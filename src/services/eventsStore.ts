import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { applyWatermarkToImageSrc } from '../utils/watermark';
import { KOPPA_LOCATIONS } from '../data/newsData';
import {
  OperationType,
  auth,
  db,
  ensureFreshVerifiedToken,
  handleFirestoreError,
} from '../firebase';
import type { ProgramEvent } from '../types/news';
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
import {
  createEventViaSheets,
  deleteEventViaSheets,
  fetchEventByIdFromSheets,
  fetchEventsPageFromSheets,
  isSheetsStorageActive,
  recordAggregatedViewOnServer,
  updateEventViaSheets,
} from './sheetsStorageClient';

export const EVENTS_PAGE_SIZE = 20;
const EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const SINGLE_EVENT_CACHE_TTL_MS = 10 * 60 * 1000;
const EVENTS_LIST_CACHE_KEY = 'events:list_v1';

export interface EventMutationInput {
  titleKannada: string;
  descriptionKannada: string;
  eventDate: string; // YYYY-MM-DD
  eventTime: string;
  location: string;
  organizer: string;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  watermarkApplied?: boolean;
}

function timestampToMs(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const ts = value as Timestamp;
    return ts.toMillis();
  }
  return undefined;
}

function mapDocToEvent(docId: string, data: Record<string, unknown>): ProgramEvent {
  return {
    id: typeof data.id === 'string' ? data.id : docId,
    titleKannada: typeof data.titleKannada === 'string' ? data.titleKannada : '',
    descriptionKannada: typeof data.descriptionKannada === 'string' ? data.descriptionKannada : '',
    eventDate: typeof data.eventDate === 'string' ? data.eventDate : '',
    eventTime: typeof data.eventTime === 'string' ? data.eventTime : '',
    location: typeof data.location === 'string' ? data.location : KOPPA_LOCATIONS[0],
    organizer: typeof data.organizer === 'string' ? data.organizer : 'Coffeenadu Desk',
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined,
    authorUid: typeof data.authorUid === 'string' ? data.authorUid : undefined,
    createdTimestamp: timestampToMs(data.createdAt),
    viewCount: typeof data.viewCount === 'number' && Number.isFinite(data.viewCount) ? data.viewCount : 0,
    watermarkApplied: Boolean(data.watermarkApplied),
  };
}

function sortEventsForDisplay(list: ProgramEvent[]): ProgramEvent[] {
  return [...list].sort((a, b) => {
    const dateDiff = b.eventDate.localeCompare(a.eventDate);
    if (dateDiff !== 0) return dateDiff;
    return a.eventTime.localeCompare(b.eventTime);
  });
}

function mergeUniqueEvents(existing: ProgramEvent[], incoming: ProgramEvent[]): ProgramEvent[] {
  const map = new Map<string, ProgramEvent>();
  for (const ev of existing) {
    map.set(ev.id, ev);
  }
  for (const ev of incoming) {
    map.set(ev.id, ev);
  }
  return sortEventsForDisplay(Array.from(map.values()));
}

function sanitizeEventPayload(input: EventMutationInput) {
  const titleKannada = input.titleKannada.trim().slice(0, 300);
  const descriptionKannada = input.descriptionKannada.trim().slice(0, 2000);
  const eventDate = input.eventDate.trim();
  const eventTime = (input.eventTime.trim() || '10:00 AM').slice(0, 40);
  const location = (input.location.trim() || KOPPA_LOCATIONS[0]).slice(0, 60);
  const organizer = (input.organizer.trim() || 'Local Committee').slice(0, 100);
  const imageUrl = input.imageUrl?.trim() || '';

  if (!titleKannada || !descriptionKannada) {
    throw new Error('Program title and details are required.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new Error('Please choose a valid scheduled date (YYYY-MM-DD).');
  }
  if (imageUrl.length > 350000) {
    throw new Error('Selected photo is too large. Please pick a smaller photo.');
  }

  return {
    titleKannada,
    descriptionKannada,
    eventDate,
    eventTime,
    location,
    organizer,
    imageUrl,
    watermarkApplied: Boolean(imageUrl && input.watermarkApplied),
  };
}

// Shared reactive events store (shared across /events and /admin Events tab with zero duplicate reads)
let sharedEvents: ProgramEvent[] = [];
let sharedEventsLoaded = false;
let sharedHasMoreEvents = false;
let lastEventCursorDoc: QueryDocumentSnapshot<DocumentData> | null = null;
let lastEventCursorDate: string | null = null;
let sheetsEventsPage = 1;

type EventsStoreListener = (state: {
  events: ProgramEvent[];
  loaded: boolean;
  hasMore: boolean;
}) => void;

const eventStoreListeners = new Set<EventsStoreListener>();

function emitEventsState(): void {
  const payload = {
    events: sharedEvents,
    loaded: sharedEventsLoaded,
    hasMore: sharedHasMoreEvents,
  };
  eventStoreListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Ignore listener errors
    }
  });
}

function updateSharedEventsCache(list: ProgramEvent[], hasMore: boolean): void {
  sharedEvents = list;
  sharedEventsLoaded = true;
  sharedHasMoreEvents = hasMore;
  setCachedValue(EVENTS_LIST_CACHE_KEY, list, EVENTS_CACHE_TTL_MS, { hasMore });
  for (const ev of list.slice(0, 30)) {
    setCachedValue(`events:item:${ev.id}`, ev, SINGLE_EVENT_CACHE_TTL_MS);
  }
  emitEventsState();
}

export function subscribeToEventsState(listener: EventsStoreListener): () => void {
  eventStoreListeners.add(listener);
  listener({
    events: sharedEvents,
    loaded: sharedEventsLoaded,
    hasMore: sharedHasMoreEvents,
  });
  return () => {
    eventStoreListeners.delete(listener);
  };
}

export async function loadInitialEvents(options?: {
  forceRefresh?: boolean;
  pageSize?: number;
}): Promise<{
  events: ProgramEvent[];
  hasMore: boolean;
  fromCache: boolean;
  quotaExceeded?: boolean;
}> {
  const pageSize = options?.pageSize ?? EVENTS_PAGE_SIZE;

  if (!options?.forceRefresh) {
    if (sharedEventsLoaded && sharedEvents.length > 0) {
      const freshMem = getCachedValue<ProgramEvent[]>(EVENTS_LIST_CACHE_KEY);
      if (freshMem) {
        return {
          events: sharedEvents,
          hasMore: sharedHasMoreEvents,
          fromCache: true,
        };
      }
    }

    const cached = getCachedValue<ProgramEvent[]>(EVENTS_LIST_CACHE_KEY);
    if (cached) {
      const sorted = sortEventsForDisplay(cached.data);
      sharedEvents = sorted;
      sharedEventsLoaded = true;
      sharedHasMoreEvents = Boolean(cached.hasMore);
      if (!lastEventCursorDate && sorted.length > 0) {
        lastEventCursorDate = sorted[sorted.length - 1]?.eventDate ?? null;
      }
      emitEventsState();
      return {
        events: sorted,
        hasMore: sharedHasMoreEvents,
        fromCache: true,
      };
    }
  }

  if (isQuotaCooldownActive()) {
    const stale = getCachedValue<ProgramEvent[]>(EVENTS_LIST_CACHE_KEY, { allowStale: true });
    const fallback = stale?.data ? sortEventsForDisplay(stale.data) : sharedEvents;
    sharedEvents = fallback;
    sharedEventsLoaded = true;
    sharedHasMoreEvents = Boolean(stale?.hasMore);
    emitEventsState();
    return {
      events: fallback,
      hasMore: sharedHasMoreEvents,
      fromCache: true,
      quotaExceeded: true,
    };
  }

  return dedupeInFlight(`loadInitialEvents:${pageSize}:${Boolean(options?.forceRefresh)}`, async () => {
    if (await isSheetsStorageActive()) {
      try {
        const res = await fetchEventsPageFromSheets({
          page: 1,
          limit: pageSize,
          forceRefresh: Boolean(options?.forceRefresh),
        });
        clearFirestoreQuotaExceeded();
        sheetsEventsPage = 1;
        const list = sortEventsForDisplay(res.events);
        updateSharedEventsCache(list, res.hasMore);
        return { events: list, hasMore: res.hasMore, fromCache: res.fromCache };
      } catch {
        const stale = getCachedValue<ProgramEvent[]>(EVENTS_LIST_CACHE_KEY, { allowStale: true });
        if (stale?.data) {
          const fallback = sortEventsForDisplay(stale.data);
          sharedEvents = fallback;
          sharedEventsLoaded = true;
          sharedHasMoreEvents = Boolean(stale.hasMore);
          emitEventsState();
          return { events: fallback, hasMore: sharedHasMoreEvents, fromCache: true };
        }
      }
    }

    const path = 'events';
    try {
      const eventsQuery = query(
        collection(db, path),
        orderBy('eventDate', 'desc'),
        limit(pageSize)
      );
      const snapshot = await getDocs(eventsQuery);
      clearFirestoreQuotaExceeded();

      lastEventCursorDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;
      const list = sortEventsForDisplay(
        snapshot.docs.map((snap) => mapDocToEvent(snap.id, snap.data() as Record<string, unknown>))
      );
      lastEventCursorDate =
        snapshot.docs.length > 0
          ? String(
              (snapshot.docs[snapshot.docs.length - 1].data() as Record<string, unknown>).eventDate ||
                ''
            ) || null
          : null;
      const hasMore = snapshot.docs.length === pageSize;

      updateSharedEventsCache(list, hasMore);
      return { events: list, hasMore, fromCache: false };
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
      } else {
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch {
          // Recorded cleanly
        }
      }

      const stale = getCachedValue<ProgramEvent[]>(EVENTS_LIST_CACHE_KEY, { allowStale: true });
      const fallback = stale?.data ? sortEventsForDisplay(stale.data) : sharedEvents;
      sharedEvents = fallback;
      sharedEventsLoaded = true;
      sharedHasMoreEvents = Boolean(stale?.hasMore);
      emitEventsState();
      return {
        events: fallback,
        hasMore: sharedHasMoreEvents,
        fromCache: true,
        quotaExceeded: isFirestoreQuotaError(error),
      };
    }
  });
}

export async function loadMoreEvents(
  pageSize = EVENTS_PAGE_SIZE
): Promise<{ events: ProgramEvent[]; hasMore: boolean; quotaExceeded?: boolean }> {
  if (!sharedHasMoreEvents || isQuotaCooldownActive()) {
    return {
      events: sharedEvents,
      hasMore: sharedHasMoreEvents,
      quotaExceeded: isQuotaCooldownActive(),
    };
  }

  return dedupeInFlight(`loadMoreEvents:${lastEventCursorDate ?? sheetsEventsPage}`, async () => {
    if (await isSheetsStorageActive()) {
      try {
        const nextPage = sheetsEventsPage + 1;
        const res = await fetchEventsPageFromSheets({ page: nextPage, limit: pageSize });
        sheetsEventsPage = nextPage;
        const merged = mergeUniqueEvents(sharedEvents, res.events);
        updateSharedEventsCache(merged, res.hasMore);
        return { events: merged, hasMore: res.hasMore };
      } catch {
        return { events: sharedEvents, hasMore: sharedHasMoreEvents };
      }
    }

    const path = 'events';
    try {
      let paginatedQuery;
      if (lastEventCursorDoc) {
        paginatedQuery = query(
          collection(db, path),
          orderBy('eventDate', 'desc'),
          startAfter(lastEventCursorDoc),
          limit(pageSize)
        );
      } else if (lastEventCursorDate) {
        paginatedQuery = query(
          collection(db, path),
          orderBy('eventDate', 'desc'),
          startAfter(lastEventCursorDate),
          limit(pageSize)
        );
      } else {
        sharedHasMoreEvents = false;
        emitEventsState();
        return { events: sharedEvents, hasMore: false };
      }

      const snapshot = await getDocs(paginatedQuery);
      clearFirestoreQuotaExceeded();

      if (snapshot.empty) {
        sharedHasMoreEvents = false;
        updateSharedEventsCache(sharedEvents, false);
        return { events: sharedEvents, hasMore: false };
      }

      lastEventCursorDoc = snapshot.docs[snapshot.docs.length - 1] ?? lastEventCursorDoc;
      lastEventCursorDate =
        String(
          (snapshot.docs[snapshot.docs.length - 1].data() as Record<string, unknown>).eventDate || ''
        ) || lastEventCursorDate;

      const nextBatch = snapshot.docs.map((snap) =>
        mapDocToEvent(snap.id, snap.data() as Record<string, unknown>)
      );
      const hasMore = snapshot.docs.length === pageSize;
      const merged = mergeUniqueEvents(sharedEvents, nextBatch);
      updateSharedEventsCache(merged, hasMore);
      return { events: merged, hasMore };
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
        return { events: sharedEvents, hasMore: sharedHasMoreEvents, quotaExceeded: true };
      }
      return { events: sharedEvents, hasMore: sharedHasMoreEvents };
    }
  });
}

export async function getEventByIdFromFirestore(eventId: string): Promise<ProgramEvent | null> {
  const cleanId = eventId.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanId)) return null;

  const inMemory = sharedEvents.find((ev) => ev.id === cleanId);
  if (inMemory) return inMemory;

  const itemCacheKey = `events:item:${cleanId}`;
  const cachedItem = getCachedValue<ProgramEvent>(itemCacheKey);
  if (cachedItem) return cachedItem.data;

  const listCache = getCachedValue<ProgramEvent[]>(EVENTS_LIST_CACHE_KEY, { allowStale: true });
  const inListCache = listCache?.data?.find((ev) => ev.id === cleanId);
  if (inListCache && (listCache?.isFresh || isQuotaCooldownActive())) {
    return inListCache;
  }

  if (isQuotaCooldownActive()) {
    return getCachedValue<ProgramEvent>(itemCacheKey, { allowStale: true })?.data ?? null;
  }

  return dedupeInFlight(itemCacheKey, async () => {
    if (await isSheetsStorageActive()) {
      try {
        const fromSheets = await fetchEventByIdFromSheets(cleanId);
        if (fromSheets) {
          setCachedValue(itemCacheKey, fromSheets, SINGLE_EVENT_CACHE_TTL_MS);
          return fromSheets;
        }
      } catch {
        // Fallback cleanly
      }
    }

    try {
      const snap = await getDoc(doc(db, 'events', cleanId));
      clearFirestoreQuotaExceeded();
      if (snap.exists()) {
        const mapped = mapDocToEvent(snap.id, snap.data() as Record<string, unknown>);
        setCachedValue(itemCacheKey, mapped, SINGLE_EVENT_CACHE_TTL_MS);
        return mapped;
      }
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
      }
      const stale = getCachedValue<ProgramEvent>(itemCacheKey, { allowStale: true });
      if (stale) return stale.data;
      if (inListCache) return inListCache;
    }
    return null;
  });
}

export async function createEventInFirestore(
  uid: string,
  input: EventMutationInput
): Promise<string> {
  const clean = sanitizeEventPayload(input);
  await ensureFreshVerifiedToken(auth.currentUser);

  if (await isSheetsStorageActive()) {
    const created = await createEventViaSheets({
      titleKannada: clean.titleKannada,
      descriptionKannada: clean.descriptionKannada,
      eventDate: clean.eventDate,
      eventTime: clean.eventTime,
      location: clean.location,
      organizer: clean.organizer,
      imageUrl: clean.imageUrl || '',
      imageThumbUrl: input.imageThumbUrl || '',
      imageDriveId: input.imageDriveId || '',
      watermarkApplied: clean.watermarkApplied,
      authorUid: uid,
    });
    const updated = mergeUniqueEvents([created], sharedEvents);
    updateSharedEventsCache(updated, sharedHasMoreEvents);
    return created.id;
  }

  const now = Date.now();
  const id = `event-${now}-${Math.random().toString(36).slice(2, 6)}`;
  const docPath = `events/${id}`;

  const docPayload: Record<string, unknown> = {
    id,
    titleKannada: clean.titleKannada,
    descriptionKannada: clean.descriptionKannada,
    eventDate: clean.eventDate,
    eventTime: clean.eventTime,
    location: clean.location,
    organizer: clean.organizer,
    authorUid: uid,
    viewCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (clean.imageUrl) {
    docPayload.imageUrl = clean.imageUrl;
    docPayload.watermarkApplied = clean.watermarkApplied;
  } else {
    docPayload.watermarkApplied = false;
  }

  try {
    await setDoc(doc(db, 'events', id), docPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }

  const createdEvent: ProgramEvent = {
    id,
    titleKannada: clean.titleKannada,
    descriptionKannada: clean.descriptionKannada,
    eventDate: clean.eventDate,
    eventTime: clean.eventTime,
    location: clean.location,
    organizer: clean.organizer,
    imageUrl: clean.imageUrl || undefined,
    authorUid: uid,
    createdTimestamp: now,
    viewCount: 0,
    watermarkApplied: clean.watermarkApplied,
  };
  const updated = mergeUniqueEvents([createdEvent], sharedEvents);
  updateSharedEventsCache(updated, sharedHasMoreEvents);
  return id;
}

export async function updateEventInFirestore(
  eventId: string,
  input: EventMutationInput
): Promise<void> {
  const clean = sanitizeEventPayload(input);
  await ensureFreshVerifiedToken(auth.currentUser);

  if (await isSheetsStorageActive()) {
    const updated = await updateEventViaSheets(eventId, {
      titleKannada: clean.titleKannada,
      descriptionKannada: clean.descriptionKannada,
      eventDate: clean.eventDate,
      eventTime: clean.eventTime,
      location: clean.location,
      organizer: clean.organizer,
      imageUrl: clean.imageUrl || '',
      imageThumbUrl: input.imageThumbUrl || '',
      imageDriveId: input.imageDriveId || '',
      watermarkApplied: Boolean(clean.imageUrl && clean.watermarkApplied),
    });
    const nextList = sortEventsForDisplay(
      sharedEvents.map((ev) => (ev.id === eventId ? updated : ev))
    );
    updateSharedEventsCache(nextList, sharedHasMoreEvents);
    return;
  }

  const docPath = `events/${eventId}`;
  try {
    await updateDoc(doc(db, 'events', eventId), {
      titleKannada: clean.titleKannada,
      descriptionKannada: clean.descriptionKannada,
      eventDate: clean.eventDate,
      eventTime: clean.eventTime,
      location: clean.location,
      organizer: clean.organizer,
      imageUrl: clean.imageUrl ? clean.imageUrl : deleteField(),
      watermarkApplied: clean.imageUrl ? clean.watermarkApplied : false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }

  const nextList = sortEventsForDisplay(
    sharedEvents.map((ev) =>
      ev.id === eventId
        ? {
            ...ev,
            titleKannada: clean.titleKannada,
            descriptionKannada: clean.descriptionKannada,
            eventDate: clean.eventDate,
            eventTime: clean.eventTime,
            location: clean.location,
            organizer: clean.organizer,
            imageUrl: clean.imageUrl || undefined,
            watermarkApplied: Boolean(clean.imageUrl && clean.watermarkApplied),
          }
        : ev
    )
  );
  updateSharedEventsCache(nextList, sharedHasMoreEvents);
}

export async function backfillEventWatermarks(events: ProgramEvent[]): Promise<number> {
  if (isQuotaCooldownActive()) return 0;
  const candidates = events.filter((ev) => Boolean(ev.imageUrl?.trim()) && !ev.watermarkApplied);
  if (candidates.length === 0) return 0;

  await ensureFreshVerifiedToken(auth.currentUser);
  let processed = 0;

  for (const ev of candidates) {
    if (!ev.imageUrl || isQuotaCooldownActive()) break;
    try {
      const watermarkedDataUrl = await applyWatermarkToImageSrc(ev.imageUrl);
      await updateDoc(doc(db, 'events', ev.id), {
        imageUrl: watermarkedDataUrl,
        watermarkApplied: true,
        updatedAt: serverTimestamp(),
      });
      processed += 1;
      sharedEvents = sharedEvents.map((item) =>
        item.id === ev.id ? { ...item, imageUrl: watermarkedDataUrl, watermarkApplied: true } : item
      );
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markFirestoreQuotaExceeded(err);
        break;
      }
      // Skip items that fail CORS/encoding
    }
  }

  if (processed > 0) {
    updateSharedEventsCache(sharedEvents, sharedHasMoreEvents);
  }
  return processed;
}

export async function deleteEventInFirestore(eventId: string): Promise<void> {
  await ensureFreshVerifiedToken(auth.currentUser);

  if (await isSheetsStorageActive()) {
    await deleteEventViaSheets(eventId);
    const remaining = sharedEvents.filter((ev) => ev.id !== eventId);
    invalidateCacheByPrefix(`events:item:${eventId}`);
    updateSharedEventsCache(remaining, sharedHasMoreEvents);
    return;
  }

  const docPath = `events/${eventId}`;
  try {
    await deleteDoc(doc(db, 'events', eventId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }

  const remaining = sharedEvents.filter((ev) => ev.id !== eventId);
  invalidateCacheByPrefix(`events:item:${eventId}`);
  updateSharedEventsCache(remaining, sharedHasMoreEvents);
}

const recentEventViewTimestamps = new Map<string, number>();
const EVENT_STRICT_MODE_GUARD_MS = 500;

export async function recordEventView(eventId: string): Promise<void> {
  const cleanId = eventId.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanId)) return;

  const now = Date.now();
  const lastRecorded = recentEventViewTimestamps.get(cleanId) ?? 0;
  if (now - lastRecorded < EVENT_STRICT_MODE_GUARD_MS) {
    return;
  }
  recentEventViewTimestamps.set(cleanId, now);

  if (sharedEvents.some((item) => item.id === cleanId)) {
    sharedEvents = sharedEvents.map((item) =>
      item.id === cleanId ? { ...item, viewCount: (item.viewCount ?? 0) + 1 } : item
    );
    updateSharedEventsCache(sharedEvents, sharedHasMoreEvents);
  }

  if (await isSheetsStorageActive()) {
    await recordAggregatedViewOnServer('event', cleanId);
    return;
  }

  if (isQuotaCooldownActive()) return;

  try {
    await updateDoc(doc(db, 'events', cleanId), {
      viewCount: increment(1),
    });
  } catch {
    // Gracefully ignore if offline or document was deleted
  }
}
