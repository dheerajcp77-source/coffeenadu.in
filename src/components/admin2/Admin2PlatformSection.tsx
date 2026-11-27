import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  CloudRain,
  Download,
  Eye,
  Flag,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { PLATFORM_MODULES, PLATFORM_MODULE_MAP } from '../../constants/platformCatalog';
import {
  addAdminWeatherLog,
  createAdminPlatformListing,
  deleteAdminPlatformListing,
  deleteAdminWeatherLog,
  fetchAdminPlatformListings,
  fetchAdminPlatformOverview,
  fetchAdminReports,
  fetchAdminWeather,
  moderateAdminPlatformListing,
  updateAdminReportStatus,
} from '../../services/platformClient';
import type {
  DirectoryModuleId,
  LocalityOption,
  PlatformAnalyticsSummary,
  PlatformListing,
  PlatformReport,
  WeatherRainfallRecord,
} from '../../types/platform';
import { getAdmin2AuthHeaders } from '../../services/admin2Client';
import { formatAdminViewCount, sumViewCounts } from '../../utils/viewCounts';

interface Admin2PlatformSectionProps {
  initialMode?: 'hub' | 'moderation';
}

const DIRECTORY_MODULES = PLATFORM_MODULES.filter((m) => m.isDirectoryModule);

export const Admin2PlatformSection: React.FC<Admin2PlatformSectionProps> = ({
  initialMode = 'hub',
}) => {
  const [tab, setTab] = useState<'listings' | 'moderation' | 'reports' | 'weather' | 'analytics'>(
    initialMode === 'moderation' ? 'moderation' : 'listings'
  );
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');
  const [listings, setListings] = useState<PlatformListing[]>([]);
  const [reports, setReports] = useState<PlatformReport[]>([]);
  const [weatherLogs, setWeatherLogs] = useState<WeatherRainfallRecord[]>([]);
  const [localities, setLocalities] = useState<LocalityOption[]>([]);
  const [analytics, setAnalytics] = useState<PlatformAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // Create Listing Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    module: 'businesses' as DirectoryModuleId,
    title: '',
    titleEn: '',
    category: 'groceries',
    location: 'Koppa',
    address: '',
    phone: '',
    whatsapp: '',
    website: '',
    summary: '',
    description: '',
    price: '',
    priceLabel: '',
    employer: '',
    salary: '',
    applicationDeadline: '',
    openingHours: '',
    sourceAttribution: '',
    verified: true,
    featured: false,
  });

  // New Weather Log form
  const [rainForm, setRainForm] = useState({
    location: 'Koppa',
    dateYmd: new Date().toISOString().slice(0, 10),
    rainfallMm: '',
    tempMinC: '',
    tempMaxC: '',
    conditionKn: 'ಮೋಡ ಕವಿದ ವಾತಾವರಣ ಮತ್ತು ಸಾಧಾರಣ ಮಳೆ',
    conditionEn: 'Cloudy with moderate rainfall',
    advisoryKn: '',
    advisoryEn: '',
    sourceAttribution: 'Coffeenadu Rain Gauge Log',
  });

  useEffect(() => {
    setTab(initialMode === 'moderation' ? 'moderation' : 'listings');
  }, [initialMode]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [overviewRes, listRes, repRes, weatherRes] = await Promise.all([
        fetchAdminPlatformOverview(),
        fetchAdminPlatformListings({
          module: selectedModule,
          status: selectedStatus,
          q: searchQ,
        }),
        fetchAdminReports(),
        fetchAdminWeather(),
      ]);
      setAnalytics(overviewRes.analytics);
      setLocalities(overviewRes.localities || []);
      setListings(listRes.listings || []);
      setReports(repRes.reports || []);
      setWeatherLogs(weatherRes.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load platform management data.');
    } finally {
      setLoading(false);
    }
  }, [selectedModule, selectedStatus, searchQ]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleModerate = async (
    id: string,
    patch: Parameters<typeof moderateAdminPlatformListing>[1],
    msg: string
  ) => {
    try {
      await moderateAdminPlatformListing(id, patch);
      setFeedback(msg);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Moderation failed.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this listing permanently?')) return;
    try {
      await deleteAdminPlatformListing(id);
      setFeedback('Listing deleted.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await createAdminPlatformListing({
        ...newForm,
        price: newForm.price ? Number(newForm.price) : undefined,
        status: 'approved',
      });
      setFeedback('New platform listing published.');
      setCreateOpen(false);
      setNewForm((prev) => ({
        ...prev,
        title: '',
        titleEn: '',
        summary: '',
        description: '',
        phone: '',
        whatsapp: '',
        website: '',
        price: '',
      }));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing.');
    }
  };

  const handleAddRainLog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addAdminWeatherLog({
        ...rainForm,
        rainfallMm: Number(rainForm.rainfallMm || 0),
      });
      setFeedback('Rainfall record published.');
      setRainForm((prev) => ({ ...prev, rainfallMm: '', advisoryKn: '', advisoryEn: '' }));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add rainfall log.');
    }
  };

  const handleExportBackup = async () => {
    try {
      const res = await fetch('/api/admin2/platform/export', {
        headers: await getAdmin2AuthHeaders(),
      });
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coffeenadu-platform-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Backup export failed.');
    }
  };

  const pendingListings = listings.filter((l) => l.status === 'pending');
  const openReports = reports.filter((r) => r.status === 'open');
  const activeNewModuleMeta = PLATFORM_MODULE_MAP[newForm.module];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Malnad Platform Ecosystem Manager
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage all regional services, businesses, jobs, marketplace items, civic directories, rainfall logs, user submissions, and moderation reports without touching source code.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExportBackup()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#176B4A] hover:bg-[#12553A] px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Platform Listing
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <Eye className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>Listing Views</span>
            </div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-amber-300 tabular-nums mt-0.5">
              {formatAdminViewCount(sumViewCounts(listings.map((item) => item.views)))}
            </div>
            <div className="text-[10px] text-slate-400">Sales &amp; directories (Admin)</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">Unique Visitors</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
              {analytics.totalUniqueVisitors}
            </div>
            <div className="text-[10px] text-slate-400">
              Today: {analytics.dailyVisitors} · 7d: {analytics.weeklyVisitors}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">Pending Approval</div>
            <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">
              {analytics.pendingSubmissionsCount}
            </div>
            <div className="text-[10px] text-slate-400">User submissions</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">Open Reports</div>
            <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-0.5 tabular-nums">
              {analytics.openReportsCount}
            </div>
            <div className="text-[10px] text-slate-400">Needs review</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">Call / WA Enquiries</div>
            <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
              {analytics.totalEnquiries}
            </div>
            <div className="text-[10px] text-slate-400">Direct clicks tracked</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">WhatsApp Shares</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
              {analytics.totalWhatsappShares}
            </div>
            <div className="text-[10px] text-slate-400">Platform shares</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">Quiz Attempts</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
              {analytics.quizAttemptsCount}
            </div>
            <div className="text-[10px] text-slate-400">Malnad quizzes</div>
          </div>
        </div>
      )}

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'listings', label: `All Directory Listings (${listings.length})` },
          { id: 'moderation', label: `Pending Queue (${pendingListings.length})` },
          { id: 'reports', label: `User Reports (${openReports.length})` },
          { id: 'weather', label: `Weather & Rainfall Logs (${weatherLogs.length})` },
          { id: 'analytics', label: 'Platform Analytics & Searches' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
              tab === t.id
                ? 'bg-[#10243D] text-white dark:bg-amber-400 dark:text-slate-950'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Listings & Moderation Queue */}
      {(tab === 'listings' || tab === 'moderation') && (
        <div className="space-y-4">
          {tab === 'listings' && (
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold"
              >
                <option value="all">All 16 Directory Modules</option>
                {DIRECTORY_MODULES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.titleEn}
                  </option>
                ))}
              </select>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold"
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
                <option value="sold">Sold</option>
                <option value="expired">Expired</option>
              </select>
              <input
                type="search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search title, town, category..."
                className="flex-1 min-w-[200px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
              />
            </div>
          )}

          {loading ? (
            <div className="h-32 rounded-xl bg-slate-100 dark:bg-slate-900 animate-pulse" />
          ) : (tab === 'moderation' ? pendingListings : listings).length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500">
              {tab === 'moderation'
                ? 'No pending user submissions waiting for approval.'
                : 'No listings match the current filter.'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {(tab === 'moderation' ? pendingListings : listings).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                      <span className="uppercase tracking-wide text-[#176B4A] dark:text-emerald-400">
                        {PLATFORM_MODULE_MAP[item.module]?.titleEn || item.module}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600 dark:text-slate-300">{item.location}</span>
                      <span className="text-slate-400">·</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          item.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : item.status === 'pending'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {item.status}
                      </span>
                      {item.verified && (
                        <span className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400">
                          <ShieldCheck className="w-3 h-3" /> Verified
                        </span>
                      )}
                      {item.featured && (
                        <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                          <Star className="w-3 h-3" /> Featured
                        </span>
                      )}
                    </div>
                    <div className="font-kannada text-sm font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                      {item.summary}
                    </p>
                    <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1 font-bold tabular-nums text-slate-800 dark:text-amber-300">
                        <Eye className="w-3.5 h-3.5 text-slate-400 dark:text-amber-400/80" />
                        Views: {formatAdminViewCount(item.views)}
                      </span>
                      {item.phone && <span>Phone: {item.phone}</span>}
                      <span>Calls: {item.callClicks}</span>
                      <span>WhatsApp: {item.whatsappClicks}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {item.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleModerate(item.id, { status: 'approved' }, 'Listing approved & published.')
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                    )}
                    {item.status !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleModerate(item.id, { status: 'rejected' }, 'Listing rejected.')
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        void handleModerate(
                          item.id,
                          { verified: !item.verified },
                          item.verified ? 'Removed verified badge.' : 'Marked as verified.'
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      {item.verified ? 'Unverify' : 'Verify'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleModerate(
                          item.id,
                          { featured: !item.featured },
                          item.featured ? 'Removed featured highlight.' : 'Marked as featured.'
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      {item.featured ? 'Unfeature' : 'Feature'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item.id)}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      title="Delete listing"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {tab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-500">
              No user reports filed.
            </div>
          ) : (
            reports.map((rep) => (
              <div
                key={rep.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400">
                    <Flag className="w-3.5 h-3.5" />
                    <span>{rep.reason}</span>
                    <span className="text-slate-400">·</span>
                    <span className="uppercase text-[10px] text-slate-600 dark:text-slate-300">
                      {rep.status}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {rep.listingTitle} ({rep.module})
                  </div>
                  {rep.details && <p className="text-xs text-slate-500">{rep.details}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await updateAdminReportStatus(rep.id, 'resolved');
                      setFeedback('Report marked resolved.');
                      await loadAll();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await updateAdminReportStatus(rep.id, 'dismissed');
                      setFeedback('Report dismissed.');
                      await loadAll();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Weather & Rainfall Tab */}
      {tab === 'weather' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleAddRainLog}
            className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 text-xs"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <CloudRain className="w-4 h-4 text-sky-600" />
              <span>Publish Verified Rainfall / Weather Log</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-semibold mb-1">Location</label>
                <select
                  value={rainForm.location}
                  onChange={(e) => setRainForm({ ...rainForm, location: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
                >
                  {localities.map((l) => (
                    <option key={l.id} value={l.nameEn}>
                      {l.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Date</label>
                <input
                  type="date"
                  value={rainForm.dateYmd}
                  onChange={(e) => setRainForm({ ...rainForm, dateYmd: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block font-semibold mb-1">Rainfall (mm) *</label>
                <input
                  required
                  type="number"
                  step="0.1"
                  value={rainForm.rainfallMm}
                  onChange={(e) => setRainForm({ ...rainForm, rainfallMm: e.target.value })}
                  placeholder="42.5"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Min °C</label>
                <input
                  type="number"
                  value={rainForm.tempMinC}
                  onChange={(e) => setRainForm({ ...rainForm, tempMinC: e.target.value })}
                  placeholder="19"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Max °C</label>
                <input
                  type="number"
                  value={rainForm.tempMaxC}
                  onChange={(e) => setRainForm({ ...rainForm, tempMaxC: e.target.value })}
                  placeholder="26"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Condition (Kannada)</label>
              <input
                value={rainForm.conditionKn}
                onChange={(e) => setRainForm({ ...rainForm, conditionKn: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Source Attribution</label>
              <input
                value={rainForm.sourceAttribution}
                onChange={(e) => setRainForm({ ...rainForm, sourceAttribution: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#176B4A] text-white font-bold cursor-pointer"
            >
              Publish Rainfall Log
            </button>
          </form>

          <div className="lg:col-span-7 space-y-2.5">
            {weatherLogs.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-xs text-slate-500">
                No rainfall logs published yet. Use the form on the left to add verified station readings.
              </div>
            ) : (
              weatherLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {log.location} · {log.dateYmd} ·{' '}
                      <span className="text-sky-600 dark:text-sky-400">{log.rainfallMm} mm</span>
                    </div>
                    <div className="text-slate-500">{log.conditionKn} · {log.sourceAttribution}</div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteAdminWeatherLog(log.id);
                      await loadAll();
                    }}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Platform Analytics Tab */}
      {tab === 'analytics' && analytics && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Top Viewed Listings — Sales, Shops, Jobs &amp; Directories (Admin Only)</span>
              </h3>
              <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                Total Views: {formatAdminViewCount(sumViewCounts(listings.map((item) => item.views)))}
              </span>
            </div>
            {listings.length === 0 ? (
              <p className="text-slate-500">No platform listings found yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...listings]
                  .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
                  .slice(0, 10)
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="font-kannada font-semibold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {PLATFORM_MODULE_MAP[item.module]?.titleEn || item.module} · {item.location} · Calls: {item.callClicks} · WhatsApp: {item.whatsappClicks}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 font-bold tabular-nums text-slate-900 dark:text-amber-300">
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                        {formatAdminViewCount(item.views)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Most-Used Search Terms</h3>
              {analytics.topSearchTerms.length === 0 ? (
                <p className="text-slate-500">No search queries recorded yet.</p>
              ) : (
                analytics.topSearchTerms.map((s) => (
                  <div key={s.term} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-medium">{s.term}</span>
                    <span className="font-bold">{s.count}</span>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Popular Platform Sections</h3>
              {analytics.popularSections.length === 0 ? (
                <p className="text-slate-500">No section visits recorded yet.</p>
              ) : (
                analytics.popularSections.map((s) => (
                  <div key={s.module} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-medium capitalize">{s.module}</span>
                    <span className="font-bold">{s.visits}</span>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Device &amp; Locality Split</h3>
              <div className="flex justify-between">
                <span>Mobile Traffic Events</span>
                <strong>{analytics.deviceBreakdown.mobile}</strong>
              </div>
              <div className="flex justify-between">
                <span>Desktop Traffic Events</span>
                <strong>{analytics.deviceBreakdown.desktop}</strong>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <div className="font-semibold text-slate-500">Top Localities</div>
                {analytics.locationActivity.map((l) => (
                  <div key={l.location} className="flex justify-between">
                    <span>{l.location}</span>
                    <strong>{l.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Listing Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Add New Malnad Platform Listing
              </h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateListing} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Module *</label>
                  <select
                    value={newForm.module}
                    onChange={(e) => {
                      const nextMod = e.target.value as DirectoryModuleId;
                      setNewForm({
                        ...newForm,
                        module: nextMod,
                        category: PLATFORM_MODULE_MAP[nextMod]?.categories[0]?.id || 'general',
                      });
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
                  >
                    {DIRECTORY_MODULES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.titleEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Category</label>
                  <select
                    value={newForm.category}
                    onChange={(e) => setNewForm({ ...newForm, category: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
                  >
                    {(activeNewModuleMeta?.categories || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Title (Kannada / Primary) *</label>
                <input
                  required
                  value={newForm.title}
                  onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">English Title (Optional)</label>
                  <input
                    value={newForm.titleEn}
                    onChange={(e) => setNewForm({ ...newForm, titleEn: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Location *</label>
                  <select
                    value={newForm.location}
                    onChange={(e) => setNewForm({ ...newForm, location: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                  >
                    {localities.map((l) => (
                      <option key={l.id} value={l.nameEn}>
                        {l.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold mb-1">Phone</label>
                  <input
                    value={newForm.phone}
                    onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">WhatsApp</label>
                  <input
                    value={newForm.whatsapp}
                    onChange={(e) => setNewForm({ ...newForm, whatsapp: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Price / Salary</label>
                  <input
                    value={newForm.priceLabel}
                    onChange={(e) => setNewForm({ ...newForm, priceLabel: e.target.value })}
                    placeholder="₹12,000"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Website / Official Link (https://...)</label>
                <input
                  value={newForm.website}
                  onChange={(e) => setNewForm({ ...newForm, website: e.target.value })}
                  placeholder="https://"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Description *</label>
                <textarea
                  required
                  rows={4}
                  value={newForm.description}
                  onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newForm.verified}
                    onChange={(e) => setNewForm({ ...newForm, verified: e.target.checked })}
                  />
                  Verified Badge
                </label>
                <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newForm.featured}
                    onChange={(e) => setNewForm({ ...newForm, featured: e.target.checked })}
                  />
                  Featured on Homepage
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#176B4A] text-white font-bold cursor-pointer"
                >
                  Publish Listing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
