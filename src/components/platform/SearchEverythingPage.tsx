import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MapPin, Search, Sparkles, TrendingUp, X } from 'lucide-react';
import { PLATFORM_MODULES, PLATFORM_MODULE_MAP } from '../../constants/platformCatalog';
import { trackPlatformEvent } from '../../services/platformClient';
import type { NewsArticle } from '../../types/news';
import type {
  LocalityOption,
  PlatformLanguage,
  PlatformListing,
  PlatformModuleId,
} from '../../types/platform';
import { pickLangText, searchPlatformEverything } from '../../utils/platformHelpers';
import { PlatformIcon } from './PlatformIcon';

const RECENT_SEARCH_KEY = 'coffeenadu_recent_searches_v1';

interface SearchEverythingPageProps {
  lang: PlatformLanguage;
  initialQuery?: string;
  selectedLocation: string;
  localities: LocalityOption[];
  articles: NewsArticle[];
  listings: PlatformListing[];
  events: Array<{ id: string; title: string; location?: string; date?: string; description?: string }>;
  popularSearches: Array<{ term: string; count: number }>;
  onSelectLocation: (loc: string) => void;
  onOpenArticle: (article: NewsArticle) => void;
  onNavigateModule: (modId: PlatformModuleId, listingId?: string) => void;
  onBackHome: () => void;
}

const QUICK_SUGGESTIONS = ['Koppa', 'Sringeri', 'Coffee', 'Bus', '108', 'Seva Sindhu', 'ಕೊಪ್ಪ', 'ಅಡಿಕೆ'];

export const SearchEverythingPage: React.FC<SearchEverythingPageProps> = ({
  lang,
  initialQuery = '',
  selectedLocation,
  localities,
  articles,
  listings,
  events,
  popularSearches,
  onSelectLocation,
  onOpenArticle,
  onNavigateModule,
  onBackHome,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [moduleFilter, setModuleFilter] = useState<PlatformModuleId | 'all'>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_SEARCH_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const recordSearchTerm = (term: string) => {
    const clean = term.trim();
    if (clean.length < 2) return;
    const next = [clean, ...recentSearches.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(
      0,
      8
    );
    setRecentSearches(next);
    try {
      window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    trackPlatformEvent({ type: 'search', searchTerm: clean, location: selectedLocation });
  };

  const results = useMemo(() => {
    return searchPlatformEverything({
      query,
      moduleFilter,
      locationFilter: selectedLocation,
      articles,
      listings,
      busRoutes: [
        { id: 'koppa-smg', title: 'Koppa ↔ Shivamogga KSRTC & Private Bus Timings', routeSummary: 'Via Hariharapura, Thirthahalli, Mandagadde', location: 'Koppa' },
        { id: 'koppa-ckm', title: 'Koppa ↔ Chikkamagaluru Bus Timings', routeSummary: 'Via Jayapura, Balehonnur, Aldur', location: 'Koppa' },
        { id: 'koppa-sringeri', title: 'Koppa ↔ Sringeri ↔ Mangaluru Bus Timings', routeSummary: 'Via Jayapura, Sringeri, Karkala', location: 'Sringeri' },
      ],
      events,
      limit: 60,
    });
  }, [query, moduleFilter, selectedLocation, articles, listings, events]);

  const handleOpenResult = (res: (typeof results)[number]) => {
    if (query.trim().length >= 2) recordSearchTerm(query);
    if (res.module === 'news' && res.articleId) {
      const found = articles.find((a) => a.id === res.articleId);
      if (found) {
        onOpenArticle(found);
        return;
      }
    }
    onNavigateModule(res.module, res.listingId);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{pickLangText('ಮುಖಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ', 'Back to Home', lang)}</span>
        </button>

        <div>
          <h1 className="font-kannada text-xl sm:text-2xl font-extrabold text-[#10243D] dark:text-white">
            {pickLangText('ಮಲೆನಾಡಿನ ಎಲ್ಲವನ್ನೂ ಹುಡುಕಿ', 'Search Everything on Coffeenadu', lang)}
          </h1>
          <p className="text-xs sm:text-sm text-[#5A677A] dark:text-slate-300 font-kannada mt-0.5">
            {pickLangText(
              'ಸುದ್ದಿ, ವ್ಯಾಪಾರ, ಉದ್ಯೋಗ, ಖರೀದಿ-ಮಾರಾಟ, ಬಸ್ ಸಮಯ, ಆಸ್ಪತ್ರೆ, ಪ್ರವಾಸಿ ತಾಣ, ಯೋಜನೆ ಮತ್ತು ಸಹಾಯವಾಣಿ — ಒಂದೇ ಹುಡುಕಾಟದಲ್ಲಿ',
              'Unified bilingual search across News, Businesses, Jobs, Marketplace, Bus Routes, Hospitals, Tourism, Schemes & Contacts',
              lang
            )}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            recordSearchTerm(query);
          }}
          className="grid grid-cols-1 md:grid-cols-12 gap-3"
        >
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={pickLangText(
                'ಕನ್ನಡ ಅಥವಾ English ನಲ್ಲಿ ಹುಡುಕಿ (ಉದಾ: ಕೊಪ್ಪ, ಬಸ್, Coffee, 108)...',
                'Type in Kannada or English (e.g., Koppa, Bus, Coffee, Hospital)...',
                lang
              )}
              className="w-full pl-10 pr-9 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-sm text-[#10243D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="md:col-span-3">
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value as PlatformModuleId | 'all')}
              className="w-full px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-sm font-medium text-[#10243D] dark:text-white"
            >
              <option value="all">{pickLangText('ಎಲ್ಲಾ ವಿಭಾಗಗಳು', 'All Modules', lang)}</option>
              {PLATFORM_MODULES.filter((m) => m.id !== 'account').map((m) => (
                <option key={m.id} value={m.id}>
                  {pickLangText(m.titleKn, m.titleEn, lang)}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={selectedLocation}
              onChange={(e) => onSelectLocation(e.target.value)}
              className="w-full px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-sm font-medium text-[#10243D] dark:text-white"
            >
              <option value="all">{pickLangText('ಎಲ್ಲಾ ಊರುಗಳು', 'All Locations', lang)}</option>
              {localities.map((l) => (
                <option key={l.id} value={l.nameEn}>
                  {l.nameEn} ({l.nameKn})
                </option>
              ))}
            </select>
          </div>
        </form>

        {/* Recent & Popular Searches */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="inline-flex items-center gap-1 font-bold text-[#5A677A] dark:text-slate-400">
            <TrendingUp className="w-3.5 h-3.5 text-[#176B4A]" />
            {pickLangText('ಜನಪ್ರಿಯ ಹುಡುಕಾಟ:', 'Try:', lang)}
          </span>
          {(popularSearches.length > 0
            ? popularSearches.map((s) => s.term)
            : QUICK_SUGGESTIONS
          ).map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => {
                setQuery(term);
                recordSearchTerm(term);
              }}
              className="px-2.5 py-1 rounded-lg bg-[#F3F6F8] dark:bg-slate-800 hover:bg-[#176B4A] hover:text-white text-[#10243D] dark:text-slate-200 font-medium cursor-pointer transition-colors"
            >
              {term}
            </button>
          ))}
          {recentSearches.length > 0 && (
            <>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="font-semibold text-slate-500">
                {pickLangText('ಇತ್ತೀಚಿನ:', 'Recent:', lang)}
              </span>
              {recentSearches.slice(0, 4).map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="text-[#176B4A] dark:text-[#D9A441] hover:underline font-semibold cursor-pointer"
                >
                  {term}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="space-y-3">
        <div className="text-xs font-bold text-[#5A677A] dark:text-slate-400 px-1">
          {results.length} {pickLangText('ಫಲಿತಾಂಶಗಳು ಲಭ್ಯವಿವೆ', 'matching results', lang)}
        </div>

        {results.length === 0 ? (
          <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <Sparkles className="w-7 h-7 mx-auto text-[#D9A441]" />
            <h2 className="font-kannada text-base font-bold text-[#10243D] dark:text-white">
              {pickLangText('ಯಾವುದೇ ಫಲಿತಾಂಶ ಕಂಡುಬಂದಿಲ್ಲ', 'No matching results found', lang)}
            </h2>
            <p className="text-xs text-[#5A677A] dark:text-slate-400 max-w-md mx-auto">
              {pickLangText(
                'ಬೇರೆ ಪದ ಬಳಸಿ ಹುಡುಕಿ ಅಥವಾ “ಎಲ್ಲಾ ಊರುಗಳು” ಆಯ್ಕೆ ಮಾಡಿ ಪ್ರಯತ್ನಿಸಿ.',
                'Try shorter keywords, switch location to "All Locations", or explore all 22 Malnad modules.',
                lang
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {results.map((item) => {
              const mod = PLATFORM_MODULE_MAP[item.module];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenResult(item)}
                  className="text-left bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 hover:border-[#176B4A] rounded-2xl p-4 flex items-start gap-3.5 transition-colors cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#F3F6F8] dark:bg-slate-800 text-[#176B4A] dark:text-[#D9A441] flex items-center justify-center shrink-0">
                    <PlatformIcon icon={mod.icon} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-[11px] font-semibold text-[#5A677A] dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span className="text-[#176B4A] dark:text-[#D9A441] font-bold">
                        {pickLangText(mod.titleKn, mod.titleEn, lang)}
                      </span>
                      {item.location && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" />
                            {item.location}
                          </span>
                        </>
                      )}
                      {item.priceLabel && (
                        <>
                          <span>·</span>
                          <span className="font-bold text-[#10243D] dark:text-white">
                            {item.priceLabel}
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="font-kannada text-sm font-bold text-[#10243D] dark:text-white group-hover:text-[#176B4A] line-clamp-2">
                      {item.title}
                    </h3>
                    {item.summary && (
                      <p className="text-xs text-[#5A677A] dark:text-slate-400 font-kannada line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
