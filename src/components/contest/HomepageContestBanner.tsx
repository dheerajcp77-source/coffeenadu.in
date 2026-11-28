import React, { useEffect, useState } from 'react';
import { ArrowRight, Award, BookOpen, PenSquare, Trophy } from 'lucide-react';
import malnadBannerImg from '../../assets/images/malnad_contest_banner_1795833076071.jpg';
import { fetchContestOverview } from '../../services/contestClient';
import type { ContestEditableContent, ContestPrizeTier } from '../../types/contest';
import {
  CONTEST_KANNADA_HEADING,
  createDefaultContestEditableContent,
  createDefaultContestPrizes,
} from '../../utils/contestHelpers';

interface HomepageContestBannerProps {
  onNavigateContest: (options?: {
    section?: 'leaderboard' | 'rules' | 'winners';
    openSubmit?: boolean;
  }) => void;
}

const DEFAULT_PRIZES = createDefaultContestPrizes();
const DEFAULT_CONTENT = createDefaultContestEditableContent();

export const HomepageContestBanner: React.FC<HomepageContestBannerProps> = ({
  onNavigateContest,
}) => {
  const [content, setContent] = useState<ContestEditableContent>(DEFAULT_CONTENT);
  const [prizes, setPrizes] = useState<ContestPrizeTier[]>(DEFAULT_PRIZES);
  const [totalBudget, setTotalBudget] = useState<number>(1500);

  useEffect(() => {
    let mounted = true;
    const syncBanner = async () => {
      try {
        const data = await fetchContestOverview();
        if (!mounted) return;
        if (data.contentConfig) setContent(data.contentConfig);
        if (data.activeMonth?.prizes?.length) setPrizes(data.activeMonth.prizes);
        if (typeof data.activeMonth?.totalBudgetInr === 'number') {
          setTotalBudget(data.activeMonth.totalBudgetInr);
        }
      } catch {
        // Keep default banner content on offline/network error
      }
    };
    void syncBanner();
    const handleMutated = () => {
      void syncBanner();
    };
    window.addEventListener('coffeenadu:data-mutated', handleMutated);
    return () => {
      mounted = false;
      window.removeEventListener('coffeenadu:data-mutated', handleMutated);
    };
  }, []);

  return (
    <section
      aria-label="Coffeenadu Most Viewed News Challenge"
      className="relative overflow-hidden rounded-xl border border-emerald-900/20 bg-[#0F3928] text-white shadow-sm"
    >
      <img
        src={malnadBannerImg}
        alt="Malnad coffee hills at sunrise — Coffeenadu Most Viewed News Challenge"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-35"
        loading="eager"
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-[#0B2D1F]/95 via-[#103D2B]/88 to-[#124531]/75"
        aria-hidden="true"
      />

      <div className="relative z-10 px-5 py-6 sm:px-8 sm:py-7 lg:px-10 lg:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr] lg:items-center">
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                {content.mainHeadingEn || 'COFFEENADU MOST VIEWED NEWS CHALLENGE'}
              </span>
              <span className="text-emerald-300/60" aria-hidden="true">
                |
              </span>
              <span className="text-white/90">
                {content.homepagePromoBadgeKn || `ಈ ತಿಂಗಳ ₹${totalBudget} ನಗದು ಬಹುಮಾನ!`}
              </span>
            </div>

            <h2 className="font-serif text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl lg:text-[28px]">
              {content.homepagePromoHeadingKn || CONTEST_KANNADA_HEADING}
            </h2>

            <p className="max-w-2xl text-sm leading-relaxed text-emerald-50/90 sm:text-[15px]">
              {content.homepagePromoSubtitleKn}
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1.5">
              <button
                type="button"
                onClick={() => onNavigateContest({ openSubmit: true })}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-[#0F3928] transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
              >
                <PenSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{content.homepagePromoButtonKn || 'ಸ್ಪರ್ಧೆಯಲ್ಲಿ ಭಾಗವಹಿಸಿ'}</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => onNavigateContest({ section: 'leaderboard' })}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3.5 py-2.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 sm:text-sm cursor-pointer"
              >
                <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                <span>{content.buttonLabels?.leaderboardBtnEn || 'View Leaderboard'}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateContest({ section: 'rules' })}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-white/25 px-3.5 py-2.5 text-xs font-semibold text-emerald-50 transition hover:bg-white/10 sm:text-sm cursor-pointer"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{content.buttonLabels?.rulesBtnEn || 'Competition Rules'}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateContest({ section: 'winners' })}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-white/25 px-3.5 py-2.5 text-xs font-semibold text-emerald-50 transition hover:bg-white/10 sm:text-sm cursor-pointer"
              >
                <Award className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                <span>{content.buttonLabels?.previousWinnersBtnEn || 'Previous Winners'}</span>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-white/15 bg-white/95 p-4 text-slate-900 shadow-sm">
            <div className="flex items-baseline justify-between border-b border-emerald-900/10 pb-2.5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-800">
                  Monthly Cash Rewards
                </p>
                <p className="text-xs text-slate-600">ಪ್ರತಿ ತಿಂಗಳು 4 ವಿಜೇತರಿಗೆ ನಗದು ಬಹುಮಾನ</p>
              </div>
              <span className="font-serif text-2xl font-extrabold tabular-nums text-emerald-900">
                ₹{totalBudget.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {prizes.slice(0, 4).map((tier) => {
                const isQuality = tier.type === 'quality';
                return (
                  <div
                    key={tier.rank}
                    className={`rounded-md border px-1.5 py-2 ${
                      tier.rank === 1
                        ? 'border-amber-400/70 bg-amber-50'
                        : isQuality
                        ? 'border-emerald-700/25 bg-emerald-50/70'
                        : 'border-slate-200 bg-slate-50/70'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {isQuality ? '4th ★' : `#${tier.rank}`}
                    </div>
                    <div className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-900 sm:text-base">
                      ₹{tier.amountInr}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-600">
                      {isQuality ? 'Quality' : 'Views'}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-2.5 text-[11px] leading-snug text-slate-600">
              1–3ನೇ ಬಹುಮಾನ: ಅತಿ ಹೆಚ್ಚು ಓದಲ್ಪಟ್ಟ ಮೂಲ ಸುದ್ದಿ · 4ನೇ ಬಹುಮಾನ (₹{prizes.find((p) => p.type === 'quality')?.amountInr ?? 100}): ಆಡ್ಮಿನ್ ಆಯ್ಕೆ
              ಮಾಡಿದ ಅತ್ಯುತ್ತಮ ಗುಣಮಟ್ಟದ ಸುದ್ದಿ · ಉಚಿತ ಭಾಗವಹಿಸುವಿಕೆ.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
