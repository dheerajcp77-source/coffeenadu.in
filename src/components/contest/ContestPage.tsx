import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  ExternalLink,
  Flag,
  MapPin,
  PenSquare,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import malnadBannerImg from '../../assets/images/malnad_contest_banner_1795833076071.jpg';
import { fetchContestOverview } from '../../services/contestClient';
import type {
  ContestPublicOverview,
  ContestUserLeaderboardEntry,
  PublicContestEntry,
} from '../../types/contest';
import {
  CONTEST_KANNADA_HEADING,
  CONTEST_KANNADA_SUBTITLE,
  CONTEST_OFFICIAL_NAME,
  buildContestArticleShareText,
  buildContestPageShareText,
  computeCountdownParts,
  createDefaultContestEditableContent,
  createDefaultContestPrizes,
} from '../../utils/contestHelpers';
import {
  CommunityReportModal,
  type CommunityReportTarget,
} from '../community/CommunityModals';
import { ContestSubmitModal } from './ContestSubmitModal';

interface ContestPageProps {
  initialSection?: 'leaderboard' | 'rules' | 'winners' | null;
  initialOpenSubmit?: boolean;
  sectionNonce?: number;
  submitNonce?: number;
  onBackHome: () => void;
  onOpenCommunityPost: (slug: string) => void;
  onContestSubmitted?: () => void;
}

const DEFAULT_PRIZES = createDefaultContestPrizes();

function formatDateKn(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export const ContestPage: React.FC<ContestPageProps> = ({
  initialSection,
  initialOpenSubmit = false,
  sectionNonce = 0,
  submitNonce = 0,
  onBackHome,
  onOpenCommunityPost,
  onContestSubmitted,
}) => {
  const [overview, setOverview] = useState<ContestPublicOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitModalOpen, setSubmitModalOpen] = useState(initialOpenSubmit);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedContestUrl, setCopiedContestUrl] = useState(false);
  const [failedThumbIds, setFailedThumbIds] = useState<Record<string, boolean>>({});
  const [reportingEntry, setReportingEntry] = useState<CommunityReportTarget | null>(null);
  const [leaderboardView, setLeaderboardView] = useState<'users' | 'articles'>('users');
  const [expandedParticipantKey, setExpandedParticipantKey] = useState<string | null>(null);
  const [countdown, setCountdown] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    expired: false,
  });

  const shareOrigin =
    typeof window !== 'undefined'
      ? (window as unknown as { __COFFEENADU_SHARE_ORIGIN__?: string })
          .__COFFEENADU_SHARE_ORIGIN__ || window.location.origin
      : 'https://coffeenadu.in';

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchContestOverview();
      setOverview(data);
      setCountdown(computeCountdownParts(data.activeMonth.endsAtIso));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'ಸ್ಪರ್ಧೆಯ ಮಾಹಿತಿಯನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const handleMutated = () => {
      void loadOverview();
    };
    window.addEventListener('coffeenadu:data-mutated', handleMutated);
    return () => window.removeEventListener('coffeenadu:data-mutated', handleMutated);
  }, [loadOverview]);

  useEffect(() => {
    if (initialOpenSubmit || submitNonce > 0) {
      setSubmitModalOpen(true);
    }
  }, [initialOpenSubmit, submitNonce]);

  useEffect(() => {
    if (!overview?.activeMonth.endsAtIso) return;
    const timer = window.setInterval(() => {
      setCountdown(computeCountdownParts(overview.activeMonth.endsAtIso));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [overview?.activeMonth.endsAtIso]);

  useEffect(() => {
    const hashTarget =
      initialSection ||
      (typeof window !== 'undefined'
        ? (window.location.hash.replace('#', '') as 'leaderboard' | 'rules' | 'winners' | '')
        : '');
    if (!hashTarget) return;
    const timeout = window.setTimeout(() => {
      const el = document.getElementById(hashTarget);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [initialSection, sectionNonce, loading]);

  const scrollToSection = (id: 'leaderboard' | 'rules' | 'winners') => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try {
        window.history.replaceState(null, '', `/contest#${id}`);
      } catch {
        // ignore history error
      }
    }
  };

  const activeMonth = overview?.activeMonth;
  const monthLabelDisplay = activeMonth
    ? `${activeMonth.displayLabelKn} (${activeMonth.displayLabelEn})`
    : '';

  const handleShareContestWhatsApp = () => {
    const msg = buildContestPageShareText(activeMonth?.displayLabelKn);
    window.location.href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };

  const handleCopyContestLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareOrigin}/contest`);
      setCopiedContestUrl(true);
      setTimeout(() => setCopiedContestUrl(false), 2500);
    } catch {
      // ignore clipboard fallback
    }
  };

  const handleShareEntryWhatsApp = (entry: PublicContestEntry) => {
    const msg = buildContestArticleShareText({
      title: entry.title,
      slug: entry.slug,
      location: entry.location,
      contributorName: entry.contributorName,
    });
    window.location.href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };

  const prizes = (activeMonth?.prizes || DEFAULT_PRIZES).slice(0, 4);
  const totalBudget = activeMonth?.totalBudgetInr ?? 1500;
  const topViewLeaders = overview?.topThree || (overview?.topFour || []).slice(0, 3);
  const userLeaderboard: ContestUserLeaderboardEntry[] = overview?.userLeaderboard || [];
  const totalParticipantsCount = overview?.totalParticipantsCount ?? userLeaderboard.length;
  const participationPaused = activeMonth?.participationEnabled === false;
  const periodRangeLabel = activeMonth
    ? `${formatDateKn(activeMonth.startsAtIso)} – ${formatDateKn(activeMonth.endsAtIso)}`
    : '';
  const qualityWinner = overview?.fourthQualityWinner ?? overview?.fifthQualityWinner ?? null;
  const qualityPrize = prizes.find((p) => p.type === 'quality') || prizes[3];
  const allEntries = overview?.allEligibleEntries || [];
  const content = overview?.contentConfig || createDefaultContestEditableContent();
  const hiddenSet = new Set(content.hiddenSections || []);
  const vis = {
    prizes: !hiddenSet.has('prizes'),
    leaderboard: !hiddenSet.has('leaderboard'),
    fifthPrizeCard: !hiddenSet.has('prizes'),
    rules: !hiddenSet.has('rules'),
    faqs: !hiddenSet.has('faqs'),
    winners: !hiddenSet.has('winners'),
    notice: !hiddenSet.has('notice'),
    footer: true,
  };

  const filteredEntries = searchQuery.trim()
    ? allEntries.filter((entry) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          entry.title.toLowerCase().includes(q) ||
          entry.contributorName.toLowerCase().includes(q) ||
          entry.location.toLowerCase().includes(q)
        );
      })
    : allEntries;

  return (
    <div className="min-h-screen bg-[#F6F8F6] text-slate-900">
      {content.showAnnouncementBanner && content.announcementBannerKn && (
        <div
          data-testid="contest-announcement-banner"
          className="border-b border-amber-300/60 bg-amber-50 px-4 py-2.5 text-center text-xs font-bold text-amber-950 sm:text-sm"
        >
          {content.announcementBannerKn}
        </div>
      )}
      {/* Strictly Ad-Free Dedicated Contest Top Utility Strip */}
      <div className="border-b border-emerald-900/15 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-bold text-emerald-900 transition hover:text-emerald-700 sm:text-sm cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>ಮುಖಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ (Coffeenadu Home)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyContestLink}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {copiedContestUrl ? 'ಲಿಂಕ್ ಕಾಪಿ ಆಗಿದೆ' : 'coffeenadu.in/contest'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleShareContestWhatsApp}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#168A45] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#127239] cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Share Contest</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hero Section — Malnad Forest Green & Crisp White Editorial Frame */}
      <header className="relative overflow-hidden border-b border-emerald-950/20 bg-[#0D3424] text-white">
        <img
          src={malnadBannerImg}
          alt="Malnad coffee plantations at sunrise"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-35"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#0A2A1D]/92 via-[#0E3928]/88 to-[#0B2D1F]/95"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-300">
                <span className="inline-flex items-center gap-1.5">
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  {content.mainHeadingEn || CONTEST_OFFICIAL_NAME}
                </span>
                {activeMonth && (
                  <>
                    <span className="text-emerald-300/60">|</span>
                    <span className="text-white">{monthLabelDisplay}</span>
                  </>
                )}
              </div>

              <h1
                data-testid="contest-main-heading"
                className="font-serif text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-[42px]"
              >
                {content.mainHeadingKn || CONTEST_KANNADA_HEADING}
              </h1>

              <p
                data-testid="contest-main-subtitle"
                className="max-w-2xl text-base leading-relaxed text-emerald-50/95 sm:text-lg"
              >
                {content.subtitleKn || CONTEST_KANNADA_SUBTITLE}
              </p>

              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-100/85 sm:text-sm">
                <MapPin className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <span>{content.introKn}</span>
              </p>

              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <button
                  type="button"
                  data-testid="contest-participate-btn"
                  onClick={() => setSubmitModalOpen(true)}
                  disabled={activeMonth ? !activeMonth.isAcceptingEntries : false}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-extrabold text-[#0D3424] shadow-sm transition hover:bg-amber-50 disabled:opacity-50 cursor-pointer"
                >
                  <PenSquare className="h-4 w-4" />
                  <span>{content.buttonLabels.participateBtnKn}</span>
                </button>

                {participationPaused && (
                  <span
                    data-testid="contest-participation-paused-badge"
                    className="inline-flex min-h-[40px] items-center rounded-lg border border-amber-300/60 bg-amber-400/20 px-3 py-1.5 text-xs font-bold text-amber-200"
                  >
                    ಸ್ಪರ್ಧಾ ಪ್ರಕಟಣೆ ತಾತ್ಕಾಲಿಕವಾಗಿ ಸ್ಥಗಿತಗೊಳಿಸಲಾಗಿದೆ (Paused by Admin)
                  </span>
                )}

                {vis.leaderboard !== false && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('leaderboard')}
                    className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 cursor-pointer"
                  >
                    <Trophy className="h-4 w-4 text-amber-300" />
                    <span>{content.buttonLabels.leaderboardBtnEn}</span>
                  </button>
                )}

                {vis.rules !== false && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('rules')}
                    className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-white/10 cursor-pointer"
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>{content.buttonLabels.rulesBtnEn}</span>
                  </button>
                )}

                {vis.winners !== false && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('winners')}
                    className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-white/10 cursor-pointer"
                  >
                    <Award className="h-4 w-4 text-amber-300" />
                    <span>{content.buttonLabels.previousWinnersBtnEn}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Live IST Countdown Panel */}
            <div className="rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-200">
                <span className="inline-flex items-center gap-1.5 uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5" />
                  {participationPaused
                    ? 'ಸ್ಪರ್ಧಾ ಭಾಗವಹಿಸುವಿಕೆ ತಾತ್ಕಾಲಿಕವಾಗಿ ಸ್ಥಗಿತ'
                    : activeMonth?.isAcceptingEntries
                    ? `${activeMonth.durationDays || 30} ದಿನಗಳ ಸ್ಪರ್ಧೆ ಮುಕ್ತಾಯಕ್ಕೆ ಬಾಕಿ ಸಮಯ`
                    : 'ಈ ಅವಧಿ ಮುಕ್ತಾಯಗೊಂಡಿದೆ'}
                </span>
                <span className="text-white/80">IST</span>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Days', value: countdown.days },
                  { label: 'Hours', value: countdown.hours },
                  { label: 'Mins', value: countdown.minutes },
                  { label: 'Secs', value: countdown.seconds },
                ].map((unit) => (
                  <div
                    key={unit.label}
                    className="rounded-lg border border-white/15 bg-[#092418]/70 px-2 py-2.5"
                  >
                    <div className="font-mono text-2xl font-extrabold tabular-nums text-white sm:text-3xl">
                      {String(unit.value).padStart(2, '0')}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/80">
                      {unit.label}
                    </div>
                  </div>
                ))}
              </div>

              {activeMonth && (
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3 text-xs text-emerald-100/90">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-amber-300" />
                    {periodRangeLabel}
                  </span>
                  <span className="font-bold tabular-nums text-white">
                    {totalParticipantsCount} ಸ್ಪರ್ಧಿಗಳು · {overview?.totalEligibleCount ?? 0} ಸುದ್ದಿಗಳು
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-10">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error}
          </div>
        )}

        {vis.notice !== false && content.showImportantNotice && content.importantNoticeKn && (
          <div
            data-testid="contest-important-notice"
            className="rounded-xl border border-amber-300 bg-amber-50/90 px-5 py-4 text-xs font-semibold leading-relaxed text-amber-950 sm:text-sm"
          >
            {content.importantNoticeKn}
          </div>
        )}

        {/* Monthly ₹1,500 Prize Breakdown Ledger (4 Prizes) */}
        {vis.prizes !== false && (
        <section aria-labelledby="prizes-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
                Monthly Cash Prize Structure
              </p>
              <h2
                id="prizes-heading"
                className="mt-1 font-serif text-2xl font-bold text-slate-900"
              >
                ತಿಂಗಳ ನಗದು ಬಹುಮಾನಗಳು — ಒಟ್ಟು ₹{totalBudget.toLocaleString('en-IN')}
              </h2>
            </div>
            <p className="text-xs font-medium text-slate-600">
              {content.participationInstructionsKn}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {prizes.map((tier) => {
              const isQuality = tier.type === 'quality';
              const isFirst = tier.rank === 1;
              return (
                <div
                  key={tier.rank}
                  className={`flex flex-col justify-between rounded-xl border p-4 ${
                    isFirst
                      ? 'border-amber-400 bg-amber-50/70'
                      : isQuality
                      ? 'border-emerald-800/30 bg-emerald-50/70'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {tier.labelEn}
                      </span>
                      {isQuality ? (
                        <Sparkles className="h-4 w-4 text-emerald-800" />
                      ) : (
                        <Trophy
                          className={`h-4 w-4 ${
                            isFirst ? 'text-amber-600' : 'text-emerald-700'
                          }`}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-700">
                      {tier.labelKn}
                    </p>
                    <p className="mt-3 font-serif text-3xl font-extrabold tabular-nums text-slate-950">
                      ₹{tier.amountInr}
                    </p>
                  </div>
                  <p className="mt-3 border-t border-slate-200/80 pt-2.5 text-xs leading-snug text-slate-600">
                    {isQuality
                      ? 'ಮೂಲ ಸುದ್ದಿ, ನಿಖರತೆ, ಸ್ಥಳೀಯ ಮಹತ್ವ ಮತ್ತು ಉಪಯುಕ್ತತೆ ಆಧರಿಸಿ ಆಡ್ಮಿನ್ ಪ್ರತ್ಯೇಕ ಆಯ್ಕೆ'
                      : 'ಅತಿ ಹೆಚ್ಚು ಅರ್ಹ ಓದುಗರ ವೀಕ್ಷಣೆ ಪಡೆದ ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿಗೆ'}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
        )}

        {/* Live 30-Day Leaderboard (Automatic User Total Views + Top Articles) */}
        {vis.leaderboard !== false && (
        <section id="leaderboard" aria-labelledby="leaderboard-heading" className="scroll-mt-28 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
                30-Day Automatic Views Leaderboard · {monthLabelDisplay}
                {periodRangeLabel ? ` (${periodRangeLabel})` : ''}
              </p>
              <h2
                id="leaderboard-heading"
                className="mt-1 font-serif text-2xl font-bold text-slate-900"
              >
                ಲೈವ್ ಸ್ಪರ್ಧಾ ಲೀಡರ್‌ಬೋರ್ಡ್ (Live Rankings)
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                ಪ್ರತಿ ನೋಂದಾಯಿತ ಬಳಕೆದಾರರು ಪ್ರಕಟಿಸಿದ ಎಲ್ಲಾ ಅರ್ಹ ಮೂಲ ಸುದ್ದಿಗಳ ಪರಿಶೀಲಿತ ವೀಕ್ಷಣೆಗಳು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಒಟ್ಟುಗೂಡಿಸಲ್ಪಡುತ್ತವೆ.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <span>{content.closingDateNoticeKn}</span>
            </div>
          </div>

          {/* View Switcher Tabs: User Total Views Leaderboard vs Top News Articles */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                data-testid="leaderboard-tab-users"
                onClick={() => setLeaderboardView('users')}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                  leaderboardView === 'users'
                    ? 'bg-[#0F3928] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>ಬಳಕೆದಾರರ ಒಟ್ಟು ವೀಕ್ಷಣೆ ({userLeaderboard.length})</span>
              </button>
              <button
                type="button"
                data-testid="leaderboard-tab-articles"
                onClick={() => setLeaderboardView('articles')}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                  leaderboardView === 'articles'
                    ? 'bg-[#0F3928] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>ಅತಿ ಹೆಚ್ಚು ವೀಕ್ಷಣೆಯ ಸುದ್ದಿಗಳು ({topViewLeaders.length})</span>
              </button>
            </div>

            {activeMonth && (
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Calendar className="h-3.5 w-3.5 text-emerald-700" />
                <span>
                  ಅವಧಿ: <strong className="text-slate-900">{periodRangeLabel}</strong>
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="space-y-2.5" data-testid="leaderboard-loading">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          ) : leaderboardView === 'users' ? (
            userLeaderboard.length === 0 ? (
              <div
                data-testid="user-leaderboard-empty"
                className="rounded-xl border border-emerald-900/15 bg-white p-8 text-center"
              >
                <Trophy className="mx-auto h-10 w-10 text-emerald-800/40" />
                <h3 className="mt-3 font-serif text-xl font-bold text-slate-900">
                  ಈ 30 ದಿನಗಳ ಸ್ಪರ್ಧೆ ಪ್ರಾರಂಭವಾಗಿದೆ!
                </h3>
                <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-600">
                  {content.participationInstructionsKn}
                </p>
                <button
                  type="button"
                  disabled={activeMonth ? !activeMonth.isAcceptingEntries : false}
                  onClick={() => setSubmitModalOpen(true)}
                  className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0F3928] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#144B35] disabled:opacity-50 cursor-pointer"
                >
                  <PenSquare className="h-4 w-4" />
                  <span>ಮೊದಲ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ</span>
                </button>
              </div>
            ) : (
              <div
                data-testid="user-views-leaderboard"
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                {/* Desktop & Tablet Leaderboard Table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="px-5 py-3.5">Rank</th>
                        <th className="px-5 py-3.5">Registered Contributor (ಬಳಕೆದಾರರು)</th>
                        <th className="px-5 py-3.5 text-right">Eligible News (ಪ್ರಕಟಿತ ಸುದ್ದಿ)</th>
                        <th className="px-5 py-3.5 text-right">Total Verified Views (ಒಟ್ಟು ವೀಕ್ಷಣೆ)</th>
                        <th className="px-5 py-3.5 text-right">Competition Period</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userLeaderboard.map((row) => {
                        const isTop3 = row.rank <= 3;
                        const prizeTier = prizes.find((p) => p.rank === row.rank && p.type === 'views');
                        const isExpanded = expandedParticipantKey === row.participantKey;
                        const initial = (row.displayName || 'C').trim().charAt(0).toUpperCase() || 'C';
                        return (
                          <React.Fragment key={row.participantKey}>
                            <tr
                              data-testid={`user-leaderboard-row-${row.rank}`}
                              className={`transition hover:bg-emerald-50/40 ${
                                row.rank === 1 ? 'bg-amber-50/50' : ''
                              }`}
                            >
                              <td className="px-5 py-3.5">
                                <span
                                  className={`inline-flex min-w-[36px] items-center justify-center rounded-md px-2 py-1 font-mono text-xs font-extrabold tabular-nums ${
                                    row.rank === 1
                                      ? 'bg-amber-400 text-slate-950'
                                      : isTop3
                                      ? 'bg-[#0F3928] text-white'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  #{row.rank}
                                </span>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F3928] text-xs font-extrabold text-amber-300">
                                    {initial}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-slate-900">{row.displayName}</p>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                      {prizeTier && (
                                        <span className="font-bold text-emerald-800">
                                          {prizeTier.labelKn} · ₹{prizeTier.amountInr}
                                        </span>
                                      )}
                                      {(row.topArticles?.length ?? 0) > 0 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedParticipantKey(
                                              isExpanded ? null : row.participantKey
                                            )
                                          }
                                          className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 hover:underline cursor-pointer"
                                        >
                                          <span>
                                            {isExpanded ? 'ಸುದ್ದಿಗಳನ್ನು ಮರೆಮಾಡಿ' : 'ಸುದ್ದಿಗಳನ್ನು ನೋಡಿ'}
                                          </span>
                                          {isExpanded ? (
                                            <ChevronUp className="h-3.5 w-3.5" />
                                          ) : (
                                            <ChevronDown className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-right font-mono text-sm font-bold tabular-nums text-slate-800">
                                {row.eligibleArticleCount}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <span className="inline-flex items-center justify-end gap-1.5 font-mono text-base font-extrabold tabular-nums text-emerald-950">
                                  <Eye className="h-4 w-4 text-emerald-700" />
                                  {row.totalVerifiedViews.toLocaleString('en-IN')}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-right text-xs font-medium text-slate-600">
                                <div>{activeMonth?.displayLabelEn || row.competitionPeriodLabelEn || row.competitionPeriodId}</div>
                                {periodRangeLabel && (
                                  <div className="text-[11px] text-slate-400">{periodRangeLabel}</div>
                                )}
                              </td>
                            </tr>
                            {isExpanded && (row.topArticles?.length ?? 0) > 0 && (
                              <tr className="bg-slate-50/90">
                                <td colSpan={5} className="px-6 py-3">
                                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                    {row.displayName} — Eligible Articles in {activeMonth?.displayLabelEn}
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {(row.topArticles || []).map((art) => (
                                      <button
                                        key={art.id}
                                        type="button"
                                        onClick={() => onOpenCommunityPost(art.slug)}
                                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-emerald-600/40 cursor-pointer"
                                      >
                                        <span className="min-w-0 truncate font-semibold text-slate-900">
                                          {art.title}
                                        </span>
                                        <span className="shrink-0 font-mono font-bold tabular-nums text-emerald-800">
                                          {art.eligibleViews.toLocaleString('en-IN')} views
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Leaderboard Cards */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {userLeaderboard.map((row) => {
                    const isTop3 = row.rank <= 3;
                    const prizeTier = prizes.find((p) => p.rank === row.rank && p.type === 'views');
                    const isExpanded = expandedParticipantKey === row.participantKey;
                    const initial = (row.displayName || 'C').trim().charAt(0).toUpperCase() || 'C';
                    return (
                      <div
                        key={row.participantKey}
                        data-testid={`user-leaderboard-card-${row.rank}`}
                        className={`p-4 ${row.rank === 1 ? 'bg-amber-50/50' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`inline-flex min-w-[32px] shrink-0 items-center justify-center rounded-md px-2 py-1 font-mono text-xs font-extrabold tabular-nums ${
                                row.rank === 1
                                  ? 'bg-amber-400 text-slate-950'
                                  : isTop3
                                  ? 'bg-[#0F3928] text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              #{row.rank}
                            </span>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F3928] text-xs font-extrabold text-amber-300">
                              {initial}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">
                                {row.displayName}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {row.eligibleArticleCount} ಅರ್ಹ ಸುದ್ದಿ
                                {prizeTier ? ` · ${prizeTier.labelKn} ₹${prizeTier.amountInr}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="inline-flex items-center gap-1 font-mono text-base font-extrabold tabular-nums text-emerald-950">
                              <Eye className="h-3.5 w-3.5 text-emerald-700" />
                              {row.totalVerifiedViews.toLocaleString('en-IN')}
                            </div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              ಒಟ್ಟು ವೀಕ್ಷಣೆ
                            </div>
                          </div>
                        </div>

                        {(row.topArticles?.length ?? 0) > 0 && (
                          <div className="mt-2.5 border-t border-slate-100 pt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedParticipantKey(isExpanded ? null : row.participantKey)
                              }
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 cursor-pointer"
                            >
                              <span>
                                {isExpanded
                                  ? 'ಪ್ರಕಟಿತ ಸುದ್ದಿಗಳನ್ನು ಮರೆಮಾಡಿ'
                                  : `ಪ್ರಕಟಿತ ಸುದ್ದಿಗಳು (${row.eligibleArticleCount})`}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                            {isExpanded && (
                              <div className="mt-2 space-y-1.5">
                                {(row.topArticles || []).map((art) => (
                                  <button
                                    key={art.id}
                                    type="button"
                                    onClick={() => onOpenCommunityPost(art.slug)}
                                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs cursor-pointer"
                                  >
                                    <span className="min-w-0 truncate font-semibold text-slate-900">
                                      {art.title}
                                    </span>
                                    <span className="shrink-0 font-mono font-bold tabular-nums text-emerald-800">
                                      {art.eligibleViews.toLocaleString('en-IN')}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : topViewLeaders.length === 0 ? (
            <div className="rounded-xl border border-emerald-900/15 bg-white p-8 text-center">
              <Trophy className="mx-auto h-10 w-10 text-emerald-800/40" />
              <h3 className="mt-3 font-serif text-xl font-bold text-slate-900">
                ಈ ತಿಂಗಳ ಸ್ಪರ್ಧೆ ಪ್ರಾರಂಭವಾಗಿದೆ!
              </h3>
              <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-600">
                {content.participationInstructionsKn}
              </p>
              <button
                type="button"
                disabled={activeMonth ? !activeMonth.isAcceptingEntries : false}
                onClick={() => setSubmitModalOpen(true)}
                className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0F3928] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#144B35] disabled:opacity-50 cursor-pointer"
              >
                <PenSquare className="h-4 w-4" />
                <span>ಮೊದಲ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ</span>
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {topViewLeaders.map((entry, idx) => {
                const rank = idx + 1;
                const tier = prizes.find((p) => p.rank === rank);
                const hasThumb = Boolean(entry.thumbnailUrl && !failedThumbIds[entry.id]);
                const authorInitial =
                  (entry.contributorName || 'C').trim().charAt(0).toUpperCase() || 'C';
                return (
                  <article
                    key={entry.id}
                    className={`flex flex-col justify-between overflow-hidden rounded-xl border bg-white transition hover:border-emerald-700/40 ${
                      rank === 1 ? 'border-amber-400 shadow-sm' : 'border-slate-200'
                    }`}
                  >
                    <div className="p-4 space-y-3">
                      {/* Rank & Prize Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-extrabold tabular-nums ${
                              rank === 1
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-[#0F3928] text-white'
                            }`}
                          >
                            #{rank}
                          </span>
                          <span className="text-[11px] font-bold text-emerald-800">
                            {tier ? `${tier.labelKn} · ₹${tier.amountInr}` : `Rank #${rank}`}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium text-slate-500">
                          {formatDateKn(entry.publishedAt)}
                        </span>
                      </div>

                      {/* Threads-style Post Body (with image only when user uploaded a real photo) */}
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center self-stretch shrink-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0F3928] text-xs font-extrabold text-amber-300">
                            {authorInitial}
                          </div>
                          <div className="mt-1.5 w-[2px] flex-1 rounded-full bg-slate-200" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1.5 pb-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                            <span className="font-bold text-slate-900">
                              {entry.contributorName}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="inline-flex items-center gap-0.5 text-slate-600">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {entry.location}
                            </span>
                          </div>

                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <button
                                type="button"
                                onClick={() => onOpenCommunityPost(entry.slug)}
                                className="block text-left font-serif text-base font-bold leading-snug text-slate-900 transition hover:text-emerald-800 line-clamp-2 cursor-pointer"
                              >
                                {entry.title}
                              </button>
                              {entry.summary && (
                                <p className="text-xs leading-relaxed text-slate-600 line-clamp-3 whitespace-pre-line">
                                  {entry.summary}
                                </p>
                              )}
                            </div>

                            {hasThumb && (
                              <button
                                type="button"
                                onClick={() => onOpenCommunityPost(entry.slug)}
                                className="h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-[#F4F1EA] flex items-center justify-center cursor-pointer sm:h-24 sm:w-28"
                              >
                                <img
                                  src={entry.thumbnailUrl}
                                  alt={entry.title}
                                  className="h-full w-full object-contain"
                                  loading="lazy"
                                  onError={() =>
                                    setFailedThumbIds((prev) => ({ ...prev, [entry.id]: true }))
                                  }
                                />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-4 text-xs">
                        <div>
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            Eligible Views
                          </span>
                          <span className="inline-flex items-center gap-1 text-sm font-extrabold tabular-nums text-emerald-950">
                            <Eye className="h-3.5 w-3.5 text-emerald-700" />
                            {entry.eligibleViews.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="border-l border-slate-200 pl-3">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Total Page Views
                          </span>
                          <span className="text-sm font-bold tabular-nums text-slate-700">
                            {entry.totalPageViews.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleShareEntryWhatsApp(entry)}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#168A45] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#127239] cursor-pointer"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          <span>Share</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenCommunityPost(entry.slug)}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 cursor-pointer"
                        >
                          <span>ಓದಿ</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          data-testid={`contest-report-btn-${entry.id}`}
                          onClick={() =>
                            setReportingEntry({
                              id: entry.postId,
                              slug: entry.slug,
                              title: entry.title,
                              targetType: 'contest',
                            })
                          }
                          title="Report this entry"
                          aria-label="Report this entry"
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-rose-300 hover:text-rose-600 cursor-pointer"
                        >
                          <Flag className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Separate 4th Prize — Best Quality Original News Card (Admin Selection) */}
          {vis.fifthPrizeCard !== false && (
          <div className="rounded-xl border border-emerald-900/20 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span>4th Prize — Best Quality Original News (₹{qualityPrize?.amountInr ?? 100})</span>
                </div>
                <h3 className="font-serif text-lg font-bold text-slate-900">
                  4ನೇ ಬಹುಮಾನ — ಅತ್ಯುತ್ತಮ ಗುಣಮಟ್ಟದ ಮೂಲ ಸುದ್ದಿ (ಆಡ್ಮಿನ್ ಆಯ್ಕೆ)
                </h3>
                <p className="max-w-3xl text-sm text-slate-600">
                  ಮೂಲ ಸುದ್ದಿ, ನಿಖರತೆ, ಸ್ಥಳೀಯ ಮಹತ್ವ ಮತ್ತು ಸಮುದಾಯದ ಉಪಯುಕ್ತತೆ ಆಧರಿಸಿ ಆಡ್ಮಿನ್ ತಂಡದಿಂದ ಪ್ರತ್ಯೇಕವಾಗಿ ಆಯ್ಕೆ ಮಾಡಲಾಗುತ್ತದೆ.
                </p>
              </div>

              {qualityWinner ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
                  <p className="text-xs font-bold uppercase text-amber-900">
                    Announced Quality Winner
                  </p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {qualityWinner.contributorName}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenCommunityPost(qualityWinner.articleSlug)
                    }
                    className="mt-1 text-left text-xs font-semibold text-emerald-800 underline cursor-pointer"
                  >
                    {qualityWinner.articleTitle}
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900">
                  ತಿಂಗಳ ಅಂತ್ಯದಲ್ಲಿ ಆಡ್ಮಿನ್ ಪರಿಶೀಲನೆಯ ನಂತರ ಘೋಷಿಸಲಾಗುವುದು
                </div>
              )}
            </div>
          </div>
          )}

          {/* All Eligible Entries List */}
          {allEntries.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="font-serif text-lg font-bold text-slate-900">
                    ಈ ತಿಂಗಳ ಎಲ್ಲಾ ಅರ್ಹ ಸ್ಪರ್ಧಾ ಸುದ್ದಿಗಳು ({allEntries.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    ಸುದ್ದಿ ತೆರೆಯಿರಿ ಮತ್ತು ನಿಮ್ಮ ಸ್ನೇಹಿತರೊಂದಿಗೆ ಹಂಚಿಕೊಂಡು ವೀಕ್ಷಣೆ ಹೆಚ್ಚಿಸಿ
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ಸುದ್ದಿ, ಲೇಖಕರು ಅಥವಾ ಊರು ಹುಡುಕಿ..."
                    className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredEntries.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50/70"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 w-7 shrink-0 font-mono text-xs font-bold tabular-nums text-slate-500">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenCommunityPost(entry.slug)}
                          className="text-left text-sm font-bold text-slate-900 hover:text-emerald-800 cursor-pointer"
                        >
                          {entry.title}
                        </button>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                          <span className="font-medium text-slate-700">
                            {entry.contributorName}
                          </span>
                          <span>{entry.location}</span>
                          <span>{formatDateKn(entry.publishedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs font-extrabold tabular-nums text-emerald-900">
                          {entry.eligibleViews.toLocaleString('en-IN')} ಅರ್ಹ ವೀಕ್ಷಣೆ
                        </div>
                        <div className="text-[11px] tabular-nums text-slate-500">
                          ಒಟ್ಟು: {entry.totalPageViews.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleShareEntryWhatsApp(entry)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-emerald-700/25 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 cursor-pointer"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Share</span>
                      </button>
                      <button
                        type="button"
                        data-testid={`contest-list-report-btn-${entry.id}`}
                        onClick={() =>
                          setReportingEntry({
                            id: entry.postId,
                            slug: entry.slug,
                            title: entry.title,
                            targetType: 'contest',
                          })
                        }
                        title="Report this entry"
                        aria-label="Report this entry"
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-rose-300 hover:text-rose-600 cursor-pointer"
                      >
                        <Flag className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        )}

        {/* Official Competition Rules */}
        {vis.rules !== false && (
        <section id="rules" aria-labelledby="rules-heading" className="scroll-mt-28 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
              Official Competition Guidelines & Fair-Play Policy
            </p>
            <h2
              id="rules-heading"
              className="mt-1 font-serif text-2xl font-bold text-slate-900"
            >
              ಸ್ಪರ್ಧೆಯ ಅಧಿಕೃತ ನಿಯಮಗಳು (Official Contest Rules)
            </h2>
            {content.eligibilityCriteriaKn && content.eligibilityCriteriaKn.length > 0 && (
              <p className="mt-1.5 text-xs font-medium text-slate-600 sm:text-sm">
                {content.eligibilityCriteriaKn.join(' · ')}
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {content.competitionRules.map((rule) => (
              <div
                key={rule.id || rule.titleKn}
                className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{rule.titleKn}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{rule.descKn}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        )}

        {/* Frequently Asked Questions (FAQs) */}
        {vis.faqs !== false && content.faqs && content.faqs.length > 0 && (
        <section id="faqs" aria-labelledby="faqs-heading" className="scroll-mt-28 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
              Frequently Asked Questions
            </p>
            <h2
              id="faqs-heading"
              className="mt-1 font-serif text-2xl font-bold text-slate-900"
            >
              ಪದೇ ಪದೇ ಕೇಳಲಾಗುವ ಪ್ರಶ್ನೆಗಳು (FAQs)
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {content.faqs.map((faq) => (
              <div
                key={faq.id || faq.questionKn}
                className="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5"
              >
                <h3 className="text-sm font-bold text-slate-900">{faq.questionKn}</h3>
                <p className="text-xs leading-relaxed text-slate-600">{faq.answerKn}</p>
              </div>
            ))}
          </div>
        </section>
        )}

        {/* Previous Monthly Winners Archive */}
        {vis.winners !== false && (
        <section id="winners" aria-labelledby="winners-heading" className="scroll-mt-28 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
              Official Hall of Winners
            </p>
            <h2
              id="winners-heading"
              className="mt-1 font-serif text-2xl font-bold text-slate-900"
            >
              {content.previousWinnersHeadingKn}
            </h2>
          </div>

          {overview && overview.previousMonths.length > 0 ? (
            <div className="space-y-6">
              {overview.previousMonths.map((monthGroup) => (
                <div
                  key={monthGroup.monthKey}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-emerald-950/5 px-5 py-3">
                    <div>
                      <h3 className="font-serif text-base font-bold text-emerald-950">
                        {monthGroup.displayLabelKn} ({monthGroup.displayLabelEn})
                      </h3>
                      {monthGroup.startsAtIso && monthGroup.endsAtIso && (
                        <p className="text-[11px] font-medium text-emerald-900/70">
                          {formatDateKn(monthGroup.startsAtIso)} – {formatDateKn(monthGroup.endsAtIso)}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-emerald-800">
                      {monthGroup.winners.length} ವಿಜೇತರು
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {monthGroup.winners.map((w) => (
                      <div
                        key={`${monthGroup.monthKey}-${w.rank}`}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-emerald-800">
                            <span>{w.prizeLabelEn}</span>
                            <span className="text-slate-300">·</span>
                            <span>{w.prizeLabelKn}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenCommunityPost(w.articleSlug)}
                            className="mt-0.5 text-left font-serif text-base font-bold text-slate-900 hover:text-emerald-800 cursor-pointer"
                          >
                            {w.articleTitle}
                          </button>
                          <p className="mt-0.5 text-xs text-slate-600">
                            ವಿಜೇತರು: <strong className="text-slate-900">{w.contributorName}</strong>
                            {w.prizeType === 'views'
                              ? ` · ${w.eligibleViews.toLocaleString('en-IN')} ಅರ್ಹ ವೀಕ್ಷಣೆ`
                              : ' · ಆಡ್ಮಿನ್ ಗುಣಮಟ್ಟದ ಆಯ್ಕೆ'}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-serif text-xl font-extrabold tabular-nums text-emerald-900">
                            ₹{w.prizeAmountInr}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {monthGroup.userLeaderboard && monthGroup.userLeaderboard.length > 0 && (
                    <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Frozen Top Standings (Total Verified Views)
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {monthGroup.userLeaderboard.slice(0, 5).map((u) => (
                          <div
                            key={`${monthGroup.monthKey}-${u.participantKey}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                          >
                            <span className="truncate font-semibold text-slate-900">
                              #{u.rank} {u.displayName} ({u.eligibleArticleCount})
                            </span>
                            <span className="shrink-0 font-mono font-bold tabular-nums text-emerald-800">
                              {u.totalVerifiedViews.toLocaleString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-7 text-center">
              <Award className="mx-auto h-9 w-9 text-amber-500/80" />
              <h3 className="mt-2.5 font-serif text-lg font-bold text-slate-900">
                {content.winnerAnnouncementHeadingKn}
              </h3>
              <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-slate-600 sm:text-sm">
                {content.winnerAnnouncementNoteKn}
              </p>
            </div>
          )}
        </section>
        )}

        {/* Contest Footer & Contact Notice */}
        {vis.footer !== false && content.footerInfoKn && (
          <footer
            data-testid="contest-footer-info"
            className="rounded-xl border border-emerald-900/15 bg-white px-5 py-4 text-center text-xs leading-relaxed text-slate-600"
          >
            {content.footerInfoKn}
          </footer>
        )}
      </main>

      <ContestSubmitModal
        isOpen={submitModalOpen}
        monthLabel={monthLabelDisplay}
        isMonthOpen={activeMonth ? activeMonth.isAcceptingEntries : true}
        onClose={() => setSubmitModalOpen(false)}
        onSubmitted={() => {
          void loadOverview();
          onContestSubmitted?.();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('coffeenadu:data-mutated'));
          }
        }}
        onOpenArticle={onOpenCommunityPost}
      />

      <CommunityReportModal
        post={reportingEntry}
        onClose={() => setReportingEntry(null)}
      />
    </div>
  );
};
