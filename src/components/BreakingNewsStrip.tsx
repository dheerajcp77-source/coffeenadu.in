import { useMemo, useState } from 'react';
import { ChevronRight, Pause, Play } from 'lucide-react';
import { getKannadaLocationLabel } from '../constants/newsData';
import type { NewsArticle } from '../types/news';
import { stripRichTextToPlainText } from '../utils/richText';

interface BreakingNewsStripProps {
  articles: NewsArticle[];
  onSelectArticle: (article: NewsArticle) => void;
  noticeText?: string;
}

export function BreakingNewsStrip({
  articles,
  onSelectArticle,
  noticeText,
}: BreakingNewsStripProps) {
  const [isPaused, setIsPaused] = useState(false);
  const items = useMemo(() => articles.slice(0, 8), [articles]);

  if (items.length === 0) {
    return null;
  }

  // Repeat list cleanly for seamless marquee ticker when there are multiple headlines
  const trackItems = items.length > 1 ? [...items, ...items] : items;
  const cleanNotice = (noticeText || '').trim();

  return (
    <div
      className={`cn-ticker-container bg-[#10243D] text-white border-b border-[#1E3A5F] dark:bg-[#07111F] dark:border-slate-800 ${
        isPaused ? 'cn-ticker-paused' : ''
      }`}
      role="region"
      aria-label="Live Breaking News Ticker"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-stretch h-10 sm:h-11 overflow-hidden gap-2">
        {/* Crisp Red BREAKING NEWS Label + Gold Kannada Subtitle */}
        <div className="shrink-0 flex items-center gap-2 pr-3 border-r border-white/15">
          <span className="inline-flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-white shadow-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full bg-white ${isPaused ? '' : 'animate-pulse'}`}
              aria-hidden="true"
            />
            <span>BREAKING NEWS</span>
          </span>
          <span className="hidden md:inline font-kannada text-xs font-bold text-[#D9A441]">
            ತಾಜಾ ಸುದ್ದಿ
          </span>
        </div>

        {/* Marquee / Touch-Scrollable Track */}
        <div className="relative flex-1 min-w-0 flex items-center overflow-x-auto sm:overflow-hidden pl-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black,black_calc(100%-16px),transparent)]">
          <div
            className={`flex items-center gap-6 whitespace-nowrap ${
              items.length > 1 ? 'cn-ticker-track' : ''
            }`}
          >
            {cleanNotice && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200 shrink-0">
                <span className="text-[#D9A441] font-bold">★</span>
                <span className="font-kannada">{cleanNotice}</span>
              </span>
            )}
            {trackItems.map((article, idx) => {
              const headline = stripRichTextToPlainText(article.titleKannada);
              const placeLabel = getKannadaLocationLabel(article.location).split('(')[0].trim();
              return (
                <button
                  key={`${article.id}-${idx}`}
                  type="button"
                  onClick={() => onSelectArticle(article)}
                  className="inline-flex items-center gap-2 text-xs sm:text-[13px] font-medium text-white hover:text-[#D9A441] focus-visible:text-[#D9A441] transition-colors cursor-pointer group shrink-0 min-h-[34px]"
                >
                  <span className="font-kannada text-[11px] font-bold text-[#D9A441] shrink-0">
                    [{placeLabel}]
                  </span>
                  <span className="font-kannada group-hover:underline">
                    {headline}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#D9A441] shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Accessible Pause / Resume Toggle */}
        {items.length > 1 && (
          <div className="shrink-0 flex items-center pl-1.5 border-l border-white/15">
            <button
              type="button"
              onClick={() => setIsPaused((prev) => !prev)}
              aria-pressed={isPaused}
              aria-label={isPaused ? 'Resume breaking news ticker' : 'Pause breaking news ticker'}
              title={isPaused ? 'Resume ticker' : 'Pause ticker'}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {isPaused ? (
                <Play className="w-3.5 h-3.5 text-[#D9A441] fill-current" aria-hidden="true" />
              ) : (
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
