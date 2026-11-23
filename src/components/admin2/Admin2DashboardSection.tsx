import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Bell,
  Clock,
  Cpu,
  Database,
  Eye,
  FileEdit,
  FileText,
  FolderArchive,
  HardDrive,
  Loader2,
  Newspaper,
  RefreshCw,
  Users,
} from 'lucide-react';
import { fetchAdmin2Dashboard, type Admin2DashboardResponse } from '../../services/admin2Client';
import type { AdminSectionId } from '../../types/admin2';
import { TrafficAreaChart } from './Admin2Charts';

interface Admin2DashboardSectionProps {
  onNavigateSection: (section: AdminSectionId) => void;
  onUnreadCountChange?: (count: number) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatShortTime(iso?: string | null): string {
  if (!iso) return 'Not yet recorded';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Admin2DashboardSection({
  onNavigateSection,
  onUnreadCountChange,
}: Admin2DashboardSectionProps) {
  const [data, setData] = useState<Admin2DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdmin2Dashboard();
      setData(res);
      onUnreadCountChange?.(res.unreadNotifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading real-time metrics from Google Sheets &amp; Drive…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="h-4 w-4" />
          Dashboard load error
        </div>
        <p className="mt-1 text-xs">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const kpiCards = [
    {
      label: 'Total Articles',
      value: data.articles.total,
      sub: `${data.articles.eventsCount} events listed`,
      icon: Newspaper,
      onClick: () => onNavigateSection('news'),
    },
    {
      label: 'Published Live',
      value: data.articles.published,
      sub: 'Live in Google Sheets',
      icon: FileText,
      onClick: () => onNavigateSection('news'),
    },
    {
      label: 'Drafts & Scheduled',
      value: data.articles.drafts + data.articles.scheduled,
      sub: `${data.articles.drafts} drafts · ${data.articles.scheduled} scheduled`,
      icon: FileEdit,
      onClick: () => onNavigateSection('news'),
    },
    {
      label: 'Archived Stories',
      value: data.articles.archived,
      sub: 'Restorable snapshots',
      icon: Archive,
      onClick: () => onNavigateSection('news'),
    },
    {
      label: 'Daily Visitors',
      value: data.traffic.todayVisitors,
      sub: `${data.traffic.todayPageViews} page views today`,
      icon: Users,
      onClick: () => onNavigateSection('analytics'),
    },
    {
      label: 'Total Article Views',
      value: data.traffic.totalSheetViews,
      sub: `${data.traffic.totalPageViews14d} portal hits (14d)`,
      icon: Eye,
      onClick: () => onNavigateSection('analytics'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Newsroom Command Overview
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Live telemetry synced from Google Sheets, Google Drive, Apps Script, and server traffic logs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Metrics
        </button>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-xs transition-all hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-[#111C2E] dark:hover:border-slate-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                    {card.value.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-100 p-2.5 text-[#0B192C] dark:bg-slate-800 dark:text-blue-400">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">{card.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Connected Systems Health Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => onNavigateSection('storage')}
          className="rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-[#111C2E] hover:border-slate-300 dark:hover:border-slate-700"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Database className="h-3.5 w-3.5 text-emerald-600" />
            Google Sheets
          </div>
          <p className="mt-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {data.systemStatus.sheetsConnected ? 'Connected' : 'Not Configured'}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            Cache Hit: {data.systemStatus.cacheHitRatePct}%
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('health')}
          className="rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-[#111C2E] hover:border-slate-300 dark:hover:border-slate-700"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Clock className="h-3.5 w-3.5 text-blue-600" />
            Apps Script API
          </div>
          <p className="mt-1.5 text-xs font-semibold text-slate-900 dark:text-white capitalize">
            {data.systemStatus.appsScriptStatus.replace('_', ' ')}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {data.systemStatus.appsScriptCallsToday} / {data.systemStatus.dailyFreeLimitCalls.toLocaleString()} calls today
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('media')}
          className="rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-[#111C2E] hover:border-slate-300 dark:hover:border-slate-700"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <HardDrive className="h-3.5 w-3.5 text-indigo-600" />
            Drive Media Cache
          </div>
          <p className="mt-1.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
            {data.systemStatus.driveCachedFiles} cached images
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {formatBytes(data.systemStatus.driveCachedBytes)} local disk cache
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('automations')}
          className="rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-[#111C2E] hover:border-slate-300 dark:hover:border-slate-700"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Cpu className="h-3.5 w-3.5 text-amber-600" />
            Automations
          </div>
          <p className="mt-1.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
            {data.systemStatus.automationsActive} / {data.systemStatus.automationsTotal} active
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {data.systemStatus.automationsErrored > 0
              ? `${data.systemStatus.automationsErrored} error(s)`
              : 'All tasks healthy'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('backups')}
          className="rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-[#111C2E] hover:border-slate-300 dark:hover:border-slate-700"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <FolderArchive className="h-3.5 w-3.5 text-emerald-600" />
            Latest Backup
          </div>
          <p className="mt-1.5 truncate text-xs font-semibold text-slate-900 dark:text-white">
            {data.systemStatus.availableBackups} snapshot(s)
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {formatShortTime(data.systemStatus.latestBackupAt)}
          </p>
        </button>
      </div>

      {/* Main Chart + Popular Articles */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E] xl:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                14-Day Reader Traffic
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real page views and unique daily visitors recorded on this server.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('analytics')}
              className="text-xs font-semibold text-[#1D4ED8] hover:underline dark:text-blue-400"
            >
              Full Analytics
            </button>
          </div>
          <TrafficAreaChart data={data.traffic.dailySeries} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E] xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Most Read Articles
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ranked by real view counts in Google Sheets.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('news')}
              className="text-xs font-semibold text-[#1D4ED8] hover:underline dark:text-blue-400"
            >
              Manage News
            </button>
          </div>
          {data.popularArticles.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No articles found yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.popularArticles.map((art, idx) => (
                <div key={art.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="mt-0.5 text-xs font-bold tabular-nums text-slate-400">
                      {idx + 1}.
                    </span>
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {art.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {art.category} · {art.publishedDate}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                    {art.views.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Recent Activity & Notifications */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Editorial Activity</h3>
            <button
              type="button"
              onClick={() => onNavigateSection('security')}
              className="text-xs font-semibold text-[#1D4ED8] hover:underline dark:text-blue-400"
            >
              Audit Log
            </button>
          </div>
          {data.recentActivity.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No recent activity logged yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentActivity.slice(0, 6).map((log) => (
                <li key={log.id} className="flex items-start justify-between gap-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{log.action}</p>
                    <p className="truncate text-slate-500 dark:text-slate-400">
                      {log.details} · <span className="font-medium">{log.actorEmail}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    {formatShortTime(log.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Notifications</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('notifications')}
              className="text-xs font-semibold text-[#1D4ED8] hover:underline dark:text-blue-400"
            >
              View All
            </button>
          </div>
          {data.recentNotifications.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentNotifications.slice(0, 6).map((notif) => (
                <li key={notif.id} className="flex items-start justify-between gap-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {!notif.read && (
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-600 align-middle" />
                      )}
                      {notif.title}
                    </p>
                    <p className="line-clamp-1 text-slate-500 dark:text-slate-400">{notif.message}</p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    {formatShortTime(notif.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
