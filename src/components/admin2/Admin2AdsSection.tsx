import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgePlus,
  CalendarClock,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Eye,
  FileEdit,
  Globe,
  Loader2,
  MapPin,
  Megaphone,
  MessageCircle,
  PauseCircle,
  Phone,
  PlayCircle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteAdminAd,
  fetchAdminAds,
  toggleAdminAdStatus,
} from '../../services/adsClient';
import {
  AD_CATEGORIES,
  type Advertisement,
  type AdvertisementStats,
} from '../../types/ads';
import {
  buildAdPublicUrl,
  buildTelHref,
  buildWhatsAppAdHref,
  formatReadableAdDate,
  getAdLifecycleState,
  getTodayIstYmd,
  sanitizeExternalWebsiteUrl,
  type EffectiveAdLifecycle,
} from '../../utils/adHelpers';
import { sanitizeRichTextHtml } from '../../utils/richText';
import { AdImage } from '../AdImage';

interface Admin2AdsSectionProps {
  onOpenAddAd: () => void;
  onEditAd: (ad: Advertisement) => void;
  refreshNonce: number;
  onDataChanged?: (nextAdNumber: string) => void;
}

type StatusFilter = 'all' | EffectiveAdLifecycle;

function renderLifecycleStatus(state: EffectiveAdLifecycle) {
  switch (state) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Active</span>
        </span>
      );
    case 'scheduled':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Scheduled</span>
        </span>
      );
    case 'inactive':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <PauseCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Inactive</span>
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Expired</span>
        </span>
      );
    case 'draft':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
          <FileEdit className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Draft</span>
        </span>
      );
  }
}

export function Admin2AdsSection({
  onOpenAddAd,
  onEditAd,
  refreshNonce,
  onDataChanged,
}: Admin2AdsSectionProps) {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [stats, setStats] = useState<AdvertisementStats>({
    total: 0,
    active: 0,
    inactive: 0,
    expired: 0,
    draft: 0,
  });
  const [todayYmd, setTodayYmd] = useState<string>(() => getTodayIstYmd());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewAd, setPreviewAd] = useState<Advertisement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminAds();
      setAds(res.ads);
      setStats(res.stats);
      if (res.todayYmd) setTodayYmd(res.todayYmd);
      onDataChanged?.(res.nextAdNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load advertisements.');
    } finally {
      setLoading(false);
    }
  }, [onDataChanged]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  const filteredAds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ads.filter((ad) => {
      const lifecycle = getAdLifecycleState(ad, todayYmd);
      if (statusFilter !== 'all') {
        if (statusFilter === 'active') {
          if (lifecycle !== 'active' && lifecycle !== 'scheduled') return false;
        } else if (lifecycle !== statusFilter) {
          return false;
        }
      }
      if (categoryFilter !== 'All' && ad.category !== categoryFilter) {
        return false;
      }
      if (q) {
        const haystack = [
          ad.adNumber,
          ad.title,
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
  }, [ads, searchQuery, statusFilter, categoryFilter, todayYmd]);

  const handleToggleStatus = async (ad: Advertisement) => {
    const nextStatus = ad.status === 'active' ? 'inactive' : 'active';
    setBusyId(ad.id);
    setError('');
    setFeedback('');
    try {
      const res = await toggleAdminAdStatus(ad.id, nextStatus);
      setAds((prev) => prev.map((item) => (item.id === ad.id ? res.ad : item)));
      setStats(res.stats);
      setFeedback(
        `${ad.adNumber} is now ${nextStatus === 'active' ? 'Active' : 'Inactive'}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update advertisement status.');
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
      onDataChanged?.(res.nextAdNumber);
      setFeedback(`Deleted advertisement ${ad.adNumber}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete advertisement.');
    } finally {
      setBusyId(null);
    }
  };

  const kpis: Array<{
    id: StatusFilter;
    label: string;
    value: number;
    tone: string;
  }> = [
    { id: 'all', label: 'Total Ads', value: stats.total, tone: 'text-slate-900 dark:text-white' },
    { id: 'active', label: 'Active Ads', value: stats.active, tone: 'text-emerald-700 dark:text-emerald-400' },
    { id: 'inactive', label: 'Inactive Ads', value: stats.inactive, tone: 'text-amber-700 dark:text-amber-400' },
    { id: 'expired', label: 'Expired Ads', value: stats.expired, tone: 'text-rose-700 dark:text-rose-400' },
    { id: 'draft', label: 'Draft Ads', value: stats.draft, tone: 'text-slate-600 dark:text-slate-300' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Local Advertisement Management
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage local business advertisements independently of news articles — displayed across Local Ads, slider, article footer, and scroll popup.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={onOpenAddAd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-bold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 cursor-pointer whitespace-nowrap"
          >
            <BadgePlus className="h-4 w-4" />
            <span>Add Advertisement</span>
          </button>
        </div>
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
            aria-label="Dismiss message"
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
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 5 Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => {
          const selected = statusFilter === kpi.id;
          return (
            <button
              key={kpi.id}
              type="button"
              onClick={() => setStatusFilter(kpi.id)}
              className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                selected
                  ? 'border-[#0F274A] bg-white ring-1 ring-[#0F274A]/20 dark:border-amber-400 dark:bg-[#111C2E]'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-[#111C2E] dark:hover:border-slate-700'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {kpi.label}
              </p>
              <p className={`mt-2 text-2xl font-extrabold tabular-nums tracking-tight ${kpi.tone}`}>
                {kpi.value}
              </p>
            </button>
          );
        })}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111C2E]">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by AD number, title, address, or phone..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F274A] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
          </select>

          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="All">All Categories</option>
            {AD_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Advertisement List / Table */}
      {loading && ads.length === 0 ? (
        <div className="flex h-52 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-500 dark:border-slate-800 dark:bg-[#111C2E] dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading local advertisements...</span>
        </div>
      ) : filteredAds.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-[#111C2E]">
          <Megaphone className="mx-auto h-8 w-8 text-slate-400 mb-3" aria-hidden="true" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {ads.length === 0 ? 'No local advertisements published yet' : 'No advertisements match your filters'}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {ads.length === 0
              ? 'Publish your first local business advertisement with original unmodified banners, contact details, and automatic scheduling.'
              : 'Try clearing the search query or switching status and category filters.'}
          </p>
          {ads.length === 0 && (
            <button
              type="button"
              onClick={onOpenAddAd}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-bold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
            >
              <BadgePlus className="h-4 w-4" />
              <span>Add First Advertisement</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111C2E]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="py-3 px-4">Ad ID</th>
                  <th className="py-3 px-3">Creative</th>
                  <th className="py-3 px-3">Advertisement Title</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Publish / Expiry</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Reach</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredAds.map((ad) => {
                  const lifecycle = getAdLifecycleState(ad, todayYmd);
                  const isBusy = busyId === ad.id;
                  return (
                    <tr
                      key={ad.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#0F274A] dark:text-amber-300 whitespace-nowrap tabular-nums">
                        {ad.adNumber}
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
                      <td className="py-3 px-3 max-w-xs">
                        <p className="font-kannada font-semibold text-slate-900 dark:text-white line-clamp-1">
                          {ad.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {[ad.businessAddress, ad.contactNumber].filter(Boolean).join(' · ') ||
                            `${ad.additionalImages.length} extra image${ad.additionalImages.length === 1 ? '' : 's'}`}
                        </p>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {ad.category}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <div>{formatReadableAdDate(ad.publishDate)}</div>
                        <div className="text-[11px] text-slate-400">
                          to {formatReadableAdDate(ad.expiryDate)}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {renderLifecycleStatus(lifecycle)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <div>{ad.views.toLocaleString('en-IN')} views</div>
                        <div className="text-[11px] text-slate-400">
                          {ad.clicks.toLocaleString('en-IN')} clicks
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {confirmDeleteId === ad.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDelete(ad)}
                              className="rounded bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700 cursor-pointer"
                            >
                              {isBusy ? '...' : 'Confirm Delete'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleStatus(ad)}
                              title={ad.status === 'active' ? 'Deactivate Advertisement' : 'Activate Advertisement'}
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              {ad.status === 'active' ? (
                                <PauseCircle className="h-4 w-4 text-amber-600" />
                              ) : (
                                <PlayCircle className="h-4 w-4 text-emerald-600" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewAd(ad)}
                              title="Preview Advertisement"
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditAd(ad)}
                              title="Edit Advertisement"
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(ad.id)}
                              title="Delete Advertisement"
                              className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
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

          {/* Mobile & Tablet Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:hidden">
            {filteredAds.map((ad) => {
              const lifecycle = getAdLifecycleState(ad, todayYmd);
              const isBusy = busyId === ad.id;
              return (
                <article
                  key={ad.id}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-[#111C2E]"
                >
                  <div className="h-40 w-full border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
                    <AdImage
                      src={ad.mainImageThumbUrl || ad.mainImageUrl}
                      alt={ad.title}
                      fit="contain"
                      className="h-full w-full"
                    />
                  </div>
                  <div className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-[#0F274A] dark:text-amber-300">
                        {ad.adNumber} · {ad.category}
                      </span>
                      {renderLifecycleStatus(lifecycle)}
                    </div>

                    <h3 className="font-kannada text-sm font-bold text-slate-900 dark:text-white line-clamp-2">
                      {ad.title}
                    </h3>

                    <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      {formatReadableAdDate(ad.publishDate)} – {formatReadableAdDate(ad.expiryDate)} · {ad.views} views · {ad.clicks} clicks
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleStatus(ad)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        {ad.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewAd(ad)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditAd(ad)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                      {confirmDeleteId === ad.id ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDelete(ad)}
                          className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white cursor-pointer"
                        >
                          Confirm Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(ad.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {/* Full Ad Preview Modal */}
      {previewAd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-5 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewAd.adNumber}`}
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0F172A]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <span className="font-mono font-bold text-[#0F274A] dark:text-amber-300">
                  {previewAd.adNumber}
                </span>
                <span aria-hidden="true">·</span>
                <span>{previewAd.category}</span>
                <span aria-hidden="true">·</span>
                {renderLifecycleStatus(getAdLifecycleState(previewAd, todayYmd))}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={buildAdPublicUrl(previewAd.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F274A] hover:underline dark:text-blue-400"
                >
                  <span>Public Link</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAd(null)}
                  aria-label="Close preview"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <h3 className="font-kannada text-xl font-extrabold text-slate-950 dark:text-white leading-snug">
                {previewAd.title}
              </h3>

              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-950">
                <AdImage
                  src={previewAd.mainImageUrl}
                  alt={previewAd.title}
                  fit="contain"
                  lazy={false}
                  className="w-full max-h-[420px] flex items-center justify-center bg-white dark:bg-slate-950"
                  imgClassName="max-h-[420px] w-auto mx-auto"
                />
              </div>

              {previewAd.description && (
                <div
                  className="article-rich-content font-kannada text-sm text-slate-800 dark:text-slate-200 leading-relaxed space-y-3"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(previewAd.description) }}
                />
              )}

              {(previewAd.businessAddress ||
                previewAd.contactNumber ||
                previewAd.whatsappNumber ||
                previewAd.websiteUrl) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900">
                  {previewAd.businessAddress && (
                    <div className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <MapPin className="h-4 w-4 text-[#0F274A] dark:text-amber-300 shrink-0 mt-0.5" />
                      <span className="font-kannada">{previewAd.businessAddress}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {previewAd.contactNumber && (
                      <a
                        href={buildTelHref(previewAd.contactNumber)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F274A] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        <span>{previewAd.contactNumber}</span>
                      </a>
                    )}
                    {previewAd.whatsappNumber && (
                      <a
                        href={buildWhatsAppAdHref(previewAd.whatsappNumber, previewAd)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    {sanitizeExternalWebsiteUrl(previewAd.websiteUrl) && (
                      <a
                        href={sanitizeExternalWebsiteUrl(previewAd.websiteUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span>Visit Website</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {previewAd.additionalImages.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Additional Images ({previewAd.additionalImages.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {previewAd.additionalImages.map((img, idx) => (
                      <figure
                        key={`${img.imageUrl.slice(0, 24)}-${idx}`}
                        className="rounded-lg border border-slate-200 overflow-hidden dark:border-slate-700"
                      >
                        <AdImage
                          src={img.imageUrl}
                          alt={img.caption || `${previewAd.title} photo ${idx + 2}`}
                          fit="contain"
                          className="h-44 w-full bg-white dark:bg-slate-950"
                        />
                        {img.caption && (
                          <figcaption className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 font-kannada">
                            {img.caption}
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  const target = previewAd;
                  setPreviewAd(null);
                  onEditAd(target);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Advertisement</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewAd(null)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
