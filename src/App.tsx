import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { AdvancedSearchModal } from './components/AdvancedSearchModal';
import { ArticleDetailView } from './components/ArticleDetailView';
import { BottomMobileNav, type MobileNavTab } from './components/BottomMobileNav';
import { BreakingNewsStrip } from './components/BreakingNewsStrip';
import { BusTimingsSection } from './components/BusTimingsSection';
import { CategoryBar } from './components/CategoryBar';
import { CoffeeCupLogo } from './components/CoffeeCupLogo';
import { FeaturedLeadCarousel } from './components/FeaturedLeadCarousel';
import { FloatingScrollAd } from './components/FloatingScrollAd';
import { Header } from './components/Header';
import { HomepageAdSlot } from './components/HomepageAdSlot';
import { HomepagePopupAd } from './components/HomepagePopupAd';
import { LocalAdsSection } from './components/LocalAdsSection';
import { NotificationCenterDrawer } from './components/NotificationCenterDrawer';
import { PrivacyScreenGuard } from './components/PrivacyScreenGuard';
import { ProgramsEventsSection } from './components/ProgramsEventsSection';
import { RightRail } from './components/RightRail';
import { SavedAndHistoryDrawer } from './components/SavedAndHistoryDrawer';
import { SiteInfoModal, type SiteInfoPageKey } from './components/SiteInfoModal';
import { SupportChatSection } from './components/SupportChatSection';
import { TrendingNewsSection } from './components/TrendingNewsSection';
import { WebsiteEntryAd } from './components/WebsiteEntryAd';
import { WhatsAppGroupBanner } from './components/WhatsAppGroupBanner';
import { matchesSelectedLocation } from './constants/newsData';
import {
  fetchActiveAdById,
  loadActiveAds,
  subscribeToActiveAds,
} from './services/adsClient';
import {
  getArticleByIdFromFirestore,
  loadInitialArticles,
  loadMoreArticles,
  subscribeToArticlesState,
} from './services/articlesStore';
import {
  checkReaderThreadSummaryOnce,
  getOrCreateReaderThreadId,
} from './services/chatStore';
import {
  getEventByIdFromFirestore,
  loadInitialEvents,
  loadMoreEvents,
  subscribeToEventsState,
} from './services/eventsStore';
import { subscribeToQuotaStatus, type QuotaStatus } from './services/firestoreOptimizer';
import type { AdPlatformSettings, Advertisement } from './types/ads';
import type { FilterCategory, NewsArticle, ProgramEvent, SupportThread } from './types/news';
import { createDefaultAdPlatformSettings } from './utils/adHelpers';
import { isArticleActivelyFeatured } from './utils/featuredLead';
import {
  getBreakingNewsArticles,
  getTrendingArticles,
  searchArticlesAdvanced,
  type TimeframeFilter,
} from './utils/newsHelpers';
import {
  clearReadingHistory,
  markArticleIdsNotified,
  persistNotificationFeed,
  persistNotificationSettings,
  persistPublicTheme,
  persistReadingPreferences,
  readBookmarks,
  readNotificationFeed,
  readNotificationSettings,
  readNotifiedArticleIds,
  readInitialPublicTheme,
  readReadingHistory,
  readReadingPreferences,
  recordReadingHistoryEntry,
  removeBookmarkById,
  toggleArticleBookmark,
  type HistoryArticleSnapshot,
  type InAppNotificationItem,
  type PublicThemeMode,
  type ReaderNotificationSettings,
  type ReadingPreferences,
  type SavedArticleSnapshot,
} from './utils/readerPreferences';
import { stripRichTextToPlainText } from './utils/richText';
import { buildArticlePublicUrl } from './utils/slug';
import { auth } from './firebase';
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_FEED_CATEGORIES,
  DEFAULT_HOMEPAGE_ANNOUNCEMENT,
  DEFAULT_MALNAD_LOCALITIES,
  DEFAULT_WEATHER_CONFIG,
  PLATFORM_MODULES,
  PLATFORM_MODULE_MAP,
  STARTER_VERIFIED_PUBLIC_LISTINGS,
} from './constants/platformCatalog';
import {
  fetchPlatformBootstrap,
  loadSavedBundle,
  submitListingReport,
  toggleSavedListingInBundle,
  trackPlatformEvent,
} from './services/platformClient';
import {
  fetchCommunityPosts,
  fetchCommunitySession,
} from './services/communityClient';
import type {
  CommunityCategoryId,
  CommunitySelfProfile,
  PublicCommunityPost,
} from './types/community';
import type {
  AnnouncementButtonConfig,
  DirectoryModuleId,
  FeedCategoryConfig,
  FeedCategoryId,
  HomepageAnnouncementConfig,
  LocalityOption,
  PlatformDisplaySettings,
  PlatformLanguage,
  PlatformListing,
  PlatformModuleId,
  UserSavedBundle,
  WeatherConfig,
  WeatherRainfallRecord,
} from './types/platform';
import {
  buildUnifiedCommunityFeed,
  filterUnifiedCommunityFeed,
  type UnifiedFeedItem,
} from './utils/unifiedFeedHelpers';
import { CoffeenaduCommunityPage } from './components/community/CoffeenaduCommunityPage';
import {
  CommunityComposerModal,
  CommunityRegisterModal,
  CommunityReportModal,
} from './components/community/CommunityModals';
import { ContestPage } from './components/contest/ContestPage';
import { HomepageContestBanner } from './components/contest/HomepageContestBanner';
import { HomepageAnnouncementBanner } from './components/community/HomepageAnnouncementBanner';
import { UnifiedCommunityFeed } from './components/community/UnifiedCommunityFeed';
import { PlatformAccountPage } from './components/platform/PlatformAccountPage';
import { PlatformDirectoryPage } from './components/platform/PlatformDirectoryPage';
import { PlatformExplorePage } from './components/platform/PlatformExplorePage';
import { PlatformGamesPage } from './components/platform/PlatformGamesPage';
import { PlatformWeatherPage } from './components/platform/PlatformWeatherPage';
import { SearchEverythingPage } from './components/platform/SearchEverythingPage';

const PLATFORM_DIRECTORY_ROUTE_MAP: Record<string, DirectoryModuleId> = {
  '/businesses': 'businesses',
  '/jobs': 'jobs',
  '/marketplace': 'marketplace',
  '/agriculture': 'agriculture',
  '/education': 'education',
  '/health': 'health',
  '/schemes': 'schemes',
  '/tourism': 'tourism',
  '/property': 'property',
  '/lost-found': 'lost-found',
  '/grievances': 'grievances',
  '/services': 'services',
  '/offers': 'offers',
  '/contacts': 'contacts',
  '/documents': 'documents',
};

function normalizeRoutePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function readPlatformItemIdFromUrl(): string | null {
  try {
    const id = new URLSearchParams(window.location.search).get('item');
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function readSearchQFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('q') || '';
  } catch {
    return '';
  }
}

function isAdminPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/admin' || normalized.startsWith('/admin/');
}

function isBusTimingsPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/bus-timings' || normalized.startsWith('/bus-timings/');
}

function isEventsPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/events' || normalized.startsWith('/events/');
}

function isChatPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/chat' || normalized.startsWith('/chat/');
}

function isAdsPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/ads' || normalized.startsWith('/ads/');
}

function readArticleIdFromUrl(): string | null {
  try {
    const id = new URLSearchParams(window.location.search).get('article');
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function readEventIdFromUrl(): string | null {
  try {
    const id = new URLSearchParams(window.location.search).get('event');
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function readAdIdFromUrl(): string | null {
  try {
    const id = new URLSearchParams(window.location.search).get('ad');
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function readAdPreviewTokenFromUrl(): string | null {
  try {
    const token = new URLSearchParams(window.location.search).get('preview');
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

function ArticleLoadingSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading selected article"
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10"
    >
      <div className="flex items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-[#10243D] dark:hover:text-white cursor-pointer px-2 -ml-2 min-h-[40px]"
        >
          ← Back to Feed
        </button>
        <div className="h-8 w-36 rounded-md bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
      <div className="py-8 max-w-3xl mx-auto space-y-5">
        <div className="h-4 w-56 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-9 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-9 w-4/5 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-5 w-full rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
        <div className="aspect-[16/9] w-full rounded-md bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="space-y-3 pt-2">
          <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
          <div className="h-4 w-11/12 rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [articlesLoaded, setArticlesLoaded] = useState<boolean>(false);
  const [hasMoreArticles, setHasMoreArticles] = useState<boolean>(false);
  const [loadingMoreArticles, setLoadingMoreArticles] = useState<boolean>(false);
  const [events, setEvents] = useState<ProgramEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState<boolean>(false);
  const [hasMoreEvents, setHasMoreEvents] = useState<boolean>(false);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState<boolean>(false);
  const [directEvent, setDirectEvent] = useState<ProgramEvent | null>(null);
  const [directEventLoading, setDirectEventLoading] = useState<boolean>(() =>
    Boolean(readEventIdFromUrl())
  );
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus>({
    quotaExceeded: false,
    lastErrorAt: 0,
    cooldownUntil: 0,
    message: '',
  });
  const [readerThread, setReaderThread] = useState<SupportThread | null>(null);
  const readerThreadId = useMemo(() => getOrCreateReaderThreadId(), []);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('All');
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(() =>
    readArticleIdFromUrl()
  );
  const [directArticle, setDirectArticle] = useState<NewsArticle | null>(null);
  const [directArticleLoading, setDirectArticleLoading] = useState<boolean>(() =>
    Boolean(readArticleIdFromUrl())
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() =>
    readEventIdFromUrl()
  );
  const [activeAds, setActiveAds] = useState<Advertisement[]>([]);
  const [adSettings, setAdSettings] = useState<AdPlatformSettings>(() =>
    createDefaultAdPlatformSettings()
  );
  const [adsLoaded, setAdsLoaded] = useState<boolean>(false);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(() =>
    readAdIdFromUrl()
  );
  const [selectedAdPreviewToken, setSelectedAdPreviewToken] = useState<string | null>(() =>
    readAdPreviewTokenFromUrl()
  );
  const [directAd, setDirectAd] = useState<Advertisement | null>(null);
  const [isDirectAdPreview, setIsDirectAdPreview] = useState<boolean>(false);
  const [directAdLoading, setDirectAdLoading] = useState<boolean>(() =>
    Boolean(readAdIdFromUrl())
  );
  const [entryOverlayActive, setEntryOverlayActive] = useState<boolean>(false);
  const [leadNowMs, setLeadNowMs] = useState<number>(() => Date.now());

  // Frontend 2.0 + Reader Addons state
  const [publicTheme, setPublicTheme] = useState<PublicThemeMode>(() => readInitialPublicTheme());
  const [readingPrefs, setReadingPrefs] = useState<ReadingPreferences>(() =>
    readReadingPreferences()
  );
  const [bookmarks, setBookmarks] = useState<SavedArticleSnapshot[]>(() => readBookmarks());
  const [readingHistory, setReadingHistory] = useState<HistoryArticleSnapshot[]>(() =>
    readReadingHistory()
  );
  const [notifSettings, setNotifSettings] = useState<ReaderNotificationSettings>(() =>
    readNotificationSettings()
  );
  const [notificationFeed, setNotificationFeed] = useState<InAppNotificationItem[]>(() =>
    readNotificationFeed()
  );
  const [browserNotifPermission, setBrowserNotifPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'unsupported'
  );
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [libraryDrawerTab, setLibraryDrawerTab] = useState<'saved' | 'history' | null>(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [siteInfoPage, setSiteInfoPage] = useState<SiteInfoPageKey | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileNavTab>('home');

  // Coffeenadu Malnad Platform (22-module ecosystem) state
  const [platformLang, setPlatformLang] = useState<PlatformLanguage>(() => {
    try {
      const saved = window.localStorage.getItem('coffeenadu_lang');
      return saved === 'en' ? 'en' : 'kn';
    } catch {
      return 'kn';
    }
  });
  const [platformLocalities, setPlatformLocalities] = useState<LocalityOption[]>(
    DEFAULT_MALNAD_LOCALITIES
  );
  const [platformModuleCounts, setPlatformModuleCounts] = useState<Record<string, number>>({});
  const [platformListings, setPlatformListings] = useState<PlatformListing[]>(
    STARTER_VERIFIED_PUBLIC_LISTINGS
  );
  const [popularSearches, setPopularSearches] = useState<Array<{ term: string; count: number }>>([]);
  const [weatherConfig, setWeatherConfig] = useState<WeatherConfig>(DEFAULT_WEATHER_CONFIG);
  const [weatherLogs, setWeatherLogs] = useState<WeatherRainfallRecord[]>([]);
  const [savedBundle, setSavedBundle] = useState<UserSavedBundle>(() => loadSavedBundle());
  const [platformItemId, setPlatformItemId] = useState<string | null>(() =>
    readPlatformItemIdFromUrl()
  );
  const [platformSearchInitialQ, setPlatformSearchInitialQ] = useState<string>(() =>
    readSearchQFromUrl()
  );

  // Unified Homepage Feed, Admin Announcement Banner, Display Settings & 31 Categories state
  const [homepageAnnouncement, setHomepageAnnouncement] = useState<HomepageAnnouncementConfig>(
    DEFAULT_HOMEPAGE_ANNOUNCEMENT
  );
  const [feedCategories, setFeedCategories] = useState<FeedCategoryConfig[]>(
    DEFAULT_FEED_CATEGORIES
  );
  const [displaySettings, setDisplaySettings] = useState<PlatformDisplaySettings>(
    DEFAULT_DISPLAY_SETTINGS
  );
  const [activeFeedCategory, setActiveFeedCategory] = useState<FeedCategoryId>('all');
  const [feedSort, setFeedSort] = useState<'latest' | 'popular'>('latest');
  const [feedError, setFeedError] = useState<string | null>(null);
  const [reportingCommunityPost, setReportingCommunityPost] = useState<PublicCommunityPost | null>(
    null
  );
  const [reportingPlatformListing, setReportingPlatformListing] = useState<PlatformListing | null>(
    null
  );
  const [platformReportReason, setPlatformReportReason] = useState('ತಪ್ಪು ಅಥವಾ ಹಳೆಯ ಮಾಹಿತಿ');
  const [platformReportDetails, setPlatformReportDetails] = useState('');
  const [platformReportSaving, setPlatformReportSaving] = useState(false);
  const [platformReportDone, setPlatformReportDone] = useState(false);

  // Coffeenadu Community (simple name + mobile registration, instant publish) state
  const [communityUser, setCommunityUser] = useState<CommunitySelfProfile | null>(null);
  const [communityPosts, setCommunityPosts] = useState<PublicCommunityPost[]>([]);
  const [communityFeedLoaded, setCommunityFeedLoaded] = useState(false);
  const [communityInitialCategory, setCommunityInitialCategory] = useState<
    CommunityCategoryId | 'all'
  >('all');
  const [homepageCommunityRegisterOpen, setHomepageCommunityRegisterOpen] = useState(false);
  const [homepageCommunityComposerOpen, setHomepageCommunityComposerOpen] = useState(false);
  const [pendingOpenComposerAfterRegister, setPendingOpenComposerAfterRegister] = useState(false);

  const recordedHistoryArticleIdRef = useRef<string | null>(null);

  const adminRouteActive = isAdminPath(pathname);

  const refreshPlatformBootstrap = useCallback(() => {
    fetchPlatformBootstrap()
      .then((data) => {
        setFeedError(null);
        if (data.localities?.length) setPlatformLocalities(data.localities);
        if (data.moduleCounts) setPlatformModuleCounts(data.moduleCounts);
        if (Array.isArray(data.featuredListings)) setPlatformListings(data.featuredListings);
        if (Array.isArray(data.popularSearches)) setPopularSearches(data.popularSearches);
        if (data.weatherConfig) setWeatherConfig(data.weatherConfig);
        if (Array.isArray(data.latestWeatherLogs)) setWeatherLogs(data.latestWeatherLogs);
        if (data.homepageAnnouncement) setHomepageAnnouncement(data.homepageAnnouncement);
        if (Array.isArray(data.feedCategories) && data.feedCategories.length > 0) {
          setFeedCategories(data.feedCategories);
        }
        if (data.displaySettings) {
          setDisplaySettings({
            ...DEFAULT_DISPLAY_SETTINGS,
            ...data.displaySettings,
            showViewCounts: Boolean(data.displaySettings.showViewCounts),
          });
        }
      })
      .catch(() => {
        // Keep starter defaults gracefully if offline
      });
  }, []);

  const refreshCommunityPublicFeed = useCallback(() => {
    fetchCommunityPosts({ limit: 100 })
      .then((res) => {
        if (Array.isArray(res.posts)) setCommunityPosts(res.posts);
        setCommunityFeedLoaded(true);
      })
      .catch(() => {
        setCommunityFeedLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!adminRouteActive) {
      refreshPlatformBootstrap();
      refreshCommunityPublicFeed();
      fetchCommunitySession()
        .then((res) => setCommunityUser(res.authenticated ? res.profile : null))
        .catch(() => setCommunityUser(null));
    }
  }, [adminRouteActive, refreshPlatformBootstrap, refreshCommunityPublicFeed]);

  const handleTogglePlatformLang = useCallback((next: PlatformLanguage) => {
    setPlatformLang(next);
    try {
      window.localStorage.setItem('coffeenadu_lang', next);
    } catch {
      // ignore
    }
  }, []);

  const handleToggleSaveListing = useCallback((module: DirectoryModuleId, id: string) => {
    setSavedBundle((prev) => toggleSavedListingInBundle(prev, module, id));
  }, []);

  // Sync theme and reduced motion classes on documentElement for public routes
  useEffect(() => {
    if (adminRouteActive) {
      document.documentElement.classList.remove('dark');
      return;
    }
    persistPublicTheme(publicTheme);
  }, [publicTheme, adminRouteActive]);

  useEffect(() => {
    persistReadingPreferences(readingPrefs);
  }, [readingPrefs]);

  useEffect(() => {
    try {
      if ('caches' in window && window.caches && typeof window.caches.keys === 'function') {
        void window.caches
          .keys()
          .then((keys) =>
            Promise.allSettled(
              keys
                .filter((key) => !key.startsWith('coffeenadu-admin-shell-'))
                .map((key) => window.caches.delete(key))
            )
          )
          .catch(() => {});
      }
    } catch {
      // Ignore cache cleanup errors
    }

    const handlePopState = () => {
      setPathname(window.location.pathname);
      setSelectedArticleId(readArticleIdFromUrl());
      setSelectedEventId(readEventIdFromUrl());
      setSelectedAdId(readAdIdFromUrl());
      setSelectedAdPreviewToken(readAdPreviewTokenFromUrl());
      setPlatformItemId(readPlatformItemIdFromUrl());
      setPlatformSearchInitialQ(readSearchQFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Subscribe to in-memory shared stores & quota monitor
  useEffect(() => {
    const unsubArticles = subscribeToArticlesState((state) => {
      setArticles(state.articles);
      setArticlesLoaded(state.loaded);
      setHasMoreArticles(state.hasMore);
    });
    const unsubEvents = subscribeToEventsState((state) => {
      setEvents(state.events);
      setEventsLoaded(state.loaded);
      setHasMoreEvents(state.hasMore);
    });
    const unsubAds = subscribeToActiveAds((state) => {
      setActiveAds(state.ads);
      setAdSettings(state.settings);
      setAdsLoaded(state.loaded);
    });
    const unsubQuota = subscribeToQuotaStatus((nextStatus) => {
      setQuotaStatus(nextStatus);
    });
    return () => {
      unsubArticles();
      unsubEvents();
      unsubAds();
      unsubQuota();
    };
  }, []);

  const busTimingsActiveCheck = isBusTimingsPath(pathname);
  const eventsActiveCheck = isEventsPath(pathname);
  const chatActiveCheck = isChatPath(pathname);
  const adsActiveCheck = isAdsPath(pathname);

  useEffect(() => {
    if (adminRouteActive) return;
    void loadActiveAds();
  }, [adminRouteActive]);

  useEffect(() => {
    if (
      adminRouteActive ||
      busTimingsActiveCheck ||
      eventsActiveCheck ||
      chatActiveCheck ||
      adsActiveCheck ||
      selectedArticleId ||
      selectedAdId
    ) {
      return;
    }
    void loadInitialArticles();
  }, [
    adminRouteActive,
    busTimingsActiveCheck,
    eventsActiveCheck,
    chatActiveCheck,
    adsActiveCheck,
    selectedArticleId,
    selectedAdId,
  ]);

  useEffect(() => {
    if (adminRouteActive || selectedEventId) {
      return;
    }
    void loadInitialEvents();
  }, [adminRouteActive, eventsActiveCheck, selectedEventId]);

  useEffect(() => {
    if (adminRouteActive) return;
    let cancelled = false;
    void checkReaderThreadSummaryOnce(readerThreadId).then((thread) => {
      if (!cancelled) {
        setReaderThread(thread);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [adminRouteActive, readerThreadId, chatActiveCheck]);

  useEffect(() => {
    if (!selectedArticleId) {
      setDirectArticle(null);
      setDirectArticleLoading(false);
      return;
    }

    const fromList = articles.find((a) => a.id === selectedArticleId);
    if (fromList) {
      setDirectArticle(fromList);
      setDirectArticleLoading(false);
      return;
    }

    let cancelled = false;
    setDirectArticle(null);
    setDirectArticleLoading(true);

    void getArticleByIdFromFirestore(selectedArticleId)
      .then((found) => {
        if (cancelled) return;
        setDirectArticle(found);
        setDirectArticleLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setDirectArticleLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedArticleId, articles]);

  useEffect(() => {
    if (!eventsActiveCheck || !selectedEventId) {
      setDirectEvent(null);
      setDirectEventLoading(false);
      return;
    }

    const fromList = events.find((ev) => ev.id === selectedEventId);
    if (fromList) {
      setDirectEvent(fromList);
      setDirectEventLoading(false);
      return;
    }

    let cancelled = false;
    setDirectEvent(null);
    setDirectEventLoading(true);

    void getEventByIdFromFirestore(selectedEventId)
      .then((found) => {
        if (cancelled) return;
        setDirectEvent(found);
        setDirectEventLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setDirectEventLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [eventsActiveCheck, selectedEventId, events]);

  useEffect(() => {
    if (!selectedAdId) {
      setDirectAd(null);
      setIsDirectAdPreview(false);
      setDirectAdLoading(false);
      return;
    }

    if (!selectedAdPreviewToken) {
      const fromList = activeAds.find(
        (a) =>
          a.id === selectedAdId ||
          a.adNumber.toUpperCase() === selectedAdId.toUpperCase() ||
          (a.sharing?.customSlug && a.sharing.customSlug.toLowerCase() === selectedAdId.toLowerCase())
      );
      if (fromList) {
        setDirectAd(fromList);
        setIsDirectAdPreview(false);
        setDirectAdLoading(false);
        return;
      }
    }

    let cancelled = false;
    setDirectAd(null);
    setDirectAdLoading(true);
    void fetchActiveAdById(selectedAdId, selectedAdPreviewToken)
      .then((res) => {
        if (cancelled) return;
        setDirectAd(res?.ad ?? null);
        setIsDirectAdPreview(Boolean(res?.isPreview));
        if (res?.settings) setAdSettings(res.settings);
        setDirectAdLoading(false);
      })
      .catch(() => {
        if (!cancelled) setDirectAdLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAdId, selectedAdPreviewToken, activeAds]);

  const handleLoadMoreArticles = async () => {
    if (loadingMoreArticles || !hasMoreArticles) return;
    setLoadingMoreArticles(true);
    try {
      await loadMoreArticles();
    } finally {
      setLoadingMoreArticles(false);
    }
  };

  const handleLoadMoreEvents = async () => {
    if (loadingMoreEvents || !hasMoreEvents) return;
    setLoadingMoreEvents(true);
    try {
      await loadMoreEvents();
    } finally {
      setLoadingMoreEvents(false);
    }
  };

  const navigateTo = (targetPath: string, instantScroll = false) => {
    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (currentFull !== targetPath) {
      window.history.pushState({}, '', targetPath);
      setPathname(targetPath.split('?')[0] || '/');
    }
    window.scrollTo({ top: 0, behavior: instantScroll ? 'auto' : 'smooth' });
  };

  const filteredArticles = useMemo(
    () =>
      searchArticlesAdvanced(
        articles,
        {
          query: searchQuery,
          category: activeCategory,
          location: selectedLocation,
          timeframe,
        },
        leadNowMs,
        matchesSelectedLocation
      ),
    [articles, activeCategory, selectedLocation, timeframe, searchQuery, leadNowMs]
  );

  const selectedArticle = useMemo(() => {
    if (!selectedArticleId) return null;
    const fromFeed = articles.find((a) => a.id === selectedArticleId);
    if (fromFeed) return fromFeed;
    if (directArticle && directArticle.id === selectedArticleId) {
      return directArticle;
    }
    return null;
  }, [articles, selectedArticleId, directArticle]);

  // Record reading history automatically when an article opens
  useEffect(() => {
    if (!selectedArticle) {
      recordedHistoryArticleIdRef.current = null;
      return;
    }
    if (recordedHistoryArticleIdRef.current === selectedArticle.id) return;
    recordedHistoryArticleIdRef.current = selectedArticle.id;
    setReadingHistory(recordReadingHistoryEntry(selectedArticle));
  }, [selectedArticle]);

  // Keep client-side <title> and OG/Twitter/canonical meta tags synced during SPA transitions
  useEffect(() => {
    if (adminRouteActive) return;
    const setMetaAttr = (selector: string, content: string) => {
      const el = document.querySelector(selector);
      if (el && content) el.setAttribute('content', content);
    };
    const setCanonicalHref = (href: string) => {
      const link = document.querySelector('link[rel="canonical"]');
      if (link) link.setAttribute('href', href);
    };

    if (selectedArticle) {
      const cleanTitle = stripRichTextToPlainText(selectedArticle.titleKannada);
      const cleanSummary =
        stripRichTextToPlainText(selectedArticle.summaryKannada) ||
        'Local Koppa Taluk Kannada news update on Coffeenadu News.';
      const canonicalArticleUrl = buildArticlePublicUrl(selectedArticle.id);
      const ogImage = `https://coffeenadu.in/api/article-image/${encodeURIComponent(selectedArticle.id)}`;

      document.title = `${cleanTitle} — Coffeenadu News`;
      setMetaAttr('meta[name="description"]', cleanSummary.slice(0, 280));
      setMetaAttr('meta[property="og:type"]', 'article');
      setMetaAttr('meta[property="og:title"]', cleanTitle);
      setMetaAttr('meta[property="og:description"]', cleanSummary.slice(0, 280));
      setMetaAttr('meta[property="og:url"]', canonicalArticleUrl);
      setMetaAttr('meta[property="og:image"]', ogImage);
      setMetaAttr('meta[name="twitter:title"]', cleanTitle);
      setMetaAttr('meta[name="twitter:description"]', cleanSummary.slice(0, 280));
      setMetaAttr('meta[name="twitter:image"]', ogImage);
      setCanonicalHref(canonicalArticleUrl);
      return;
    }

    const normalized = normalizeRoutePath(pathname);
    const isCommunityPathCheck =
      normalized === '/community' ||
      normalized === '/community/dashboard' ||
      normalized === '/my-posts' ||
      normalized.startsWith('/community/');
    const matchedDirModuleId = PLATFORM_DIRECTORY_ROUTE_MAP[normalized];
    const matchedMeta = matchedDirModuleId
      ? PLATFORM_MODULE_MAP[matchedDirModuleId]
      : normalized === '/weather'
      ? PLATFORM_MODULE_MAP.weather
      : normalized === '/games'
      ? PLATFORM_MODULE_MAP.games
      : normalized === '/account'
      ? PLATFORM_MODULE_MAP.account
      : null;

    const defaultDesc = isCommunityPathCheck
      ? 'COFFEENADU COMMUNITY – ನಮ್ಮ ಮಲೆನಾಡು ಸಮುದಾಯ. ಕೊಪ್ಪ, ಶೃಂಗೇರಿ, ಜಯಪುರ, ಬಾಳೆಹೊನ್ನೂರು ಮತ್ತು ಮಲೆನಾಡು ಜನರ ಅಂಗಡಿ, ಮಾರಾಟ, ಸೇವೆ, ಉದ್ಯೋಗ ಮತ್ತು ಸ್ಥಳೀಯ ಮಾಹಿತಿ.'
      : matchedMeta
      ? `${matchedMeta.shortDescEn} — Coffeenadu Malnad Digital Platform.`
      : normalized === '/explore'
      ? 'Explore all 22 Malnad digital platform services for Koppa, Jayapura, Hariharapura, Sringeri, Balehonnur, and N.R. Pura.'
      : normalized === '/search'
      ? 'Search everything across Malnad news, local businesses, jobs, marketplace, bus timings, events, and government schemes.'
      : 'Coffeenadu — Malnad Digital Platform & Koppa Taluk local Kannada news, businesses, jobs, bus timings, and community services.';
    const defaultImage = 'https://coffeenadu.in/api/og-default-image';
    const defaultTitle = isCommunityPathCheck
      ? 'COFFEENADU COMMUNITY – ನಮ್ಮ ಮಲೆನಾಡು ಸಮುದಾಯ'
      : matchedMeta
      ? `${matchedMeta.titleKn} (${matchedMeta.titleEn}) — Coffeenadu`
      : normalized === '/explore'
      ? 'Explore Malnad Services — Coffeenadu'
      : normalized === '/search'
      ? 'Search Everything — Coffeenadu'
      : busTimingsActiveCheck
      ? 'Bus Timings — Coffeenadu News'
      : eventsActiveCheck
      ? 'Programs & Events — Coffeenadu News'
      : adsActiveCheck
      ? 'Local Advertisements — Coffeenadu News'
      : chatActiveCheck
      ? 'Message Editorial Desk — Coffeenadu News'
      : 'Coffeenadu — Malnad Digital Platform & Koppa Taluk Local News';
    const canonicalRoute = isCommunityPathCheck
      ? `https://coffeenadu.in${normalized}`
      : matchedMeta
      ? `https://coffeenadu.in${normalized}`
      : normalized === '/explore' || normalized === '/search'
      ? `https://coffeenadu.in${normalized}`
      : busTimingsActiveCheck
      ? 'https://coffeenadu.in/bus-timings'
      : eventsActiveCheck
      ? 'https://coffeenadu.in/events'
      : adsActiveCheck
      ? 'https://coffeenadu.in/ads'
      : 'https://coffeenadu.in/';

    document.title = defaultTitle;
    setMetaAttr('meta[name="description"]', defaultDesc);
    setMetaAttr('meta[property="og:type"]', 'website');
    setMetaAttr('meta[property="og:title"]', defaultTitle);
    setMetaAttr('meta[property="og:description"]', defaultDesc);
    setMetaAttr('meta[property="og:url"]', canonicalRoute);
    setMetaAttr('meta[property="og:image"]', defaultImage);
    setMetaAttr('meta[name="twitter:title"]', defaultTitle);
    setMetaAttr('meta[name="twitter:description"]', defaultDesc);
    setMetaAttr('meta[name="twitter:image"]', defaultImage);
    setCanonicalHref(canonicalRoute);
  }, [
    adminRouteActive,
    pathname,
    selectedArticle,
    busTimingsActiveCheck,
    eventsActiveCheck,
    adsActiveCheck,
    chatActiveCheck,
  ]);

  const isWaitingForSelectedArticle = Boolean(
    selectedArticleId && !selectedArticle && (!articlesLoaded || directArticleLoading)
  );

  const relatedArticles = useMemo(() => {
    if (!selectedArticle) return [];
    return articles
      .filter((a) => a.id !== selectedArticle.id && a.category === selectedArticle.category)
      .slice(0, 4);
  }, [articles, selectedArticle]);

  const breakingArticles = useMemo(
    () => getBreakingNewsArticles(articles, leadNowMs, 6),
    [articles, leadNowMs]
  );

  const trendingResult = useMemo(() => getTrendingArticles(articles, 5), [articles]);

  // Populate in-app alerts & optionally dispatch browser notifications once per article ID
  useEffect(() => {
    if (adminRouteActive || !articlesLoaded || breakingArticles.length === 0) return;

    const existingIds = new Set(notificationFeed.map((n) => n.articleId));
    const additions: InAppNotificationItem[] = [];

    for (const item of breakingArticles.slice(0, 5)) {
      if (!existingIds.has(item.id)) {
        additions.push({
          id: `notif-${item.id}`,
          articleId: item.id,
          title: stripRichTextToPlainText(item.titleKannada),
          category: item.category,
          location: item.location,
          createdAt: item.publishedTimestamp || Date.now(),
          read: false,
        });
      }
    }

    if (additions.length > 0) {
      const nextFeed = [...additions, ...notificationFeed].slice(0, 20);
      setNotificationFeed(nextFeed);
      persistNotificationFeed(nextFeed);
    }

    if (
      notifSettings.browserEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'granted'
    ) {
      const alreadyNotified = readNotifiedArticleIds();
      const fresh = breakingArticles.filter((a) => !alreadyNotified.has(a.id)).slice(0, 2);
      if (fresh.length > 0) {
        for (const item of fresh) {
          try {
            const notif = new window.Notification('Coffeenadu Breaking News', {
              body: stripRichTextToPlainText(item.titleKannada),
              icon: '/pwa-192x192.png',
              tag: `cn-breaking-${item.id}`,
            });
            notif.onclick = () => {
              window.focus();
              handleOpenArticle(item);
              notif.close();
            };
          } catch {
            // Ignore browser Notification restrictions
          }
        }
        markArticleIdsNotified(fresh.map((a) => a.id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminRouteActive, articlesLoaded, breakingArticles, notifSettings.browserEnabled]);

  const busTimingsActive = isBusTimingsPath(pathname);
  const eventsActive = isEventsPath(pathname);
  const chatActive = isChatPath(pathname);
  const adsActive = isAdsPath(pathname);
  const normalizedPathname = normalizeRoutePath(pathname);
  const isCommunityRoot = normalizedPathname === '/community';
  const isCommunityDashboard =
    normalizedPathname === '/community/dashboard' || normalizedPathname === '/my-posts';
  const communityPostSlug = useMemo(() => {
    if (
      normalizedPathname.startsWith('/community/') &&
      normalizedPathname !== '/community/dashboard'
    ) {
      const raw = normalizedPathname.slice('/community/'.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
    return null;
  }, [normalizedPathname]);
  const communityActive = isCommunityRoot || isCommunityDashboard || Boolean(communityPostSlug);

  const activeDirectoryModule: DirectoryModuleId | null =
    PLATFORM_DIRECTORY_ROUTE_MAP[normalizedPathname] || null;
  const weatherActive = normalizedPathname === '/weather';
  const gamesActive = normalizedPathname === '/games';
  const exploreActive = normalizedPathname === '/explore';
  const accountActive = normalizedPathname === '/account';
  const searchPageActive = normalizedPathname === '/search';
  const contestActive = normalizedPathname === '/contest';
  const isPlatformSubroute = Boolean(
    communityActive ||
      contestActive ||
      activeDirectoryModule ||
      weatherActive ||
      gamesActive ||
      exploreActive ||
      accountActive ||
      searchPageActive
  );

  const isSpecialRoute =
    busTimingsActive ||
    eventsActive ||
    chatActive ||
    adsActive ||
    contestActive ||
    isPlatformSubroute;

  useEffect(() => {
    if (adminRouteActive) return;
    const activeModName =
      (communityActive ? 'community' : null) ||
      activeDirectoryModule ||
      (weatherActive
        ? 'weather'
        : gamesActive
          ? 'games'
          : exploreActive
            ? 'explore'
            : accountActive
              ? 'account'
              : searchPageActive
                ? 'search'
                : busTimingsActive
                  ? 'transport'
                  : eventsActive
                    ? 'events'
                    : 'news');
    trackPlatformEvent({
      type: 'page_view',
      module: activeModName,
      location: selectedLocation === 'All' ? 'all' : selectedLocation,
    });
  }, [
    adminRouteActive,
    communityActive,
    activeDirectoryModule,
    weatherActive,
    gamesActive,
    exploreActive,
    accountActive,
    searchPageActive,
    busTimingsActive,
    eventsActive,
    selectedLocation,
  ]);

  const handleOpenCommunity = (category?: CommunityCategoryId) => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    setCommunityInitialCategory(category || 'all');
    setActiveMobileTab('explore');
    navigateTo('/community');
  };

  const handleOpenCommunityDashboard = () => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    setActiveMobileTab('explore');
    navigateTo('/community/dashboard');
  };

  const handleOpenCommunityPost = (slug: string) => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    navigateTo(`/community/${encodeURIComponent(slug)}`);
  };

  const handleHomepageAddInformation = () => {
    if (communityUser) {
      setHomepageCommunityComposerOpen(true);
    } else {
      setPendingOpenComposerAfterRegister(true);
      setHomepageCommunityRegisterOpen(true);
    }
  };

  const handleNavigatePlatformModule = (modId: PlatformModuleId, listingId?: string) => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    setPlatformItemId(listingId || null);

    if (modId === 'news') {
      handleResetHome();
      return;
    }
    if (modId === 'community') {
      handleOpenCommunity();
      return;
    }
    if (modId === 'transport') {
      setActiveMobileTab('services');
      navigateTo('/bus-timings');
      return;
    }
    if (modId === 'events') {
      setActiveMobileTab('explore');
      navigateTo('/events');
      return;
    }

    const meta = PLATFORM_MODULE_MAP[modId];
    const targetRoute = meta?.route || '/explore';
    if (modId === 'marketplace') setActiveMobileTab('marketplace');
    else if (modId === 'businesses' || modId === 'services') setActiveMobileTab('services');
    else setActiveMobileTab('explore');

    const fullPath = listingId
      ? `${targetRoute}?item=${encodeURIComponent(listingId)}`
      : targetRoute;
    navigateTo(fullPath);
  };

  const handleOpenSearchEverything = (q?: string) => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    setPlatformSearchInitialQ(q || '');
    const target = q && q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search';
    navigateTo(target);
  };

  const handleExploreAllServices = () => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    setActiveMobileTab('explore');
    navigateTo('/explore');
  };

  const handleSelectFeedCategory = (categoryId: FeedCategoryId) => {
    setActiveFeedCategory(categoryId);
    if (categoryId === 'all') setActiveCategory('All');
    else if (categoryId === 'local') setActiveCategory('Local');
    else if (categoryId === 'malnad') setActiveCategory('Malnad');
    else if (categoryId === 'agriculture') setActiveCategory('Agriculture');
    else if (categoryId === 'health') setActiveCategory('Health');
    else if (categoryId === 'entertainment') setActiveCategory('Entertainment');
    else if (categoryId === 'crime') setActiveCategory('Crime');
    else if (categoryId === 'general') setActiveCategory('General');
    else if (categoryId === 'education') setActiveCategory('Education');
    else if (categoryId === 'politics') setActiveCategory('Politics');
    else if (categoryId === 'sports') setActiveCategory('Sports');
    else if (categoryId === 'culture') setActiveCategory('Culture');
    else if (categoryId === 'civic-roads') setActiveCategory('Civic & Roads');
    else if (categoryId === 'special') setActiveCategory('Special');
    else if (categoryId === 'state') setActiveCategory('State');
    else if (categoryId === 'nation') setActiveCategory('Nation');
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    setActiveMobileTab('home');
    if (isSpecialRoute || window.location.search) {
      navigateTo('/');
    }
  };

  const handleSelectCategory = (category: FilterCategory) => {
    setActiveCategory(category);
    if (category === 'All') setActiveFeedCategory('news');
    else if (category === 'Local') setActiveFeedCategory('local');
    else if (category === 'Malnad') setActiveFeedCategory('malnad');
    else if (category === 'Agriculture') setActiveFeedCategory('agriculture');
    else if (category === 'Health') setActiveFeedCategory('health');
    else if (category === 'Entertainment') setActiveFeedCategory('entertainment');
    else if (category === 'Crime') setActiveFeedCategory('crime');
    else if (category === 'General') setActiveFeedCategory('general');
    else if (category === 'Education') setActiveFeedCategory('education');
    else setActiveFeedCategory('news');
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    setActiveMobileTab('home');
    if (isSpecialRoute || window.location.search) {
      navigateTo('/');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleAnnouncementButtonClick = (btn: AnnouncementButtonConfig) => {
    const action = btn.action;
    if (action === 'open-submit-modal') {
      handleHomepageAddInformation();
      return;
    }
    if (action.startsWith('filter:')) {
      const targetCat = action.slice('filter:'.length) as FeedCategoryId;
      handleSelectFeedCategory(targetCat);
      const feedEl = document.getElementById('latest-news-feed');
      feedEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (action === 'route:/community') {
      handleOpenCommunity();
      return;
    }
    if (action === 'route:/marketplace') {
      handleNavigatePlatformModule('marketplace');
      return;
    }
    if (action === 'route:/businesses') {
      handleNavigatePlatformModule('businesses');
      return;
    }
    if (action === 'route:/jobs') {
      handleNavigatePlatformModule('jobs');
      return;
    }
    if (action === 'route:/events') {
      handleJumpToEvents();
      return;
    }
    if (action === 'route:/ads') {
      handleJumpToAds();
      return;
    }
    if (action === 'custom-url' && btn.customUrl) {
      if (btn.customUrl.startsWith('/')) {
        navigateTo(btn.customUrl);
      } else if (btn.customUrl.startsWith('https://') || btn.customUrl.startsWith('http://')) {
        window.open(btn.customUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleResetHome = () => {
    setActiveCategory('All');
    setActiveFeedCategory('all');
    setSelectedLocation('All');
    setTimeframe('All');
    setSearchQuery('');
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    setActiveMobileTab('home');
    if (isSpecialRoute || window.location.search) {
      navigateTo('/');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleOpenArticle = useCallback((article: NewsArticle) => {
    setSelectedEventId(null);
    setSelectedAdId(null);
    setDirectArticle(article);
    setDirectArticleLoading(false);
    setSelectedArticleId(article.id);
    navigateTo(`/?article=${encodeURIComponent(article.id)}`, true);
  }, []);

  const handleCloseArticle = () => {
    setSelectedArticleId(null);
    setDirectArticle(null);
    setDirectArticleLoading(false);
    navigateTo('/', true);
  };

  const handleOpenEvent = (ev: ProgramEvent) => {
    setSelectedArticleId(null);
    setSelectedAdId(null);
    setSelectedEventId(ev.id);
    navigateTo(`/events?event=${encodeURIComponent(ev.id)}`);
  };

  const handleCloseEvent = () => {
    setSelectedEventId(null);
    navigateTo('/events');
  };

  const handleJumpToBusTimings = () => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    navigateTo('/bus-timings');
  };

  const handleJumpToEvents = () => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    navigateTo('/events');
  };

  const handleJumpToChat = () => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    navigateTo('/chat');
  };

  const handleJumpToAds = () => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdId(null);
    void loadActiveAds();
    navigateTo('/ads');
  };

  const handleOpenAd = (ad: Advertisement) => {
    setSelectedArticleId(null);
    setSelectedEventId(null);
    setSelectedAdPreviewToken(null);
    setIsDirectAdPreview(false);
    setDirectAd(ad);
    setDirectAdLoading(false);
    setSelectedAdId(ad.id);
    navigateTo(`/ads?ad=${encodeURIComponent(ad.sharing?.customSlug || ad.id)}`, true);
  };

  const handleCloseAd = () => {
    setSelectedAdId(null);
    setSelectedAdPreviewToken(null);
    setIsDirectAdPreview(false);
    setDirectAd(null);
    setDirectAdLoading(false);
    navigateTo('/ads');
  };

  const handleToggleBookmark = (article: NewsArticle) => {
    const res = toggleArticleBookmark(article);
    setBookmarks(res.bookmarks);
  };

  const handleRequestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserNotifPermission('unsupported');
      return;
    }
    try {
      const perm = await window.Notification.requestPermission();
      setBrowserNotifPermission(perm);
      const next: ReaderNotificationSettings = {
        ...notifSettings,
        browserEnabled: perm === 'granted',
      };
      setNotifSettings(next);
      persistNotificationSettings(next);
    } catch {
      // Ignore permission rejection
    }
  };

  // Real-time auto-removal of expired Lead Stories
  useEffect(() => {
    let earliestExpiry = Number.POSITIVE_INFINITY;
    for (const article of articles) {
      if (
        article.isFeatured &&
        typeof article.featuredUntil === 'number' &&
        article.featuredUntil > leadNowMs &&
        article.featuredUntil < earliestExpiry
      ) {
        earliestExpiry = article.featuredUntil;
      }
    }
    if (!Number.isFinite(earliestExpiry)) return;
    const delayMs = Math.max(1000, Math.min(60000, earliestExpiry - leadNowMs + 500));
    const timer = window.setTimeout(() => {
      setLeadNowMs(Date.now());
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [articles, leadNowMs]);

  const leadArticles = useMemo(
    () => filteredArticles.filter((a) => isArticleActivelyFeatured(a, leadNowMs)),
    [filteredArticles, leadNowMs]
  );

  // Unified Social Feed combining News, Community Submissions, Approved Listings & Events
  const allUnifiedFeedItems = useMemo(
    () =>
      buildUnifiedCommunityFeed({
        articles,
        communityPosts,
        platformListings,
        events,
      }),
    [articles, communityPosts, platformListings, events]
  );

  const unifiedFeedCategoryCounts = useMemo(() => {
    const counts: Partial<Record<FeedCategoryId, number>> = {
      all: allUnifiedFeedItems.length,
    };
    for (const item of allUnifiedFeedItems) {
      for (const catId of item.feedCategories) {
        counts[catId] = (counts[catId] || 0) + 1;
      }
    }
    return counts;
  }, [allUnifiedFeedItems]);

  const filteredUnifiedFeedItems = useMemo(
    () =>
      filterUnifiedCommunityFeed(allUnifiedFeedItems, {
        categoryId: activeFeedCategory,
        location: selectedLocation,
        searchQuery,
        sort: feedSort,
      }),
    [allUnifiedFeedItems, activeFeedCategory, selectedLocation, searchQuery, feedSort]
  );

  const bookmarkedIdSet = useMemo(() => new Set(bookmarks.map((b) => b.id)), [bookmarks]);
  const savedListingIdSet = useMemo(
    () =>
      new Set([
        ...savedBundle.businesses,
        ...savedBundle.jobs,
        ...savedBundle.marketplace,
        ...savedBundle.otherListings,
      ]),
    [savedBundle]
  );
  const unreadNotificationsCount = useMemo(
    () => notificationFeed.filter((n) => !n.read).length,
    [notificationFeed]
  );

  const isUnifiedItemSaved = useCallback(
    (item: UnifiedFeedItem): boolean => {
      if (item.source === 'news') return bookmarkedIdSet.has(item.id);
      if (item.source === 'platform') return savedListingIdSet.has(item.id);
      return savedBundle.otherListings.includes(item.key);
    },
    [bookmarkedIdSet, savedListingIdSet, savedBundle.otherListings]
  );

  const handleToggleSaveUnifiedItem = useCallback(
    (item: UnifiedFeedItem) => {
      if (item.source === 'news' && item.newsArticle) {
        handleToggleBookmark(item.newsArticle);
        return;
      }
      if (item.source === 'platform' && item.platformListing) {
        handleToggleSaveListing(item.platformListing.module, item.platformListing.id);
        return;
      }
      handleToggleSaveListing('community', item.key);
    },
    [handleToggleSaveListing]
  );

  const handleReportUnifiedItem = useCallback((item: UnifiedFeedItem) => {
    if (item.source === 'community' && item.communityPost) {
      setReportingCommunityPost(item.communityPost);
    } else if (item.source === 'platform' && item.platformListing) {
      setPlatformReportReason('ತಪ್ಪು ಅಥವಾ ಹಳೆಯ ಮಾಹಿತಿ');
      setPlatformReportDetails('');
      setPlatformReportDone(false);
      setReportingPlatformListing(item.platformListing);
    }
  }, []);

  const [contestNavTarget, setContestNavTarget] = useState<{
    section?: 'leaderboard' | 'rules' | 'winners';
    openSubmit?: boolean;
  }>({});

  const handleJumpToContest = useCallback(
    (options?: { section?: 'leaderboard' | 'rules' | 'winners'; openSubmit?: boolean }) => {
      setContestNavTarget(options || {});
      const suffix = options?.section ? `#${options.section}` : '';
      navigateTo(`/contest${suffix}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [navigateTo]
  );

  if (adminRouteActive) {
    return (
      <AdminPanel
        articles={articles}
        onNavigateHome={() => navigateTo('/')}
      />
    );
  }

  return (
    <PrivacyScreenGuard enabled={!adminRouteActive}>
      <div className="min-h-screen flex flex-col bg-[#FBF9F5] dark:bg-[#11100E] text-[#1C1917] dark:text-[#FBF9F5] transition-colors">
        <WhatsAppGroupBanner variant="top-bar" />
        <Header
          activeCategory={activeCategory}
          activePlatformRoute={normalizedPathname}
          isBusTimingsView={busTimingsActive}
          isEventsView={eventsActive}
          isChatView={chatActive}
          isAdsView={adsActive || Boolean(selectedAdId)}
          isContestView={contestActive}
          theme={publicTheme}
          lang={platformLang}
          bookmarkCount={bookmarks.length}
          unreadNotificationsCount={unreadNotificationsCount}
          onSelectCategory={handleSelectCategory}
          onResetHome={handleResetHome}
          onJumpToBusTimings={handleJumpToBusTimings}
          onJumpToEvents={handleJumpToEvents}
          onJumpToAds={handleJumpToAds}
          onJumpToContest={() => handleJumpToContest()}
          onOpenSearch={() => handleOpenSearchEverything('')}
          onOpenSaved={() => setLibraryDrawerTab('saved')}
          onOpenNotifications={() => setNotifDrawerOpen(true)}
          onToggleTheme={() =>
            setPublicTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
          }
          onToggleLang={handleTogglePlatformLang}
          onNavigateModule={(modId) => handleNavigatePlatformModule(modId)}
          onExploreAll={handleExploreAllServices}
        />

        {/* Breaking News Strip across homepage feed */}
        {!selectedArticleId && !selectedAdId && !isSpecialRoute && displaySettings.showBreakingTicker && (
          <BreakingNewsStrip
            articles={breakingArticles}
            onSelectArticle={handleOpenArticle}
          />
        )}

        {!selectedArticleId && !selectedAdId && !isSpecialRoute && (
          <CategoryBar
            activeCategory={activeCategory}
            feedCategories={feedCategories}
            activeFeedCategory={activeFeedCategory}
            onSelectFeedCategory={handleSelectFeedCategory}
            showCategoryGrid={displaySettings.showCategoryGrid}
            language={platformLang}
            isAdsView={adsActive || Boolean(selectedAdId)}
            onSelectCategory={handleSelectCategory}
            onJumpToAds={handleJumpToAds}
            selectedLocation={selectedLocation}
            onSelectLocation={setSelectedLocation}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpenAdvancedSearch={() => setSearchModalOpen(true)}
            latestWeather={weatherLogs[0] || null}
            bannerSlot={
              <HomepageAnnouncementBanner
                config={homepageAnnouncement}
                language={platformLang}
                onButtonClick={handleAnnouncementButtonClick}
              />
            }
          />
        )}

        {busTimingsActive ? (
          <main className="flex-1">
            <BusTimingsSection onBackToNews={handleResetHome} />
          </main>
        ) : eventsActive ? (
          <main className="flex-1">
            <ProgramsEventsSection
              events={events}
              directEvent={directEvent}
              isLoading={selectedEventId ? directEventLoading && !directEvent : !eventsLoaded}
              selectedEventId={selectedEventId}
              hasMoreEvents={hasMoreEvents}
              loadingMoreEvents={loadingMoreEvents}
              quotaExceeded={quotaStatus.quotaExceeded}
              onLoadMoreEvents={handleLoadMoreEvents}
              onSelectEvent={handleOpenEvent}
              onCloseEvent={handleCloseEvent}
              onBackToNews={handleResetHome}
            />
            {!selectedEventId && activeAds.length > 0 && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
                <HomepageAdSlot
                  ads={activeAds}
                  settings={adSettings}
                  position="custom"
                  customPosition="after_events"
                  onOpenAd={handleOpenAd}
                  onViewAllAds={handleJumpToAds}
                />
              </div>
            )}
          </main>
        ) : chatActive ? (
          <main className="flex-1">
            <SupportChatSection onBackToNews={handleResetHome} />
          </main>
        ) : adsActive || selectedAdId ? (
          <main className="flex-1">
            <LocalAdsSection
              ads={activeAds}
              settings={adSettings}
              directAd={directAd}
              isDirectPreview={isDirectAdPreview}
              isLoading={selectedAdId ? directAdLoading && !directAd : !adsLoaded}
              selectedAdId={selectedAdId}
              onSelectAd={handleOpenAd}
              onCloseAd={handleCloseAd}
              onBackToNews={handleResetHome}
            />
          </main>
        ) : contestActive ? (
          <div className="flex-1" data-testid="dedicated-contest-route">
            <ContestPage
              initialSection={contestNavTarget.section || null}
              initialOpenSubmit={Boolean(contestNavTarget.openSubmit)}
              onBackHome={handleResetHome}
              onOpenCommunityPost={handleOpenCommunityPost}
              onContestSubmitted={() => {
                refreshCommunityPublicFeed();
              }}
            />
          </div>
        ) : communityActive ? (
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
            <CoffeenaduCommunityPage
              activePostSlug={communityPostSlug}
              initialDashboardOpen={isCommunityDashboard}
              initialCategory={communityInitialCategory}
              globalLocation={selectedLocation === 'All' ? 'all' : selectedLocation}
              userProfile={communityUser}
              onUserProfileChange={setCommunityUser}
              onNavigateHome={handleResetHome}
              onNavigateCommunityRoot={() => handleOpenCommunity()}
              onNavigatePost={handleOpenCommunityPost}
              onNavigateDashboard={handleOpenCommunityDashboard}
              onNavigateContest={() => handleJumpToContest({ section: 'leaderboard' })}
              onPostsUpdated={setCommunityPosts}
            />
          </main>
        ) : activeDirectoryModule ? (
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
            <PlatformDirectoryPage
              moduleId={activeDirectoryModule}
              lang={platformLang}
              selectedLocation={selectedLocation === 'All' ? 'all' : selectedLocation}
              localities={platformLocalities}
              initialListingId={platformItemId}
              savedListingIds={[
                ...savedBundle.businesses,
                ...savedBundle.jobs,
                ...savedBundle.marketplace,
                ...savedBundle.otherListings,
              ]}
              currentUserUid={auth.currentUser?.uid}
              currentUserName={auth.currentUser?.displayName || undefined}
              onToggleSave={handleToggleSaveListing}
              onSelectLocation={(loc) => setSelectedLocation(loc === 'all' ? 'All' : loc)}
              onBackHome={handleResetHome}
              onListingsChanged={refreshPlatformBootstrap}
            />
          </main>
        ) : weatherActive ? (
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
            <PlatformWeatherPage
              lang={platformLang}
              selectedLocation={selectedLocation === 'All' ? 'all' : selectedLocation}
              localities={platformLocalities}
              weatherConfig={weatherConfig}
              weatherLogs={weatherLogs}
              onSelectLocation={(loc) => setSelectedLocation(loc === 'all' ? 'All' : loc)}
              onBackHome={handleResetHome}
            />
          </main>
        ) : gamesActive ? (
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
            <PlatformGamesPage
              lang={platformLang}
              localities={platformLocalities}
              onBackHome={handleResetHome}
            />
          </main>
        ) : exploreActive ? (
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
            <PlatformExplorePage
              lang={platformLang}
              moduleCounts={platformModuleCounts}
              articleCount={articles.length}
              eventCount={events.length}
              onNavigateModule={(modId) => handleNavigatePlatformModule(modId)}
              onBackHome={handleResetHome}
            />
          </main>
        ) : accountActive ? (
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
            <PlatformAccountPage
              lang={platformLang}
              articles={articles}
              allListings={platformListings}
              savedArticleIds={bookmarks.map((b) => b.id)}
              savedBundle={savedBundle}
              onRemoveSavedArticle={(id) => setBookmarks(removeBookmarkById(id))}
              onToggleSaveListing={handleToggleSaveListing}
              onOpenArticle={handleOpenArticle}
              onNavigateModule={handleNavigatePlatformModule}
              onBackHome={handleResetHome}
            />
          </main>
        ) : searchPageActive ? (
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
            <SearchEverythingPage
              lang={platformLang}
              initialQuery={platformSearchInitialQ}
              selectedLocation={selectedLocation === 'All' ? 'all' : selectedLocation}
              localities={platformLocalities}
              articles={articles}
              listings={platformListings}
              events={events.map((ev) => ({
                id: ev.id,
                title: stripRichTextToPlainText(ev.titleKannada),
                location: ev.location,
                date: ev.eventDate,
                description: stripRichTextToPlainText(ev.descriptionKannada),
              }))}
              popularSearches={popularSearches}
              onSelectLocation={(loc) => setSelectedLocation(loc === 'all' ? 'All' : loc)}
              onOpenArticle={handleOpenArticle}
              onNavigateModule={handleNavigatePlatformModule}
              onBackHome={handleResetHome}
            />
          </main>
        ) : selectedArticleId ? (
          <div className="flex-1 bg-white dark:bg-[#0B1626]">
            {selectedArticle ? (
              <ArticleDetailView
                key={selectedArticle.id}
                article={selectedArticle}
                allArticles={articles}
                relatedArticles={relatedArticles}
                activeAds={activeAds}
                adSettings={adSettings}
                isBookmarked={bookmarkedIdSet.has(selectedArticle.id)}
                readingPrefs={readingPrefs}
                readingHistory={readingHistory}
                onToggleBookmark={handleToggleBookmark}
                onUpdateReadingPrefs={setReadingPrefs}
                onBack={handleCloseArticle}
                onSelectArticle={handleOpenArticle}
                onSelectAd={handleOpenAd}
                onOpenMessageAdmin={handleJumpToChat}
                platformLang={platformLang}
                platformListings={platformListings}
                onNavigatePlatformModule={handleNavigatePlatformModule}
                onExploreAllServices={handleExploreAllServices}
              />
            ) : isWaitingForSelectedArticle ? (
              <ArticleLoadingSkeleton onBack={handleCloseArticle} />
            ) : (
              <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
                <h1 className="text-lg font-bold text-[#17263A] dark:text-white">
                  Selected article could not be found
                </h1>
                <p className="text-sm text-[#738093] dark:text-slate-400">
                  This story may have been removed or moved by the editorial desk.
                </p>
                <button
                  type="button"
                  onClick={handleCloseArticle}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#10243D] hover:bg-[#19385F] rounded-lg cursor-pointer min-h-[40px]"
                >
                  Back to Latest News
                </button>
              </main>
            )}
          </div>
        ) : (
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 space-y-6">
            {/* Prominent Monthly News Contributor Challenge Banner */}
            <HomepageContestBanner onNavigateContest={handleJumpToContest} />

            {/* Custom Top Banner Homepage Admin Ad Slot */}
            {activeAds.length > 0 && (
              <HomepageAdSlot
                ads={activeAds}
                settings={adSettings}
                position="custom"
                customPosition="top_banner"
                onOpenAd={handleOpenAd}
                onViewAllAds={handleJumpToAds}
              />
            )}

            {/* Mobile/Tablet Trending News Horizontal Strip */}
            {displaySettings.showTrendingSection && trendingResult.items.length > 0 && (
              <div id="trending-news-mobile" className="lg:hidden">
                <TrendingNewsSection
                  articles={trendingResult.items}
                  isViewRanked={false}
                  onSelectArticle={handleOpenArticle}
                  variant="horizontal"
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
              {/* Left/Main Unified Social Community Feed (8 cols on desktop, full width on mobile) */}
              <div id="latest-news-feed" className="lg:col-span-8 space-y-5">
                {quotaStatus.quotaExceeded && (
                  <div
                    role="status"
                    className="px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200"
                  >
                    <AlertCircle
                      className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <p className="font-kannada leading-relaxed">
                      Daily live database read limit temporarily reached. Showing saved stories — live sync resumes automatically after quota reset.
                    </p>
                  </div>
                )}

                {/* Featured Lead Stories Carousel (shown when specifically filtering News) */}
                {activeFeedCategory === 'news' && leadArticles.length > 0 && (
                  <FeaturedLeadCarousel
                    leadArticles={leadArticles}
                    onOpenArticle={handleOpenArticle}
                  />
                )}

                {/* Main Unified Social Feed: COFFEENADU COMMUNITY | ಕಾಫಿನಾಡು ಸಮುದಾಯ */}
                {displaySettings.showCommunityFeed && (
                  <UnifiedCommunityFeed
                    items={filteredUnifiedFeedItems}
                    totalUnfilteredCount={allUnifiedFeedItems.length}
                    loading={!articlesLoaded && !communityFeedLoaded && allUnifiedFeedItems.length === 0}
                    error={feedError}
                    onRetry={() => {
                      refreshPlatformBootstrap();
                      refreshCommunityPublicFeed();
                      void loadInitialArticles();
                    }}
                    language={platformLang}
                    activeCategoryId={activeFeedCategory}
                    feedCategories={feedCategories}
                    selectedLocation={selectedLocation}
                    searchQuery={searchQuery}
                    sort="latest"
                    onSortChange={setFeedSort}
                    showViewCounts={false}
                    onResetFilters={handleResetHome}
                    onAddInfoClick={handleHomepageAddInformation}
                    onOpenArticle={handleOpenArticle}
                    onOpenCommunityPost={(post) => handleOpenCommunityPost(post.slug)}
                    onOpenPlatformListing={(listing) =>
                      handleNavigatePlatformModule(listing.module, listing.id)
                    }
                    onOpenEvent={handleOpenEvent}
                    onReportItem={handleReportUnifiedItem}
                    isItemSaved={isUnifiedItemSaved}
                    onToggleSaveItem={handleToggleSaveUnifiedItem}
                    onShareTracked={(item) => {
                      trackPlatformEvent({
                        type: 'whatsapp_share',
                        module: item.source === 'news' ? 'news' : 'community',
                        location: item.location,
                      });
                    }}
                    renderInlineAd={(slotIdx) =>
                      activeAds.length > 0 ? (
                        <HomepageAdSlot
                          ads={activeAds}
                          settings={adSettings}
                          position={slotIdx === 0 ? 'below_headline' : 'between_news'}
                          onOpenAd={handleOpenAd}
                          onViewAllAds={handleJumpToAds}
                        />
                      ) : null
                    }
                  />
                )}

                {/* Load Older News Stories from Firestore Archive if available */}
                {hasMoreArticles &&
                  (activeFeedCategory === 'all' ||
                    activeFeedCategory === 'news' ||
                    activeFeedCategory === 'local' ||
                    activeFeedCategory === 'malnad') && (
                    <div className="pt-1 flex justify-center">
                      <button
                        type="button"
                        onClick={handleLoadMoreArticles}
                        disabled={loadingMoreArticles}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#10243D] dark:text-slate-100 bg-white dark:bg-[#0F1E33] hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xs transition-colors cursor-pointer disabled:opacity-60 min-h-[42px]"
                      >
                        {loadingMoreArticles ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            <span>Loading older news archive...</span>
                          </>
                        ) : (
                          <span>
                            {platformLang === 'kn'
                              ? 'ಹಳೆಯ ಸುದ್ದಿ ಸಂಗ್ರಹ ನೋಡಿ'
                              : 'Load Older News Archive'}
                          </span>
                        )}
                      </button>
                    </div>
                  )}
              </div>

              {/* Right Rail (4 cols on desktop, stacks below on mobile) */}
              <div id="koppa-right-rail" className="lg:col-span-4">
                <RightRail
                  selectedLocation={selectedLocation}
                  onSelectLocation={(loc) => {
                    setSelectedLocation(loc);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  trendingArticles={displaySettings.showTrendingSection ? trendingResult.items : []}
                  trendingIsViewRanked={false}
                  onSelectArticle={handleOpenArticle}
                  activeAds={activeAds}
                  adSettings={adSettings}
                  onOpenAd={handleOpenAd}
                  onViewAllAds={handleJumpToAds}
                />
              </div>
            </div>

            {activeAds.length > 0 && (
              <HomepageAdSlot
                ads={activeAds}
                settings={adSettings}
                position="above_footer"
                onOpenAd={handleOpenAd}
                onViewAllAds={handleJumpToAds}
              />
            )}
          </main>
        )}

        <footer className="border-t border-[#E7DFCE] dark:border-[#2E2922] bg-white dark:bg-[#151310] mt-10 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-24 md:py-8 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 font-masthead text-lg font-bold text-[#1C1917] dark:text-[#FBF9F5]">
                  <CoffeeCupLogo className="w-7 h-7 shrink-0" />
                  <span>Coffeenadu News</span>
                </div>
                <p className="text-xs text-[#6B6052] dark:text-[#A89C8B] mt-1 max-w-md leading-relaxed">
                  Koppa Taluk, Chikkamagaluru District · Malnad Kannada News, Local Bus Timings, Community Programs &amp; Business Directory
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-[#926710] dark:text-[#E6BC5C]">
                  <button
                    type="button"
                    onClick={() => setSiteInfoPage('about')}
                    className="hover:underline cursor-pointer"
                  >
                    About Us
                  </button>
                  <button
                    type="button"
                    onClick={() => setSiteInfoPage('contact')}
                    className="hover:underline cursor-pointer"
                  >
                    Contact
                  </button>
                  <button
                    type="button"
                    onClick={() => setSiteInfoPage('privacy')}
                    className="hover:underline cursor-pointer"
                  >
                    Privacy Policy
                  </button>
                  <button
                    type="button"
                    onClick={() => setSiteInfoPage('terms')}
                    className="hover:underline cursor-pointer"
                  >
                    Terms
                  </button>
                  <button
                    type="button"
                    onClick={() => setSiteInfoPage('advertise')}
                    className="hover:underline cursor-pointer"
                  >
                    Advertise With Us
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-xs font-medium text-[#6B6052] dark:text-[#C4B8A5] max-w-2xl">
                {PLATFORM_MODULES.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => handleNavigatePlatformModule(mod.id)}
                    className="hover:text-[#926710] dark:hover:text-[#E6BC5C] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {platformLang === 'kn' ? mod.titleKn : mod.titleEn}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleJumpToAds}
                  className="font-semibold text-[#926710] dark:text-[#E6BC5C] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Local Ads
                </button>
                <button
                  type="button"
                  onClick={handleJumpToChat}
                  className="font-semibold text-[#1C1917] dark:text-[#FBF9F5] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Message Admin
                </button>
              </div>
            </div>

            <div className="pt-6 border-t border-[#EFE8D8] dark:border-[#2E2922] space-y-4">
              <div className="text-center py-2">
                <p className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-[#1C1917] dark:text-[#FBF9F5]">
                  © 2026 CoffeeNadu News. All rights reserved.
                </p>
              </div>

              <div className="pt-4 border-t border-[#F4EFE4] dark:border-[#24201A] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-center sm:text-left text-[11px] sm:text-xs text-[#6B6052] dark:text-[#A89C8B]">
                <p className="font-bold text-[#1C1917] dark:text-[#ECE5D7]">
                  Developed by Dheeraj
                </p>
                <p className="leading-relaxed">
                  Unauthorized copying, screenshotting, downloading, or redistribution of news content and photos is prohibited.
                </p>
              </div>
            </div>
          </div>
        </footer>

        {/* Modals & Drawers */}
        <AdvancedSearchModal
          isOpen={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
          articles={articles}
          initialQuery={searchQuery}
          initialCategory={activeCategory}
          initialLocation={selectedLocation}
          onSelectArticle={handleOpenArticle}
        />

        <SavedAndHistoryDrawer
          isOpen={libraryDrawerTab !== null}
          initialTab={libraryDrawerTab || 'saved'}
          onClose={() => setLibraryDrawerTab(null)}
          bookmarks={bookmarks}
          history={readingHistory}
          articles={articles}
          onRemoveBookmark={(id) => setBookmarks(removeBookmarkById(id))}
          onClearHistory={() => {
            clearReadingHistory();
            setReadingHistory([]);
          }}
          onSelectArticle={handleOpenArticle}
        />

        <NotificationCenterDrawer
          isOpen={notifDrawerOpen}
          onClose={() => setNotifDrawerOpen(false)}
          settings={notifSettings}
          onUpdateSettings={(next) => {
            setNotifSettings(next);
            persistNotificationSettings(next);
          }}
          onRequestBrowserPermission={handleRequestBrowserPermission}
          browserPermission={browserNotifPermission}
          notifications={notificationFeed}
          articles={articles}
          onMarkAllRead={() => {
            const nextFeed = notificationFeed.map((n) => ({ ...n, read: true }));
            setNotificationFeed(nextFeed);
            persistNotificationFeed(nextFeed);
          }}
          onSelectArticle={handleOpenArticle}
        />

        <SiteInfoModal
          page={siteInfoPage}
          onClose={() => setSiteInfoPage(null)}
          onOpenMessageAdmin={handleJumpToChat}
          onOpenLocalAds={handleJumpToAds}
        />

        {/* Homepage Community Registration & Instant-Publish Submission Modals */}
        {!communityActive && (
          <>
            <CommunityRegisterModal
              open={homepageCommunityRegisterOpen}
              onClose={() => {
                setHomepageCommunityRegisterOpen(false);
                setPendingOpenComposerAfterRegister(false);
              }}
              onRegistered={(profile) => {
                setCommunityUser(profile);
                setHomepageCommunityRegisterOpen(false);
                if (pendingOpenComposerAfterRegister) {
                  setPendingOpenComposerAfterRegister(false);
                  setHomepageCommunityComposerOpen(true);
                }
              }}
            />

            <CommunityComposerModal
              open={homepageCommunityComposerOpen}
              authorName={communityUser?.fullName || ''}
              defaultLocation={selectedLocation === 'All' ? 'ಕೊಪ್ಪ' : selectedLocation}
              onClose={() => setHomepageCommunityComposerOpen(false)}
              onSaved={(savedPost) => {
                setCommunityPosts((prev) => [
                  savedPost,
                  ...prev.filter((p) => p.id !== savedPost.id),
                ]);
              }}
              onOpenPost={(post) => {
                setHomepageCommunityComposerOpen(false);
                handleOpenCommunityPost(post.slug);
              }}
            />

            <CommunityReportModal
              post={reportingCommunityPost}
              onClose={() => setReportingCommunityPost(null)}
            />
          </>
        )}

        {/* Platform Listing Report Modal from Unified Homepage Feed */}
        {reportingPlatformListing && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Report listing"
          >
            <div className="w-full max-w-md bg-white dark:bg-[#101D30] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
              <h2 className="font-kannada text-base font-extrabold text-[#10243D] dark:text-white">
                {platformLang === 'kn' ? 'ಮಾಹಿತಿ ವರದಿ ಮಾಡಿ' : 'Report Listing'}
              </h2>
              {platformReportDone ? (
                <div className="space-y-3 text-sm text-[#10243D] dark:text-slate-100">
                  <p className="font-kannada">
                    {platformLang === 'kn'
                      ? 'ನಿಮ್ಮ ವರದಿಯನ್ನು ಸ್ವೀಕರಿಸಲಾಗಿದೆ. ಆಡ್ಮಿನ್ ತಂಡ ಶೀಘ್ರದಲ್ಲೇ ಪರಿಶೀಲಿಸುತ್ತದೆ.'
                      : 'Your report has been received. Our admin team will review it shortly.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setReportingPlatformListing(null)}
                    className="px-4 py-2 rounded-xl bg-[#10243D] dark:bg-[#D9A441] text-white dark:text-[#10243D] text-xs font-bold cursor-pointer"
                  >
                    {platformLang === 'kn' ? 'ಮುಚ್ಚಿ' : 'Close'}
                  </button>
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setPlatformReportSaving(true);
                    try {
                      await submitListingReport({
                        listingId: reportingPlatformListing.id,
                        reason: platformReportReason,
                        details: platformReportDetails.trim(),
                      });
                      setPlatformReportDone(true);
                    } finally {
                      setPlatformReportSaving(false);
                    }
                  }}
                >
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-kannada">
                    {reportingPlatformListing.title}
                  </p>
                  <select
                    value={platformReportReason}
                    onChange={(e) => setPlatformReportReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-[#10243D] dark:text-white [&>option]:bg-white [&>option]:text-[#10243D] dark:[&>option]:bg-slate-900 dark:[&>option]:text-white"
                  >
                    <option value="ತಪ್ಪು ಅಥವಾ ಹಳೆಯ ಮಾಹಿತಿ">ತಪ್ಪು ಅಥವಾ ಹಳೆಯ ಮಾಹಿತಿ (Incorrect / Outdated)</option>
                    <option value="ವಂಚನೆ / ಸ್ಪ್ಯಾಮ್">ವಂಚನೆ / ಸ್ಪ್ಯಾಮ್ (Spam / Fraud)</option>
                    <option value="ಅನುಚಿತ ವಿಷಯ">ಅನುಚಿತ ವಿಷಯ (Inappropriate)</option>
                  </select>
                  <textarea
                    rows={2}
                    value={platformReportDetails}
                    onChange={(e) => setPlatformReportDetails(e.target.value)}
                    placeholder={platformLang === 'kn' ? 'ಹೆಚ್ಚುವರಿ ವಿವರ (ಐಚ್ಛಿಕ)' : 'Additional details (optional)'}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-[#10243D] dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReportingPlatformListing(null)}
                      className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {platformLang === 'kn' ? 'ರದ್ದುಮಾಡಿ' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={platformReportSaving}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                    >
                      {platformReportSaving
                        ? '...'
                        : platformLang === 'kn'
                          ? 'ವರದಿ ಸಲ್ಲಿಸಿ'
                          : 'Submit Report'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Optional Website Entry Advertisement Overlay (STRICTLY Disabled on /contest) */}
        <WebsiteEntryAd
          ads={activeAds}
          settings={adSettings}
          onOpenAd={handleOpenAd}
          disabled={
            contestActive ||
            adsActive ||
            Boolean(selectedAdId) ||
            Boolean(selectedAdPreviewToken) ||
            chatActive
          }
          onActiveChange={setEntryOverlayActive}
        />

        {/* Optional Main Homepage Popup Advertisement (STRICTLY Disabled on /contest) */}
        <HomepagePopupAd
          ads={activeAds}
          settings={adSettings}
          onOpenAd={handleOpenAd}
          entryOverlayActive={entryOverlayActive}
          disabled={
            contestActive ||
            isSpecialRoute ||
            Boolean(selectedArticleId) ||
            Boolean(selectedAdId) ||
            Boolean(selectedEventId)
          }
        />

        {/* Article Reading / Scroll Popup Advertisement (STRICTLY Disabled on /contest) */}
        <FloatingScrollAd
          ads={activeAds}
          settings={adSettings}
          onOpenAd={handleOpenAd}
          articleId={selectedArticle ? selectedArticle.id : null}
          disabled={
            contestActive ||
            adsActive ||
            Boolean(selectedAdId) ||
            chatActive ||
            entryOverlayActive
          }
        />

        {/* Fixed Bottom Mobile Navigation Bar: Home · Explore · Services · Marketplace · Menu */}
        <BottomMobileNav
          activeTab={activeMobileTab}
          theme={publicTheme}
          lang={platformLang}
          bookmarkCount={bookmarks.length}
          unreadNotificationsCount={unreadNotificationsCount}
          onGoHome={() => {
            setActiveMobileTab('home');
            handleResetHome();
          }}
          onGoExplore={() => {
            setActiveMobileTab('explore');
            handleExploreAllServices();
          }}
          onGoServices={() => {
            setActiveMobileTab('services');
            handleNavigatePlatformModule('businesses');
          }}
          onGoMarketplace={() => {
            setActiveMobileTab('marketplace');
            handleNavigatePlatformModule('marketplace');
          }}
          onOpenSearch={() => handleOpenSearchEverything('')}
          onOpenSaved={() => setLibraryDrawerTab('saved')}
          onOpenHistory={() => setLibraryDrawerTab('history')}
          onOpenNotifications={() => setNotifDrawerOpen(true)}
          onToggleTheme={() =>
            setPublicTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
          }
          onToggleLang={handleTogglePlatformLang}
          onNavigateModule={(modId) => handleNavigatePlatformModule(modId)}
          onNavigateSection={(section) => {
            if (section === 'bus-timings') handleJumpToBusTimings();
            else if (section === 'events') handleJumpToEvents();
            else if (section === 'local-ads') handleJumpToAds();
            else handleJumpToChat();
          }}
        />

        {/* Floating Message Admin Button — elevated on mobile above BottomMobileNav */}
        {!chatActive && (
          <button
            type="button"
            onClick={handleJumpToChat}
            aria-label="Message Coffeenadu Admin"
            className="fixed bottom-20 md:bottom-4 right-3 sm:right-4 z-30 inline-flex items-center justify-center gap-2 w-11 h-11 sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 text-xs sm:text-sm font-bold text-[#FBF9F5] bg-[#1C1917] hover:bg-[#2E2922] border border-[#D4A238]/70 rounded-full sm:rounded-xl shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer min-h-[44px]"
          >
            <MessageSquare className="w-4 h-4 text-[#E6BC5C] shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline font-kannada whitespace-nowrap">Message · ಸಂದೇಶ</span>
            {readerThread?.unreadByReader && (
              <span className="hidden sm:inline ml-1 px-1.5 py-0.5 text-[10px] font-extrabold bg-[#E6BC5C] text-[#171411] rounded">
                Reply
              </span>
            )}
          </button>
        )}
      </div>
    </PrivacyScreenGuard>
  );
}
