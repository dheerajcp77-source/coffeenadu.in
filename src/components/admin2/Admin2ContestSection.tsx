import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Ban,
  Calendar,
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  History,
  Lock,
  Phone,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  downloadAdminContestExport,
  fetchAdminContestOverview,
  finalizeAdminContestMonth,
  openNextAdminContestMonth,
  resetAdminContestMonthScores,
  reviewAdminContestAlert,
  saveAdminContestWinners,
  toggleAdminContestWinnersPublished,
  updateAdminContestEntryEligibility,
  updateAdminContestEntryScore,
  updateAdminContestMonthConfig,
  type AdminWinnerSelectionInput,
} from '../../services/contestClient';
import { setAdminCommunityPostStatus } from '../../services/communityClient';
import type {
  AdminContestEntryView,
  ContestAdminOverview,
  ContestMonthStatus,
  ContestPrizeTier,
} from '../../types/contest';

interface Admin2ContestSectionProps {
  darkMode: boolean;
}

type AdminContestTab = 'entries' | 'views' | 'winners' | 'alerts' | 'settings' | 'audit';

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
  const [disqualifyHidePost, setDisqualifyHidePost] = useState(false);
  const [disqualifyModalError, setDisqualifyModalError] = useState('');

  const [viewSearchQuery, setViewSearchQuery] = useState('');
  const [scoreEditTarget, setScoreEditTarget] = useState<AdminContestEntryView | null>(null);
  const [scoreEditDisplayValue, setScoreEditDisplayValue] = useState<string>('0');
  const [scoreEditModalError, setScoreEditModalError] = useState('');

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
        .sort(
          (a, b) =>
            (b.competitionDisplayScore ?? b.eligibleViews) -
            (a.competitionDisplayScore ?? a.eligibleViews)
        );

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

  const notifyPublicDataMutated = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('coffeenadu:data-mutated'));
    }
  };

  const runAction = async (fn: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await fn();
      setFeedback(successMessage);
      await loadData(selectedMonthKey || undefined);
      notifyPublicDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDisqualify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disqualifyTarget) return;
    const trimmedReason = disqualifyReason.trim();
    if (trimmedReason.length < 3) {
      setDisqualifyModalError('Please select a preset reason or enter at least 3 characters.');
      return;
    }
    setDisqualifyModalError('');
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const targetTitle = disqualifyTarget.title;
      await updateAdminContestEntryEligibility(
        disqualifyTarget.id,
        'disqualified',
        trimmedReason,
        { hidePost: disqualifyHidePost }
      );
      setDisqualifyTarget(null);
      setDisqualifyReason('');
      setDisqualifyHidePost(false);
      setFeedback(
        disqualifyHidePost
          ? `Disqualified "${targetTitle}" from contest and unpublished from Community Feed.`
          : `Disqualified "${targetTitle}" from contest leaderboard (kept published in Community Feed).`
      );
      await loadData(selectedMonthKey || undefined);
      notifyPublicDataMutated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disqualify entry.';
      setDisqualifyModalError(msg);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleReinstate = async (entry: AdminContestEntryView) => {
    await runAction(
      () => updateAdminContestEntryEligibility(entry.id, 'eligible'),
      `Reinstated "${entry.title}" as contest eligible and published in Community Feed.`
    );
  };

  const handleToggleFeedStatus = async (entry: AdminContestEntryView) => {
    const isCurrentlyPublished = entry.postStatus === 'published';
    const nextStatus = isCurrentlyPublished ? 'hidden' : 'published';
    await runAction(
      async () => {
        await setAdminCommunityPostStatus(
          entry.postId,
          nextStatus,
          nextStatus === 'hidden' ? 'Unpublished by admin from contest panel' : undefined
        );
      },
      nextStatus === 'published'
        ? `Published "${entry.title}" to the Community Feed.`
        : `Unpublished "${entry.title}" from the public Community Feed.`
    );
  };

  const openScoreEditDialog = (entry: AdminContestEntryView) => {
    const currentDisplay =
      entry.competitionDisplayScore ?? entry.eligibleViews ?? 0;
    setScoreEditTarget(entry);
    setScoreEditDisplayValue(String(Math.max(0, currentDisplay)));
    setScoreEditModalError('');
  };

  const handleSaveManualScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scoreEditTarget) return;
    const parsedDisplay = Number(scoreEditDisplayValue);
    if (!Number.isFinite(parsedDisplay) || parsedDisplay < 0) {
      setScoreEditModalError('Competition display score must be a non-negative integer (0 or more).');
      return;
    }
    const cleanDisplayScore = Math.floor(parsedDisplay);
    setScoreEditModalError('');
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const targetTitle = scoreEditTarget.title;
      await updateAdminContestEntryScore(scoreEditTarget.id, {
        competitionDisplayScore: cleanDisplayScore,
      });
      setScoreEditTarget(null);
      setFeedback(
        `Updated competition display score for "${targetTitle}" to ${cleanDisplayScore.toLocaleString(
          'en-IN'
        )} and recalculated public leaderboard rankings.`
      );
      await loadData(selectedMonthKey || undefined);
      notifyPublicDataMutated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update score.';
      setScoreEditModalError(msg);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleQuickAdjustEntryScore = async (
    entry: AdminContestEntryView,
    delta: number
  ) => {
    await runAction(
      async () => {
        await updateAdminContestEntryScore(entry.id, { delta });
      },
      `Adjusted "${entry.title}" display score by ${delta > 0 ? `+${delta}` : delta} and synced public leaderboard.`
    );
  };

  const handleResetEntryScore = async (entry: AdminContestEntryView) => {
    await runAction(
      async () => {
        await updateAdminContestEntryScore(entry.id, { reset: true });
      },
      `Reset manual score adjustment for "${entry.title}" back to genuine eligible views (${(
        entry.genuineEligibleViews ?? entry.eligibleViews
      ).toLocaleString('en-IN')}).`
    );
  };

  const handleResetAllMonthScores = async () => {
    if (!overview) return;
    await runAction(
      async () => {
        await resetAdminContestMonthScores(overview.selectedMonth.monthKey);
      },
      `Restored all articles in ${overview.selectedMonth.displayLabelEn} to their original genuine-view rankings.`
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
          {
            id: 'views' as const,
            label: `View Management${
              (overview?.summary.manuallyAdjustedEntries ?? 0) > 0
                ? ` (${overview?.summary.manuallyAdjustedEntries} adjusted)`
                : ''
            }`,
            icon: Sliders,
          },
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
              data-testid={`contest-tab-${tab.id}`}
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
                    <th className="px-4 py-3 font-bold text-right">Displayed Score</th>
                    <th className="px-4 py-3 font-bold text-right">Genuine Views</th>
                    <th className="px-4 py-3 font-bold text-right">Total Views</th>
                    <th className="px-4 py-3 font-bold text-right">Blocked</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {overview.entries.map((entry, idx) => {
                    const isEligible = entry.eligibility === 'eligible';
                    const genuineViews = entry.genuineEligibleViews ?? entry.eligibleViews;
                    const manualAdj = entry.manualScoreAdjustment ?? 0;
                    const displayScore = entry.competitionDisplayScore ?? entry.eligibleViews;
                    return (
                      <tr key={entry.id} className="align-top">
                        <td className="px-4 py-3 font-mono font-bold tabular-nums">
                          {isEligible ? `#${entry.currentRank ?? idx + 1}` : '—'}
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
                          <div>{displayScore.toLocaleString('en-IN')}</div>
                          {manualAdj !== 0 && (
                            <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                              {manualAdj > 0 ? `+${manualAdj}` : manualAdj} adj
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {genuineViews.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {entry.totalPageViews.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                          {entry.suspiciousBlockedViews.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                                isEligible
                                  ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                              }`}
                            >
                              {isEligible ? 'Contest Eligible' : 'Contest Disqualified'}
                            </span>
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                                entry.postStatus === 'published'
                                  ? 'bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200'
                                  : 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                              }`}
                            >
                              {entry.postStatus === 'published'
                                ? 'Feed: Published'
                                : 'Feed: Unpublished'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {isEligible ? (
                              <button
                                type="button"
                                disabled={busy}
                                data-testid={`contest-disqualify-btn-${entry.id}`}
                                onClick={() => {
                                  setDisqualifyTarget(entry);
                                  setDisqualifyReason('');
                                  setDisqualifyHidePost(false);
                                  setDisqualifyModalError('');
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
                                data-testid={`contest-reinstate-btn-${entry.id}`}
                                onClick={() => void handleReinstate(entry)}
                                className="inline-flex items-center gap-1 rounded border border-emerald-400 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Reinstate</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              data-testid={`contest-toggle-feed-btn-${entry.id}`}
                              onClick={() => void handleToggleFeedStatus(entry)}
                              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold ${
                                entry.postStatus === 'published'
                                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300'
                                  : 'border-blue-400 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300'
                              }`}
                              title={
                                entry.postStatus === 'published'
                                  ? 'Unpublish from public Community Feed'
                                  : 'Publish back to public Community Feed'
                              }
                            >
                              {entry.postStatus === 'published' ? (
                                <>
                                  <EyeOff className="h-3 w-3" />
                                  <span>Unpublish Feed</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="h-3 w-3" />
                                  <span>Publish Feed</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {disqualifyTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
              role="dialog"
              aria-modal="true"
              aria-labelledby="disqualify-modal-title"
              data-testid="contest-disqualify-modal"
            >
              <form
                onSubmit={handleConfirmDisqualify}
                className={`w-full max-w-lg rounded-xl border p-5 shadow-2xl ${cardBg}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                      Contest Moderation · Audit Logged
                    </p>
                    <h3 id="disqualify-modal-title" className="mt-0.5 text-base font-bold">
                      Disqualify Contest Entry
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDisqualifyTarget(null);
                      setDisqualifyModalError('');
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${inputClass}`}
                  >
                    Close
                  </button>
                </div>

                <div
                  className={`mt-3 rounded-lg border p-3 text-xs ${
                    darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <p className="font-bold">{disqualifyTarget.title}</p>
                  <p className={`mt-0.5 text-[11px] ${mutedText}`}>
                    {disqualifyTarget.contributorName} · {disqualifyTarget.location}
                  </p>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-bold">Quick Reason Presets:</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      'Duplicate news submission',
                      'Promotional / Shop advertisement',
                      'Copy-paste / Not original local news',
                      'Artificial / Suspicious traffic spike',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setDisqualifyReason(preset);
                          setDisqualifyModalError('');
                        }}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
                          disqualifyReason === preset
                            ? 'border-red-600 bg-red-600 text-white'
                            : darkMode
                            ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="contest-disqualify-reason-input"
                    className="mb-1 block text-xs font-bold"
                  >
                    Disqualification Reason (Recorded in Audit Log) *
                  </label>
                  <input
                    id="contest-disqualify-reason-input"
                    data-testid="contest-disqualify-reason-input"
                    type="text"
                    required
                    minLength={3}
                    value={disqualifyReason}
                    onChange={(e) => {
                      setDisqualifyReason(e.target.value);
                      if (disqualifyModalError) setDisqualifyModalError('');
                    }}
                    placeholder="e.g., Duplicate news submission, shop advertisement"
                    className={`w-full rounded-lg border px-3 py-2 text-xs ${inputClass}`}
                  />
                </div>

                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-red-200/70 bg-red-50/50 p-2.5 text-xs dark:border-red-900/60 dark:bg-red-950/20">
                  <input
                    type="checkbox"
                    data-testid="contest-disqualify-hide-post-checkbox"
                    checked={disqualifyHidePost}
                    onChange={(e) => setDisqualifyHidePost(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded accent-red-600"
                  />
                  <span>
                    <strong>Also unpublish from Community Feed:</strong> Leave unchecked to remove
                    from the contest leaderboard only while keeping the article published in the
                    Community Feed. Check this box to remove it from public display completely.
                  </span>
                </label>

                {disqualifyModalError && (
                  <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
                    {disqualifyModalError}
                  </p>
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDisqualifyTarget(null);
                      setDisqualifyModalError('');
                    }}
                    className={`rounded-lg border px-3.5 py-2 text-xs font-semibold ${inputClass}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    data-testid="contest-disqualify-confirm-btn"
                    className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {busy ? 'Disqualifying...' : 'Confirm Disqualify'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {activeTab === 'views' && overview && (
        <div className={`overflow-hidden rounded-xl border ${cardBg}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <Sliders className="h-3.5 w-3.5" />
                <span>Super Admin Manual View Score Management</span>
              </div>
              <h3 className="mt-0.5 font-serif text-base font-bold">
                Competition Display Score & Leaderboard Ranking Control —{' '}
                {overview.selectedMonth.displayLabelEn}
              </h3>
              <p className={`mt-0.5 text-xs ${mutedText}`}>
                Formula:{' '}
                <code className="font-mono font-bold">
                  competition_display_score = genuine_eligible_views + manual_score_adjustment
                </code>{' '}
                (minimum 0). Genuine eligible views are preserved independently and never
                overwritten.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  data-testid="view-mgmt-search-input"
                  value={viewSearchQuery}
                  onChange={(e) => setViewSearchQuery(e.target.value)}
                  placeholder="Search contributor, title, location..."
                  className={`w-64 rounded-lg border py-1.5 pl-8 pr-3 text-xs ${inputClass}`}
                />
              </div>

              {(overview.summary.manuallyAdjustedEntries ?? 0) > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="view-mgmt-restore-all-btn"
                  onClick={() => void handleResetAllMonthScores()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Restore Original Genuine-View Ranking</span>
                </button>
              )}
            </div>
          </div>

          <div
            className={`grid gap-3 border-b border-slate-200 px-5 py-3 text-xs sm:grid-cols-3 dark:border-slate-800 ${
              darkMode ? 'bg-slate-950/40' : 'bg-slate-50/70'
            }`}
          >
            <div>
              <span className={mutedText}>Total Genuine Eligible Views:</span>{' '}
              <strong className="font-mono">
                {overview.summary.totalEligibleViews.toLocaleString('en-IN')}
              </strong>
            </div>
            <div>
              <span className={mutedText}>Total Competition Display Score:</span>{' '}
              <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                {(
                  overview.summary.totalCompetitionDisplayScore ??
                  overview.summary.totalEligibleViews
                ).toLocaleString('en-IN')}
              </strong>
            </div>
            <div>
              <span className={mutedText}>Manually Adjusted Articles:</span>{' '}
              <strong className="font-mono">
                {overview.summary.manuallyAdjustedEntries ?? 0}
              </strong>
            </div>
          </div>

          {(() => {
            const q = viewSearchQuery.trim().toLowerCase();
            const filteredEntries = overview.entries.filter((entry) => {
              if (!q) return true;
              return (
                entry.title.toLowerCase().includes(q) ||
                entry.contributorName.toLowerCase().includes(q) ||
                entry.location.toLowerCase().includes(q) ||
                entry.id.toLowerCase().includes(q)
              );
            });

            if (filteredEntries.length === 0) {
              return (
                <div className="p-8 text-center text-sm text-slate-500">
                  No matching contest articles found.
                </div>
              );
            }

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" data-testid="view-mgmt-table">
                  <thead
                    className={
                      darkMode ? 'bg-slate-950/70 text-slate-300' : 'bg-slate-50 text-slate-600'
                    }
                  >
                    <tr>
                      <th className="px-4 py-3 font-bold">Current Ranking</th>
                      <th className="px-4 py-3 font-bold">Contributor Name</th>
                      <th className="px-4 py-3 font-bold">Article Title</th>
                      <th className="px-4 py-3 font-bold text-right">Genuine Eligible Views</th>
                      <th className="px-4 py-3 font-bold text-right">Manual Adjustment</th>
                      <th className="px-4 py-3 font-bold text-right">Final Displayed Score</th>
                      <th className="px-4 py-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredEntries.map((entry, idx) => {
                      const isEligible = entry.eligibility === 'eligible';
                      const genuine = entry.genuineEligibleViews ?? entry.eligibleViews;
                      const manualAdj = entry.manualScoreAdjustment ?? 0;
                      const finalScore = entry.competitionDisplayScore ?? entry.eligibleViews;
                      const currentRank = isEligible ? entry.currentRank ?? idx + 1 : null;
                      const genuineRank = isEligible ? entry.genuineRank ?? null : null;

                      return (
                        <tr
                          key={entry.id}
                          data-testid={`view-mgmt-row-${entry.id}`}
                          className="align-top"
                        >
                          <td className="px-4 py-3 font-mono font-bold tabular-nums">
                            {currentRank ? (
                              <div className="flex flex-col items-start gap-0.5">
                                <span
                                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-extrabold ${
                                    currentRank <= 4
                                      ? 'bg-amber-100 text-amber-950 dark:bg-amber-950/70 dark:text-amber-300'
                                      : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                                  }`}
                                >
                                  #{currentRank}
                                </span>
                                {genuineRank && genuineRank !== currentRank && (
                                  <span className={`text-[10px] font-normal ${mutedText}`}>
                                    Genuine #{genuineRank}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-red-500">Disqualified</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <p className="font-bold">{entry.contributorName}</p>
                            <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              <Phone className="h-3 w-3" />
                              <span>{entry.contributorMobileNumber || 'Not available'}</span>
                            </p>
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
                              {entry.location} · {new Date(entry.publishedAt).toLocaleDateString('en-IN')}
                            </p>
                          </td>

                          <td
                            className="px-4 py-3 text-right font-mono text-sm font-bold tabular-nums"
                            data-testid={`view-mgmt-genuine-${entry.id}`}
                          >
                            {genuine.toLocaleString('en-IN')}
                          </td>

                          <td
                            className="px-4 py-3 text-right font-mono text-sm font-bold tabular-nums"
                            data-testid={`view-mgmt-adjustment-${entry.id}`}
                          >
                            <span
                              className={
                                manualAdj > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : manualAdj < 0
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : mutedText
                              }
                            >
                              {manualAdj > 0 ? `+${manualAdj.toLocaleString('en-IN')}` : manualAdj.toLocaleString('en-IN')}
                            </span>
                            {entry.manualScoreUpdatedBy && manualAdj !== 0 && (
                              <p className={`text-[10px] font-sans font-normal ${mutedText}`}>
                                by {entry.manualScoreUpdatedBy}
                              </p>
                            )}
                          </td>

                          <td
                            className="px-4 py-3 text-right font-mono text-base font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400"
                            data-testid={`view-mgmt-final-${entry.id}`}
                          >
                            {finalScore.toLocaleString('en-IN')}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={busy || finalScore <= 0}
                                data-testid={`view-mgmt-dec10-btn-${entry.id}`}
                                onClick={() => void handleQuickAdjustEntryScore(entry, -10)}
                                className={`rounded border px-2 py-1 font-mono text-[11px] font-bold ${inputClass} hover:opacity-80 disabled:opacity-40`}
                                title="Decrease displayed score by 10"
                              >
                                -10
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                data-testid={`view-mgmt-inc10-btn-${entry.id}`}
                                onClick={() => void handleQuickAdjustEntryScore(entry, 10)}
                                className={`rounded border px-2 py-1 font-mono text-[11px] font-bold ${inputClass} hover:opacity-80`}
                                title="Increase displayed score by 10"
                              >
                                +10
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                data-testid={`view-mgmt-edit-btn-${entry.id}`}
                                onClick={() => openScoreEditDialog(entry)}
                                className="inline-flex items-center gap-1 rounded bg-[#0F3928] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#144B35]"
                              >
                                <Edit3 className="h-3 w-3" />
                                <span>Edit</span>
                              </button>
                              {manualAdj !== 0 && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  data-testid={`view-mgmt-reset-btn-${entry.id}`}
                                  onClick={() => void handleResetEntryScore(entry)}
                                  className="inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                                  title="Reset manual adjustment to 0"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>Reset</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {scoreEditTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
              role="dialog"
              aria-modal="true"
              aria-labelledby="score-edit-modal-title"
              data-testid="view-mgmt-edit-modal"
            >
              <form
                onSubmit={handleSaveManualScore}
                className={`w-full max-w-lg rounded-xl border p-5 shadow-2xl ${cardBg}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Super Admin View Management · Audit Logged
                    </p>
                    <h3 id="score-edit-modal-title" className="mt-0.5 text-base font-bold">
                      Edit Competition Display Score
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setScoreEditTarget(null);
                      setScoreEditModalError('');
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${inputClass}`}
                  >
                    Close
                  </button>
                </div>

                <div
                  className={`mt-3 rounded-lg border p-3 text-xs ${
                    darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <p className="font-bold">{scoreEditTarget.title}</p>
                  <p className={`mt-0.5 text-[11px] ${mutedText}`}>
                    Contributor: <strong>{scoreEditTarget.contributorName}</strong> ·{' '}
                    {scoreEditTarget.location}
                  </p>
                </div>

                {(() => {
                  const genuine =
                    scoreEditTarget.genuineEligibleViews ?? scoreEditTarget.eligibleViews ?? 0;
                  const parsedDisplay = Math.max(0, Math.floor(Number(scoreEditDisplayValue) || 0));
                  const computedAdjustment = parsedDisplay - genuine;

                  return (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-3 gap-2.5 text-center">
                        <div
                          className={`rounded-lg border p-2.5 ${
                            darkMode
                              ? 'border-slate-800 bg-slate-950/60'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <p className={`text-[10px] font-bold uppercase ${mutedText}`}>
                            Genuine Views
                          </p>
                          <p
                            className="mt-1 font-mono text-base font-extrabold"
                            data-testid="view-mgmt-modal-genuine"
                          >
                            {genuine.toLocaleString('en-IN')}
                          </p>
                        </div>

                        <div
                          className={`rounded-lg border p-2.5 ${
                            darkMode
                              ? 'border-slate-800 bg-slate-950/60'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <p className={`text-[10px] font-bold uppercase ${mutedText}`}>
                            Manual Adjustment
                          </p>
                          <p
                            className={`mt-1 font-mono text-base font-extrabold ${
                              computedAdjustment > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : computedAdjustment < 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : ''
                            }`}
                            data-testid="view-mgmt-modal-adjustment"
                          >
                            {computedAdjustment > 0
                              ? `+${computedAdjustment.toLocaleString('en-IN')}`
                              : computedAdjustment.toLocaleString('en-IN')}
                          </p>
                        </div>

                        <div
                          className={`rounded-lg border p-2.5 ${
                            darkMode
                              ? 'border-emerald-800/60 bg-emerald-950/30'
                              : 'border-emerald-300 bg-emerald-50/70'
                          }`}
                        >
                          <p className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
                            Final Display Score
                          </p>
                          <p
                            className="mt-1 font-mono text-base font-extrabold text-emerald-700 dark:text-emerald-400"
                            data-testid="view-mgmt-modal-final"
                          >
                            {parsedDisplay.toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="view-mgmt-display-score-input"
                          className="mb-1 block text-xs font-bold"
                        >
                          Competition Display Score (Public Leaderboard & Article Views) *
                        </label>
                        <input
                          id="view-mgmt-display-score-input"
                          data-testid="view-mgmt-display-score-input"
                          type="number"
                          min={0}
                          step={1}
                          required
                          value={scoreEditDisplayValue}
                          onChange={(e) => {
                            setScoreEditDisplayValue(e.target.value);
                            if (scoreEditModalError) setScoreEditModalError('');
                          }}
                          className={`w-full rounded-lg border px-3 py-2 font-mono text-sm font-bold ${inputClass}`}
                        />
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-bold">
                          Quick Increase / Decrease Displayed Score:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {[-100, -50, -10, -1, 1, 10, 50, 100, 250].map((step) => (
                            <button
                              key={step}
                              type="button"
                              onClick={() => {
                                const nextVal = Math.max(0, parsedDisplay + step);
                                setScoreEditDisplayValue(String(nextVal));
                                setScoreEditModalError('');
                              }}
                              className={`rounded-md border px-2.5 py-1 font-mono text-xs font-bold transition ${inputClass} hover:opacity-80`}
                            >
                              {step > 0 ? `+${step}` : step}
                            </button>
                          ))}
                          <button
                            type="button"
                            data-testid="view-mgmt-modal-reset-btn"
                            onClick={() => {
                              setScoreEditDisplayValue(String(genuine));
                              setScoreEditModalError('');
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reset to Genuine ({genuine})</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {scoreEditModalError && (
                  <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
                    {scoreEditModalError}
                  </p>
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="view-mgmt-cancel-btn"
                    onClick={() => {
                      setScoreEditTarget(null);
                      setScoreEditModalError('');
                    }}
                    className={`rounded-lg border px-3.5 py-2 text-xs font-semibold ${inputClass}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    data-testid="view-mgmt-save-btn"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F3928] px-4 py-2 text-xs font-bold text-white hover:bg-[#144B35] disabled:opacity-60"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{busy ? 'Saving...' : 'Save Score & Sync Leaderboard'}</span>
                  </button>
                </div>
              </form>
            </div>
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
