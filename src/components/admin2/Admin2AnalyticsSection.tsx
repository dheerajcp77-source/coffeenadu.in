import { useEffect, useState } from 'react';
import {
  BarChart3,
  Clock,
  Eye,
  FileText,
  Globe,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { fetchAdmin2Analytics } from '../../services/admin2Client';
import type { Admin2AnalyticsSummary, AdminSectionId } from '../../types/admin2';
import { HorizontalBarList, TrafficAreaChart } from './Admin2Charts';

function formatViewedTime(iso?: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Admin2AnalyticsSectionProps {
  onNavigateSection: (section: AdminSectionId) => void;
}

export function Admin2AnalyticsSection({ onNavigateSection }: Admin2AnalyticsSectionProps) {
  const [rangeDays, setRangeDays] = useState<number>(14);
  const [data, setData] = useState<Admin2AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const load = async (days: number) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchAdmin2Analytics(days);
      setData(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(rangeDays);
  }, [rangeDays]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Analytics Centre
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real reader traffic, device categories, referrers, and article performance recorded from live requests &amp; Google Sheets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRangeDays(d)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums ${
                  rangeDays === d
                    ? 'bg-[#0B192C] text-white dark:bg-blue-600'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load(rangeDays)}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {loading && !data ? (
        <div className="flex h-56 items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading real analytics…
        </div>
      ) : data ? (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Eye className="h-3.5 w-3.5" /> Portal Page Views ({rangeDays}d)
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.totals.pageViews.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Users className="h-3.5 w-3.5" /> Unique Daily Visitors ({rangeDays}d)
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.totals.uniqueVisitors.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <BarChart3 className="h-3.5 w-3.5" /> Total Views (All Articles)
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.totals.totalSheetArticleViews.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <FileText className="h-3.5 w-3.5" /> Live Published Stories
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.totals.totalPublishedArticles.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Traffic Trend Chart */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
            <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">
              Daily Visitors &amp; Page Views Trend
            </h3>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Measured from actual HTTP visits to CoffeeNadu News (zero synthetic values).
            </p>
            <TrafficAreaChart data={data.dailySeries} height={240} />
          </section>

          {/* Breakdown Row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
              <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">Traffic Sources</h3>
              <HorizontalBarList
                items={data.trafficSources.map((s) => ({
                  label: s.source,
                  value: s.count,
                  subLabel: `${s.pct}%`,
                }))}
                emptyText="No referrer visits recorded in this date range yet."
              />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
              <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">Device Categories</h3>
              <HorizontalBarList
                items={data.deviceBreakdown.map((d) => ({
                  label: d.device,
                  value: d.count,
                  subLabel: `${d.pct}%`,
                }))}
                barClassName="bg-emerald-600 dark:bg-emerald-500"
                emptyText="No device traffic recorded in this date range yet."
              />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E]">
              <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">
                Category Views (Sheets)
              </h3>
              <HorizontalBarList
                items={data.categoryPerformance.slice(0, 7).map((c) => ({
                  label: c.category,
                  value: c.views,
                  subLabel: `${c.articles} stories`,
                }))}
                barClassName="bg-amber-600 dark:bg-amber-500"
                emptyText="No categorized articles found."
              />
            </section>
          </div>

          {/* Optional GA4 & Search Console Connection Status */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-[#111C2E]">
              <div>
                <p className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <Globe className="h-3.5 w-3.5 text-blue-600" /> Google Analytics 4 (Optional)
                </p>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                  {data.ga4Connected
                    ? `Configured Measurement ID: ${data.ga4MeasurementId}`
                    : 'Not linked yet. Add your GA4 Measurement ID in Website Settings.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('settings')}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Configure
              </button>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-[#111C2E]">
              <div>
                <p className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <Globe className="h-3.5 w-3.5 text-emerald-600" /> Google Search Console
                </p>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                  {data.searchConsoleConnected
                    ? `Property: ${data.searchConsoleSiteUrl}`
                    : 'Not configured yet. Set canonical Search Console URL in Settings.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('seo')}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                SEO Audit
              </button>
            </div>
          </div>

          {/* Most Viewed & Recently Viewed Articles */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
              <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Most Viewed Articles (Live View Counts)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Headline</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Published</th>
                      <th className="px-4 py-2.5 text-right">Total Views</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.topArticles.map((art) => (
                      <tr key={art.id}>
                        <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                          {art.title}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{art.category}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-500">{art.publishedDate}</td>
                        <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                          {art.views.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                <Clock className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recently Viewed Articles
                </h3>
              </div>
              {!data.recentlyViewedArticles || data.recentlyViewedArticles.length === 0 ? (
                <p className="px-5 py-10 text-center text-xs text-slate-500">
                  No recent article views recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5">Headline</th>
                        <th className="px-4 py-2.5">Category</th>
                        <th className="px-4 py-2.5">Last Viewed</th>
                        <th className="px-4 py-2.5 text-right">Total Views</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.recentlyViewedArticles.map((art) => (
                        <tr key={art.id}>
                          <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                            {art.title}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{art.category}</td>
                          <td className="px-4 py-2.5 tabular-nums text-slate-500">
                            {formatViewedTime(art.viewedAt)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                            {art.views.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
