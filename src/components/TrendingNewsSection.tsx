import { Flame, MapPin } from 'lucide-react';
import { getKannadaLocationLabel, resolveArticleImage } from '../constants/newsData';
import type { NewsArticle } from '../types/news';
import { stripRichTextToPlainText } from '../utils/richText';
import { NewsImage } from './NewsImage';

interface TrendingNewsSectionProps {
  articles: NewsArticle[];
  isViewRanked: boolean;
  onSelectArticle: (article: NewsArticle) => void;
  variant?: 'rail' | 'horizontal';
}

export function TrendingNewsSection({
  articles,
  isViewRanked,
  onSelectArticle,
  variant = 'rail',
}: TrendingNewsSectionProps) {
  if (articles.length === 0) return null;

  const title = isViewRanked ? 'Top Stories' : 'Top Stories';
  const subtitleKn = 'ಪ್ರಮುಖ ಸುದ್ದಿಗಳು';

  if (variant === 'horizontal') {
    return (
      <section
        className="rounded-2xl border border-[#E7DFCE] dark:border-[#2E2922] bg-white dark:bg-[#1A1815] p-4 shadow-2xs"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#1C1917] dark:bg-[#D4A238]/20 text-[#E6BC5C] flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#1C1917] dark:text-[#FBF9F5] leading-tight">
                {title}
              </h2>
              <p className="font-kannada text-[11px] text-[#6B6052] dark:text-[#A89C8B]">
                {subtitleKn}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#926710] dark:text-[#E6BC5C]">
            Top {articles.length}
          </span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1.5 no-scrollbar snap-x">
          {articles.map((article, index) => {
            const headline = stripRichTextToPlainText(article.titleKannada);
            const place = getKannadaLocationLabel(article.location).split('(')[0].trim();
            return (
              <button
                key={article.id}
                type="button"
                onClick={() => onSelectArticle(article)}
                className="snap-start shrink-0 w-[250px] text-left rounded-xl border border-[#E7DFCE] dark:border-[#2E2922] bg-[#FAF7F0] dark:bg-[#221F1A] p-2.5 hover:border-[#C5932B] dark:hover:border-[#E2B44B]/60 transition-colors cursor-pointer flex gap-2.5 items-start"
              >
                <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-[#F5F1E8] dark:bg-[#14120F] border border-[#E7DFCE] dark:border-[#2E2922]">
                  <NewsImage
                    src={resolveArticleImage(article, true)}
                    alt={headline}
                    watermarkApplied={article.watermarkApplied}
                    fitMode="contain"
                    fillParent
                  />
                  <span className="absolute top-1 left-1 w-5 h-5 rounded bg-[#1C1917]/90 text-[#E6BC5C] text-[10px] font-extrabold flex items-center justify-center z-20">
                    {index + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[10px] text-[#6B6052] dark:text-[#A89C8B] font-semibold mb-1">
                    <span className="truncate">{article.category}</span>
                    <span>•</span>
                    <span className="font-kannada truncate">{place}</span>
                  </div>
                  <h3 className="font-kannada text-xs font-bold text-[#1C1917] dark:text-[#FBF9F5] line-clamp-2 leading-snug">
                    {headline}
                  </h3>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section
      className="bg-white dark:bg-[#1A1815] rounded-2xl border border-[#E7DFCE] dark:border-[#2E2922] overflow-hidden shadow-2xs"
      aria-label={title}
    >
      <div className="bg-[#1C1917] dark:bg-[#14120F] text-[#FBF9F5] px-4 py-3 flex items-center justify-between border-b border-[#3A3122]">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-[#E6BC5C]" />
          <div>
            <h3 className="text-sm font-bold tracking-wide leading-tight">{title}</h3>
            <p className="font-kannada text-[11px] text-[#CFC4B2]">{subtitleKn}</p>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#E6BC5C]">
          Koppa Desk
        </span>
      </div>

      <div className="divide-y divide-[#EFE8D8] dark:divide-[#2A251E]">
        {articles.map((article, index) => {
          const headline = stripRichTextToPlainText(article.titleKannada);
          const place = getKannadaLocationLabel(article.location).split('(')[0].trim();
          return (
            <button
              key={article.id}
              type="button"
              onClick={() => onSelectArticle(article)}
              className="w-full text-left p-3.5 hover:bg-[#FAF7F0] dark:hover:bg-[#221F1A] transition-colors cursor-pointer flex items-start gap-3 group"
            >
              <span className="shrink-0 w-6 h-6 rounded-md bg-[#F6F0E1] dark:bg-[#282218] text-[#926710] dark:text-[#E6BC5C] text-xs font-extrabold flex items-center justify-center mt-0.5 group-hover:bg-gradient-to-r group-hover:from-[#C5932B] group-hover:to-[#DEB04B] group-hover:text-[#171411] transition-colors">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="font-kannada text-[13px] font-bold text-[#1C1917] dark:text-[#FBF9F5] leading-snug line-clamp-2 group-hover:text-[#926710] dark:group-hover:text-[#E6BC5C] transition-colors">
                  {headline}
                </h4>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#6B6052] dark:text-[#A89C8B]">
                  <span className="inline-flex items-center gap-1 font-kannada">
                    <MapPin className="w-3 h-3 text-[#B88623] dark:text-[#E6BC5C]" />
                    {place}
                  </span>
                  <span>·</span>
                  <span>{article.publishedDate}</span>
                </div>
              </div>
              <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-[#F5F1E8] dark:bg-[#14120F] border border-[#E7DFCE] dark:border-[#2E2922]">
                <NewsImage
                  src={resolveArticleImage(article, true)}
                  alt={headline}
                  watermarkApplied={article.watermarkApplied}
                  fitMode="contain"
                  fillParent
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
