import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  AlertCircle,
  BadgePlus,
  CalendarPlus,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileEdit,
  FilePlus2,
  Images,
  Link2,
  Loader2,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Timer,
  Type,
  X,
} from 'lucide-react';
import {
  auth,
  checkIsAuthorizedAdmin,
  formatReadableFirestoreError,
  googleProvider,
  isAdminOwnerEmail,
} from '../firebase';
import {
  addAdminRecordInFirestore,
  backfillArticleWatermarks,
  createArticleInFirestore,
  deleteArticleInFirestore,
  listAdminRecordsFromFirestore,
  loadInitialArticles,
  loadMoreArticles,
  removeAdminRecordInFirestore,
  removeLegacyFogArticleIfPresent,
  subscribeToArticlesState,
  syncArticleViewCountsFromServer,
  toggleArticleLeadStory,
  updateArticleInFirestore,
  type AdminDirectoryEntry,
} from '../services/articlesStore';
import {
  deleteThreadByAdmin,
  loadAdminInboxThreads,
  loadMoreAdminInboxThreads,
  markThreadReadByAdmin,
  sendAdminReply,
  subscribeToThreadMessagesForAdmin,
} from '../services/chatStore';
import {
  backfillEventWatermarks,
  createEventInFirestore,
  deleteEventInFirestore,
  loadInitialEvents,
  loadMoreEvents,
  subscribeToEventsState,
  updateEventInFirestore,
  type EventMutationInput,
} from '../services/eventsStore';
import {
  clearAdmin2MemoryToken,
  exchangeFirebaseForAdmin2Session,
  logoutAdmin2Session,
  revokeAdmin2SessionKeepalive,
} from '../services/admin2Client';
import {
  isAndroidKeystoreVaultAvailable,
  requestAndroidAppExit,
} from '../services/androidVaultBridge';
import {
  ROLE_DEFAULT_PERMISSIONS,
  type Admin2SessionUser,
  type AdminSectionId,
} from '../types/admin2';
import type {
  NewsArticle,
  ProgramEvent,
  SupportMessage,
  SupportThread,
} from '../types/news';
import { AdminArticleModal, type AdminArticlePayload } from './AdminArticleModal';
import { AdminEventModal } from './AdminEventModal';
import { AdminStorageManager } from './AdminStorageManager';
import { Admin2LoginView } from './admin2/Admin2LoginView';
import { Admin2Shell } from './admin2/Admin2Shell';
import { Admin2DashboardSection } from './admin2/Admin2DashboardSection';
import { Admin2NewsSection } from './admin2/Admin2NewsSection';
import { Admin2CalendarSection } from './admin2/Admin2CalendarSection';
import { Admin2AiStudioSection } from './admin2/Admin2AiStudioSection';
import { Admin2MediaSection } from './admin2/Admin2MediaSection';
import { Admin2MessagingSection } from './admin2/Admin2MessagingSection';
import { Admin2NotificationsSection } from './admin2/Admin2NotificationsSection';
import { Admin2AnalyticsSection } from './admin2/Admin2AnalyticsSection';
import { Admin2SeoSection } from './admin2/Admin2SeoSection';
import { Admin2AutomationsSection } from './admin2/Admin2AutomationsSection';
import { Admin2AdministratorsSection } from './admin2/Admin2AdministratorsSection';
import { Admin2SecuritySection } from './admin2/Admin2SecuritySection';
import { Admin2SettingsSection } from './admin2/Admin2SettingsSection';
import {
  createAdminAd,
  deleteAdminAd,
  fetchAdminAds,
  updateAdminAd,
} from '../services/adsClient';
import type { AdPlatformSettings, Advertisement, AdvertisementPayload } from '../types/ads';
import { AdminAdModal } from './admin2/AdminAdModal';
import { Admin2AdsSection } from './admin2/Admin2AdsSection';
import { Admin2HealthSection } from './admin2/Admin2HealthSection';
import { buildAdPublicUrl, createDefaultAdPlatformSettings } from '../utils/adHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { buildArticlePublicUrl } from '../utils/slug';

interface AdminPanelProps {
  articles: NewsArticle[];
  onNavigateHome: () => void;
}

function readInitialQueryToken(param: string): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get(param) || '').trim();
  } catch {
    return '';
  }
}

function readInitialDarkPreference(): boolean {
  try {
    return window.localStorage.getItem('cn_admin2_theme') === 'dark';
  } catch {
    return false;
  }
}

export function AdminPanel({ articles, onNavigateHome }: AdminPanelProps) {
  // Authentication state: ALWAYS starts unauthenticated on every fresh launch (never auto-enters dashboard).
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [sessionUser, setSessionUser] = useState<Admin2SessionUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(false);
  const [authError, setAuthError] = useState('');
  const [lockNotice, setLockNotice] = useState('');
  const [loginReloadNonce, setLoginReloadNonce] = useState(0);
  const [signingInGoogle, setSigningInGoogle] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [sendingVerification, setSendingVerification] = useState(false);
  const [isAndroidApp] = useState<boolean>(() => isAndroidKeystoreVaultAvailable());

  const [initialActivateToken] = useState<string>(() => readInitialQueryToken('activate'));
  const [initialResetToken] = useState<string>(() => readInitialQueryToken('reset'));

  // Navigation & Theme state (supports PWA app shortcut ?section= deep links)
  const [activeSection, setActiveSection] = useState<AdminSectionId>(() => {
    const requested = readInitialQueryToken('section');
    const validSections: AdminSectionId[] = [
      'dashboard',
      'news',
      'add-article',
      'ads',
      'add-ad',
      'calendar',
      'ai-studio',
      'media',
      'messaging',
      'notifications',
      'analytics',
      'seo',
      'automations',
      'administrators',
      'storage',
      'backups',
      'security',
      'settings',
      'health',
    ];
    return validSections.includes(requested as AdminSectionId)
      ? (requested as AdminSectionId)
      : 'dashboard';
  });
  const [newsInitialView, setNewsInitialView] = useState<'published' | 'drafts' | 'scheduled' | 'archived'>('published');
  const [darkMode, setDarkMode] = useState<boolean>(() => readInitialDarkPreference());
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);

  // Global feedback banner & published URL state
  const [dashboardFeedback, setDashboardFeedback] = useState('');
  const [dashboardError, setDashboardError] = useState('');
  const [lastPublishedUrl, setLastPublishedUrl] = useState('');
  const [copiedPublishedUrl, setCopiedPublishedUrl] = useState(false);

  // Article modal & store pagination state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [isSavingArticle, setIsSavingArticle] = useState(false);
  const [hasMoreArticles, setHasMoreArticles] = useState(false);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [loadingMoreArticles, setLoadingMoreArticles] = useState(false);

  // Programs & Events state
  const [eventsList, setEventsList] = useState<ProgramEvent[]>([]);
  const [hasMoreEvents, setHasMoreEvents] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ProgramEvent | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  // Local Advertisements state
  const [adModalOpen, setAdModalOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  const [isSavingAd, setIsSavingAd] = useState(false);
  const [nextAdNumber, setNextAdNumber] = useState('AD001');
  const [adPlatformSettings, setAdPlatformSettings] = useState<AdPlatformSettings>(() =>
    createDefaultAdPlatformSettings()
  );
  const [adsRefreshNonce, setAdsRefreshNonce] = useState(0);

  // Preserved Reader Inbox & Chat state
  const [inboxThreads, setInboxThreads] = useState<SupportThread[]>([]);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<SupportMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Preserved Firebase Co-Editors state
  const [firebaseCoEditors, setFirebaseCoEditors] = useState<AdminDirectoryEntry[]>([]);
  const [loadingCoEditors, setLoadingCoEditors] = useState(false);

  const attemptedArticleBackfillRef = useRef<Set<string>>(new Set());
  const attemptedEventBackfillRef = useRef<Set<string>>(new Set());

  const isAuthenticated = Boolean(sessionUser);
  const activeActorUid = fbUser?.uid || sessionUser?.id || 'admin2-editor';
  const isFirebasePrimaryOwner = Boolean(fbUser?.emailVerified) && isAdminOwnerEmail(fbUser?.email);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('cn_admin2_theme', next ? 'dark' : 'light');
      } catch {
        // Ignore storage restrictions
      }
      return next;
    });
  };

  // Clear all sensitive in-memory session & dashboard state and revoke the active backend session.
  const forceLockAndLogout = useCallback(
    async (reason = 'user_logout', noticeText = '') => {
      await logoutAdmin2Session(reason, false).catch(() => undefined);
      clearAdmin2MemoryToken();
      if (auth.currentUser) {
        await signOut(auth).catch(() => undefined);
      }
      setSessionUser(null);
      setFbUser(null);
      setCheckingAuth(false);
      setAuthError('');
      setVerificationMessage('');
      setDashboardFeedback('');
      setDashboardError('');
      setLastPublishedUrl('');
      setCopiedPublishedUrl(false);
      setModalOpen(false);
      setEditingArticle(null);
      setEventModalOpen(false);
      setEditingEvent(null);
      setAdModalOpen(false);
      setEditingAd(null);
      setInboxThreads([]);
      setSelectedThreadId(null);
      setThreadMessages([]);
      setReplyText('');
      setFirebaseCoEditors([]);
      setUnreadNotifications(0);
      setLockNotice(noticeText);
      setLoginReloadNonce((n) => n + 1);
    },
    []
  );

  // Fresh launch hardening: never inherit a cached Chrome/Firebase session on mount.
  useEffect(() => {
    clearAdmin2MemoryToken();
    if (auth.currentUser) {
      void signOut(auth).catch(() => undefined);
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('fresh') || url.searchParams.has('source')) {
        url.searchParams.delete('fresh');
        url.searchParams.delete('source');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    } catch {
      // Ignore history API issues
    }
  }, []);

  // Lifecycle hooks: Android native lock/exit callback + browser/tab close keepalive revocation.
  useEffect(() => {
    window.__coffeeNaduForceLockAndLogout = (reason?: string) => {
      const label =
        reason === 'android_back_exit'
          ? 'Session revoked when exiting the app. Press Login Now to authenticate.'
          : reason === 'app_backgrounded'
          ? 'Session automatically locked when the app moved to the background. Press Login Now to continue.'
          : 'Session locked. Press Login Now to authenticate.';
      void forceLockAndLogout(reason || 'app_backgrounded', label);
    };

    const handlePageHide = () => {
      revokeAdmin2SessionKeepalive('window_close');
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      delete window.__coffeeNaduForceLockAndLogout;
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [forceLockAndLogout]);

  // Subscribe to shared articles & events stores
  useEffect(() => {
    const unsubArticles = subscribeToArticlesState((state) => {
      setHasMoreArticles(state.hasMore);
    });
    const unsubEvents = subscribeToEventsState((state) => {
      setEventsList(state.events);
      setHasMoreEvents(state.hasMore);
    });
    return () => {
      unsubArticles();
      unsubEvents();
    };
  }, []);

  // Section-gated lazy loading of articles, events, inbox threads, and Firebase co-editors
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    if (
      activeSection === 'dashboard' ||
      activeSection === 'news' ||
      activeSection === 'add-article' ||
      activeSection === 'storage' ||
      activeSection === 'backups'
    ) {
      setLoadingArticles(true);
      void loadInitialArticles()
        .then(() => syncArticleViewCountsFromServer())
        .finally(() => {
          if (!cancelled) setLoadingArticles(false);
        });
    }

    if (
      activeSection === 'calendar' ||
      activeSection === 'storage' ||
      activeSection === 'backups'
    ) {
      setLoadingEvents(true);
      void loadInitialEvents().finally(() => {
        if (!cancelled) setLoadingEvents(false);
      });
    }

    if (activeSection === 'messaging' || activeSection === 'dashboard') {
      setLoadingInbox(true);
      void loadAdminInboxThreads()
        .then((res) => {
          if (cancelled) return;
          setInboxThreads(res.threads);
          setHasMoreThreads(res.hasMore);
          setSelectedThreadId((prev) => {
            if (prev && res.threads.some((t) => t.id === prev)) return prev;
            return res.threads[0]?.id ?? null;
          });
        })
        .catch(() => {
          // Silently ignore if Firebase inbox rules disallow password-only accounts without Firebase login
        })
        .finally(() => {
          if (!cancelled) setLoadingInbox(false);
        });
    }

    if (activeSection === 'administrators' && isFirebasePrimaryOwner) {
      setLoadingCoEditors(true);
      void listAdminRecordsFromFirestore()
        .then((entries) => {
          if (!cancelled) setFirebaseCoEditors(entries);
        })
        .catch(() => {
          // Ignore if Firestore directory unavailable
        })
        .finally(() => {
          if (!cancelled) setLoadingCoEditors(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, activeSection, isFirebasePrimaryOwner]);

  // Preserve automatic legacy fog cleanup & watermark backfill on existing articles/events
  useEffect(() => {
    if (!isAuthenticated) return;
    void removeLegacyFogArticleIfPresent();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || activeSection !== 'news') return;
    const pendingArticles = articles.filter(
      (a) =>
        Boolean(a.imageUrl?.trim()) &&
        !a.watermarkApplied &&
        !attemptedArticleBackfillRef.current.has(a.id)
    );
    if (pendingArticles.length > 0) {
      pendingArticles.forEach((a) => attemptedArticleBackfillRef.current.add(a.id));
      void backfillArticleWatermarks(pendingArticles);
    }
  }, [isAuthenticated, activeSection, articles]);

  useEffect(() => {
    if (!isAuthenticated || activeSection !== 'calendar') return;
    const pendingEvents = eventsList.filter(
      (ev) =>
        Boolean(ev.imageUrl?.trim()) &&
        !ev.watermarkApplied &&
        !attemptedEventBackfillRef.current.has(ev.id)
    );
    if (pendingEvents.length > 0) {
      pendingEvents.forEach((ev) => attemptedEventBackfillRef.current.add(ev.id));
      void backfillEventWatermarks(pendingEvents);
    }
  }, [isAuthenticated, activeSection, eventsList]);

  // Subscribe to selected Reader Inbox thread messages while on Messaging Centre
  useEffect(() => {
    if (!isAuthenticated || activeSection !== 'messaging' || !selectedThreadId) {
      setThreadMessages([]);
      return;
    }
    const unsubMsgs = subscribeToThreadMessagesForAdmin(
      selectedThreadId,
      (msgs) => setThreadMessages(msgs),
      (err) => setDashboardError(formatReadableFirestoreError(err))
    );
    const activeThread = inboxThreads.find((t) => t.id === selectedThreadId);
    if (activeThread?.unreadByAdmin) {
      void markThreadReadByAdmin(selectedThreadId);
    }
    return () => unsubMsgs();
  }, [isAuthenticated, activeSection, selectedThreadId, inboxThreads]);

  const unreadInboxCount = useMemo(
    () => inboxThreads.filter((t) => t.unreadByAdmin).length,
    [inboxThreads]
  );

  // Establish a tracked, revocable Admin 2.0 server session after an explicit Firebase/Google sign-in.
  const completeExplicitFirebaseLogin = async (signedInUser: User, rememberMe: boolean) => {
    setFbUser(signedInUser);
    if (!signedInUser.emailVerified) {
      setCheckingAuth(false);
      return;
    }

    setCheckingAuth(true);
    try {
      const idToken = await signedInUser.getIdToken(true);
      try {
        const exchanged = await exchangeFirebaseForAdmin2Session(idToken, rememberMe);
        if (exchanged.ok && exchanged.user) {
          setLockNotice('');
          setAuthError('');
          setSessionUser(exchanged.user);
          return;
        }
      } catch (exchangeErr) {
        // Fallback only for legacy Firestore co-editors who explicitly authenticated
        const firebaseAllowed = await checkIsAuthorizedAdmin(signedInUser).catch(() => false);
        if (firebaseAllowed) {
          const owner = isAdminOwnerEmail(signedInUser.email);
          setLockNotice('');
          setAuthError('');
          setSessionUser({
            id: signedInUser.uid,
            email: (signedInUser.email || '').toLowerCase(),
            fullName: signedInUser.displayName || signedInUser.email || 'CoffeeNadu Editor',
            role: owner ? 'super_admin' : 'editor',
            permissions: owner
              ? [...ROLE_DEFAULT_PERMISSIONS.super_admin]
              : [...ROLE_DEFAULT_PERMISSIONS.editor],
            protectedSuperAdmin: owner,
            authProvider: 'firebase',
          });
          return;
        }
        await signOut(auth).catch(() => undefined);
        setFbUser(null);
        throw exchangeErr;
      }
    } finally {
      setCheckingAuth(false);
    }
  };

  // Auth Handlers (explicit user actions only)
  const handleGoogleSignIn = async (rememberMe: boolean) => {
    setAuthError('');
    setLockNotice('');
    setVerificationMessage('');
    setSigningInGoogle(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await completeExplicitFirebaseLogin(cred.user, rememberMe);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Sign-in popup was closed. Please try again.');
      } else {
        setAuthError(msg);
      }
    } finally {
      setSigningInGoogle(false);
    }
  };

  const handleFirebasePasswordSignIn = async (
    email: string,
    password: string,
    rememberMe: boolean
  ) => {
    setAuthError('');
    setLockNotice('');
    setVerificationMessage('');
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await completeExplicitFirebaseLogin(cred.user, rememberMe);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        throw new Error(
          'Invalid email or password. (If you are a new editor, use your Admin 2.0 password or Google Sign-In.)'
        );
      }
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        throw new Error('Invalid email or password.');
      }
      throw err instanceof Error ? err : new Error('Unable to sign in.');
    }
  };

  const handleAdmin2PasswordLoginSuccess = (loggedInUser: Admin2SessionUser) => {
    setAuthError('');
    setLockNotice('');
    setSessionUser(loggedInUser);
    setCheckingAuth(false);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('activate') || url.searchParams.has('reset')) {
        url.searchParams.delete('activate');
        url.searchParams.delete('reset');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    } catch {
      // Ignore history API issues
    }
  };

  const handleSendVerification = async () => {
    if (!fbUser) return;
    setAuthError('');
    setVerificationMessage('');
    setSendingVerification(true);
    try {
      await sendEmailVerification(fbUser);
      setVerificationMessage(
        `Verification email sent to ${fbUser.email}. Click the link in your inbox, then press "I've Verified — Refresh".`
      );
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to send verification email.');
    } finally {
      setSendingVerification(false);
    }
  };

  const handleRefreshVerification = async () => {
    if (!fbUser) return;
    setAuthError('');
    setVerificationMessage('');
    setCheckingAuth(true);
    try {
      await fbUser.reload();
      const refreshedUser = auth.currentUser;
      if (refreshedUser?.emailVerified) {
        await completeExplicitFirebaseLogin(refreshedUser, false);
      } else {
        setAuthError('Email is still not verified. Please click the verification link in your email first.');
      }
      setFbUser(refreshedUser);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not refresh account status.');
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleSignOut = async () => {
    await forceLockAndLogout('user_logout', 'You have been signed out securely.');
  };

  const handleExitApp = async () => {
    await forceLockAndLogout('app_exit', 'Session revoked before exiting CoffeeNadu Admin.');
    if (!requestAndroidAppExit()) {
      onNavigateHome();
    }
  };

  // Preserved Article Publishing & Editing Handler (100% existing behavior)
  const handleSaveArticle = async (payload: AdminArticlePayload) => {
    if (!isAuthenticated) {
      throw new Error('Please sign in with an authorized editor account.');
    }
    setIsSavingArticle(true);
    setDashboardError('');
    setDashboardFeedback('');
    setLastPublishedUrl('');
    setCopiedPublishedUrl(false);
    try {
      let savedArticleId = editingArticle?.id || '';
      if (editingArticle) {
        await updateArticleInFirestore(activeActorUid, editingArticle.id, payload);
      } else {
        savedArticleId = await createArticleInFirestore(activeActorUid, payload);
      }

      if (payload.alsoAddToProgram && payload.programDate) {
        const plainTitle = stripRichTextToPlainText(payload.titleKannada);
        const plainSummary = stripRichTextToPlainText(payload.summaryKannada);
        const plainParagraphs = payload.bodyKannada
          .map((part) => stripRichTextToPlainText(part))
          .filter(Boolean);
        const eventDescription = [plainSummary, ...plainParagraphs]
          .filter((part, idx, arr) => part && (idx === 0 || part !== arr[0]))
          .join('\n\n')
          .slice(0, 2000);

        await createEventInFirestore(activeActorUid, {
          titleKannada: plainTitle,
          descriptionKannada: eventDescription || plainTitle,
          eventDate: payload.programDate,
          eventTime: payload.programTime || '10:00 AM',
          location: payload.location,
          organizer: payload.programOrganizer || payload.reporter || 'Koppa Taluk Committee',
          imageUrl: payload.imageUrl || undefined,
          imageThumbUrl: payload.imageThumbUrl || undefined,
          imageDriveId: payload.imageDriveId || undefined,
          watermarkApplied: payload.watermarkApplied,
        });
      }

      if (savedArticleId) {
        setLastPublishedUrl(buildArticlePublicUrl(savedArticleId));
      }

      setModalOpen(false);
      setEditingArticle(null);
      setDashboardFeedback(
        payload.alsoAddToProgram
          ? editingArticle
            ? 'Article updated and also added to Programs & Events calendar.'
            : 'Published to both News and Programs & Events calendar.'
          : editingArticle
          ? 'Article updated and saved permanently.'
          : 'New article published and saved permanently for all readers.'
      );
      if (activeSection === 'add-article') {
        setActiveSection('news');
      }
    } catch (err) {
      const readable = formatReadableFirestoreError(err);
      setDashboardError(readable);
      throw new Error(readable);
    } finally {
      setIsSavingArticle(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!isAuthenticated) return;
    setDashboardError('');
    setDashboardFeedback('');
    setLastPublishedUrl('');
    try {
      await deleteArticleInFirestore(activeActorUid, id);
      setDashboardFeedback('Article deleted from the live feed.');
    } catch (err) {
      setDashboardError(formatReadableFirestoreError(err));
    }
  };

  // Preserved Programs & Events Handlers
  const handleSaveEvent = async (payload: EventMutationInput) => {
    if (!isAuthenticated) {
      throw new Error('Please sign in with an authorized editor account.');
    }
    setIsSavingEvent(true);
    setDashboardError('');
    setDashboardFeedback('');
    try {
      if (editingEvent) {
        await updateEventInFirestore(editingEvent.id, payload);
      } else {
        await createEventInFirestore(activeActorUid, payload);
      }
      setEventModalOpen(false);
      setEditingEvent(null);
      setDashboardFeedback(
        editingEvent
          ? 'Program/Event updated on the calendar.'
          : 'New Program/Event published and marked on the calendar.'
      );
    } catch (err) {
      const readable = formatReadableFirestoreError(err);
      setDashboardError(readable);
      throw new Error(readable);
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!isAuthenticated) return;
    setDashboardError('');
    setDashboardFeedback('');
    try {
      await deleteEventInFirestore(eventId);
      setDashboardFeedback('Program/Event removed from the calendar.');
    } catch (err) {
      setDashboardError(formatReadableFirestoreError(err));
    }
  };

  // Local Advertisement Publishing, Editing & Deletion Handlers
  const openNewAdComposer = useCallback(() => {
    setEditingAd(null);
    setAdModalOpen(true);
    void fetchAdminAds()
      .then((res) => {
        if (res.nextAdNumber) setNextAdNumber(res.nextAdNumber);
        if (res.settings) setAdPlatformSettings(res.settings);
      })
      .catch(() => {
        // Ignore if fetch fails; backend always assigns authoritative sequential AD number
      });
  }, []);

  const handleSaveAd = async (payload: AdvertisementPayload) => {
    if (!isAuthenticated) {
      throw new Error('Please sign in with an authorized editor account.');
    }
    setIsSavingAd(true);
    setDashboardError('');
    setDashboardFeedback('');
    setLastPublishedUrl('');
    setCopiedPublishedUrl(false);
    try {
      let savedAd: Advertisement;
      if (editingAd) {
        const res = await updateAdminAd(editingAd.id, payload);
        savedAd = res.ad;
      } else {
        const res = await createAdminAd(payload);
        savedAd = res.ad;
        if (res.nextAdNumber) setNextAdNumber(res.nextAdNumber);
      }

      setAdModalOpen(false);
      setEditingAd(null);
      setAdsRefreshNonce((n) => n + 1);
      if (savedAd.status === 'active') {
        setLastPublishedUrl(buildAdPublicUrl(savedAd.id));
      }
      setDashboardFeedback(
        editingAd
          ? `Advertisement ${savedAd.adNumber} updated and saved.`
          : savedAd.status === 'draft'
          ? `Advertisement ${savedAd.adNumber} saved as draft.`
          : `Advertisement ${savedAd.adNumber} published and saved permanently.`
      );
      if (activeSection === 'add-ad') {
        setActiveSection('ads');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save advertisement.';
      setDashboardError(msg);
      throw new Error(msg);
    } finally {
      setIsSavingAd(false);
    }
  };

  const handleDeleteAdFromModal = async (ad: Advertisement) => {
    if (!isAuthenticated) return;
    setDashboardError('');
    setDashboardFeedback('');
    setLastPublishedUrl('');
    const res = await deleteAdminAd(ad.id);
    if (res.nextAdNumber) setNextAdNumber(res.nextAdNumber);
    setAdModalOpen(false);
    setEditingAd(null);
    setAdsRefreshNonce((n) => n + 1);
    setDashboardFeedback(`Advertisement ${ad.adNumber} permanently deleted.`);
  };

  // Preserved Reader Inbox Handlers
  const handleSendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !selectedThreadId || isSendingReply) return;
    const text = replyText.trim();
    if (!text) return;

    setDashboardError('');
    setDashboardFeedback('');
    setIsSendingReply(true);
    try {
      await sendAdminReply({
        threadId: selectedThreadId,
        adminName: sessionUser?.fullName || fbUser?.displayName || fbUser?.email || 'CoffeeNadu Admin',
        text,
      });
      setInboxThreads((prev) =>
        prev.map((t) =>
          t.id === selectedThreadId
            ? {
                ...t,
                lastMessage: text.slice(0, 1000),
                lastSenderRole: 'admin',
                status: 'replied',
                unreadByAdmin: false,
                unreadByReader: true,
              }
            : t
        )
      );
      setReplyText('');
      setDashboardFeedback('Reply sent to reader.');
    } catch (err) {
      setDashboardError(formatReadableFirestoreError(err));
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!isAuthenticated) return;
    setDashboardError('');
    setDashboardFeedback('');
    try {
      await deleteThreadByAdmin(threadId);
      setInboxThreads((prev) => {
        const next = prev.filter((t) => t.id !== threadId);
        if (selectedThreadId === threadId) {
          setSelectedThreadId(next[0]?.id ?? null);
        }
        return next;
      });
      setDashboardFeedback('Conversation deleted from Inbox.');
    } catch (err) {
      setDashboardError(formatReadableFirestoreError(err));
    }
  };

  // Refresh & pagination helpers
  const handleRefreshArticles = async () => {
    if (loadingArticles) return;
    setLoadingArticles(true);
    try {
      await loadInitialArticles({ forceRefresh: true });
      await syncArticleViewCountsFromServer();
    } finally {
      setLoadingArticles(false);
    }
  };

  const handleLoadMoreArticles = async () => {
    if (loadingMoreArticles || !hasMoreArticles) return;
    setLoadingMoreArticles(true);
    try {
      await loadMoreArticles();
    } finally {
      setLoadingMoreArticles(false);
    }
  };

  const handleRefreshEvents = async () => {
    if (loadingEvents) return;
    setLoadingEvents(true);
    try {
      await loadInitialEvents({ forceRefresh: true });
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleRefreshInbox = async () => {
    if (loadingInbox) return;
    setLoadingInbox(true);
    try {
      const res = await loadAdminInboxThreads({ forceRefresh: true });
      setInboxThreads(res.threads);
      setHasMoreThreads(res.hasMore);
    } catch (err) {
      setDashboardError(formatReadableFirestoreError(err));
    } finally {
      setLoadingInbox(false);
    }
  };

  const handleLoadMoreInbox = async () => {
    if (loadingMoreThreads || !hasMoreThreads) return;
    setLoadingMoreThreads(true);
    try {
      const res = await loadMoreAdminInboxThreads(inboxThreads);
      setInboxThreads(res.threads);
      setHasMoreThreads(res.hasMore);
    } catch (err) {
      setDashboardError(formatReadableFirestoreError(err));
    } finally {
      setLoadingMoreThreads(false);
    }
  };

  // Preserved Firebase Co-Editor CRUD
  const handleAddFirebaseCoEditor = async (uid: string, label: string) => {
    if (!fbUser || !isFirebasePrimaryOwner) {
      throw new Error('Sign in with a verified Primary Owner Google account to add legacy Firebase co-editors.');
    }
    await addAdminRecordInFirestore(fbUser.uid, uid, label);
    const updated = await listAdminRecordsFromFirestore();
    setFirebaseCoEditors(updated);
  };

  const handleRemoveFirebaseCoEditor = async (uid: string) => {
    if (!fbUser || !isFirebasePrimaryOwner) {
      throw new Error('Sign in with a verified Primary Owner Google account to remove legacy Firebase co-editors.');
    }
    await removeAdminRecordInFirestore(uid);
    setFirebaseCoEditors((prev) => prev.filter((item) => item.uid !== uid));
  };

  const handleCopyPublishedUrl = async () => {
    if (!lastPublishedUrl) return;
    try {
      await navigator.clipboard.writeText(lastPublishedUrl);
      setCopiedPublishedUrl(true);
      window.setTimeout(() => setCopiedPublishedUrl(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  // Suppress unused warning on hasMoreEvents/loadingMoreEvents while keeping state ready
  void hasMoreEvents;
  void loadingMoreEvents;
  void loadMoreEvents;

  // Loading auth screen
  if (checkingAuth && !sessionUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B192C] px-4 text-white">
        <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
        <p className="mt-3 text-xs font-medium tracking-wide text-slate-300">
          Verifying CoffeeNadu News Admin 2.0 session…
        </p>
      </div>
    );
  }

  // Unauthenticated view (supports Google, Firebase Email/Password, Admin 2.0 Password, Activation & Reset)
  if (!sessionUser) {
    const verificationPendingEmail =
      fbUser && !fbUser.emailVerified ? fbUser.email || 'your email' : null;

    return (
      <Admin2LoginView
        onNavigateHome={onNavigateHome}
        onGoogleSignIn={handleGoogleSignIn}
        onFirebasePasswordSignIn={handleFirebasePasswordSignIn}
        onAdmin2PasswordLoginSuccess={handleAdmin2PasswordLoginSuccess}
        signingInGoogle={signingInGoogle}
        externalError={authError}
        lockNotice={lockNotice}
        reloadNonce={loginReloadNonce}
        verificationPendingEmail={verificationPendingEmail}
        verificationMessage={verificationMessage}
        sendingVerification={sendingVerification}
        onResendVerification={handleSendVerification}
        onRefreshVerification={handleRefreshVerification}
        onSignOutPending={handleSignOut}
        initialActivateToken={initialActivateToken}
        initialResetToken={initialResetToken}
      />
    );
  }

  const openNewArticleComposer = () => {
    setEditingArticle(null);
    setModalOpen(true);
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return (
          <Admin2DashboardSection
            onNavigateSection={(sec) => {
              if (sec === 'add-article') {
                setActiveSection('add-article');
              } else {
                setActiveSection(sec);
              }
            }}
            onUnreadCountChange={setUnreadNotifications}
            onQuickAddArticle={openNewArticleComposer}
            onQuickAddAd={openNewAdComposer}
          />
        );

      case 'news':
        return (
          <Admin2NewsSection
            key={newsInitialView}
            articles={articles}
            sessionUser={sessionUser}
            hasMoreArticles={hasMoreArticles}
            loadingArticles={loadingArticles}
            loadingMoreArticles={loadingMoreArticles}
            onRefreshArticles={handleRefreshArticles}
            onLoadMoreArticles={handleLoadMoreArticles}
            onOpenNewArticleModal={openNewArticleComposer}
            onEditLiveArticle={(article) => {
              setEditingArticle(article);
              setModalOpen(true);
            }}
            onDeleteLiveArticle={handleDeleteArticle}
            onToggleLeadStory={async (articleId, nextFeatured) => {
              setDashboardError('');
              setDashboardFeedback('');
              await toggleArticleLeadStory(articleId, nextFeatured);
              setDashboardFeedback(
                nextFeatured
                  ? 'Article pinned to Lead Story.'
                  : 'Article permanently removed from Lead Story.'
              );
            }}
            initialView={newsInitialView}
          />
        );

      case 'add-article':
        return (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Publish New Article
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Launch the full CoffeeNadu Newsroom Publisher with every existing publishing feature intact — Google Sheets live sync, Google Drive photo upload, automatic CoffeeNadu circular logo + double middle watermark, custom English URL slug, Lead Story expiry timer, unified rich text toolbar, and optional extra photos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewArticleComposer}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#0B192C] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#132945] dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
                >
                  <FilePlus2 className="h-4 w-4" />
                  Open Full News Publisher
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    CoffeeNadu Image Branding
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                    Automatic circular CoffeeNadu logo + two middle text overlays on all newly uploaded main and extra news photos.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    <Type className="h-4 w-4 text-blue-600" />
                    Unified Word Formatting
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                    Single top formatting bar supporting bold, italic, underline, fonts, and sizes across headline, summary, body, and photo caption.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    <Link2 className="h-4 w-4 text-indigo-600" />
                    Custom English URL Slug
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                    Assign readable English links (e.g. <code className="font-mono">koppa-rain-alert</code>) automatically published under the portal URL.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    <Timer className="h-4 w-4 text-amber-600" />
                    Lead Story Expiry Timer
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                    Pin as Lead Story with automatic hours/days expiration or untick anytime to move back to standard feed.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    <Images className="h-4 w-4 text-teal-600" />
                    Extra Photos &amp; Zero-Crop Fit
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                    Attach optional extra photographs displayed after the article body; square and wide images adapt cleanly without cropping.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    <CalendarPlus className="h-4 w-4 text-rose-600" />
                    Calendar Cross-Publishing
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                    Optionally publish the same announcement directly to the Programs &amp; Events calendar in one step.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setNewsInitialView('drafts');
                    setActiveSection('news');
                  }}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <FileEdit className="h-3.5 w-3.5" />
                  Save Draft or Schedule Instead
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('ai-studio')}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Draft with AI News Studio
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingEvent(null);
                    setEventModalOpen(true);
                  }}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Add Program / Event Only
                </button>
                <button
                  type="button"
                  onClick={openNewAdComposer}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-400/70 bg-amber-50 px-4 py-2 text-xs font-semibold text-[#0B192C] hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300"
                >
                  <BadgePlus className="h-3.5 w-3.5" />
                  Add Advertisement Instead
                </button>
              </div>
            </div>
          </div>
        );

      case 'ads':
        return (
          <Admin2AdsSection
            initialTab="dashboard"
            onOpenAddAd={openNewAdComposer}
            onEditAd={(ad) => {
              setEditingAd(ad);
              setAdModalOpen(true);
            }}
            refreshNonce={adsRefreshNonce}
            onDataChanged={(nextNum) => {
              if (nextNum) setNextAdNumber(nextNum);
            }}
          />
        );

      case 'add-ad':
        return (
          <Admin2AdsSection
            initialTab="create"
            onOpenAddAd={openNewAdComposer}
            onEditAd={(ad) => {
              setEditingAd(ad);
              setAdModalOpen(true);
            }}
            refreshNonce={adsRefreshNonce}
            onDataChanged={(nextNum) => {
              if (nextNum) setNextAdNumber(nextNum);
            }}
          />
        );

      case 'calendar':
        return (
          <Admin2CalendarSection
            articles={articles}
            events={eventsList}
            loadingEvents={loadingEvents}
            onRefreshEvents={handleRefreshEvents}
            onOpenAddEvent={() => {
              setEditingEvent(null);
              setEventModalOpen(true);
            }}
            onEditEvent={(ev) => {
              setEditingEvent(ev);
              setEventModalOpen(true);
            }}
            onDeleteEvent={handleDeleteEvent}
            onNavigateNewsScheduled={() => {
              setNewsInitialView('scheduled');
              setActiveSection('news');
            }}
          />
        );

      case 'ai-studio':
        return (
          <Admin2AiStudioSection
            onDraftSaved={() => {
              setDashboardFeedback('AI draft saved to News Management → Drafts (requires editor approval before publishing).');
            }}
          />
        );

      case 'media':
        return <Admin2MediaSection />;

      case 'messaging':
        return (
          <Admin2MessagingSection
            threads={inboxThreads}
            hasMoreThreads={hasMoreThreads}
            loadingInbox={loadingInbox}
            loadingMoreThreads={loadingMoreThreads}
            selectedThreadId={selectedThreadId}
            threadMessages={threadMessages}
            replyText={replyText}
            isSendingReply={isSendingReply}
            onSelectThread={(threadId) => setSelectedThreadId(threadId)}
            onReplyTextChange={setReplyText}
            onSendReply={handleSendReply}
            onDeleteThread={handleDeleteThread}
            onRefreshInbox={handleRefreshInbox}
            onLoadMoreThreads={handleLoadMoreInbox}
          />
        );

      case 'notifications':
        return <Admin2NotificationsSection onUnreadCountChange={setUnreadNotifications} />;

      case 'analytics':
        return <Admin2AnalyticsSection onNavigateSection={setActiveSection} />;

      case 'seo':
        return <Admin2SeoSection />;

      case 'automations':
        return <Admin2AutomationsSection />;

      case 'administrators':
        return (
          <Admin2AdministratorsSection
            sessionUser={sessionUser}
            firebaseCoEditors={firebaseCoEditors}
            loadingCoEditors={loadingCoEditors}
            onAddFirebaseCoEditor={handleAddFirebaseCoEditor}
            onRemoveFirebaseCoEditor={handleRemoveFirebaseCoEditor}
          />
        );

      case 'storage':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Storage Manager (Google Sheets &amp; Google Drive)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live Google Sheets database connection, Google Drive image storage metrics, historical Firebase migration, and Apps Script code tools.
              </p>
            </div>
            <AdminStorageManager
              currentArticles={articles}
              currentEvents={eventsList}
              onDataChanged={async () => {
                await Promise.all([handleRefreshArticles(), handleRefreshEvents()]);
              }}
            />
          </div>
        );

      case 'backups':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Backup and Restore Centre
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Create instant Google Drive backups, inspect previous snapshots with preview-before-restore protection, and download JSON/CSV archives.
              </p>
            </div>
            <AdminStorageManager
              currentArticles={articles}
              currentEvents={eventsList}
              autoOpenBackups={true}
              onDataChanged={async () => {
                await Promise.all([handleRefreshArticles(), handleRefreshEvents()]);
              }}
            />
          </div>
        );

      case 'security':
        return <Admin2SecuritySection />;

      case 'settings':
        return <Admin2SettingsSection />;

      case 'health':
        return <Admin2HealthSection />;

      default:
        return (
          <Admin2DashboardSection
            onNavigateSection={setActiveSection}
            onUnreadCountChange={setUnreadNotifications}
          />
        );
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <Admin2Shell
        activeSection={activeSection}
        onSelectSection={(sec) => {
          if (sec === 'news' && activeSection !== 'news') {
            setNewsInitialView('published');
          }
          setActiveSection(sec);
        }}
        sessionUser={sessionUser}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        unreadNotifications={unreadNotifications}
        unreadMessages={unreadInboxCount}
        onNavigateHome={onNavigateHome}
        onSignOut={() => void handleSignOut()}
        onExitApp={() => void handleExitApp()}
        showExitApp={isAndroidApp}
        onQuickAddArticle={openNewArticleComposer}
        onQuickAddAd={openNewAdComposer}
      >
        {/* Global Feedback & Error Alerts */}
        {dashboardFeedback && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="font-semibold">{dashboardFeedback}</span>
              {lastPublishedUrl && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <a
                    href={lastPublishedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-white/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-800 underline hover:bg-white dark:bg-emerald-900/50 dark:text-emerald-200"
                  >
                    {lastPublishedUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyPublishedUrl()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-200"
                  >
                    {copiedPublishedUrl ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedPublishedUrl ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setDashboardFeedback('');
                setLastPublishedUrl('');
              }}
              className="cursor-pointer rounded p-1 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {dashboardError && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span className="font-semibold">{dashboardError}</span>
            </div>
            <button
              type="button"
              onClick={() => setDashboardError('')}
              className="cursor-pointer rounded p-1 text-rose-700 hover:bg-rose-100 dark:text-rose-300"
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {renderSection()}
      </Admin2Shell>

      {/* Preserved Full News Publisher Modal (MS Word Toolbar, Custom Slug, Lead Timer, Extra Photos, Watermark) */}
      <AdminArticleModal
        isOpen={modalOpen}
        editingArticle={editingArticle}
        existingArticleIds={articles.map((a) => a.id)}
        isSaving={isSavingArticle}
        onClose={() => {
          setModalOpen(false);
          setEditingArticle(null);
        }}
        onSubmit={handleSaveArticle}
      />

      {/* Preserved Programs & Events Modal */}
      <AdminEventModal
        isOpen={eventModalOpen}
        editingEvent={editingEvent}
        isSaving={isSavingEvent}
        onClose={() => {
          setEventModalOpen(false);
          setEditingEvent(null);
        }}
        onSubmit={handleSaveEvent}
      />

      {/* Local Advertisement Publisher Modal */}
      <AdminAdModal
        isOpen={adModalOpen}
        editingAd={editingAd}
        nextAdNumber={nextAdNumber}
        platformSettings={adPlatformSettings}
        isSaving={isSavingAd}
        onClose={() => {
          setAdModalOpen(false);
          setEditingAd(null);
        }}
        onSubmit={handleSaveAd}
        onDelete={handleDeleteAdFromModal}
      />
    </div>
  );
}
