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
  MapPin,
  PenSquare,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  User,
} from 'lucide-react';
import malnadBannerImg from '../../assets/images/malnad_contest_banner_1795833076071.jpg';
import { fetchContestOverview } from '../../services/contestClient';
import type { ContestPublicOverview, PublicContestEntry } from '../../types/contest';
import {
  CONTEST_KANNADA_HEADING,
  CONTEST_KANNADA_SUBTITLE,
  CONTEST_OFFICIAL_NAME,
  buildContestArticleShareText,
  buildContestPageShareText,
  computeCountdownParts,
  createDefaultContestPrizes,
} from '../../utils/contestHelpers';
import { ContestSubmitModal } from './ContestSubmitModal';

interface ContestPageProps {
  initialSection?: 'leaderboard' | 'rules' | 'winners' | null;
  initialOpenSubmit?: boolean;
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
    if (initialOpenSubmit) setSubmitModalOpen(true);
  }, [initialOpenSubmit]);

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
  }, [initialSection, loading]);

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

  const prizes = activeMonth?.prizes || DEFAULT_PRIZES;
  const totalBudget = activeMonth?.totalBudgetInr ?? 500;
  const topFour = overview?.topFour || [];
  const allEntries = overview?.allEligibleEntries || [];

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
                  {CONTEST_OFFICIAL_NAME}
                </span>
                {activeMonth && (
                  <>
                    <span className="text-emerald-300/60">|</span>
                    <span className="text-white">{monthLabelDisplay}</span>
                  </>
                )}
              </div>

              <h1 className="font-serif text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-[42px]">
                {CONTEST_KANNADA_HEADING}
              </h1>

              <p className="max-w-2xl text-base leading-relaxed text-emerald-50/95 sm:text-lg">
                {CONTEST_KANNADA_SUBTITLE}
              </p>

              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-100/85 sm:text-sm">
                <MapPin className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <span>
                  ಕೊಪ್ಪ, ಶೃಂಗೇರಿ, ಜಯಪುರ, ಬಾಳೆಹೊನ್ನೂರು ಮತ್ತು ಸುತ್ತಮುತ್ತಲಿನ ಮಲೆನಾಡು ಗ್ರಾಮಗಳಿಗಾಗಿ
                  ವಿಶೇಷ ಮಾಸಿಕ ಸ್ಪರ್ಧೆ · ಯಾವುದೇ ಪ್ರವೇಶ ಶುಲ್ಕವಿಲ್ಲ · ಶೂನ್ಯ ಜಾಹೀರಾತು ಪುಟ
                </span>
              </p>

              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSubmitModalOpen(true)}
                  disabled={activeMonth ? !activeMonth.isAcceptingEntries : false}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-extrabold text-[#0D3424] shadow-sm transition hover:bg-amber-50 disabled:opacity-50 cursor-pointer"
                >
                  <PenSquare className="h-4 w-4" />
                  <span>Submit News & Participate (ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ)</span>
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('leaderboard')}
                  className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 cursor-pointer"
                >
                  <Trophy className="h-4 w-4 text-amber-300" />
                  <span>View Leaderboard</span>
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('rules')}
                  className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-white/10 cursor-pointer"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Read Competition Rules</span>
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('winners')}
                  className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-white/10 cursor-pointer"
                >
                  <Award className="h-4 w-4 text-amber-300" />
                  <span>Previous Winners</span>
                </button>
              </div>
            </div>

            {/* Live IST Countdown Panel */}
            <div className="rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-200">
                <span className="inline-flex items-center gap-1.5 uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5" />
                  {activeMonth?.isAcceptingEntries
                    ? 'ತಿಂಗಳ ಸ್ಪರ್ಧೆ ಮುಕ್ತಾಯಕ್ಕೆ ಬಾಕಿ ಸಮಯ'
                    : 'ಈ ತಿಂಗಳ ಅವಧಿ ಮುಕ್ತಾಯಗೊಂಡಿದೆ'}
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
                <div className="mt-3.5 flex items-center justify-between border-t border-white/15 pt-3 text-xs text-emerald-100/90">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-amber-300" />
                    {formatDateKn(activeMonth.startsAtIso)} – {formatDateKn(activeMonth.endsAtIso)}
                  </span>
                  <span className="font-bold tabular-nums text-white">
                    {overview?.totalEligibleCount ?? 0} ಅರ್ಹ ಸುದ್ದಿಗಳು
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

        {/* Monthly ₹500 Prize Breakdown Ledger */}
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
                ತಿಂಗಳ ನಗದು ಬಹುಮಾನಗಳು — ಒಟ್ಟು ₹{totalBudget}
              </h2>
            </div>
            <p className="text-xs font-medium text-slate-600">
              ಉಚಿತ ಭಾಗವಹಿಸುವಿಕೆ · ಪ್ರತಿ ತಿಂಗಳು 5 ವಿಜೇತರಿಗೆ ನೇರ ನಗದು ಬಹುಮಾನ
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

        {/* Live Monthly Leaderboard */}
        <section id="leaderboard" aria-labelledby="leaderboard-heading" className="scroll-mt-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
                Live Monthly Leaderboard · {monthLabelDisplay}
              </p>
              <h2
                id="leaderboard-heading"
                className="mt-1 font-serif text-2xl font-bold text-slate-900"
              >
                ಅತಿ ಹೆಚ್ಚು ವೀಕ್ಷಣೆ ಪಡೆದ ಟಾಪ್ ಸುದ್ದಿಗಳು
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <span>
                ಒಬ್ಬ ಓದುಗರಿಂದ 24 ಗಂಟೆಯಲ್ಲಿ 1 ಅರ್ಹ ವೀಕ್ಷಣೆ ಮಾತ್ರ ಲೆಕ್ಕವಾಗುತ್ತದೆ (ಬಾಟ್/ರಿಫ್ರೆಶ್
                ಫಿಲ್ಟರ್)
              </span>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          ) : topFour.length === 0 ? (
            <div className="rounded-xl border border-emerald-900/15 bg-white p-8 text-center">
              <Trophy className="mx-auto h-10 w-10 text-emerald-800/40" />
              <h3 className="mt-3 font-serif text-xl font-bold text-slate-900">
                ಈ ತಿಂಗಳ ಮೊದಲ ಸ್ಪರ್ಧಿಯಾಗಿ ನಿಮ್ಮೂರಿನ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ!
              </h3>
              <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-600">
                ಈ ತಿಂಗಳಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ಸ್ಪರ್ಧಾ ಸುದ್ದಿ ಪ್ರಕಟವಾಗಿಲ್ಲ. ಈಗಲೇ ನಿಮ್ಮೂರಿನ ಮೂಲ ಸುದ್ದಿ
                ಪ್ರಕಟಿಸಿ ಮತ್ತು ₹500 ನಗದು ಬಹುಮಾನದ ಸ್ಪರ್ಧೆಯಲ್ಲಿ ಮುನ್ನಡೆ ಸಾಧಿಸಿ.
              </p>
              <button
                type="button"
                onClick={() => setSubmitModalOpen(true)}
                className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0F3928] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#144B35] cursor-pointer"
              >
                <PenSquare className="h-4 w-4" />
                <span>ಮೊದಲ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ</span>
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {topFour.map((entry, idx) => {
                const rank = idx + 1;
                const tier = prizes.find((p) => p.rank === rank);
                return (
                  <article
                    key={entry.id}
                    className={`flex flex-col justify-between overflow-hidden rounded-xl border bg-white transition hover:border-emerald-700/40 ${
                      rank === 1 ? 'border-amber-400 shadow-sm' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex gap-4 p-4">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-emerald-950/5 sm:h-28 sm:w-28">
                        {entry.thumbnailUrl ? (
                          <img
                            src={entry.thumbnailUrl}
                            alt={entry.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-[#0F3928]/10 text-emerald-900">
                            <Trophy className="h-6 w-6 opacity-70" />
                            <span className="mt-1 text-[10px] font-bold">CONTEST</span>
                          </div>
                        )}
                        <div
                          className={`absolute left-0 top-0 px-2.5 py-1 text-xs font-extrabold tabular-nums ${
                            rank === 1
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-[#0F3928] text-white'
                          }`}
                        >
                          #{rank}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold text-emerald-800">
                          <span>
                            {tier ? `${tier.labelKn} · ₹${tier.amountInr}` : `Rank #${rank}`}
                          </span>
                          <span className="font-medium text-slate-500">
                            {formatDateKn(entry.publishedAt)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenCommunityPost(entry.slug)}
                          className="mt-1 block text-left font-serif text-base font-bold leading-snug text-slate-900 transition hover:text-emerald-800 line-clamp-2 cursor-pointer"
                        >
                          {entry.title}
                        </button>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                            <User className="h-3.5 w-3.5 text-emerald-700" />
                            {entry.contributorName}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            {entry.location}
                          </span>
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
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Separate 5th Prize — Best Quality Original News Card */}
          <div className="rounded-xl border border-emerald-900/20 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span>5th Prize — Best Quality Original News (₹{prizes[4]?.amountInr ?? 50})</span>
                </div>
                <h3 className="font-serif text-lg font-bold text-slate-900">
                  5ನೇ ಬಹುಮಾನ — ಆಡ್ಮಿನ್ ಆಯ್ಕೆ ಮಾಡುವ ಅತ್ಯುತ್ತಮ ಗುಣಮಟ್ಟದ ಮೂಲ ಸುದ್ದಿ
                </h3>
                <p className="max-w-3xl text-sm text-slate-600">
                  ಕೇವಲ ವೀಕ್ಷಣೆಗಳ ಸಂಖ್ಯೆಗಿಂತ ಹೆಚ್ಚಾಗಿ — ಸುದ್ದಿಯ ಮೂಲತನ, ನಿಖರತೆ, ಸ್ಥಳೀಯ ಮಹತ್ವ ಮತ್ತು
                  ಸಾರ್ವಜನಿಕ ಉಪಯುಕ್ತತೆಯನ್ನು ಪರಿಗಣಿಸಿ ಕಾಫಿನಾಡು ಆಡ್ಮಿನ್ ಈ ಬಹುಮಾನವನ್ನು ಪ್ರತ್ಯೇಕವಾಗಿ
                  ಆಯ್ಕೆ ಮಾಡುತ್ತಾರೆ.
                </p>
              </div>

              {overview?.fifthQualityWinner ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
                  <p className="text-xs font-bold uppercase text-amber-900">
                    Announced Quality Winner
                  </p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {overview.fifthQualityWinner.contributorName}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenCommunityPost(overview.fifthQualityWinner!.articleSlug)
                    }
                    className="mt-1 text-left text-xs font-semibold text-emerald-800 underline cursor-pointer"
                  >
                    {overview.fifthQualityWinner.articleTitle}
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900">
                  ತಿಂಗಳ ಅಂತ್ಯದಲ್ಲಿ ಆಡ್ಮಿನ್ ಪರಿಶೀಲನೆಯ ನಂತರ ಘೋಷಿಸಲಾಗುವುದು
                </div>
              )}
            </div>
          </div>

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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Official Competition Rules */}
        <section id="rules" aria-labelledby="rules-heading" className="scroll-mt-6 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
              Official Competition Guidelines & Fair-Play Policy
            </p>
            <h2
              id="rules-heading"
              className="mt-1 font-serif text-2xl font-bold text-slate-900"
            >
              ಸ್ಪರ್ಧೆಯ ನಿಯಮಗಳು ಮತ್ತು ಅರ್ಹತಾ ಮಾನದಂಡಗಳು
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                title: '1. ಉಚಿತ ಭಾಗವಹಿಸುವಿಕೆ (No Entry Fee)',
                desc: 'ಕೊಪ್ಪ, ಶೃಂಗೇರಿ, ಜಯಪುರ, ಬಾಳೆಹೊನ್ನೂರು ಮತ್ತು ಸುತ್ತಮುತ್ತಲಿನ ಮಲೆನಾಡು ಪ್ರದೇಶದ ಯಾರಾದರೂ ಉಚಿತವಾಗಿ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ ಭಾಗವಹಿಸಬಹುದು.',
              },
              {
                title: '2. ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿಗಳಿಗೆ ಮಾತ್ರ ಅವಕಾಶ',
                desc: 'ಸುದ್ದಿಗಳು ಮೂಲ, ನಿಖರ ಹಾಗೂ ಸ್ಥಳೀಯ ಜನರಿಗೆ ಉಪಯುಕ್ತವಾಗಿರಬೇಕು. ನಕಲಿ ಸುದ್ದಿ, ಕಾಪಿ-ಪೇಸ್ಟ್, ದ್ವೇಷಪೂರಿತ ಅಥವಾ ದಾರಿತಪ್ಪಿಸುವ ವಿಷಯಗಳನ್ನು ಅನರ್ಹಗೊಳಿಸಲಾಗುತ್ತದೆ.',
              },
              {
                title: '3. ಜಾಹೀರಾತು / ಮಾರಾಟ / ಕಳೆದುಹೋದ ವಸ್ತುಗಳಿಗೆ ಪ್ರತ್ಯೇಕ ವಿಭಾಗ',
                desc: 'ಅಂಗಡಿ ಪ್ರಚಾರ, ಮಾರಾಟ ಪ್ರಕಟಣೆಗಳು, ಜಾಹೀರಾತುಗಳು ಮತ್ತು ಕಳೆದುಹೋದ/ಸಿಕ್ಕ ವಸ್ತುಗಳ ಮಾಹಿತಿ ಸ್ಪರ್ಧೆಗೆ ಅರ್ಹವಲ್ಲ. ಅವುಗಳನ್ನು ಎಂದಿನಂತೆ ಸಮುದಾಯ ವಿಭಾಗದಲ್ಲಿ ಪ್ರಕಟಿಸಿ.',
              },
              {
                title: '4. ಪ್ರಾಮಾಣಿಕ ವೀಕ್ಷಣೆ ಲೆಕ್ಕಾಚಾರ (24-Hour Unique View Rule)',
                desc: 'ಪ್ರತಿ ಓದುಗರಿಂದ 24 ಗಂಟೆಯಲ್ಲಿ ಗರಿಷ್ಠ 1 ಅರ್ಹ ವೀಕ್ಷಣೆ ಮಾತ್ರ ಲೆಕ್ಕವಾಗುತ್ತದೆ. ಪದೇ ಪದೇ ಪುಟ ರಿಫ್ರೆಶ್ ಮಾಡುವುದು, ಬಾಟ್ ಅಥವಾ ಕೃತಕ ಟ್ರಾಫಿಕ್ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಫಿಲ್ಟರ್ ಆಗುತ್ತದೆ.',
              },
              {
                title: '5. ಮಾಸಿಕ ಅವಧಿ (IST Timezone)',
                desc: 'ಪ್ರತಿ ತಿಂಗಳ 1ನೇ ತಾರೀಖಿನಿಂದ ತಿಂಗಳ ಕೊನೆಯ ದಿನದ ರಾತ್ರಿ 11:59 (IST) ವರೆಗೆ ಪ್ರಕಟವಾದ ಸುದ್ದಿಗಳ ಅರ್ಹ ವೀಕ್ಷಣೆಗಳನ್ನು ಮಾತ್ರ ಆ ತಿಂಗಳ ಸ್ಪರ್ಧೆಗೆ ಪರಿಗಣಿಸಲಾಗುತ್ತದೆ.',
              },
              {
                title: '6. 5ನೇ ಗುಣಮಟ್ಟದ ಬಹುಮಾನ (₹50)',
                desc: 'ಮೊದಲ 4 ಬಹುಮಾನಗಳು ಅತಿ ಹೆಚ್ಚು ಅರ್ಹ ವೀಕ್ಷಣೆ ಆಧಾರಿತವಾಗಿದ್ದು, 5ನೇ ಬಹುಮಾನವನ್ನು ಮೂಲತನ, ನಿಖರತೆ ಮತ್ತು ಸ್ಥಳೀಯ ಉಪಯುಕ್ತತೆ ಆಧರಿಸಿ ಆಡ್ಮಿನ್ ಪ್ರತ್ಯೇಕವಾಗಿ ಆಯ್ಕೆ ಮಾಡುತ್ತಾರೆ.',
              },
              {
                title: '7. ಗೌಪ್ಯತೆ ಮತ್ತು ವಿಜೇತರ ಪರಿಶೀಲನೆ',
                desc: 'ಸುದ್ದಿ ಪ್ರಕಟಿಸುವಾಗ ನೀಡುವ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಸಾರ್ವಜನಿಕವಾಗಿ ಎಲ್ಲಿಯೂ ಕಾಣಿಸುವುದಿಲ್ಲ. ಬಹುಮಾನ ವಿತರಣೆಗೆ ಮುನ್ನ ಆಡ್ಮಿನ್ ಪರಿಶೀಲನೆ ನಡೆಸಿ ನೇರವಾಗಿ ಸಂಪರ್ಕಿಸುತ್ತಾರೆ.',
              },
              {
                title: '8. ಅಂತಿಮ ನಿರ್ಧಾರ',
                desc: 'ಅನುಮಾನಾಸ್ಪದ ಟ್ರಾಫಿಕ್ ಅಥವಾ ನಿಯಮ ಉಲ್ಲಂಘನೆ ಕಂಡುಬಂದಲ್ಲಿ ಲೇಖನವನ್ನು ಅನರ್ಹಗೊಳಿಸುವ ಹಕ್ಕು ಕಾಫಿನಾಡು ಆಡ್ಮಿನ್ ತಂಡಕ್ಕೆ ಇರುತ್ತದೆ.',
              },
            ].map((rule) => (
              <div
                key={rule.title}
                className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{rule.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{rule.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Previous Monthly Winners Archive */}
        <section id="winners" aria-labelledby="winners-heading" className="scroll-mt-6 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
              Official Hall of Winners
            </p>
            <h2
              id="winners-heading"
              className="mt-1 font-serif text-2xl font-bold text-slate-900"
            >
              ಹಿಂದಿನ ತಿಂಗಳ ವಿಜೇತರು (Previous Winners)
            </h2>
          </div>

          {overview && overview.previousMonths.length > 0 ? (
            <div className="space-y-6">
              {overview.previousMonths.map((monthGroup) => (
                <div
                  key={monthGroup.monthKey}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 bg-emerald-950/5 px-5 py-3">
                    <h3 className="font-serif text-base font-bold text-emerald-950">
                      {monthGroup.displayLabelKn} ({monthGroup.displayLabelEn})
                    </h3>
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
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-7 text-center">
              <Award className="mx-auto h-9 w-9 text-amber-500/80" />
              <h3 className="mt-2.5 font-serif text-lg font-bold text-slate-900">
                ಈ ತಿಂಗಳ ವಿಜೇತರನ್ನು ತಿಂಗಳ ಅಂತ್ಯದಲ್ಲಿ ಪ್ರಕಟಿಸಲಾಗುವುದು
              </h3>
              <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-slate-600 sm:text-sm">
                ಪ್ರತಿ ತಿಂಗಳ ಸ್ಪರ್ಧೆ ಮುಕ್ತಾಯಗೊಂಡು ಆಡ್ಮಿನ್ ಪರಿಶೀಲನೆ ಪೂರ್ಣಗೊಂಡ ನಂತರ ವಿಜೇತರ ಹೆಸರು,
                ವಿಜೇತ ಸುದ್ದಿ ಮತ್ತು ಬಹುಮಾನದ ವಿವರಗಳನ್ನು ಇಲ್ಲಿ ಶಾಶ್ವತವಾಗಿ ಪ್ರಕಟಿಸಲಾಗುತ್ತದೆ.
              </p>
            </div>
          )}
        </section>
      </main>

      <ContestSubmitModal
        isOpen={submitModalOpen}
        monthLabel={monthLabelDisplay}
        isMonthOpen={activeMonth ? activeMonth.isAcceptingEntries : true}
        onClose={() => setSubmitModalOpen(false)}
        onSubmitted={() => {
          void loadOverview();
          onContestSubmitted?.();
        }}
        onOpenArticle={onOpenCommunityPost}
      />
    </div>
  );
};
