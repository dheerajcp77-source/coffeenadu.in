import React from 'react';
import {
  ArrowRight,
  Compass,
  MapPin,
  Phone,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { PLATFORM_MODULE_MAP } from '../../constants/platformCatalog';
import type {
  HomepageSectionConfig,
  LocalityOption,
  PlatformLanguage,
  PlatformListing,
  PlatformModuleId,
  WeatherRainfallRecord,
} from '../../types/platform';
import {
  getOrderedEnabledHomepageSections,
  matchesLocality,
  pickLangText,
} from '../../utils/platformHelpers';
import { PlatformIcon } from './PlatformIcon';

const QUICK_ACCESS_MODULES: PlatformModuleId[] = [
  'businesses',
  'jobs',
  'marketplace',
  'agriculture',
  'transport',
  'health',
  'schemes',
  'education',
  'tourism',
  'property',
  'services',
  'contacts',
];

interface PlatformHomepageTopBarProps {
  lang: PlatformLanguage;
  selectedLocation: string;
  localities: LocalityOption[];
  moduleCounts: Record<string, number>;
  onSelectLocation: (loc: string) => void;
  onToggleLang: (next: PlatformLanguage) => void;
  onOpenSearch: (initialQuery?: string) => void;
  onNavigateModule: (modId: PlatformModuleId) => void;
  onExploreAll: () => void;
}

export const PlatformHomepageTopBar: React.FC<PlatformHomepageTopBarProps> = ({
  lang,
  selectedLocation,
  localities,
  moduleCounts,
  onSelectLocation,
  onToggleLang,
  onOpenSearch,
  onNavigateModule,
  onExploreAll,
}) => {
  const [quickQuery, setQuickQuery] = React.useState('');

  return (
    <section
      aria-label="Coffeenadu Malnad Platform Hub"
      className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4"
    >
      {/* Top Row: Regional Identity + Location Selector + Language Switch + Global Search */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#176B4A] dark:text-[#D9A441]">
            {pickLangText(
              'ಮಲೆನಾಡು ಸಮಗ್ರ ಡಿಜಿಟಲ್ ವೇದಿಕೆ · ಕೊಪ್ಪ · ಜಯಪುರ · ಶೃಂಗೇರಿ · ಬಾಳೆಹೊನ್ನೂರು',
              'Malnad Regional Digital Platform · Koppa · Jayapura · Sringeri · Balehonnur',
              lang
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onOpenSearch(quickQuery);
            }}
            className="mt-2 flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                placeholder={pickLangText(
                  'ಸುದ್ದಿ, ವ್ಯಾಪಾರ, ಉದ್ಯೋಗ, ಬಸ್ ಸಮಯ, ಆಸ್ಪತ್ರೆ, ಯೋಜನೆ ಹುಡುಕಿ...',
                  'Search news, businesses, jobs, bus timings, hospitals, schemes...',
                  lang
                )}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-xs sm:text-sm text-[#10243D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-[#10243D] hover:bg-[#1A355B] text-white text-xs font-bold shrink-0 cursor-pointer min-h-[42px]"
            >
              {pickLangText('ಹುಡುಕಿ', 'Search', lang)}
            </button>
          </form>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          <div className="relative flex-1 sm:flex-initial">
            <MapPin className="w-3.5 h-3.5 text-[#176B4A] dark:text-[#D9A441] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedLocation}
              onChange={(e) => onSelectLocation(e.target.value)}
              aria-label="Select Malnad town"
              className="w-full sm:w-44 pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-xs font-bold text-[#10243D] dark:text-white min-h-[42px]"
            >
              <option value="all">{pickLangText('ಎಲ್ಲಾ ಮಲೆನಾಡು', 'All Malnad', lang)}</option>
              {localities.map((loc) => (
                <option key={loc.id} value={loc.nameEn}>
                  {pickLangText(loc.nameKn, loc.nameEn, lang)}
                </option>
              ))}
            </select>
          </div>

          <div
            className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 p-0.5 min-h-[42px] items-center"
            role="group"
            aria-label="Language switcher"
          >
            <button
              type="button"
              onClick={() => onToggleLang('kn')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                lang === 'kn'
                  ? 'bg-[#176B4A] text-white'
                  : 'text-[#475569] dark:text-slate-300'
              }`}
            >
              ಕನ್ನಡ
            </button>
            <button
              type="button"
              onClick={() => onToggleLang('en')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                lang === 'en'
                  ? 'bg-[#176B4A] text-white'
                  : 'text-[#475569] dark:text-slate-300'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </div>

      {/* Quick-Access Service Categories Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {QUICK_ACCESS_MODULES.map((modId) => {
          const mod = PLATFORM_MODULE_MAP[modId];
          const count = moduleCounts[modId];
          return (
            <button
              key={modId}
              type="button"
              onClick={() => onNavigateModule(modId)}
              className="text-left p-2.5 sm:p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-[#FAFBFC] dark:bg-slate-900/50 hover:border-[#176B4A] dark:hover:border-[#D9A441] hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer group flex flex-col justify-between gap-1.5"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="w-7 h-7 rounded-lg bg-[#176B4A]/10 dark:bg-[#176B4A]/25 text-[#176B4A] dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <PlatformIcon icon={mod.icon} className="w-4 h-4" />
                </span>
                {typeof count === 'number' && count > 0 && (
                  <span className="text-[10px] font-bold text-[#64748B] dark:text-slate-400">
                    {count}
                  </span>
                )}
              </div>
              <div className="font-kannada text-[11px] sm:text-xs font-bold text-[#10243D] dark:text-white group-hover:text-[#176B4A] dark:group-hover:text-[#D9A441] leading-tight line-clamp-2">
                {pickLangText(mod.titleKn, mod.titleEn, lang)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-[#5A677A] dark:text-slate-400 font-kannada">
          <button
            type="button"
            onClick={() => onNavigateModule('weather')}
            className="hover:text-[#176B4A] dark:hover:text-[#D9A441] font-semibold cursor-pointer"
          >
            {pickLangText('ಹವಾಮಾನ & ಮಳೆ', 'Weather & Rainfall', lang)}
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onNavigateModule('games')}
            className="hover:text-[#176B4A] dark:hover:text-[#D9A441] font-semibold cursor-pointer"
          >
            {pickLangText('ಮಲೆನಾಡು ಕ್ವಿಜ್', 'Malnad Quizzes', lang)}
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onNavigateModule('offers')}
            className="hover:text-[#176B4A] dark:hover:text-[#D9A441] font-semibold cursor-pointer"
          >
            {pickLangText('ಸ್ಥಳೀಯ ಆಫರ್', 'Local Offers', lang)}
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onNavigateModule('grievances')}
            className="hover:text-[#176B4A] dark:hover:text-[#D9A441] font-semibold cursor-pointer"
          >
            {pickLangText('ಕುಂದುಕೊರತೆ', 'Grievances', lang)}
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onNavigateModule('documents')}
            className="hover:text-[#176B4A] dark:hover:text-[#D9A441] font-semibold cursor-pointer"
          >
            {pickLangText('ದಾಖಲೆಗಳು', 'Documents', lang)}
          </button>
        </div>

        <button
          type="button"
          onClick={onExploreAll}
          className="inline-flex items-center gap-1 font-bold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>{pickLangText('ಎಲ್ಲಾ 22 ವಿಭಾಗಗಳು →', 'All 22 Services →', lang)}</span>
        </button>
      </div>
    </section>
  );
};

interface PlatformHomepageEcosystemGridProps {
  lang: PlatformLanguage;
  selectedLocation: string;
  sections: HomepageSectionConfig[];
  listings: PlatformListing[];
  moduleCounts: Record<string, number>;
  weatherLogs: WeatherRainfallRecord[];
  activeQuizCount: number;
  popularSearches: Array<{ term: string; count: number }>;
  onNavigateModule: (modId: PlatformModuleId, listingId?: string) => void;
  onOpenSearch: (query?: string) => void;
}

export const PlatformHomepageEcosystemGrid: React.FC<PlatformHomepageEcosystemGridProps> = ({
  lang,
  selectedLocation,
  sections,
  listings,
  moduleCounts,
  weatherLogs,
  activeQuizCount,
  popularSearches,
  onNavigateModule,
  onOpenSearch,
}) => {
  const ordered = getOrderedEnabledHomepageSections(sections);

  return (
    <section
      aria-label="Malnad Digital Services Directory"
      className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800 space-y-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#176B4A] dark:text-[#D9A441]">
            {pickLangText('ಕಾಫಿನಾಡು ಮಲೆನಾಡು ಇಕೋಸಿಸ್ಟಮ್', 'Coffeenadu Regional Ecosystem', lang)}
          </p>
          <h2 className="font-kannada text-xl sm:text-2xl font-extrabold text-[#10243D] dark:text-white mt-0.5">
            {pickLangText(
              'ಮಲೆನಾಡಿನ ಸೇವೆಗಳು, ವ್ಯಾಪಾರ, ಉದ್ಯೋಗ ಮತ್ತು ನಾಗರಿಕ ಮಾಹಿತಿ',
              'Malnad Services, Commerce, Jobs & Civic Hub',
              lang
            )}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {ordered.map((sec) => {
          const mod = PLATFORM_MODULE_MAP[sec.module];
          if (!mod) return null;

          const modListings = listings
            .filter(
              (l) =>
                l.module === sec.module &&
                l.status === 'approved' &&
                matchesLocality(l.location, selectedLocation)
            )
            .slice(0, Math.min(sec.maxItems, 3));

          const totalApprovedInModule = listings.filter(
            (l) => l.module === sec.module && l.status === 'approved'
          ).length;

          const realCount =
            sec.module === 'games'
              ? activeQuizCount
              : sec.module === 'weather'
                ? weatherLogs.length
                : Math.max(moduleCounts[sec.module] ?? 0, totalApprovedInModule);

          return (
            <div
              key={sec.id}
              className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#176B4A]/10 dark:bg-[#176B4A]/25 text-[#176B4A] dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <PlatformIcon icon={mod.icon} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-kannada text-base font-extrabold text-[#10243D] dark:text-white leading-snug">
                        {pickLangText(sec.titleKn, sec.titleEn, lang)}
                      </h3>
                      <p className="text-xs text-[#5A677A] dark:text-slate-400 font-kannada line-clamp-1">
                        {pickLangText(sec.descriptionKn, sec.descriptionEn, lang)}
                      </p>
                    </div>
                  </div>
                  {mod.isDirectoryModule && (
                    <span className="text-[11px] font-bold text-[#64748B] dark:text-slate-400 shrink-0">
                      {realCount}
                    </span>
                  )}
                </div>

                {modListings.length > 0 ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {modListings.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onNavigateModule(sec.module, item.id)}
                        className="w-full text-left py-2.5 flex items-center justify-between gap-3 hover:text-[#176B4A] dark:hover:text-[#D9A441] transition-colors cursor-pointer group"
                      >
                        <div className="min-w-0">
                          <div className="font-kannada text-xs sm:text-sm font-bold text-[#10243D] dark:text-slate-100 group-hover:text-[#176B4A] dark:group-hover:text-[#D9A441] truncate">
                            {lang === 'en' && item.titleEn ? item.titleEn : item.title}
                          </div>
                          <div className="text-[11px] text-[#64748B] dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>{item.location}</span>
                            {item.phone && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-0.5">
                                  <Phone className="w-2.5 h-2.5" />
                                  {item.phone}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#176B4A] shrink-0" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-3 px-3.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-900/60 text-xs text-[#5A677A] dark:text-slate-400 font-kannada flex items-center justify-between gap-2">
                    <span>
                      {sec.module === 'transport'
                        ? pickLangText(
                            'ಕೊಪ್ಪ, ಜಯಪುರ, ಶೃಂಗೇರಿ, ಶಿವಮೊಗ್ಗ ಮತ್ತು ಚಿಕ್ಕಮಗಳೂರು ಬಸ್ ವೇಳಾಪಟ್ಟಿ ನೋಡಿ',
                            'Browse live KSRTC & private Malnad bus schedules and AI route helper',
                            lang
                          )
                        : sec.module === 'games'
                          ? pickLangText(
                              `${activeQuizCount} ಸಕ್ರಿಯ ಮಲೆನಾಡು ಕ್ವಿಜ್ & ಕನ್ನಡ ಪದ ಆಟ ಲಭ್ಯವಿದೆ`,
                              `${activeQuizCount} active Malnad trivia quizzes & Kannada word puzzles ready`,
                              lang
                            )
                          : sec.module === 'weather'
                            ? pickLangText(
                                'ಸ್ಥಳೀಯ ಮಳೆ ಮಾಪನ ದಾಖಲೆ ಮತ್ತು ಹವಾಮಾನ ಎಚ್ಚರಿಕೆ ವಿಭಾಗ ತೆರೆಯಿರಿ',
                                'Open Malnad rainfall station logs and weather status',
                                lang
                              )
                            : pickLangText(
                                'ಈ ವಿಭಾಗದಲ್ಲಿ ಹೊಸ ಸ್ಥಳೀಯ ಮಾಹಿತಿ ನೋಡಿ ಅಥವಾ ಉಚಿತವಾಗಿ ಸಲ್ಲಿಸಿ',
                                'Open section to browse verified updates or submit your listing',
                                lang
                              )}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => onNavigateModule(sec.module)}
                  className="inline-flex items-center gap-1.5 font-bold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
                >
                  <span>
                    {pickLangText(
                      `${mod.titleKn} ತೆರೆಯಿರಿ`,
                      `Explore ${mod.titleEn}`,
                      lang
                    )}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                {mod.allowPublicSubmission && (
                  <button
                    type="button"
                    onClick={() => onNavigateModule(sec.module)}
                    className="text-[11px] font-semibold text-[#5A677A] dark:text-slate-400 hover:text-[#10243D] dark:hover:text-white cursor-pointer"
                  >
                    {pickLangText('+ ಸಲ್ಲಿಸಿ', '+ Submit', lang)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Popular Searches Bar */}
      <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-extrabold text-[#10243D] dark:text-white">
            <TrendingUp className="w-4 h-4 text-[#176B4A]" />
            {pickLangText('ಜನಪ್ರಿಯ ಹುಡುಕಾಟಗಳು:', 'Popular Searches:', lang)}
          </span>
          {(popularSearches.length > 0
            ? popularSearches.map((s) => s.term)
            : ['Koppa Bus', 'Sringeri', 'Coffee', 'Seva Sindhu', '108 Ambulance', 'Arecanut', 'Jobs']
          ).map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => onOpenSearch(term)}
              className="px-3 py-1.5 rounded-lg bg-[#F3F6F8] dark:bg-slate-800 hover:bg-[#176B4A] hover:text-white text-[#10243D] dark:text-slate-200 font-semibold transition-colors cursor-pointer"
            >
              {term}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onOpenSearch('')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{pickLangText('ಎಲ್ಲವನ್ನೂ ಹುಡುಕಿ', 'Search Everything', lang)}</span>
        </button>
      </div>
    </section>
  );
};
