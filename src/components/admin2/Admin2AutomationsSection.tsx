import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  History,
  Loader2,
  PauseCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  fetchAdmin2Automations,
  runAdmin2AutomationNow,
  updateAdmin2Automation,
} from '../../services/admin2Client';
import type { Admin2AutomationItem } from '../../types/admin2';

export function Admin2AutomationsSection() {
  const [items, setItems] = useState<Admin2AutomationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [historyItem, setHistoryItem] = useState<Admin2AutomationItem | null>(null);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAdmin2Automations();
      setItems(res.automations || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleToggle = async (item: Admin2AutomationItem) => {
    setErrorMsg('');
    try {
      const res = await updateAdmin2Automation(item.id, { enabled: !item.enabled });
      setItems((prev) => prev.map((a) => (a.id === item.id ? res.automation : a)));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update automation.');
    }
  };

  const handleRunNow = async (item: Admin2AutomationItem) => {
    setRunningId(item.id);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await runAdmin2AutomationNow(item.id);
      setItems((prev) => prev.map((a) => (a.id === item.id ? res.automation : a)));
      setFeedback(`${item.name}: ${res.summary}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Automation run failed.');
      await load();
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Automation Centre
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Monitor and run CoffeeNadu image branding, scheduled publishing, cache refresh, batched views, daily backups, and alerts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-[#111C2E] dark:text-slate-300">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
        <span>
          Safeguards enforced: Existing Google Apps Script triggers are preserved untouched, and AI-generated drafts can never auto-publish without human editor approval.
        </span>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading automations…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((item) => {
            const StatusIcon =
              item.status === 'error'
                ? AlertCircle
                : item.status === 'paused'
                ? PauseCircle
                : CheckCircle2;
            const statusColor =
              item.status === 'error'
                ? 'text-rose-600'
                : item.status === 'paused'
                ? 'text-amber-600'
                : 'text-emerald-600';

            return (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {item.category} · {item.managedBy.replace(/_/g, ' ')}
                      </p>
                      <h3 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                        {item.name}
                      </h3>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold capitalize ${statusColor}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {item.status}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {item.description}
                  </p>

                  {item.preserveTriggerNote && (
                    <p className="mt-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      ✓ {item.preserveTriggerNote}
                    </p>
                  )}

                  {item.lastError && (
                    <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                      Last Error: {item.lastError}
                    </p>
                  )}

                  <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-[11px] dark:border-slate-800">
                    <div>
                      <dt className="text-slate-400">Schedule</dt>
                      <dd className="font-medium text-slate-700 dark:text-slate-200">{item.scheduleLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Last Execution</dt>
                      <dd className="tabular-nums font-medium text-slate-700 dark:text-slate-200">
                        {item.lastRunAt ? new Date(item.lastRunAt).toLocaleString('en-IN') : 'Waiting'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={() => void handleToggle(item)}
                      className="h-4 w-4 rounded accent-[#0B192C]"
                    />
                    {item.enabled ? 'Enabled' : 'Paused'}
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryItem(item)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                    >
                      <History className="h-3.5 w-3.5" />
                      History ({item.history.length})
                    </button>
                    {item.canRunManually && (
                      <button
                        type="button"
                        disabled={runningId === item.id}
                        onClick={() => void handleRunNow(item)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0B192C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#13294B] disabled:opacity-60 dark:bg-blue-600"
                      >
                        {runningId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Run Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History Modal */}
      {historyItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-[#111C2E]">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Execution History — {historyItem.name}
              </h3>
              <button
                type="button"
                onClick={() => setHistoryItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {historyItem.history.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No executions logged yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {historyItem.history.map((run) => (
                  <li key={run.id} className="py-2.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-bold uppercase text-[10px] ${
                          run.status === 'error' ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {run.status} · {run.durationMs}ms
                      </span>
                      <span className="tabular-nums text-[11px] text-slate-400">
                        {new Date(run.timestamp).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-700 dark:text-slate-200">{run.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
