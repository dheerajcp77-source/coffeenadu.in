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
  const items = useMemo(() => articles.slice(0, 8), [articles]);

  if (items.length === 0) {
    return null;
  }

  // Ensure the marquee track is wide enough to loop seamlessly even when 1–3 breaking stories exist
  const basePass =
    items.length === 1
      ? [items[0], items[0], items[0]]
      : items.length === 2
        ? [...items, ...items]
        : items;
  const trackItems = [...basePass, ...basePass];

  return (
    <div
      className="cn-ticker-container bg-[#231F1A] text-[#FBF9F5] border-b border-[#D4A238]/35 dark:bg-[#14120F] dark:border-[#3A3122]"
      role="region"
      aria-label="Breaking and top news headlines marquee"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-stretch h-10 sm:h-11 overflow-hidden">
        <div className="shrink-0 flex items-center gap-1.5 pr-3 sm:pr-4 border-r border-[#D4A238]/25">
          <span className="inline-flex items-center gap-1 rounded bg-gradient-to-r from-[#D4A238] to-[#E6BC5C] px-2 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-[#181512]">
            <Zap className="w-3 h-3 fill-current" />
            <span>Breaking</span>
          </span>
          <span className="hidden md:inline font-kannada text-xs font-semibold text-[#F1D592]">
            ತಾಜಾ ಸುದ್ದಿ
          </span>
        </div>

        <div className="relative flex-1 min-w-0 flex items-center overflow-hidden pl-4 [mask-image:linear-gradient(to_right,transparent,black_18px,black_calc(100%-18px),transparent)]">
          <div className="cn-ticker-track flex items-center gap-7 whitespace-nowrap">
            {trackItems.map((article, idx) => {
              const headline = stripRichTextToPlainText(article.titleKannada);
              const placeLabel = getKannadaLocationLabel(article.location).split('(')[0].trim();
              return (
                <button
                  key={`${article.id}-${idx}`}
                  type="button"
                  onClick={() => onSelectArticle(article)}
                  className="inline-flex items-center gap-2 text-xs sm:text-[13px] font-medium text-[#F5EFE2] hover:text-[#F1D592] transition-colors cursor-pointer group shrink-0"
                >
                  <span className="font-kannada text-[11px] font-bold text-[#E6BC5C] shrink-0">
                    [{placeLabel}]
                  </span>
                  <span className="font-kannada group-hover:underline">
                    {headline}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#C5A76B] group-hover:text-[#F1D592] shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
