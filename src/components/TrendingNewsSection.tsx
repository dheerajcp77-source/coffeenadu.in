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

  const title = isViewRanked ? 'Trending News' : 'Latest Picks';
  const subtitleKn = isViewRanked ? 'ಹೆಚ್ಚು ಓದಿದ ಸುದ್ದಿಗಳು' : 'ಪ್ರಮುಖ ಸುದ್ದಿಗಳು';

  if (variant === 'horizontal') {
    return (
      <section
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1E33] p-4 shadow-xs"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#10243D] dark:bg-amber-500/20 text-[#D9A441] flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#17263A] dark:text-white leading-tight">
                {title}
              </h2>
              <p className="font-kannada text-[11px] text-[#738093] dark:text-slate-400">
                {subtitleKn}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#176B4A] dark:text-emerald-400">
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
                className="snap-start shrink-0 w-[250px] text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#13253E] p-2.5 hover:border-[#10243D] dark:hover:border-amber-500/60 transition-colors cursor-pointer flex gap-2.5 items-start"
              >
                <div className="relative w-16 h-16 rounded-md overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-800">
                  <NewsImage
                    src={resolveArticleImage(article, true)}
                    alt={headline}
                    watermarkApplied={article.watermarkApplied}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-1 left-1 w-5 h-5 rounded bg-[#10243D]/90 text-[#D9A441] text-[10px] font-extrabold flex items-center justify-center">
                    {index + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[10px] text-[#738093] dark:text-slate-400 font-semibold mb-1">
                    <span className="truncate">{article.category}</span>
                    <span>•</span>
                    <span className="font-kannada truncate">{place}</span>
                  </div>
                  <h3 className="font-kannada text-xs font-bold text-[#17263A] dark:text-slate-100 line-clamp-2 leading-snug">
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
      className="bg-white dark:bg-[#0F1E33] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs"
      aria-label={title}
    >
      <div className="bg-[#10243D] dark:bg-[#0A1728] text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-[#D9A441]" />
          <div>
            <h3 className="text-sm font-bold tracking-wide leading-tight">{title}</h3>
            <p className="font-kannada text-[11px] text-slate-300">{subtitleKn}</p>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#D9A441]">
          Koppa Desk
        </span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {articles.map((article, index) => {
          const headline = stripRichTextToPlainText(article.titleKannada);
          const place = getKannadaLocationLabel(article.location).split('(')[0].trim();
          return (
            <button
              key={article.id}
              type="button"
              onClick={() => onSelectArticle(article)}
              className="w-full text-left p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer flex items-start gap-3 group"
            >
              <span className="shrink-0 w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-[#10243D] dark:text-[#D9A441] text-xs font-extrabold flex items-center justify-center mt-0.5 group-hover:bg-[#10243D] group-hover:text-white dark:group-hover:bg-[#D9A441] dark:group-hover:text-[#10243D] transition-colors">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="font-kannada text-[13px] font-bold text-[#17263A] dark:text-slate-100 leading-snug line-clamp-2 group-hover:text-[#176B4A] dark:group-hover:text-[#D9A441] transition-colors">
                  {headline}
                </h4>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#738093] dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 font-kannada">
                    <MapPin className="w-3 h-3 text-[#176B4A] dark:text-emerald-400" />
                    {place}
                  </span>
                  <span>•</span>
                  <span>{article.publishedDate}</span>
                </div>
              </div>
              <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <NewsImage
                  src={resolveArticleImage(article, true)}
                  alt={headline}
                  watermarkApplied={article.watermarkApplied}
                  className="w-full h-full object-cover"
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
