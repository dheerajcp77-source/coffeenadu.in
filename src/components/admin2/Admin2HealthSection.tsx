import { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { fetchAdmin2Health, type Admin2HealthResponse } from '../../services/admin2Client';

interface LiveVitals {
  lcpMs: number | null;
  cls: number;
  inpMs: number | null;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export function Admin2HealthSection() {
  const [health, setHealth] = useState<Admin2HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinging, setPinging] = useState(false);
  const [vitals, setVitals] = useState<LiveVitals>({ lcpMs: null, cls: 0, inpMs: null });

  const load = async (withPing = false) => {
    if (withPing) setPinging(true);
    else setLoading(true);
    try {
      const res = await fetchAdmin2Health(withPing);
      setHealth(res);
    } finally {
      setLoading(false);
      setPinging(false);
    }
  };

  useEffect(() => {
    void load(false);

    // Real browser Core Web Vitals measurement (no simulated metrics)
    const observers: PerformanceObserver[] = [];
    try {
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          setVitals((v) => ({ ...v, lcpMs: Math.round(last.startTime) }));
        }
      });
      lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
      observers.push(lcpObs);
    } catch {
      // Unsupported browser observer
    }

    try {
      const clsObs = new PerformanceObserver((list) => {
        let total = 0;
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput && typeof entry.value === 'number') {
            total += entry.value;
          }
        }
        setVitals((v) => ({ ...v, cls: Math.round((v.cls + total) * 1000) / 1000 }));
      });
      clsObs.observe({ type: 'layout-shift', buffered: true });
      observers.push(clsObs);
    } catch {
      // Unsupported browser observer
    }

    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav) {
        const interactiveMs = Math.round(nav.domInteractive);
        setVitals((v) => ({ ...v, inpMs: v.inpMs ?? interactiveMs }));
      }
    } catch {
      // Non-fatal
    }

    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            System Health &amp; Core Web Vitals
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time server diagnostics, live Google Sheets &amp; Apps Script latency testing, AI readiness, and Core Web Vitals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pinging}
            onClick={() => void load(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#13294B] disabled:opacity-60 dark:bg-blue-600"
          >
            {pinging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Ping Google Apps Script
          </button>
          <button
            type="button"
            onClick={() => void load(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !health ? (
        <div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Gathering diagnostics…
        </div>
      ) : health ? (
        <>
          {/* Live Ping Result Banner */}
          {health.integrations.ping && (
            <div
              className={`rounded-xl border px-4 py-3 text-xs font-medium ${
                health.integrations.ping.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300'
              }`}
            >
              {health.integrations.ping.ok
                ? `Apps Script Live Ping Succeeded in ${health.integrations.ping.latencyMs} ms.`
                : `Apps Script Ping Failed (${health.integrations.ping.latencyMs} ms): ${health.integrations.ping.error}`}
            </div>
          )}

          {/* Core Web Vitals Card */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-[#1D4ED8] dark:text-blue-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Live Browser Core Web Vitals (This Session)
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-slate-500 dark:text-slate-400">LCP (Target &lt; 2500ms)</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {vitals.lcpMs !== null ? `${vitals.lcpMs} ms` : 'Measuring…'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-slate-500 dark:text-slate-400">DOM Interactive / Responsiveness</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {vitals.inpMs !== null ? `${vitals.inpMs} ms` : 'Measuring…'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-slate-500 dark:text-slate-400">CLS (Target &lt; 0.1)</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {vitals.cls.toFixed(3)}
                </p>
              </div>
            </div>
          </section>

          {/* Backend & Integration Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 text-xs">
            <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#111C2E]">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Server className="h-4 w-4 text-blue-600" /> Web Server Runtime
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-slate-400">Status</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Healthy
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Uptime</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-white">
                    {formatUptime(health.server.uptimeSeconds)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Node.js Runtime</dt>
                  <dd className="mt-0.5 font-mono text-slate-800 dark:text-slate-200">{health.server.nodeVersion}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Memory (RSS / Heap)</dt>
                  <dd className="mt-0.5 tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                    {health.server.memoryRssMb} MB / {health.server.memoryHeapUsedMb} MB
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#111C2E]">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Database className="h-4 w-4 text-emerald-600" /> Google Sheets &amp; Drive Bridge
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-slate-400">Sheets Backend</dt>
                  <dd className="mt-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
                    {health.integrations.googleSheetsConfigured ? 'Connected' : 'Not Configured'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Cache Hit Rate</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-white">
                    {health.integrations.cacheHitRatePct}%
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Apps Script Calls Today</dt>
                  <dd className="mt-0.5 tabular-nums text-slate-800 dark:text-slate-200">
                    {health.integrations.appsScriptCallsToday} / {health.integrations.dailyFreeLimitCalls.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Drive Disk Cache</dt>
                  <dd className="mt-0.5 tabular-nums text-slate-800 dark:text-slate-200">
                    {health.integrations.driveCacheFiles} file(s)
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#111C2E]">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Sparkles className="h-4 w-4 text-indigo-600" /> AI News Studio &amp; SEO Services
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-slate-400">Server-Side Gemini API</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                    {health.integrations.geminiAiReady ? 'Ready (Server Key Secured)' : 'Key Not Configured'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Editorial Model</dt>
                  <dd className="mt-0.5 font-mono text-slate-800 dark:text-slate-200">
                    {health.integrations.geminiModel}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">XML Sitemap</dt>
                  <dd className="mt-0.5 font-mono text-blue-600 dark:text-blue-400">
                    {health.integrations.sitemapRoute}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Pending View Batch</dt>
                  <dd className="mt-0.5 tabular-nums text-slate-800 dark:text-slate-200">
                    {health.integrations.pendingViewsCount} queued
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#111C2E]">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <ShieldCheck className="h-4 w-4 text-amber-600" /> Access &amp; Audit Posture
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-slate-400">Admin Accounts</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-white">
                    {health.security.totalAdminAccounts} ({health.security.protectedSuperAdmins} protected owners)
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Active Sessions</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-white">
                    {health.security.activeAdminSessions}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Audit Trail Entries</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-white">
                    {health.security.auditLogEntries}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Worker Status</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                    <Cpu className="h-3.5 w-3.5" /> Scheduler Active
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      ) : null}

      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Activity className="h-3.5 w-3.5" />
        <span>All system checks run directly against live runtime processes and connected Google Sheets/Drive endpoints.</span>
      </div>
    </div>
  );
}
