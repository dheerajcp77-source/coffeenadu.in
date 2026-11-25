import { useMemo } from 'react';
import { ChevronRight, Zap } from 'lucide-react';
import { getKannadaLocationLabel } from '../constants/newsData';
import type { NewsArticle } from '../types/news';
import { stripRichTextToPlainText } from '../utils/richText';

interface BreakingNewsStripProps {
  articles: NewsArticle[];
  onSelectArticle: (article: NewsArticle) => void;
}

export function BreakingNewsStrip({ articles, onSelectArticle }: BreakingNewsStripProps) {
  const items = useMemo(() => articles.slice(0, 6), [articles]);

  if (items.length === 0) {
    return null;
  }

  // Repeat list cleanly for seamless marquee ticker when there are multiple headlines
  const trackItems = items.length > 1 ? [...items, ...items] : items;

  return (
    <div
      className="bg-[#10243D] text-white border-b border-[#1E3A5F] dark:bg-[#07111F] dark:border-slate-800"
      role="region"
      aria-label="Breaking and top news headlines"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-stretch h-10 sm:h-11 overflow-hidden">
        <div className="shrink-0 flex items-center gap-1.5 pr-3 sm:pr-4 border-r border-white/15">
          <span className="inline-flex items-center gap-1 rounded bg-[#D9A441] px-2 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-[#10243D]">
            <Zap className="w-3 h-3 fill-current" />
            <span>Breaking</span>
          </span>
          <span className="hidden md:inline font-kannada text-xs font-semibold text-amber-200/95">
            ತಾಜಾ ಸುದ್ದಿ
          </span>
        </div>

        <div className="relative flex-1 min-w-0 flex items-center overflow-hidden pl-4 [mask-image:linear-gradient(to_right,transparent,black_18px,black_calc(100%-18px),transparent)]">
          <div
            className={`flex items-center gap-6 whitespace-nowrap ${
              items.length > 1 ? 'cn-ticker-track' : ''
            }`}
          >
            {trackItems.map((article, idx) => {
              const headline = stripRichTextToPlainText(article.titleKannada);
              const placeLabel = getKannadaLocationLabel(article.location).split('(')[0].trim();
              return (
                <button
                  key={`${article.id}-${idx}`}
                  type="button"
                  onClick={() => onSelectArticle(article)}
                  className="inline-flex items-center gap-2 text-xs sm:text-[13px] font-medium text-slate-100 hover:text-[#D9A441] transition-colors cursor-pointer group shrink-0"
                >
                  <span className="font-kannada text-[11px] font-bold text-[#D9A441] shrink-0">
                    [{placeLabel}]
                  </span>
                  <span className="font-kannada truncate max-w-[65vw] sm:max-w-none group-hover:underline">
                    {headline}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#D9A441] shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
