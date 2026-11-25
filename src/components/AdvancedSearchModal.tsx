import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Clock, MapPin, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  KOPPA_PLACE_OPTIONS,
  NEWS_CATEGORIES,
  getKannadaLocationLabel,
  matchesSelectedLocation,
  resolveArticleImage,
} from '../constants/newsData';
import type { FilterCategory, NewsArticle } from '../types/news';
import {
  searchArticlesAdvanced,
  splitTextForHighlight,
  type TimeframeFilter,
} from '../utils/newsHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { NewsImage } from './NewsImage';

interface AdvancedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: NewsArticle[];
  initialQuery?: string;
  initialCategory?: FilterCategory;
  initialLocation?: string;
  onSelectArticle: (article: NewsArticle) => void;
}

const SUGGESTED_QUERIES = ['ಕೊಪ್ಪ', 'Coffee', 'ಶೃಂಗೇರಿ', 'ಅಡಿಕೆ', 'Bus', 'ಜಯಪುರ'];
const TIMEFRAMES: TimeframeFilter[] = ['All', 'Today', 'Yesterday', 'This Week'];

function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = useMemo(() => splitTextForHighlight(text, query), [text, query]);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className="bg-amber-200 dark:bg-amber-500/35 text-slate-900 dark:text-amber-100 rounded px-0.5"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

export function AdvancedSearchModal({
  isOpen,
  onClose,
  articles,
  initialQuery = '',
  initialCategory = 'All',
  initialLocation = 'All',
  onSelectArticle,
}: AdvancedSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<FilterCategory>(initialCategory);
  const [location, setLocation] = useState<string>(initialLocation);
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('All');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setCategory(initialCategory);
      setLocation(initialLocation);
      setTimeframe('All');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen, initialQuery, initialCategory, initialLocation]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const results = useMemo(() => {
    return searchArticlesAdvanced(
      articles,
      { query, category, location, timeframe },
      Date.now(),
      matchesSelectedLocation
    );
  }, [articles, query, category, location, timeframe]);

  if (!isOpen) return null;

  const hasFilters =
    query.trim() !== '' || category !== 'All' || location !== 'All' || timeframe !== 'All';

  const clearFilters = () => {
    setQuery('');
    setCategory('All');
    setLocation('All');
    setTimeframe('All');
    inputRef.current?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-start justify-center bg-slate-950/70 backdrop-blur-[2px] p-2 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="advanced-search-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl my-2 sm:my-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F1E33] shadow-2xl overflow-hidden">
        {/* Top bar */}
        <div className="bg-[#10243D] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#D9A441]" />
            <div>
              <h2 id="advanced-search-title" className="text-sm sm:text-base font-bold">
                Search Coffeenadu News
              </h2>
              <p className="font-kannada text-[11px] text-slate-300">
                ಕನ್ನಡ ಮತ್ತು ಇಂಗ್ಲಿಷ್ ಪದಗಳಲ್ಲಿ ಸುದ್ದಿಗಳನ್ನು ಹುಡುಕಿ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input & filter controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 space-y-3 bg-[#F8FAFC] dark:bg-[#0B1728]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search headlines, places, crops, or topics (ಕೊಪ್ಪ, ಕಾಫಿ, ಶೃಂಗೇರಿ...)"
              className="w-full min-h-[46px] pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#13253E] text-sm text-[#17263A] dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#176B4A] dark:focus:ring-[#D9A441]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search text"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#738093] dark:text-slate-400 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FilterCategory)}
                className="w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#13253E] px-2.5 text-xs font-medium text-[#17263A] dark:text-slate-100"
              >
                <option value="All">All Categories</option>
                {NEWS_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#738093] dark:text-slate-400 mb-1">
                Place / Taluk
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#13253E] px-2.5 text-xs font-medium text-[#17263A] dark:text-slate-100"
              >
                <option value="All">All Places</option>
                {KOPPA_PLACE_OPTIONS.map((place) => (
                  <option key={place.id} value={place.labelKn}>
                    {place.labelKn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#738093] dark:text-slate-400 mb-1">
                Timeframe
              </label>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-1">
                {TIMEFRAMES.map((tf) => {
                  const active = timeframe === tf;
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTimeframe(tf)}
                      className={`py-1.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#10243D] text-white dark:bg-[#D9A441] dark:text-[#10243D]'
                          : 'text-[#738093] dark:text-slate-300 hover:text-[#17263A] dark:hover:text-white'
                      }`}
                    >
                      {tf === 'This Week' ? '7d' : tf}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#738093] dark:text-slate-400">
                Quick terms:
              </span>
              {SUGGESTED_QUERIES.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#13253E] text-[11px] font-medium text-[#17263A] dark:text-slate-200 hover:border-[#176B4A] dark:hover:border-[#D9A441] cursor-pointer"
                >
                  {term}
                </button>
              ))}
            </div>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[58vh] overflow-y-auto p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#738093] dark:text-slate-400">
              {results.length} matching {results.length === 1 ? 'article' : 'articles'}
            </p>
          </div>

          {results.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-bold text-[#17263A] dark:text-white">
                No matching news reports found
              </p>
              <p className="font-kannada text-xs text-[#738093] dark:text-slate-400 mt-1">
                ನಿಮ್ಮ ಹುಡುಕಾಟಕ್ಕೆ ಹೊಂದುವ ಸುದ್ದಿಗಳು ಕಂಡುಬಂದಿಲ್ಲ. ದಯವಿಟ್ಟು ಫಿಲ್ಟರ್ ಬದಲಾಯಿಸಿ.
              </p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#10243D] dark:bg-[#D9A441] text-white dark:text-[#10243D] px-4 py-2 text-xs font-bold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Search Filters
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {results.slice(0, 30).map((article) => {
                const titlePlain = stripRichTextToPlainText(article.titleKannada);
                const summaryPlain = stripRichTextToPlainText(article.summaryKannada);
                const place = getKannadaLocationLabel(article.location).split('(')[0].trim();
                return (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => {
                      onSelectArticle(article);
                      onClose();
                    }}
                    className="w-full text-left py-3 first:pt-0 last:pb-0 flex gap-3 items-start hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg px-2 -mx-2 transition-colors cursor-pointer"
                  >
                    <div className="w-20 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <NewsImage
                        src={resolveArticleImage(article, true)}
                        alt={titlePlain}
                        watermarkApplied={article.watermarkApplied}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#738093] dark:text-slate-400 mb-1">
                        <span className="font-bold text-[#176B4A] dark:text-emerald-400">
                          {article.category}
                        </span>
                        <span className="inline-flex items-center gap-0.5 font-kannada">
                          <MapPin className="w-3 h-3" />
                          {place}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <Calendar className="w-3 h-3" />
                          {article.publishedDate}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {article.readTimeMinutes}m
                        </span>
                      </div>
                      <h3 className="font-kannada text-sm font-bold text-[#17263A] dark:text-slate-100 leading-snug line-clamp-2">
                        <HighlightedText text={titlePlain} query={query} />
                      </h3>
                      <p className="font-kannada text-xs text-[#738093] dark:text-slate-400 line-clamp-1 mt-0.5">
                        <HighlightedText text={summaryPlain} query={query} />
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
