import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgePlus,
  BarChart3,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  CopyPlus,
  Edit3,
  Eye,
  FileEdit,
  Globe,
  Layers,
  LayoutDashboard,
  ListChecks,
  Loader2,
  MapPin,
  Megaphone,
  MessageCircle,
  Monitor,
  PauseCircle,
  Phone,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Share2,
  Sliders,
  Smartphone,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  createAdminAd,
  deleteAdminAd,
  duplicateAdminAd,
  fetchAdminAdAnalytics,
  fetchAdminAds,
  toggleAdminAdStatus,
  updateAdminAdApproval,
  updateAdminAdPlacements,
  updateAdPlatformSettings,
} from '../../services/adsClient';
import {
  DEFAULT_KANNADA_SHARE_TEMPLATE,
  type AdAnalyticsRange,
  type AdAnalyticsSummaryResponse,
  type AdDisplayFrequency,
  type AdPlacementSlotKey,
  type AdPlacementsConfig,
  type AdPlatformSettings,
  type AdRotationMode,
  type AdRotationOrder,
  type Advertisement,
  type AdvertisementPayload,
  type AdvertisementStats,
} from '../../types/ads';
import { formatAdminViewCount, resolveAdViewCount } from '../../utils/viewCounts';
import {
  buildAdKannadaShareMessage,
  buildAdPublicUrl,
  createDefaultAdPlacements,
  createDefaultAdPlatformSettings,
  formatReadableAdDate,
  getAdLifecycleState,
  getPlacementBadgesForAd,
  getTodayIstYmd,
  mergeAdCategories,
  type EffectiveAdLifecycle,
} from '../../utils/adHelpers';
import { AdImage } from '../AdImage';
import { AdminAdEditor } from './AdminAdEditor';
import { AdPreviewModal } from './AdPreviewModal';

export type AdsSubTab =
  | 'dashboard'
  | 'all'
  | 'create'
  | 'placements'
  | 'rotation'
  | 'schedule'
  | 'sharing'
  | 'analytics'
  | 'advanced';

interface Admin2AdsSectionProps {
  onOpenAddAd: () => void;
  onEditAd: (ad: Advertisement) => void;
  refreshNonce: number;
  onDataChanged?: (nextAdNumber: string) => void;
  initialTab?: AdsSubTab;
}

type StatusFilter = 'all' | EffectiveAdLifecycle | 'pending_approval';
type PlacementFilter = 'all' | AdPlacementSlotKey;

const SUB_TABS: Array<{ id: AdsSubTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Advertisement Dashboard', icon: LayoutDashboard },
  { id: 'all', label: 'All Advertisements', icon: ListChecks },
  { id: 'create', label: 'Create Advertisement', icon: BadgePlus },
  { id: 'placements', label: 'Display Placements', icon: Layers },
  { id: 'rotation', label: 'Advertisement Rotation', icon: RotateCw },
  { id: 'schedule', label: 'Campaign Scheduling', icon: CalendarClock },
  { id: 'sharing', label: 'Sharing Settings', icon: Share2 },
  { id: 'analytics', label: 'Advertisement Analytics', icon: BarChart3 },
  { id: 'advanced', label: 'Advanced Settings', icon: Sliders },
];

const PLACEMENT_KEYS: Array<{ key: AdPlacementSlotKey; label: string; desc: string }> = [
  {
    key: 'articlePopup',
    label: 'Article Reading Popup',
    desc: 'Appears while reading an article at configured scroll % & delay',
  },
  {
    key: 'endOfArticle',
    label: 'End of Article Advertisement',
    desc: 'Shown after article content (before or after related stories)',
  },
  {
    key: 'homepagePopup',
    label: 'Main Homepage Popup',
    desc: 'Popup card on Coffeenadu homepage after delay & frequency rules',
  },
  {
    key: 'websiteEntry',
    label: 'Website Entry Advertisement',
    desc: 'Optional welcome overlay when visitor first opens Coffeenadu',
  },
  {
    key: 'homepageSection',
    label: 'Homepage Advertisement Section',
    desc: 'Cards/sliders below headline, between news, above footer, or custom slot',
  },
  {
    key: 'articleInline',
    label: 'Additional Article Ad Positions',
    desc: 'Below headline, below summary, between paragraphs, or above sharing',
  },
];

function renderLifecycleBadge(state: EffectiveAdLifecycle) {
  switch (state) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>Active</span>
        </span>
      );
    case 'scheduled':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
          <CalendarClock className="h-3 w-3 shrink-0" />
          <span>Scheduled</span>
        </span>
      );
    case 'paused':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          <PauseCircle className="h-3 w-3 shrink-0" />
          <span>Paused</span>
        </span>
      );
    case 'inactive':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <PauseCircle className="h-3 w-3 shrink-0" />
          <span>Inactive</span>
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>Expired</span>
        </span>
      );
    case 'draft':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          <FileEdit className="h-3 w-3 shrink-0" />
          <span>Draft</span>
        </span>
      );
  }
}

export function Admin2AdsSection({
  onEditAd,
  refreshNonce,
  onDataChanged,
  initialTab = 'dashboard',
}: Admin2AdsSectionProps) {
  const [subTab, setSubTab] = useState<AdsSubTab>(initialTab);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [stats, setStats] = useState<AdvertisementStats>({
    total: 0,
    active: 0,
    inactive: 0,
    scheduled: 0,
    expired: 0,
    draft: 0,
    pendingApproval: 0,
  });
  const [settings, setSettings] = useState<AdPlatformSettings>(() =>
    createDefaultAdPlatformSettings()
  );
  const [nextAdNumber, setNextAdNumber] = useState('AD001');
  const [todayYmd, setTodayYmd] = useState<string>(() => getTodayIstYmd());
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [creatingInlineAd, setCreatingInlineAd] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Table Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [placementFilter, setPlacementFilter] = useState<PlacementFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewAd, setPreviewAd] = useState<Advertisement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Analytics state
  const [analyticsRange, setAnalyticsRange] = useState<AdAnalyticsRange>('weekly');
  const [analyticsAdId, setAnalyticsAdId] = useState<string>('');
  const [analyticsData, setAnalyticsData] = useState<AdAnalyticsSummaryResponse | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Advanced custom category input
  const [newCustomCategory, setNewCustomCategory] = useState('');

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminAds();
      const rawAds = Array.isArray(res.ads)
        ? res.ads
        : Array.isArray((res as unknown as { items?: Advertisement[] }).items)
        ? (res as unknown as { items: Advertisement[] }).items
        : [];
      setAds(rawAds);

      const defaultStats: AdvertisementStats = {
        total: rawAds.length,
        active: 0,
        inactive: 0,
        scheduled: 0,
        expired: 0,
        draft: 0,
        pendingApproval: 0,
      };
      setStats(
        res.stats && typeof res.stats === 'object'
          ? { ...defaultStats, ...res.stats }
          : defaultStats
      );

      if (res.settings && typeof res.settings === 'object') {
        const defaultSettings = createDefaultAdPlatformSettings();
        setSettings({
          ...defaultSettings,
          ...res.settings,
          customCategories: Array.isArray(res.settings.customCategories)
            ? res.settings.customCategories
            : defaultSettings.customCategories,
          globalPlacementsEnabled: {
            ...defaultSettings.globalPlacementsEnabled,
            ...(res.settings.globalPlacementsEnabled || {}),
          },
        });
      }
      if (res.todayYmd) setTodayYmd(res.todayYmd);
      if (res.nextAdNumber) {
        setNextAdNumber(res.nextAdNumber);
        onDataChanged?.(res.nextAdNumber);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load advertisements.');
    } finally {
      setLoading(false);
    }
  }, [onDataChanged]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const data = await fetchAdminAdAnalytics(analyticsRange, analyticsAdId || undefined);
      const safeTotals = {
        impressions: Number(data?.totals?.impressions) || 0,
        uniqueVisitors: Number(data?.totals?.uniqueVisitors) || 0,
        clicks: Number(data?.totals?.clicks) || 0,
        ctrPct: Number(data?.totals?.ctrPct) || 0,
        whatsappClicks: Number(data?.totals?.whatsappClicks) || 0,
        phoneClicks: Number(data?.totals?.phoneClicks) || 0,
        websiteClicks: Number(data?.totals?.websiteClicks) || 0,
        directionsClicks: Number(data?.totals?.directionsClicks) || 0,
        shareClicks: Number(data?.totals?.shareClicks) || 0,
        desktopImpressions: Number(data?.totals?.desktopImpressions) || 0,
        mobileImpressions: Number(data?.totals?.mobileImpressions) || 0,
      };
      setAnalyticsData({
        ok: true,
        range: data?.range || analyticsRange,
        totals: safeTotals,
        byPlacement:
          data?.byPlacement && typeof data.byPlacement === 'object' ? data.byPlacement : {},
        series: Array.isArray(data?.series) ? data.series : [],
        perAd: Array.isArray(data?.perAd) ? data.perAd : [],
        bestPerformingAd: data?.bestPerformingAd || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load advertisement analytics.');
    } finally {
      setLoadingAnalytics(false);
    }
  }, [analyticsRange, analyticsAdId]);

  useEffect(() => {
    if (subTab === 'analytics') {
      void loadAnalytics();
    }
  }, [subTab, loadAnalytics]);

  const allCategories = useMemo(
    () => mergeAdCategories(Array.isArray(settings?.customCategories) ? settings.customCategories : []),
    [settings?.customCategories]
  );

  const filteredAds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ads.filter((ad) => {
      const lifecycle = getAdLifecycleState(ad, todayYmd);
      if (statusFilter === 'pending_approval') {
        if (ad.approvalStatus !== 'pending_approval') return false;
      } else if (statusFilter !== 'all') {
        if (lifecycle !== statusFilter) return false;
      }
      if (categoryFilter !== 'All' && ad.category !== categoryFilter) {
        return false;
      }
      if (placementFilter !== 'all') {
        const p = ad.placements;
        if (!p || !p[placementFilter]?.enabled) return false;
      }
      if (dateFrom && ad.expiryDate < dateFrom) return false;
      if (dateTo && ad.publishDate > dateTo) return false;
      if (q) {
        const haystack = [
          ad.adNumber,
          ad.title,
          ad.advertiserName || '',
          ad.campaignName || '',
          ad.category,
          ad.businessAddress || '',
          ad.contactNumber || '',
          ad.whatsappNumber || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      }
      return true;
    });
  }, [ads, searchQuery, statusFilter, categoryFilter, placementFilter, dateFrom, dateTo, todayYmd]);

  const bestPerformingAd = useMemo(() => {
    if (ads.length === 0) return null;
    return [...ads].sort((a, b) => {
      const scoreA = (Number(a.clicks) || 0) * 5 + (Number(a.views) || 0);
      const scoreB = (Number(b.clicks) || 0) * 5 + (Number(b.views) || 0);
      return scoreB - scoreA;
    })[0];
  }, [ads]);

  const handleSaveSettings = async (nextSettings: AdPlatformSettings, notice: string) => {
    setSavingSettings(true);
    setError('');
    setFeedback('');
    try {
      const updated = await updateAdPlatformSettings(nextSettings);
      setSettings(updated);
      setFeedback(notice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateInlineAd = async (payload: AdvertisementPayload) => {
    setCreatingInlineAd(true);
    setError('');
    setFeedback('');
    try {
      const res = await createAdminAd(payload);
      setAds((prev) => [res.ad, ...prev]);
      setStats(res.stats);
      if (res.nextAdNumber) {
        setNextAdNumber(res.nextAdNumber);
        onDataChanged?.(res.nextAdNumber);
      }
      setFeedback(
        res.ad.status === 'draft'
          ? `Advertisement ${res.ad.adNumber} saved as draft.`
          : `Advertisement ${res.ad.adNumber} published successfully.`
      );
      setSubTab('all');
    } finally {
      setCreatingInlineAd(false);
    }
  };

  const handleToggleStatus = async (ad: Advertisement) => {
    const nextStatus = ad.status === 'active' ? 'paused' : 'active';
    setBusyId(ad.id);
    setError('');
    setFeedback('');
    try {
      const res = await toggleAdminAdStatus(ad.id, nextStatus);
      setAds((prev) => prev.map((item) => (item.id === ad.id ? res.ad : item)));
      setStats(res.stats);
      setFeedback(`${ad.adNumber} is now ${nextStatus === 'active' ? 'Active' : 'Paused'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (ad: Advertisement) => {
    setBusyId(ad.id);
    setError('');
    setFeedback('');
    try {
      const res = await duplicateAdminAd(ad.id);
      setAds((prev) => [res.ad, ...prev]);
      setStats(res.stats);
      if (res.nextAdNumber) {
        setNextAdNumber(res.nextAdNumber);
        onDataChanged?.(res.nextAdNumber);
      }
      setFeedback(`Duplicated ${ad.adNumber} into draft ${res.ad.adNumber}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to duplicate advertisement.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (ad: Advertisement) => {
    setBusyId(ad.id);
    setError('');
    setFeedback('');
    try {
      const res = await deleteAdminAd(ad.id);
      setAds((prev) => prev.filter((item) => item.id !== ad.id));
      setStats(res.stats);
      setConfirmDeleteId(null);
      if (previewAd?.id === ad.id) setPreviewAd(null);
      if (res.nextAdNumber) {
        setNextAdNumber(res.nextAdNumber);
        onDataChanged?.(res.nextAdNumber);
      }
      setFeedback(`Deleted advertisement ${ad.adNumber}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete advertisement.');
    } finally {
      setBusyId(null);
    }
  };

  const handleApproval = async (ad: Advertisement, decision: 'approved' | 'rejected') => {
    setBusyId(ad.id);
    setError('');
    setFeedback('');
    try {
      const res = await updateAdminAdApproval(ad.id, decision);
      setAds((prev) => prev.map((item) => (item.id === ad.id ? res.ad : item)));
      setFeedback(`${ad.adNumber} marked as ${decision}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update approval status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleTogglePlacementForAd = async (ad: Advertisement, key: AdPlacementSlotKey) => {
    const base = ad.placements || createDefaultAdPlacements();
    const nextEnabled = !base[key].enabled;
    const nextPlacements = {
      ...base,
      [key]: {
        ...base[key],
        enabled: nextEnabled,
      },
    } as AdPlacementsConfig;
    setBusyId(ad.id);
    setError('');
    try {
      const res = await updateAdminAdPlacements(ad.id, nextPlacements);
      setAds((prev) => prev.map((item) => (item.id === ad.id ? res.ad : item)));
      setFeedback(
        `${ad.adNumber}: ${key} ${nextEnabled ? 'enabled' : 'disabled'}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update placement.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyAdLink = async (ad: Advertisement) => {
    const lifecycle = getAdLifecycleState(ad, todayYmd);
    const url =
      lifecycle !== 'active' && ad.previewToken
        ? buildAdPublicUrl(ad.id, undefined, ad.previewToken)
        : buildAdPublicUrl(ad.sharing?.customSlug || ad.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(ad.id);
      setFeedback(
        lifecycle !== 'active' && ad.previewToken
          ? `Copied private preview link for ${ad.adNumber}.`
          : `Copied public advertisement link for ${ad.adNumber}.`
      );
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const sampleSharePreview = useMemo(() => {
    const sampleAd: Advertisement = ads[0] || {
      id: 'sample-ad',
      adNumber: 'AD001',
      title: 'ಕೊಪ್ಪ ಕಾಫಿ & ಅಡಿಕೆ ಟ್ರೇಡರ್ಸ್ — ವಿಶೇಷ ಕೊಡುಗೆ',
      description: '',
      mainImageUrl: '',
      additionalImages: [],
      category: 'Business',
      status: 'active',
      publishDate: todayYmd,
      expiryDate: todayYmd,
      createdAt: '',
      updatedAt: '',
      createdBy: 'system',
      updatedBy: 'system',
      views: 0,
      clicks: 0,
    };
    return buildAdKannadaShareMessage(
      sampleAd,
      buildAdPublicUrl(sampleAd.sharing?.customSlug || sampleAd.id),
      settings.defaultShareMessage
    );
  }, [ads, settings.defaultShareMessage, todayYmd]);

  const aggregateReach = useMemo(() => {
    let totalImpressions = 0;
    let totalClicks = 0;
    for (const ad of ads) {
      totalImpressions += resolveAdViewCount(
        ad.views,
        (ad as Advertisement & { impressions?: number }).impressions
      );
      totalClicks += Number(ad.clicks) || 0;
    }
    return { totalImpressions, totalClicks };
  }, [ads]);

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Coffeenadu Advertising Platform
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage multi-placement campaigns, rotation, scheduling, Kannada sharing, and real-time analytics independently of news articles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('create')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-bold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 cursor-pointer"
          >
            <BadgePlus className="h-4 w-4" />
            <span>Create Advertisement</span>
          </button>
        </div>
      </div>

      {/* 9-Tab Sub-Navigation Bar */}
      <div
        role="tablist"
        aria-label="Advertisement platform sections"
        className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-[#111C2E]"
      >
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#0B192C] text-white dark:bg-amber-500 dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Feedback & Error Alerts */}
      {feedback && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback('')}
            className="rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError('')}
            className="rounded p-1 hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 1: ADVERTISEMENT DASHBOARD                                      */}
      {/* =================================================================== */}
      {subTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Total Ads', value: stats.total, tone: 'text-slate-900 dark:text-white' },
              { label: 'Active', value: stats.active, tone: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Scheduled', value: stats.scheduled ?? 0, tone: 'text-blue-700 dark:text-blue-400' },
              { label: 'Expired', value: stats.expired, tone: 'text-rose-700 dark:text-rose-400' },
              { label: 'Total Impressions', value: aggregateReach.totalImpressions, tone: 'text-[#0F274A] dark:text-amber-300' },
              { label: 'Total Clicks', value: aggregateReach.totalClicks, tone: 'text-amber-700 dark:text-amber-400' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {kpi.label}
                </p>
                <p className={`mt-2 text-2xl font-extrabold tabular-nums ${kpi.tone}`}>
                  {kpi.value.toLocaleString('en-IN')}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Best Performing Ad */}
            <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  <TrendingUp className="h-4 w-4" />
                  <span>Best Performing Advertisement</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSubTab('analytics')}
                  className="text-xs font-semibold text-[#0F274A] hover:underline dark:text-amber-300 cursor-pointer"
                >
                  Full Analytics →
                </button>
              </div>

              {bestPerformingAd ? (
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="w-full sm:w-36 h-28 rounded-lg border border-slate-200 bg-white overflow-hidden shrink-0 dark:border-slate-700 dark:bg-slate-950">
                    <AdImage
                      src={bestPerformingAd.mainImageThumbUrl || bestPerformingAd.mainImageUrl}
                      alt={bestPerformingAd.title}
                      fit="contain"
                      className="h-full w-full"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#0F274A] dark:text-amber-300">
                        {bestPerformingAd.adNumber}
                      </span>
                      {renderLifecycleBadge(getAdLifecycleState(bestPerformingAd, todayYmd))}
                    </div>
                    <h3 className="font-kannada text-sm font-bold text-slate-900 dark:text-white line-clamp-2">
                      {bestPerformingAd.title}
                    </h3>
                    <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5 text-slate-400" />
                        <strong>
                          {formatAdminViewCount(
                            resolveAdViewCount(
                              bestPerformingAd.views,
                              (bestPerformingAd as Advertisement & { impressions?: number }).impressions
                            )
                          )}
                        </strong>{' '}
                        views
                      </span>
                      <span>
                        <strong>{bestPerformingAd.clicks.toLocaleString('en-IN')}</strong> clicks
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setPreviewAd(bestPerformingAd)}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        Preview Placements
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditAd(bestPerformingAd)}
                        className="rounded-lg bg-[#0B192C] px-3 py-1 text-xs font-semibold text-white dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
                      >
                        Edit Campaign
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No advertisements published yet. Click Create Advertisement to launch your first campaign.
                </p>
              )}
            </div>

            {/* Active Placements Snapshot */}
            <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Active Placement Coverage
                </h3>
                <button
                  type="button"
                  onClick={() => setSubTab('placements')}
                  className="text-xs font-semibold text-[#0F274A] hover:underline dark:text-amber-300 cursor-pointer"
                >
                  Configure Placements →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PLACEMENT_KEYS.map((item) => {
                  const enabledCount = ads.filter(
                    (a) => getAdLifecycleState(a, todayYmd) === 'active' && a.placements?.[item.key]?.enabled
                  ).length;
                  const globalOn = settings.globalPlacementsEnabled[item.key] !== false;
                  return (
                    <div
                      key={item.key}
                      className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-2 dark:border-slate-800"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {item.label}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {enabledCount} active ad{enabledCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          globalOn
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                        }`}
                      >
                        {globalOn ? 'On' : 'Muted'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: ALL ADVERTISEMENTS (SEARCH, FILTERS, TABLE + ACTIONS)        */}
      {/* =================================================================== */}
      {subTab === 'all' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by AD ID, title, advertiser, campaign, phone, or address..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="paused">Paused</option>
                  <option value="inactive">Inactive</option>
                  <option value="expired">Expired</option>
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                </select>

                <select
                  aria-label="Filter by category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="All">All Categories</option>
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by placement"
                  value={placementFilter}
                  onChange={(e) => setPlacementFilter(e.target.value as PlacementFilter)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="all">All Placements</option>
                  {PLACEMENT_KEYS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Date Range:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Filter from date"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <span>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Filter to date"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              {(searchQuery || statusFilter !== 'all' || categoryFilter !== 'All' || placementFilter !== 'all' || dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setCategoryFilter('All');
                    setPlacementFilter('all');
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="text-xs font-semibold text-[#0F274A] hover:underline dark:text-amber-300 cursor-pointer ml-auto"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {loading && ads.length === 0 ? (
            <div className="flex h-48 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-500 dark:border-slate-800 dark:bg-[#111C2E]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading advertisements...</span>
            </div>
          ) : filteredAds.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-[#111C2E]">
              <Megaphone className="mx-auto h-8 w-8 text-slate-400 mb-2" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {ads.length === 0 ? 'No advertisements yet' : 'No advertisements match your filters'}
              </h3>
              <button
                type="button"
                onClick={() => setSubTab('create')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-bold text-white dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
              >
                <BadgePlus className="h-4 w-4" />
                <span>Create Advertisement</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111C2E]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                    <th className="py-3 px-4">Advertisement ID</th>
                    <th className="py-3 px-3">Image</th>
                    <th className="py-3 px-3">Title</th>
                    <th className="py-3 px-3">Advertiser</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Placements</th>
                    <th className="py-3 px-3 text-right">Views</th>
                    <th className="py-3 px-3 text-right">Clicks</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredAds.map((ad) => {
                    const lifecycle = getAdLifecycleState(ad, todayYmd);
                    const badges = getPlacementBadgesForAd(ad);
                    const isBusy = busyId === ad.id;
                    return (
                      <tr
                        key={ad.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-[#0F274A] dark:text-amber-300 whitespace-nowrap tabular-nums">
                          <div>{ad.adNumber}</div>
                          <div className="text-[10px] font-sans font-medium text-slate-400">
                            {ad.category}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="h-12 w-20 rounded-md overflow-hidden border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                            <AdImage
                              src={ad.mainImageThumbUrl || ad.mainImageUrl}
                              alt={ad.title}
                              fit="contain"
                              className="h-full w-full"
                            />
                          </div>
                        </td>
                        <td className="py-3 px-3 max-w-[230px]">
                          <p className="font-kannada font-semibold text-slate-900 dark:text-white line-clamp-1">
                            {ad.title}
                          </p>
                          <p className="text-[11px] text-slate-400 tabular-nums">
                            {formatReadableAdDate(ad.publishDate)} – {formatReadableAdDate(ad.expiryDate)}
                          </p>
                        </td>
                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300 max-w-[150px] truncate">
                          {ad.advertiserName || ad.campaignName || '—'}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap space-y-1">
                          {renderLifecycleBadge(lifecycle)}
                          {ad.approvalStatus === 'pending_approval' && (
                            <div className="text-[10px] font-bold text-amber-600">Pending Approval</div>
                          )}
                          {ad.approvalStatus === 'rejected' && (
                            <div className="text-[10px] font-bold text-rose-600">Rejected</div>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-[180px]">
                          {badges.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {badges.slice(0, 3).map((b) => (
                                <span
                                  key={b}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  {b}
                                </span>
                              ))}
                              {badges.length > 3 && (
                                <span className="text-[10px] text-slate-500">+{badges.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Directory Only</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums font-bold text-slate-900 dark:text-amber-300 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1" title="Admin-only historical + live ad views">
                            <Eye className="h-3.5 w-3.5 text-slate-400 dark:text-amber-400/80" />
                            {formatAdminViewCount(
                              resolveAdViewCount(
                                ad.views,
                                (ad as Advertisement & { impressions?: number }).impressions
                              )
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                          {ad.clicks.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {confirmDeleteId === ad.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleDelete(ad)}
                                className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded border border-slate-300 px-2 py-1 text-[11px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              {ad.approvalStatus === 'pending_approval' && (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleApproval(ad, 'approved')}
                                    title="Approve Advertisement"
                                    className="rounded-lg border border-emerald-200 p-1.5 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleApproval(ad, 'rejected')}
                                    title="Reject Advertisement"
                                    className="rounded-lg border border-rose-200 p-1.5 text-rose-700 hover:bg-rose-50 cursor-pointer"
                                  >
                                    <ThumbsDown className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => onEditAd(ad)}
                                title="Edit Advertisement"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewAd(ad)}
                                title="Preview All Placements"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleDuplicate(ad)}
                                title="Duplicate Advertisement"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                <CopyPlus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleToggleStatus(ad)}
                                title={ad.status === 'active' ? 'Pause Advertisement' : 'Resume / Activate'}
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                {ad.status === 'active' ? (
                                  <PauseCircle className="h-3.5 w-3.5 text-amber-600" />
                                ) : (
                                  <PlayCircle className="h-3.5 w-3.5 text-emerald-600" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAnalyticsAdId(ad.id);
                                  setSubTab('analytics');
                                }}
                                title="View Analytics"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                <BarChart3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCopyAdLink(ad)}
                                title="Copy Ad Link"
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                {copiedId === ad.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(ad.id)}
                                title="Delete Advertisement"
                                className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: CREATE ADVERTISEMENT (INLINE ACCORDION EDITOR)               */}
      {/* =================================================================== */}
      {subTab === 'create' && (
        <AdminAdEditor
          editingAd={null}
          nextAdNumber={nextAdNumber}
          platformSettings={settings}
          isSaving={creatingInlineAd}
          onSubmit={handleCreateInlineAd}
          formId="inline-create-ad-form"
          embedded={true}
        />
      )}

      {/* =================================================================== */}
      {/* TAB 4: DISPLAY PLACEMENTS (GLOBAL SWITCHES + PER-AD MATRIX)         */}
      {/* =================================================================== */}
      {subTab === 'placements' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Global Placement Master Controls
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enable or temporarily mute entire advertisement placement zones across Coffeenadu.
                </p>
              </div>
              <button
                type="button"
                disabled={savingSettings}
                onClick={() =>
                  void handleSaveSettings(settings, 'Global display placement toggles saved.')
                }
                className="rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-bold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
              >
                {savingSettings ? 'Saving...' : 'Save Global Placement Settings'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PLACEMENT_KEYS.map((item) => {
                const enabled = settings.globalPlacementsEnabled[item.key] !== false;
                return (
                  <label
                    key={item.key}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 cursor-pointer hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40"
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          globalPlacementsEnabled: {
                            ...prev.globalPlacementsEnabled,
                            [item.key]: e.target.checked,
                          },
                        }))
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {item.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Quick Per-Advertisement Placement Assignment
              </h3>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60">
                  <th className="py-2.5 px-4">Advertisement</th>
                  {PLACEMENT_KEYS.map((p) => (
                    <th key={p.key} className="py-2.5 px-3 text-center">
                      {p.label.replace(' Advertisement', '').replace(' Positions', '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ads.map((ad) => (
                  <tr key={ad.id}>
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                      <span className="font-mono text-[#0F274A] dark:text-amber-300 mr-1.5">
                        {ad.adNumber}
                      </span>
                      <span className="font-kannada line-clamp-1">{ad.title}</span>
                    </td>
                    {PLACEMENT_KEYS.map((p) => {
                      const isOn = Boolean(ad.placements?.[p.key]?.enabled);
                      return (
                        <td key={p.key} className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            disabled={busyId === ad.id}
                            checked={isOn}
                            onChange={() => void handleTogglePlacementForAd(ad, p.key)}
                            aria-label={`Toggle ${p.label} for ${ad.adNumber}`}
                            className="h-4 w-4 rounded cursor-pointer"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: ADVERTISEMENT ROTATION                                       */}
      {/* =================================================================== */}
      {subTab === 'rotation' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5 dark:border-slate-800 dark:bg-[#111C2E]">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Advertisement Rotation Mode &amp; Ordering
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Control how multiple eligible advertisements rotate across homepage sections, popups, and article placements.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                Advertisement Rotation Mode
              </label>
              <select
                value={settings.rotationMode}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    rotationMode: e.target.value as AdRotationMode,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="automatic">Automatic Rotation</option>
                <option value="manual">Manual Slider Only</option>
                <option value="both">Automatic + Manual Controls</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                Rotation Speed (Seconds)
              </label>
              <input
                type="number"
                min={2}
                max={60}
                value={settings.rotationSpeedSeconds}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    rotationSpeedSeconds: Math.min(60, Math.max(2, Number(e.target.value) || 5)),
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                Maximum Ads per Placement
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={settings.maxAdsPerPlacement}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maxAdsPerPlacement: Math.min(20, Math.max(1, Number(e.target.value) || 5)),
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                Rotation Ordering
              </label>
              <select
                value={settings.rotationOrder}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    rotationOrder: e.target.value as AdRotationOrder,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="priority">Priority-Based Order</option>
                <option value="random">Randomized Fair Order</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex items-center pt-5">
              <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.avoidRepeatInSession}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      avoidRepeatInSession: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded"
                />
                <span>Avoid showing the same advertisement repeatedly when alternatives are available</span>
              </label>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              disabled={savingSettings}
              onClick={() =>
                void handleSaveSettings(settings, 'Advertisement rotation settings saved.')
              }
              className="rounded-lg bg-[#0B192C] px-5 py-2 text-xs font-bold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
            >
              {savingSettings ? 'Saving...' : 'Save Rotation Settings'}
            </button>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 6: CAMPAIGN SCHEDULING                                          */}
      {/* =================================================================== */}
      {subTab === 'schedule' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Campaign Scheduling &amp; Recurring Rules ({ads.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automatic activation &amp; expiration in IST, recurring weekday schedules, and daily time windows.
            </p>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60">
                <th className="py-3 px-4">Ad ID</th>
                <th className="py-3 px-3">Title / Campaign</th>
                <th className="py-3 px-3">Publish Date &amp; Time</th>
                <th className="py-3 px-3">Expiry Date &amp; Time</th>
                <th className="py-3 px-3">Recurring Window</th>
                <th className="py-3 px-3">State</th>
                <th className="py-3 px-4 text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {ads.map((ad) => (
                <tr key={ad.id}>
                  <td className="py-3 px-4 font-mono font-bold text-[#0F274A] dark:text-amber-300">
                    {ad.adNumber}
                  </td>
                  <td className="py-3 px-3">
                    <p className="font-kannada font-semibold text-slate-900 dark:text-white">
                      {ad.title}
                    </p>
                    {ad.campaignName && (
                      <p className="text-[11px] text-slate-500">{ad.campaignName}</p>
                    )}
                  </td>
                  <td className="py-3 px-3 tabular-nums">
                    {formatReadableAdDate(ad.publishDate)} · {ad.schedule?.startTime || '00:00'}
                  </td>
                  <td className="py-3 px-3 tabular-nums">
                    {formatReadableAdDate(ad.expiryDate)} · {ad.schedule?.expiryTime || '23:59'}
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                    {ad.schedule?.daysOfWeek && ad.schedule.daysOfWeek.length > 0
                      ? ad.schedule.daysOfWeek
                          .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
                          .join(', ')
                      : 'Every Day'}
                    {ad.schedule?.dailyStartTime && ad.schedule?.dailyEndTime
                      ? ` (${ad.schedule.dailyStartTime}–${ad.schedule.dailyEndTime})`
                      : ''}
                  </td>
                  <td className="py-3 px-3">
                    {renderLifecycleBadge(getAdLifecycleState(ad, todayYmd))}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onEditAd(ad)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Edit Schedule
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 7: SHARING SETTINGS (GLOBAL KANNADA SHARE MESSAGE)              */}
      {/* =================================================================== */}
      {subTab === 'sharing' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Global Default Kannada Share Message
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Used whenever visitors share any advertisement via WhatsApp, Telegram, Facebook, Copy Link, or Native Share (unless overridden per ad).
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultShareMessage: `${prev.defaultShareMessage}[ADVERTISEMENT TITLE]`,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                + Insert [ADVERTISEMENT TITLE]
              </button>
              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultShareMessage: `${prev.defaultShareMessage}[ADVERTISEMENT URL]`,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                + Insert [ADVERTISEMENT URL]
              </button>
              <button
                type="button"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultShareMessage: DEFAULT_KANNADA_SHARE_TEMPLATE,
                  }))
                }
                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
              >
                Reset to Default Kannada Template
              </button>
            </div>

            <textarea
              rows={8}
              maxLength={800}
              value={settings.defaultShareMessage}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  defaultShareMessage: e.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-300 bg-white p-3.5 font-kannada text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />

            <div className="flex justify-end">
              <button
                type="button"
                disabled={savingSettings}
                onClick={() =>
                  void handleSaveSettings(settings, 'Global Kannada share message updated.')
                }
                className="rounded-lg bg-[#0B192C] px-5 py-2 text-xs font-bold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
              >
                {savingSettings ? 'Saving...' : 'Save Share Template'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#111C2E]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Live WhatsApp / Share Preview
            </h3>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <pre className="whitespace-pre-wrap font-kannada text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                {sampleSharePreview}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 8: ADVERTISEMENT ANALYTICS DASHBOARD                            */}
      {/* =================================================================== */}
      {subTab === 'analytics' && (
        <div className="space-y-5">
          {/* Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
              {(['daily', 'weekly', 'monthly', 'all'] as AdAnalyticsRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAnalyticsRange(r)}
                  className={`rounded-md px-3 py-1.5 font-semibold capitalize cursor-pointer ${
                    analyticsRange === r
                      ? 'bg-[#0B192C] text-white dark:bg-amber-500 dark:text-slate-950'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {r === 'all' ? 'All Time' : r}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Filter analytics by advertisement"
                value={analyticsAdId}
                onChange={(e) => setAnalyticsAdId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">All Advertisements ({ads.length})</option>
                {ads.map((ad) => (
                  <option key={ad.id} value={ad.id}>
                    {ad.adNumber} — {ad.title.slice(0, 40)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadAnalytics()}
                disabled={loadingAnalytics}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${loadingAnalytics ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loadingAnalytics && !analyticsData ? (
            <div className="flex h-48 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-500 dark:border-slate-800 dark:bg-[#111C2E]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Calculating real-time advertisement analytics...</span>
            </div>
          ) : analyticsData ? (
            <>
              {/* Primary KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Total Impressions',
                    value: analyticsData.totals.impressions.toLocaleString('en-IN'),
                  },
                  {
                    label: 'Unique Visitors Reached',
                    value: analyticsData.totals.uniqueVisitors.toLocaleString('en-IN'),
                  },
                  {
                    label: 'Total Clicks',
                    value: analyticsData.totals.clicks.toLocaleString('en-IN'),
                  },
                  {
                    label: 'Click-Through Rate (CTR)',
                    value: `${analyticsData.totals.ctrPct.toFixed(2)}%`,
                  },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {k.label}
                    </p>
                    <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-[#0F274A] dark:text-amber-300">
                      {k.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Action Breakdown Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'WhatsApp Clicks', value: analyticsData.totals.whatsappClicks, icon: MessageCircle },
                  { label: 'Phone Clicks', value: analyticsData.totals.phoneClicks, icon: Phone },
                  { label: 'Website Clicks', value: analyticsData.totals.websiteClicks, icon: Globe },
                  { label: 'Directions Clicks', value: analyticsData.totals.directionsClicks, icon: MapPin },
                  { label: 'Share Clicks', value: analyticsData.totals.shareClicks, icon: Share2 },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-center gap-3 dark:border-slate-800 dark:bg-[#111C2E]"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#0F274A] dark:bg-slate-800 dark:text-amber-300">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">{item.label}</p>
                        <p className="text-base font-extrabold tabular-nums text-slate-900 dark:text-white">
                          {item.value.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Device Breakdown & Placement Performance */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#111C2E]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Desktop vs Mobile Breakdown
                  </h4>
                  {(() => {
                    const desktop = analyticsData.totals.desktopImpressions || 0;
                    const mobile = analyticsData.totals.mobileImpressions || 0;
                    const totalDev = Math.max(1, desktop + mobile);
                    const desktopPct = Math.round((desktop / totalDev) * 100);
                    const mobilePct = Math.round((mobile / totalDev) * 100);
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <Monitor className="h-3.5 w-3.5" /> Desktop: {desktop.toLocaleString('en-IN')} ({desktopPct}%)
                          </span>
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <Smartphone className="h-3.5 w-3.5" /> Mobile: {mobile.toLocaleString('en-IN')} ({mobilePct}%)
                          </span>
                        </div>
                        <div className="h-3 w-full rounded-full overflow-hidden bg-slate-100 flex dark:bg-slate-800">
                          <div
                            className="bg-[#0F274A] dark:bg-blue-500"
                            style={{ width: `${desktopPct}%` }}
                          />
                          <div
                            className="bg-amber-400"
                            style={{ width: `${mobilePct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {analyticsData.bestPerformingAd && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        Top Performer in Range
                      </p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white font-kannada">
                        {analyticsData.bestPerformingAd.adNumber} · {analyticsData.bestPerformingAd.title}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {analyticsData.bestPerformingAd.impressions.toLocaleString('en-IN')} views ·{' '}
                        {analyticsData.bestPerformingAd.clicks.toLocaleString('en-IN')} clicks ({analyticsData.bestPerformingAd.ctrPct.toFixed(1)}% CTR)
                      </p>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#111C2E]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Activity by Placement
                  </h4>
                  {Object.keys(analyticsData.byPlacement).length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">
                      Placement-level breakdown will populate automatically across active ad placements.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {Object.entries(analyticsData.byPlacement).map(([key, count]) => {
                        const maxVal = Math.max(
                          1,
                          ...Object.values(analyticsData.byPlacement)
                        );
                        const pct = Math.round((count / maxVal) * 100);
                        return (
                          <div key={key} className="space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-700 dark:text-slate-200">
                                {key}
                              </span>
                              <span className="tabular-nums font-bold">{count.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden dark:bg-slate-800">
                              <div
                                className="h-full bg-[#0F274A] dark:bg-amber-400 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Daily Trend Bars */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#111C2E]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Daily Impressions &amp; Clicks Trend
                </h4>
                {analyticsData.series.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    No daily traffic recorded inside this range yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-2">
                    {analyticsData.series.slice(-14).map((bucket) => {
                      const maxImp = Math.max(
                        1,
                        ...analyticsData.series.slice(-14).map((b) => b.impressions)
                      );
                      const heightPct = Math.max(8, Math.round((bucket.impressions / maxImp) * 100));
                      return (
                        <div
                          key={bucket.date}
                          className="rounded-lg border border-slate-100 bg-slate-50/70 p-2 flex flex-col justify-between gap-2 dark:border-slate-800 dark:bg-slate-900/60"
                        >
                          <div className="h-20 flex items-end justify-center">
                            <div
                              className="w-6 rounded-t bg-[#0F274A] dark:bg-amber-400"
                              style={{ height: `${heightPct}%` }}
                              title={`${bucket.date}: ${bucket.impressions} impressions, ${bucket.clicks} clicks`}
                            />
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] font-mono text-slate-500">{bucket.date.slice(5)}</p>
                            <p className="text-[11px] font-bold tabular-nums text-slate-800 dark:text-white">
                              {bucket.impressions} / {bucket.clicks}c
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Individual Ad Performance Table */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto dark:border-slate-800 dark:bg-[#111C2E]">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Individual Advertisement Performance
                  </h4>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60">
                      <th className="py-2.5 px-4">Ad ID</th>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-3 text-right">Impressions</th>
                      <th className="py-2.5 px-3 text-right">Clicks</th>
                      <th className="py-2.5 px-3 text-right">CTR</th>
                      <th className="py-2.5 px-3 text-right">WhatsApp</th>
                      <th className="py-2.5 px-3 text-right">Phone</th>
                      <th className="py-2.5 px-4 text-right">Shares</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {analyticsData.perAd.map((row) => (
                      <tr key={row.adId}>
                        <td className="py-2.5 px-4 font-mono font-bold text-[#0F274A] dark:text-amber-300">
                          {row.adNumber}
                        </td>
                        <td className="py-2.5 px-3 font-kannada font-semibold max-w-[240px] truncate">
                          {row.title}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.impressions.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.clicks.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold">
                          {row.ctrPct.toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.whatsappClicks.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.phoneClicks.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums">
                          {row.shareClicks.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 9: ADVANCED SETTINGS (CUSTOM CATEGORIES, WORKFLOW, DEFAULTS)    */}
      {/* =================================================================== */}
      {subTab === 'advanced' && (
        <div className="space-y-5">
          {/* Custom Categories */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Custom Advertisement Categories
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Standard categories (including Shopping &amp; Shops) are built in. Add any local custom category here.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {allCategories.map((cat: string) => {
                const isCustom = (settings.customCategories || []).includes(cat);
                return (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <span>{cat}</span>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            customCategories: prev.customCategories.filter((c) => c !== cat),
                          }))
                        }
                        className="text-rose-600 hover:text-rose-800 cursor-pointer"
                        aria-label={`Remove ${cat}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>

            <div className="flex items-center gap-2 max-w-md">
              <input
                type="text"
                maxLength={48}
                value={newCustomCategory}
                onChange={(e) => setNewCustomCategory(e.target.value)}
                placeholder="e.g. Homestays & Resorts"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = newCustomCategory.trim();
                  if (!trimmed) return;
                  if (allCategories.some((c: string) => c.toLowerCase() === trimmed.toLowerCase())) {
                    setNewCustomCategory('');
                    return;
                  }
                  setSettings((prev) => ({
                    ...prev,
                    customCategories: [...prev.customCategories, trimmed],
                  }));
                  setNewCustomCategory('');
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Category</span>
              </button>
            </div>
          </div>

          {/* Workflow & Visitor Frequency Defaults */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#111C2E]">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Approval Workflow &amp; Visitor Frequency Defaults
            </h3>

            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.approvalWorkflowEnabled}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    approvalWorkflowEnabled: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded"
              />
              <span>Require admin approval before newly created advertisements appear live</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Default Display Frequency
                </label>
                <select
                  value={settings.defaultDisplayFrequency}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      defaultDisplayFrequency: e.target.value as AdDisplayFrequency,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="every_visit">Every Visit</option>
                  <option value="once_per_session">Once per Session</option>
                  <option value="once_per_day">Once per Day</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Default Max Impressions / Visitor (0 = Unlimited)
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={settings.defaultMaxImpressionsPerVisitor}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      defaultMaxImpressionsPerVisitor: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                disabled={savingSettings}
                onClick={() =>
                  void handleSaveSettings(settings, 'Advanced advertisement settings saved.')
                }
                className="rounded-lg bg-[#0B192C] px-5 py-2 text-xs font-bold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
              >
                {savingSettings ? 'Saving...' : 'Save Advanced Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Placement Desktop/Mobile Preview Modal */}
      <AdPreviewModal
        ad={previewAd}
        settings={settings}
        onClose={() => setPreviewAd(null)}
        onEditAd={(ad) => onEditAd(ad)}
      />
    </div>
  );
}
