import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  setPersistence,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  getCachedValue,
  isFirestoreQuotaError,
  markFirestoreQuotaExceeded,
  setCachedValue,
} from './services/firestoreOptimizer';

export const ADMIN_OWNER_EMAILS = [
  'shwethashwethak85@gmail.com',
  'dheerajcp77@gmail.com',
] as const;

export const PRIMARY_ADMIN_EMAIL = ADMIN_OWNER_EMAILS[0];

export function isAdminOwnerEmail(email: string | null | undefined): boolean {
  const normalized = (email || '').trim().toLowerCase();
  return ADMIN_OWNER_EMAILS.some((ownerEmail) => ownerEmail === normalized);
}

const app = initializeApp(firebaseConfig);

function createOptimizedFirestore(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

function createInMemoryAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: inMemoryPersistence,
    });
  } catch {
    const fallbackAuth = getAuth(app);
    void setPersistence(fallbackAuth, inMemoryPersistence).catch(() => undefined);
    return fallbackAuth;
  }
}

export const db = createOptimizedFirestore();
export const auth = createInMemoryAuth();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  if (isFirestoreQuotaError(error)) {
    markFirestoreQuotaExceeded(error);
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function formatReadableFirestoreError(error: unknown): string {
  if (isFirestoreQuotaError(error)) {
    return 'Daily Firebase free read limit has been reached. Previously loaded news and events are shown from cache. Quota resets daily.';
  }
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(raw) as Partial<FirestoreErrorInfo>;
    if (parsed.error) {
      if (isFirestoreQuotaError(parsed.error)) {
        return 'Daily Firebase free read limit has been reached. Previously loaded news and events are shown from cache. Quota resets daily.';
      }
      if (parsed.error.toLowerCase().includes('permission')) {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          return 'Permission denied. Your session signed out—please sign in again.';
        }
        if (!currentUser.emailVerified) {
          return `Permission denied because ${currentUser.email || 'your account'} is not verified yet. Please verify your email and refresh.`;
        }
        return `Permission denied for ${currentUser.email || 'current account'}. Please click Refresh Session or sign out and sign back in with an authorized admin account (${ADMIN_OWNER_EMAILS.join(' or ')}).`;
      }
      return parsed.error;
    }
  } catch {
    // Plain error string
  }
  return raw || 'Unable to complete database request.';
}

export async function ensureFreshVerifiedToken(user: User | null): Promise<boolean> {
  if (!user) return false;
  try {
    if (!user.emailVerified) {
      await user.reload();
    }
    if (!user.emailVerified) {
      return false;
    }
    const tokenResult = await user.getIdTokenResult();
    if (tokenResult.claims.email_verified !== true) {
      await user.getIdToken(true);
    }
    return true;
  } catch {
    return Boolean(user.emailVerified);
  }
}

export async function checkIsAuthorizedAdmin(user: User | null): Promise<boolean> {
  const verified = await ensureFreshVerifiedToken(user);
  if (!user || !verified) return false;
  if (isAdminOwnerEmail(user.email)) {
    return true;
  }
  const cacheKey = `admin_role:${user.uid}`;
  const cached = getCachedValue<boolean>(cacheKey);
  if (cached) {
    return cached.data;
  }
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    const allowed = snap.exists();
    setCachedValue(cacheKey, allowed, 10 * 60 * 1000);
    return allowed;
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
      const stale = getCachedValue<boolean>(cacheKey, { allowStale: true });
      if (stale) return stale.data;
    }
    return false;
  }
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markFirestoreQuotaExceeded(error);
    } else if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
