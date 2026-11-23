import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  ensureFreshVerifiedToken,
  handleFirestoreError,
} from '../firebase';
import type { SupportMessage, SupportThread } from '../types/news';
import {
  clearFirestoreQuotaExceeded,
  dedupeInFlight,
  getCachedValue,
  invalidateCacheByPrefix,
  isFirestoreQuotaError,
  isQuotaCooldownActive,
  markFirestoreQuotaExceeded,
  setCachedValue,
} from './firestoreOptimizer';

const THREAD_STORAGE_KEY = 'coffeenadu_reader_thread_id';
const THREAD_STARTED_KEY = 'coffeenadu_reader_has_thread';
const READER_NAME_STORAGE_KEY = 'coffeenadu_reader_name';
const READER_PHONE_STORAGE_KEY = 'coffeenadu_reader_phone';
const READER_LOC_STORAGE_KEY = 'coffeenadu_reader_location';

export const INBOX_PAGE_SIZE = 20;
const INBOX_CACHE_KEY = 'inbox:threads_v1';
const INBOX_CACHE_TTL_MS = 2 * 60 * 1000;

function timestampToMs(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const ts = value as Timestamp;
    return ts.toMillis();
  }
  return undefined;
}

function generateSecureThreadId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `chat_${hex}`;
}

export function getOrCreateReaderThreadId(): string {
  if (typeof window === 'undefined') return generateSecureThreadId();
  try {
    const existing = window.localStorage.getItem(THREAD_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{20,128}$/.test(existing)) {
      return existing;
    }
    const fresh = generateSecureThreadId();
    window.localStorage.setItem(THREAD_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return generateSecureThreadId();
  }
}

export function hasReaderStartedThread(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(THREAD_STARTED_KEY) === '1';
  } catch {
    return false;
  }
}

function markReaderStartedThread(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THREAD_STARTED_KEY, '1');
  } catch {
    // Ignore storage errors
  }
}

export function getSavedReaderProfile(): { name: string; phone: string; location: string } {
  if (typeof window === 'undefined') return { name: '', phone: '', location: '' };
  try {
    return {
      name: window.localStorage.getItem(READER_NAME_STORAGE_KEY) || '',
      phone: window.localStorage.getItem(READER_PHONE_STORAGE_KEY) || '',
      location: window.localStorage.getItem(READER_LOC_STORAGE_KEY) || '',
    };
  } catch {
    return { name: '', phone: '', location: '' };
  }
}

export function saveReaderProfile(name: string, phone: string, location: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(READER_NAME_STORAGE_KEY, name);
    window.localStorage.setItem(READER_PHONE_STORAGE_KEY, phone);
    window.localStorage.setItem(READER_LOC_STORAGE_KEY, location);
  } catch {
    // Ignore storage issues
  }
}

function mapDocToThread(docId: string, data: Record<string, unknown>): SupportThread {
  return {
    id: typeof data.id === 'string' ? data.id : docId,
    senderName: typeof data.senderName === 'string' ? data.senderName : 'Reader',
    senderPhone: typeof data.senderPhone === 'string' && data.senderPhone.trim() ? data.senderPhone.trim() : undefined,
    senderLocation: typeof data.senderLocation === 'string' ? data.senderLocation : '',
    topic: typeof data.topic === 'string' ? data.topic : 'General Query',
    lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
    lastSenderRole: data.lastSenderRole === 'admin' ? 'admin' : 'reader',
    status:
      data.status === 'replied' || data.status === 'closed' ? data.status : 'open',
    unreadByAdmin: Boolean(data.unreadByAdmin),
    unreadByReader: Boolean(data.unreadByReader),
    createdTimestamp: timestampToMs(data.createdAt),
    updatedTimestamp: timestampToMs(data.updatedAt),
  };
}

function mapDocToMessage(docId: string, data: Record<string, unknown>): SupportMessage {
  return {
    id: typeof data.id === 'string' ? data.id : docId,
    threadId: typeof data.threadId === 'string' ? data.threadId : '',
    senderRole: data.senderRole === 'admin' ? 'admin' : 'reader',
    senderName: typeof data.senderName === 'string' ? data.senderName : 'Reader',
    text: typeof data.text === 'string' ? data.text : '',
    createdTimestamp: timestampToMs(data.createdAt),
  };
}

/**
 * Lightweight cached check for unread admin replies on non-chat pages.
 * Performs ZERO Firestore reads if the visitor has never started a support thread.
 */
export async function checkReaderThreadSummaryOnce(
  threadId: string
): Promise<SupportThread | null> {
  if (!hasReaderStartedThread()) {
    return null;
  }
  const cacheKey = `reader_thread:${threadId}`;
  const cached = getCachedValue<SupportThread | null>(cacheKey);
  if (cached) {
    return cached.data;
  }
  if (isQuotaCooldownActive()) {
    return getCachedValue<SupportThread | null>(cacheKey, { allowStale: true })?.data ?? null;
  }
  return dedupeInFlight(cacheKey, async () => {
    try {
      const snap = await getDoc(doc(db, 'supportThreads', threadId));
      clearFirestoreQuotaExceeded();
      const thread = snap.exists()
        ? mapDocToThread(snap.id, snap.data() as Record<string, unknown>)
        : null;
      setCachedValue(cacheKey, thread, 2 * 60 * 1000);
      return thread;
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markFirestoreQuotaExceeded(err);
      }
      return getCachedValue<SupportThread | null>(cacheKey, { allowStale: true })?.data ?? null;
    }
  });
}

export function subscribeToReaderThread(
  threadId: string,
  onThread: (thread: SupportThread | null) => void,
  onMessages: (messages: SupportMessage[]) => void,
  onSyncError?: (error: Error) => void
): Unsubscribe {
  if (!hasReaderStartedThread()) {
    onThread(null);
    onMessages([]);
    return () => {};
  }

  const threadPath = `supportThreads/${threadId}`;
  const messagesPath = `supportThreads/${threadId}/messages`;

  const unsubThread = onSnapshot(
    doc(db, 'supportThreads', threadId),
    (snap) => {
      if (!snap.exists()) {
        onThread(null);
        return;
      }
      const mapped = mapDocToThread(snap.id, snap.data() as Record<string, unknown>);
      setCachedValue(`reader_thread:${threadId}`, mapped, 2 * 60 * 1000);
      onThread(mapped);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, threadPath);
      } catch (wrapped) {
        if (onSyncError && wrapped instanceof Error) {
          onSyncError(wrapped);
        }
      }
    }
  );

  const messagesQuery = query(
    collection(db, 'supportThreads', threadId, 'messages'),
    where('threadId', '==', threadId),
    limit(50)
  );

  const unsubMessages = onSnapshot(
    messagesQuery,
    (snapshot) => {
      const list = snapshot.docs
        .map((snap) => mapDocToMessage(snap.id, snap.data() as Record<string, unknown>))
        .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0));
      onMessages(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, messagesPath);
      } catch (wrapped) {
        if (onSyncError && wrapped instanceof Error) {
          onSyncError(wrapped);
        }
      }
    }
  );

  return () => {
    unsubThread();
    unsubMessages();
  };
}

export async function sendReaderMessage(input: {
  threadId: string;
  senderName: string;
  senderPhone: string;
  senderLocation: string;
  topic: string;
  text: string;
}): Promise<void> {
  const threadId = input.threadId.trim();
  const senderName = input.senderName.trim().slice(0, 80);
  const senderPhone = input.senderPhone.trim().slice(0, 25);
  const phoneDigits = senderPhone.replace(/\D/g, '');
  const senderLocation = input.senderLocation.trim().slice(0, 60);
  const topic = (input.topic.trim() || 'General / ಸಾಮಾನ್ಯ ವಿಚಾರ').slice(0, 120);
  const text = input.text.trim().slice(0, 2000);

  if (!senderName) {
    throw new Error('Please enter your name / ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರು ನಮೂದಿಸಿ.');
  }
  if (phoneDigits.length < 10) {
    throw new Error('Please enter a valid 10-digit mobile number / ದಯವಿಟ್ಟು ಸರಿಯಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ.');
  }
  if (!text) {
    throw new Error('Please write a message before sending.');
  }

  saveReaderProfile(senderName, senderPhone, senderLocation);

  const threadRef = doc(db, 'supportThreads', threadId);
  const threadPath = `supportThreads/${threadId}`;
  const snippet = text.slice(0, 1000);

  try {
    const existing = await getDoc(threadRef);
    if (!existing.exists()) {
      await setDoc(threadRef, {
        id: threadId,
        senderName,
        senderPhone,
        senderLocation,
        topic,
        lastMessage: snippet,
        lastSenderRole: 'reader',
        status: 'open',
        unreadByAdmin: true,
        unreadByReader: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(threadRef, {
        senderName,
        senderPhone,
        senderLocation,
        topic,
        lastMessage: snippet,
        lastSenderRole: 'reader',
        status: 'open',
        unreadByAdmin: true,
        unreadByReader: false,
        updatedAt: serverTimestamp(),
      });
    }
    markReaderStartedThread();
    invalidateCacheByPrefix(`reader_thread:${threadId}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, threadPath);
  }

  const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const msgPath = `supportThreads/${threadId}/messages/${msgId}`;
  try {
    await setDoc(doc(db, 'supportThreads', threadId, 'messages', msgId), {
      id: msgId,
      threadId,
      senderRole: 'reader',
      senderName,
      text,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, msgPath);
  }
}

export async function markThreadReadByReader(threadId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'supportThreads', threadId), {
      unreadByReader: false,
      updatedAt: serverTimestamp(),
    });
    invalidateCacheByPrefix(`reader_thread:${threadId}`);
  } catch {
    // Non-fatal
  }
}

let lastInboxCursorDoc: QueryDocumentSnapshot<DocumentData> | null = null;

export async function loadAdminInboxThreads(options?: {
  forceRefresh?: boolean;
  pageSize?: number;
}): Promise<{
  threads: SupportThread[];
  hasMore: boolean;
  fromCache: boolean;
  quotaExceeded?: boolean;
}> {
  const pageSize = options?.pageSize ?? INBOX_PAGE_SIZE;

  if (!options?.forceRefresh) {
    const cached = getCachedValue<SupportThread[]>(INBOX_CACHE_KEY);
    if (cached) {
      return {
        threads: cached.data,
        hasMore: Boolean(cached.hasMore),
        fromCache: true,
      };
    }
  }

  if (isQuotaCooldownActive()) {
    const stale = getCachedValue<SupportThread[]>(INBOX_CACHE_KEY, { allowStale: true });
    return {
      threads: stale?.data ?? [],
      hasMore: Boolean(stale?.hasMore),
      fromCache: true,
      quotaExceeded: true,
    };
  }

  const path = 'supportThreads';
  return dedupeInFlight(`adminInbox:${pageSize}:${Boolean(options?.forceRefresh)}`, async () => {
    try {
      const q = query(collection(db, path), orderBy('updatedAt', 'desc'), limit(pageSize));
      const snapshot = await getDocs(q);
      clearFirestoreQuotaExceeded();
      lastInboxCursorDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;
      const threads = snapshot.docs.map((snap) =>
        mapDocToThread(snap.id, snap.data() as Record<string, unknown>)
      );
      const hasMore = snapshot.docs.length === pageSize;
      setCachedValue(INBOX_CACHE_KEY, threads, INBOX_CACHE_TTL_MS, { hasMore });
      return { threads, hasMore, fromCache: false };
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
        const stale = getCachedValue<SupportThread[]>(INBOX_CACHE_KEY, { allowStale: true });
        return {
          threads: stale?.data ?? [],
          hasMore: Boolean(stale?.hasMore),
          fromCache: true,
          quotaExceeded: true,
        };
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  });
}

export async function loadMoreAdminInboxThreads(
  existing: SupportThread[],
  pageSize = INBOX_PAGE_SIZE
): Promise<{ threads: SupportThread[]; hasMore: boolean; quotaExceeded?: boolean }> {
  if (!lastInboxCursorDoc || isQuotaCooldownActive()) {
    return {
      threads: existing,
      hasMore: false,
      quotaExceeded: isQuotaCooldownActive(),
    };
  }

  const path = 'supportThreads';
  try {
    const q = query(
      collection(db, path),
      orderBy('updatedAt', 'desc'),
      startAfter(lastInboxCursorDoc),
      limit(pageSize)
    );
    const snapshot = await getDocs(q);
    clearFirestoreQuotaExceeded();
    if (snapshot.empty) {
      return { threads: existing, hasMore: false };
    }
    lastInboxCursorDoc = snapshot.docs[snapshot.docs.length - 1] ?? lastInboxCursorDoc;
    const next = snapshot.docs.map((snap) =>
      mapDocToThread(snap.id, snap.data() as Record<string, unknown>)
    );
    const mergedMap = new Map<string, SupportThread>();
    existing.forEach((t) => mergedMap.set(t.id, t));
    next.forEach((t) => mergedMap.set(t.id, t));
    const merged = Array.from(mergedMap.values()).sort(
      (a, b) => (b.updatedTimestamp ?? 0) - (a.updatedTimestamp ?? 0)
    );
    const hasMore = snapshot.docs.length === pageSize;
    setCachedValue(INBOX_CACHE_KEY, merged, INBOX_CACHE_TTL_MS, { hasMore });
    return { threads: merged, hasMore };
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markFirestoreQuotaExceeded(error);
      return { threads: existing, hasMore: true, quotaExceeded: true };
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeToThreadMessagesForAdmin(
  threadId: string,
  onMessages: (messages: SupportMessage[]) => void,
  onSyncError?: (error: Error) => void
): Unsubscribe {
  const path = `supportThreads/${threadId}/messages`;
  const messagesQuery = query(
    collection(db, path),
    where('threadId', '==', threadId),
    limit(50)
  );
  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const list = snapshot.docs
        .map((snap) => mapDocToMessage(snap.id, snap.data() as Record<string, unknown>))
        .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0));
      onMessages(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onSyncError && wrapped instanceof Error) {
          onSyncError(wrapped);
        }
      }
    }
  );
}

export async function sendAdminReply(input: {
  threadId: string;
  adminName: string;
  text: string;
}): Promise<void> {
  await ensureFreshVerifiedToken(auth.currentUser);
  const threadId = input.threadId.trim();
  const adminName = (input.adminName.trim() || 'Coffeenadu Admin').slice(0, 80);
  const text = input.text.trim().slice(0, 2000);
  if (!text) {
    throw new Error('Please write a reply message.');
  }

  const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const msgPath = `supportThreads/${threadId}/messages/${msgId}`;
  try {
    await setDoc(doc(db, 'supportThreads', threadId, 'messages', msgId), {
      id: msgId,
      threadId,
      senderRole: 'admin',
      senderName: adminName,
      text,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, msgPath);
  }

  const threadPath = `supportThreads/${threadId}`;
  try {
    await updateDoc(doc(db, 'supportThreads', threadId), {
      lastMessage: text.slice(0, 1000),
      lastSenderRole: 'admin',
      status: 'replied',
      unreadByAdmin: false,
      unreadByReader: true,
      updatedAt: serverTimestamp(),
    });
    invalidateCacheByPrefix('inbox:');
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, threadPath);
  }
}

export async function markThreadReadByAdmin(threadId: string): Promise<void> {
  await ensureFreshVerifiedToken(auth.currentUser);
  try {
    await updateDoc(doc(db, 'supportThreads', threadId), {
      unreadByAdmin: false,
      updatedAt: serverTimestamp(),
    });
    invalidateCacheByPrefix('inbox:');
  } catch {
    // Non-fatal
  }
}

export async function deleteThreadByAdmin(threadId: string): Promise<void> {
  await ensureFreshVerifiedToken(auth.currentUser);
  const messagesPath = `supportThreads/${threadId}/messages`;
  try {
    const msgsSnap = await getDocs(
      query(collection(db, messagesPath), where('threadId', '==', threadId), limit(100))
    );
    await Promise.all(msgsSnap.docs.map((m) => deleteDoc(m.ref)));
    await deleteDoc(doc(db, 'supportThreads', threadId));
    invalidateCacheByPrefix('inbox:');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `supportThreads/${threadId}`);
  }
}
