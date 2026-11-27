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
          {/* Admin-Only Summary KPIs (Preserves all historical + live view counts) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Eye className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> Total News Views (All-Time)
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.totals.totalSheetArticleViews.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Historical + live views (Admin only)</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <BarChart3 className="h-3.5 w-3.5" /> Page Views ({rangeDays}d)
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.totals.pageViews.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {data.totals.articleReads.toLocaleString('en-IN')} article reads in range
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Users className="h-3.5 w-3.5" /> Unique Daily Visitors ({rangeDays}d)
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.totals.uniqueVisitors.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">Real HTTP visitor sessions</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <FileText className="h-3.5 w-3.5" /> Live Published Stories
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.totals.totalPublishedArticles.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Across {data.categoryPerformance.length} active categories
              </p>
            </div>
          </div>

          {/* Traffic Trend Chart */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
            <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">
              Daily Visitor Activity Trend
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
                Views by News Category (Admin Only)
              </h3>
              <HorizontalBarList
                items={data.categoryPerformance.slice(0, 7).map((c) => ({
                  label: c.category,
                  value: c.views,
                  subLabel: `${c.views.toLocaleString('en-IN')} views · ${c.articles} stories`,
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

          {/* Top Viewed Stories & Recently Viewed (Admin Only — includes all old + live views) */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E] xl:col-span-7">
              <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Top Viewed Stories (Admin Only)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Ranked by total preserved historical + live view counts.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Headline</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Published</th>
                      <th className="px-4 py-2.5 text-right">Views</th>
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
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap font-bold text-slate-900 dark:text-amber-300">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5 text-slate-400 dark:text-amber-400/80" />
                            {(Number(art.views) || 0).toLocaleString('en-IN')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E] xl:col-span-5">
              <div className="border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Recently Viewed Stories
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Latest article reads tracked in real time.
                </p>
              </div>
              {data.recentlyViewedArticles.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-slate-500">
                  No recent article reads recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {data.recentlyViewedArticles.slice(0, 10).map((art) => (
                    <li key={`${art.id}-${art.viewedAt}`} className="flex items-start justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="line-clamp-1 font-semibold text-slate-900 dark:text-white">
                          {art.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {art.category} · {formatViewedTime(art.viewedAt)}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 font-bold tabular-nums text-slate-800 dark:text-amber-300">
                        <Eye className="h-3 w-3 text-slate-400" />
                        {(Number(art.views) || 0).toLocaleString('en-IN')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
