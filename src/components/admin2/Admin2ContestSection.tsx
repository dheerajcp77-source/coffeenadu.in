import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Ban,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  History,
  Lock,
  Phone,
  PlusCircle,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  downloadAdminContestExport,
  fetchAdminContestOverview,
  finalizeAdminContestMonth,
  openNextAdminContestMonth,
  reviewAdminContestAlert,
  saveAdminContestWinners,
  toggleAdminContestWinnersPublished,
  updateAdminContestEntryEligibility,
  updateAdminContestMonthConfig,
  type AdminWinnerSelectionInput,
} from '../../services/contestClient';
import type {
  AdminContestEntryView,
  ContestAdminOverview,
  ContestMonthStatus,
  ContestPrizeTier,
} from '../../types/contest';

interface Admin2ContestSectionProps {
  darkMode: boolean;
}

type AdminContestTab = 'entries' | 'winners' | 'alerts' | 'settings' | 'audit';

interface WinnerDraftRow {
  rank: 1 | 2 | 3 | 4 | 5;
  entryId: string;
  prizeAmountInr: number;
  selectionNote: string;
  paymentStatus: 'pending' | 'processing' | 'paid';
  paymentDate: string;
  paymentReference: string;
}

function toDatetimeLocalValue(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

function fromIstDatetimeLocal(val: string): string {
  if (!val) return new Date().toISOString();
  return `${val}:00+05:30`;
}

export const Admin2ContestSection: React.FC<Admin2ContestSectionProps> = ({ darkMode }) => {
  const [overview, setOverview] = useState<ContestAdminOverview | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AdminContestTab>('entries');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const [disqualifyTarget, setDisqualifyTarget] = useState<AdminContestEntryView | null>(null);
  const [disqualifyReason, setDisqualifyReason] = useState('');

  const [winnerDrafts, setWinnerDrafts] = useState<WinnerDraftRow[]>([]);

  const [startsLocal, setStartsLocal] = useState('');
  const [endsLocal, setEndsLocal] = useState('');
  const [monthStatusDraft, setMonthStatusDraft] = useState<ContestMonthStatus>('open');
  const [prizesDraft, setPrizesDraft] = useState<ContestPrizeTier[]>([]);

  const loadData = useCallback(async (monthKey?: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminContestOverview(monthKey);
      setOverview(data);
      setSelectedMonthKey(data.selectedMonth.monthKey);

      setStartsLocal(toDatetimeLocalValue(data.selectedMonth.startsAtIso));
      setEndsLocal(toDatetimeLocalValue(data.selectedMonth.endsAtIso));
      setMonthStatusDraft(data.selectedMonth.status);
      setPrizesDraft(data.selectedMonth.prizes);

      const eligibleRanked = data.entries
        .filter((e) => e.eligibility === 'eligible')
        .sort((a, b) => b.eligibleViews - a.eligibleViews);

      const drafts: WinnerDraftRow[] = ([1, 2, 3, 4, 5] as const).map((rank) => {
        const existing = data.selectedMonth.winners.find((w) => w.rank === rank);
        const tier = data.selectedMonth.prizes.find((p) => p.rank === rank);
        const suggestedEntry = rank <= 4 ? eligibleRanked[rank - 1] : undefined;
        return {
          rank,
          entryId: existing?.entryId || suggestedEntry?.id || '',
          prizeAmountInr: existing?.prizeAmountInr ?? tier?.amountInr ?? 50,
          selectionNote: existing?.selectionNote || '',
          paymentStatus: existing?.paymentStatus || 'pending',
          paymentDate: existing?.paymentDate || '',
          paymentReference: existing?.paymentReference || '',
        };
      });
      setWinnerDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contest management data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(selectedMonthKey || undefined);
  }, [loadData, selectedMonthKey]);

  const runAction = async (fn: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await fn();
      setFeedback(successMessage);
      await loadData(selectedMonthKey || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDisqualify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disqualifyTarget) return;
    await runAction(async () => {
      await updateAdminContestEntryEligibility(
        disqualifyTarget.id,
        'disqualified',
        disqualifyReason.trim()
      );
      setDisqualifyTarget(null);
      setDisqualifyReason('');
    }, `Disqualified "${disqualifyTarget.title}" and recorded audit entry.`);
  };

  const handleReinstate = async (entry: AdminContestEntryView) => {
    await runAction(
      () => updateAdminContestEntryEligibility(entry.id, 'eligible'),
      `Reinstated "${entry.title}" as eligible.`
    );
  };

  const handleSaveWinners = async () => {
    if (!overview) return;
    const validPayload: AdminWinnerSelectionInput[] = winnerDrafts
      .filter((w) => Boolean(w.entryId))
      .map((w) => ({
        rank: w.rank,
        entryId: w.entryId,
        prizeAmountInr: Number(w.prizeAmountInr) || 0,
        selectionNote: w.selectionNote.trim() || undefined,
        paymentStatus: w.paymentStatus,
        paymentDate: w.paymentDate.trim() || undefined,
        paymentReference: w.paymentReference.trim() || undefined,
      }));
    await runAction(
      async () => {
        await saveAdminContestWinners(overview.selectedMonth.monthKey, validPayload);
      },
      `Saved ${validPayload.length} winner selection(s) and payout details for ${overview.selectedMonth.displayLabelEn}.`
    );
  };

  const handleFinalizeMonth = async (publishNow: boolean) => {
    if (!overview) return;
    await runAction(
      async () => {
        await finalizeAdminContestMonth(overview.selectedMonth.monthKey, publishNow);
      },
      `Finalized ${overview.selectedMonth.displayLabelEn} (${
        publishNow ? 'Winners published publicly' : 'Saved privately'
      }).`
    );
  };

  const handleTogglePublishWinners = async () => {
    if (!overview) return;
    const nextState = !overview.selectedMonth.winnersPublished;
    await runAction(
      async () => {
        await toggleAdminContestWinnersPublished(overview.selectedMonth.monthKey, nextState);
      },
      nextState
        ? 'Winners are now visible publicly on /contest.'
        : 'Winners hidden from public /contest page.'
    );
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overview) return;
    await runAction(
      async () => {
        await updateAdminContestMonthConfig(overview.selectedMonth.monthKey, {
          startsAtIso: fromIstDatetimeLocal(startsLocal),
          endsAtIso: fromIstDatetimeLocal(endsLocal),
          prizes: prizesDraft,
          status: monthStatusDraft,
          allowCarryOver: false,
        });
      },
      `Updated dates & prize configuration for ${overview.selectedMonth.displayLabelEn}.`
    );
  };

  const handleOpenNextMonth = async () => {
    await runAction(async () => {
      const nextMonth = await openNextAdminContestMonth();
      setSelectedMonthKey(nextMonth.monthKey);
    }, 'Opened next competition month cleanly (previous articles archived, zero auto carry-over).');
  };

  const cardBg = darkMode
    ? 'bg-slate-900/90 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900';
  const mutedText = darkMode ? 'text-slate-400' : 'text-slate-500';
  const inputClass = darkMode
    ? 'bg-slate-950 border-slate-700 text-slate-100'
    : 'bg-white border-slate-300 text-slate-900';

  const selectedMonth = overview?.selectedMonth;
  const eligibleEntries = (overview?.entries || []).filter((e) => e.eligibility === 'eligible');
  const currentBudget = selectedMonth
    ? selectedMonth.prizes.reduce((s, p) => s + p.amountInr, 0)
    : 500;

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-5 ${cardBg}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span>Monthly Rewards Management · Admin Only</span>
            </div>
            <h2 className="mt-1 font-serif text-2xl font-bold">
              COFFEENADU – MOST VIEWED NEWS CHALLENGE 2026
            </h2>
            <p className={`mt-1 text-xs ${mutedText}`}>
              Manage eligible entries, private contributor mobile numbers, suspicious traffic
              alerts, ₹500 prize selections (1st–4th views + 5th quality), payouts, and monthly
              cycles.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {overview && overview.months.length > 0 && (
              <select
                value={selectedMonthKey}
                onChange={(e) => setSelectedMonthKey(e.target.value)}
                className={`rounded-lg border px-3 py-2 text-xs font-bold ${inputClass}`}
                aria-label="Select competition month"
              >
                {overview.months.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.displayLabelEn} ({m.status.toUpperCase()})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              disabled={busy || loading}
              onClick={() => void loadData(selectedMonthKey || undefined)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${inputClass} hover:opacity-80`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {selectedMonth && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void downloadAdminContestExport(selectedMonth.monthKey, 'csv')
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/30 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-200"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void downloadAdminContestExport(selectedMonth.monthKey, 'json')
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${inputClass}`}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>JSON</span>
                </button>
              </>
            )}

            <a
              href="/contest"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F3928] px-3 py-2 text-xs font-bold text-white hover:bg-[#144B35]"
            >
              <span>Public /contest</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {overview && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              {
                label: 'Eligible Entries',
                value: overview.summary.eligibleEntries,
                sub: `${overview.summary.disqualifiedEntries} disqualified`,
              },
              {
                label: 'Eligible Views',
                value: overview.summary.totalEligibleViews.toLocaleString('en-IN'),
                sub: '24h unique filtered',
              },
              {
                label: 'Total Raw Views',
                value: overview.summary.totalPageViews.toLocaleString('en-IN'),
                sub: 'All genuine page loads',
              },
              {
                label: 'Blocked Suspicious',
                value: overview.summary.suspiciousBlockedViews.toLocaleString('en-IN'),
                sub: 'Bots & burst spikes',
              },
              {
                label: 'Open Alerts',
                value: overview.summary.openAlerts,
                sub: 'Traffic review queue',
              },
              {
                label: 'Monthly Budget',
                value: `₹${currentBudget}`,
                sub: overview.selectedMonth.winnersPublished
                  ? 'Winners Published'
                  : 'Winners Private',
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className={`rounded-lg border p-3 ${
                  darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}>
                  {kpi.label}
                </p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">{kpi.value}</p>
                <p className={`text-[11px] ${mutedText}`}>{kpi.sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {feedback && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        {[
          { id: 'entries' as const, label: 'Rankings & Entries', icon: Trophy },
          { id: 'winners' as const, label: 'Winners & ₹500 Payouts', icon: Award },
          {
            id: 'alerts' as const,
            label: `Suspicious Traffic Alerts (${overview?.summary.openAlerts ?? 0})`,
            icon: ShieldAlert,
          },
          { id: 'settings' as const, label: 'Month Dates, Prizes & Cycle', icon: Settings },
          { id: 'audit' as const, label: 'Audit Log', icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                active
                  ? 'bg-[#0F3928] text-white'
                  : darkMode
                  ? 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'entries' && overview && (
        <div className={`overflow-hidden rounded-xl border ${cardBg}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Lock className="h-3.5 w-3.5 text-emerald-600" />
              <span>
                Contributor Mobile Numbers are STRICTLY Admin-Only (never exposed publicly)
              </span>
            </div>
            <span className={`text-xs ${mutedText}`}>
              Showing {overview.entries.length} submission(s) for{' '}
              {overview.selectedMonth.displayLabelEn}
            </span>
          </div>

          {overview.entries.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No contest entries submitted in {overview.selectedMonth.displayLabelEn} yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead
                  className={
                    darkMode
                      ? 'bg-slate-950/70 text-slate-300'
                      : 'bg-slate-50 text-slate-600'
                  }
                >
                  <tr>
                    <th className="px-4 py-3 font-bold">Rank</th>
                    <th className="px-4 py-3 font-bold">Article & Location</th>
                    <th className="px-4 py-3 font-bold">Contributor (Private Mobile)</th>
                    <th className="px-4 py-3 font-bold text-right">Eligible Views</th>
                    <th className="px-4 py-3 font-bold text-right">Total Views</th>
                    <th className="px-4 py-3 font-bold text-right">Blocked</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {overview.entries.map((entry, idx) => {
                    const isEligible = entry.eligibility === 'eligible';
                    return (
                      <tr key={entry.id} className="align-top">
                        <td className="px-4 py-3 font-mono font-bold tabular-nums">
                          {isEligible ? `#${idx + 1}` : '—'}
                        </td>
                        <td className="max-w-xs px-4 py-3">
                          <a
                            href={`/community/${encodeURIComponent(entry.slug)}?preview=1`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold hover:underline"
                          >
                            {entry.title}
                          </a>
                          <p className={`mt-0.5 text-[11px] ${mutedText}`}>
                            {entry.location} · {new Date(entry.publishedAt).toLocaleString('en-IN')}
                          </p>
                          {entry.disqualificationReason && (
                            <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                              Reason: {entry.disqualificationReason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold">{entry.contributorName}</p>
                          <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <Phone className="h-3 w-3" />
                            <span>{entry.contributorMobileNumber || 'Not available'}</span>
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {entry.eligibleViews.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {entry.totalPageViews.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                          {entry.suspiciousBlockedViews.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                              isEligible
                                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                            }`}
                          >
                            {isEligible ? 'Eligible' : 'Disqualified'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isEligible ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setDisqualifyTarget(entry);
                                setDisqualifyReason('');
                              }}
                              className="inline-flex items-center gap-1 rounded border border-red-300 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300"
                            >
                              <Ban className="h-3 w-3" />
                              <span>Disqualify</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleReinstate(entry)}
                              className="inline-flex items-center gap-1 rounded border border-emerald-400 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Reinstate</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {disqualifyTarget && (
            <form
              onSubmit={handleConfirmDisqualify}
              className="border-t border-red-200 bg-red-50/70 p-4 dark:border-red-900 dark:bg-red-950/30"
            >
              <p className="text-xs font-bold text-red-900 dark:text-red-200">
                Disqualify "{disqualifyTarget.title}" — Enter Audit Reason:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="text"
                  required
                  minLength={3}
                  value={disqualifyReason}
                  onChange={(e) => setDisqualifyReason(e.target.value)}
                  placeholder="e.g., Promotional shop ad, duplicate copy-paste, artificial traffic spike"
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs ${inputClass}`}
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                >
                  Confirm Disqualify
                </button>
                <button
                  type="button"
                  onClick={() => setDisqualifyTarget(null)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${inputClass}`}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {activeTab === 'winners' && overview && selectedMonth && (
        <div className={`space-y-5 rounded-xl border p-5 ${cardBg}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <h3 className="font-serif text-lg font-bold">
                Monthly Winner Selection & Cash Payout Tracker — {selectedMonth.displayLabelEn}
              </h3>
              <p className={`text-xs ${mutedText}`}>
                Ranks 1–4 default to top eligible views (overridable before finalization). Rank 5
                (₹50) is selected separately for best originality, accuracy, local relevance &
                usefulness. Payment details remain Admin-Only.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveWinners()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F3928] px-4 py-2 text-xs font-bold text-white hover:bg-[#144B35]"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Save Selections & Payouts</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleTogglePublishWinners()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-950 hover:bg-amber-100"
              >
                {selectedMonth.winnersPublished ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>Hide Public Announcement</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    <span>Publish Winners Publicly</span>
                  </>
                )}
              </button>

              {selectedMonth.status !== 'finalized' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleFinalizeMonth(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Finalize & Announce</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {winnerDrafts.map((row, idx) => {
              const selectedEntry = overview.entries.find((e) => e.id === row.entryId);
              const isQuality = row.rank === 5;
              return (
                <div
                  key={row.rank}
                  className={`rounded-lg border p-4 ${
                    isQuality
                      ? 'border-emerald-600/35 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : darkMode
                      ? 'border-slate-800 bg-slate-950/50'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      {isQuality ? (
                        <Sparkles className="h-4 w-4 text-amber-500" />
                      ) : (
                        <Trophy className="h-4 w-4 text-emerald-700" />
                      )}
                      <span>
                        {isQuality
                          ? '5th Prize — Best Quality Original News (Admin Selected)'
                          : `Rank #${row.rank} — Most Viewed Eligible News`}
                      </span>
                    </div>
                    {selectedEntry && (
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        <Phone className="h-3.5 w-3.5" />
                        <span>
                          {selectedEntry.contributorName} ·{' '}
                          {selectedEntry.contributorMobileNumber || 'No mobile'}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-12">
                    <div className="md:col-span-5">
                      <label className={`mb-1 block text-[11px] font-semibold ${mutedText}`}>
                        Selected Article
                      </label>
                      <select
                        value={row.entryId}
                        onChange={(e) => {
                          const next = [...winnerDrafts];
                          next[idx] = { ...next[idx], entryId: e.target.value };
                          setWinnerDrafts(next);
                        }}
                        className={`w-full rounded-lg border px-3 py-2 text-xs ${inputClass}`}
                      >
                        <option value="">-- Select Eligible Article --</option>
                        {eligibleEntries.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            [{entry.eligibleViews} views] {entry.title} — {entry.contributorName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className={`mb-1 block text-[11px] font-semibold ${mutedText}`}>
                        Prize Amount (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={row.prizeAmountInr}
                        onChange={(e) => {
                          const next = [...winnerDrafts];
                          next[idx] = {
                            ...next[idx],
                            prizeAmountInr: Math.max(0, Number(e.target.value) || 0),
                          };
                          setWinnerDrafts(next);
                        }}
                        className={`w-full rounded-lg border px-3 py-2 font-mono text-xs font-bold ${inputClass}`}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={`mb-1 block text-[11px] font-semibold ${mutedText}`}>
                        Payment Status
                      </label>
                      <select
                        value={row.paymentStatus}
                        onChange={(e) => {
                          const next = [...winnerDrafts];
                          next[idx] = {
                            ...next[idx],
                            paymentStatus: e.target.value as 'pending' | 'processing' | 'paid',
                          };
                          setWinnerDrafts(next);
                        }}
                        className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold ${inputClass}`}
                      >
                        <option value="pending">Pending</option>
                        <option value="processing">Processing</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className={`mb-1 block text-[11px] font-semibold ${mutedText}`}>
                        Payment Date (Admin Only)
                      </label>
                      <input
                        type="date"
                        value={row.paymentDate}
                        onChange={(e) => {
                          const next = [...winnerDrafts];
                          next[idx] = { ...next[idx], paymentDate: e.target.value };
                          setWinnerDrafts(next);
                        }}
                        className={`w-full rounded-lg border px-3 py-2 text-xs ${inputClass}`}
                      />
                    </div>

                    <div className="md:col-span-6">
                      <label className={`mb-1 block text-[11px] font-semibold ${mutedText}`}>
                        {isQuality
                          ? 'Quality Selection Note (Originality / Accuracy / Relevance)'
                          : 'Editorial / Verification Note (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={row.selectionNote}
                        onChange={(e) => {
                          const next = [...winnerDrafts];
                          next[idx] = { ...next[idx], selectionNote: e.target.value };
                          setWinnerDrafts(next);
                        }}
                        placeholder={
                          isQuality
                            ? 'Why this article won Best Quality Original News...'
                            : 'Verification note'
                        }
                        className={`w-full rounded-lg border px-3 py-2 text-xs ${inputClass}`}
                      />
                    </div>

                    <div className="md:col-span-6">
                      <label className={`mb-1 block text-[11px] font-semibold ${mutedText}`}>
                        Private Payout Reference / UPI Txn ID (Never Public)
                      </label>
                      <input
                        type="text"
                        value={row.paymentReference}
                        onChange={(e) => {
                          const next = [...winnerDrafts];
                          next[idx] = { ...next[idx], paymentReference: e.target.value };
                          setWinnerDrafts(next);
                        }}
                        placeholder="UPI Ref / Bank receipt note (Admin-only)"
                        className={`w-full rounded-lg border px-3 py-2 text-xs ${inputClass}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'alerts' && overview && (
        <div className={`overflow-hidden rounded-xl border ${cardBg}`}>
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h3 className="font-serif text-base font-bold">
              Automated Anti-Abuse & Suspicious Traffic Alerts
            </h3>
            <p className={`text-xs ${mutedText}`}>
              Rapid burst hits, cookie-rotation attempts, and automated scraping traffic are
              automatically blocked from eligible views and logged here.
            </p>
          </div>
          {overview.alerts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No suspicious traffic alerts recorded for {overview.selectedMonth.displayLabelEn}.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {overview.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <AlertTriangle
                        className={`h-4 w-4 ${
                          alert.severity === 'high' ? 'text-red-600' : 'text-amber-500'
                        }`}
                      />
                      <span>{alert.articleTitle}</span>
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] uppercase text-amber-900">
                        {alert.severity} · {alert.blockedCount} blocked
                      </span>
                    </div>
                    <p className={`text-xs ${mutedText}`}>{alert.reason}</p>
                    <p className={`text-[11px] ${mutedText}`}>
                      Detected: {new Date(alert.detectedAt).toLocaleString('en-IN')} · Status:{' '}
                      <strong className="uppercase">{alert.status}</strong>
                    </p>
                  </div>

                  {alert.status === 'open' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(
                            () => reviewAdminContestAlert(alert.id, 'investigated', 'Reviewed'),
                            'Marked alert as investigated.'
                          )
                        }
                        className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                      >
                        Mark Investigated
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(
                            () => reviewAdminContestAlert(alert.id, 'dismissed', 'False positive'),
                            'Dismissed alert.'
                          )
                        }
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${inputClass}`}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && overview && selectedMonth && (
        <div className="grid gap-5 lg:grid-cols-3">
          <form
            onSubmit={handleSaveConfig}
            className={`space-y-4 rounded-xl border p-5 lg:col-span-2 ${cardBg}`}
          >
            <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="font-serif text-lg font-bold">
                Configure Competition Month — {selectedMonth.displayLabelEn}
              </h3>
              <p className={`text-xs ${mutedText}`}>
                All dates are enforced in India Standard Time (IST, UTC+05:30). Counting stops
                automatically once the end timestamp is reached.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={`mb-1 block text-xs font-bold ${mutedText}`}>
                  Start Date & Time (IST)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startsLocal}
                  onChange={(e) => setStartsLocal(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-xs ${inputClass}`}
                />
              </div>
              <div>
                <label className={`mb-1 block text-xs font-bold ${mutedText}`}>
                  End Deadline (IST)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endsLocal}
                  onChange={(e) => setEndsLocal(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-xs ${inputClass}`}
                />
              </div>
              <div>
                <label className={`mb-1 block text-xs font-bold ${mutedText}`}>
                  Month Lifecycle Status
                </label>
                <select
                  value={monthStatusDraft}
                  onChange={(e) =>
                    setMonthStatusDraft(e.target.value as ContestMonthStatus)
                  }
                  className={`w-full rounded-lg border px-3 py-2 text-xs font-bold ${inputClass}`}
                >
                  <option value="open">Open (Active)</option>
                  <option value="closed">Closed (Reviewing)</option>
                  <option value="finalized">Finalized (Archived)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-xs font-bold">
                Configurable Monthly Prize Amounts (Current Total: ₹
                {prizesDraft.reduce((s, p) => s + p.amountInr, 0)})
              </p>
              <div className="grid gap-2.5 sm:grid-cols-5">
                {prizesDraft.map((tier, idx) => (
                  <div
                    key={tier.rank}
                    className={`rounded-lg border p-2.5 ${
                      darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <p className="text-[11px] font-bold">{tier.labelEn}</p>
                    <p className={`text-[10px] ${mutedText}`}>
                      {tier.type === 'quality' ? 'Quality' : 'Views'}
                    </p>
                    <input
                      type="number"
                      min={0}
                      value={tier.amountInr}
                      onChange={(e) => {
                        const next = [...prizesDraft];
                        next[idx] = {
                          ...next[idx],
                          amountInr: Math.max(0, Number(e.target.value) || 0),
                        };
                        setPrizesDraft(next);
                      }}
                      className={`mt-1.5 w-full rounded border px-2 py-1 font-mono text-xs font-bold ${inputClass}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 pt-3 dark:border-slate-800">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F3928] px-4 py-2 text-xs font-bold text-white hover:bg-[#144B35]"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Save Month Configuration</span>
              </button>
            </div>
          </form>

          <div className={`flex flex-col justify-between rounded-xl border p-5 ${cardBg}`}>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <Calendar className="h-4 w-4" />
                <span>Monthly Automation</span>
              </div>
              <h3 className="font-serif text-lg font-bold">Open Next Competition Month</h3>
              <p className={`text-xs leading-relaxed ${mutedText}`}>
                Starts the next IST calendar month cleanly with ₹500 default prizes. All current
                month articles, views, and winners remain preserved in history without transferring
                old articles into the new month.
              </p>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleOpenNextMonth()}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Open Next Competition Month</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'audit' && overview && (
        <div className={`overflow-hidden rounded-xl border ${cardBg}`}>
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h3 className="font-serif text-base font-bold">Admin Contest Audit Trail</h3>
          </div>
          {overview.auditLogs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No administrative contest actions recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {overview.auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      [{log.action}]
                    </span>{' '}
                    <span className="font-medium">{log.details}</span>
                  </div>
                  <div className={`text-[11px] ${mutedText}`}>
                    {log.actorEmail} · {new Date(log.timestamp).toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
