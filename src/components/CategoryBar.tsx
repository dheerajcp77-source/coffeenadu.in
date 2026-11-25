import {
  Building2,
  CloudSun,
  Film,
  Globe,
  GraduationCap,
  HeartPulse,
  Landmark,
  MapPin,
  Megaphone,
  Mountain,
  Newspaper,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Theater,
  Trophy,
  Vote,
  X,
} from 'lucide-react';
import koppaLandscapeImg from '../assets/images/koppa_town_landscape_1794709366123.jpg';
import { KOPPA_PLACE_OPTIONS, NEWS_CATEGORIES } from '../constants/newsData';
import type { FilterCategory, NewsCategory } from '../types/news';

interface CategoryBarProps {
  activeCategory: FilterCategory;
  isAdsView?: boolean;
  onSelectCategory: (category: FilterCategory) => void;
  onJumpToAds?: () => void;
  selectedLocation: string;
  onSelectLocation: (location: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenAdvancedSearch?: () => void;
}

const ALL_TABS: FilterCategory[] = ['All', ...NEWS_CATEGORIES];

function renderCategoryIcon(category: FilterCategory) {
  switch (category) {
    case 'All':
      return <Newspaper className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Local':
      return <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Malnad':
      return <Mountain className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Agriculture':
      return <Sprout className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Health':
      return <HeartPulse className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Entertainment':
      return <Film className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Crime':
      return <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'General':
      return <Newspaper className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Politics':
      return <Vote className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Sports':
      return <Trophy className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Special':
      return <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'State':
      return <Building2 className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Nation':
      return <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Civic & Roads':
      return <Landmark className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Education':
      return <GraduationCap className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Culture':
      return <Theater className="w-4 h-4 shrink-0" aria-hidden="true" />;
  }
}

export function getCategoryLabel(category: FilterCategory): string {
  if (category === 'All') return 'All News';
  return category;
}

export function getCategoryShortIcon(category: NewsCategory) {
  return renderCategoryIcon(category);
}

export function CategoryBar({
  activeCategory,
  isAdsView = false,
  onSelectCategory,
  onJumpToAds,
  selectedLocation,
  onSelectLocation,
  searchQuery,
  onSearchChange,
  onOpenAdvancedSearch,
}: CategoryBarProps) {
  const formattedToday = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="bg-[#F3F6F8] dark:bg-[#0B1626] transition-colors">
      {/* Scenic Editorial Koppa & Malnad Hero Banner */}
      <section aria-label="Koppa Taluk overview" className="relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto">
          <div className="relative min-h-[185px] sm:min-h-[215px] rounded-b-[28px] overflow-hidden border-b border-slate-200/80 dark:border-slate-800 bg-[#10243D]">
            <img
              src={koppaLandscapeImg}
              alt="Koppa Taluk hills and morning road"
              referrerPolicy="no-referrer"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none opacity-85 dark:opacity-55"
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-[#10243D]/95 via-[#10243D]/85 to-[#10243D]/35"
              aria-hidden="true"
            />

            <div className="relative z-10 px-4 sm:px-8 lg:px-10 py-6 sm:py-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div className="space-y-2.5 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#D9A441] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#10243D]">
                    Malnad Edition
                  </span>
                  <span className="text-[11px] text-slate-200 font-medium">
                    Focus on your selected place across Koppa Taluk
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-[#D9A441] shrink-0" aria-hidden="true" />
                  <label htmlFor="hero-location-select" className="sr-only">
                    Select place in Kannada
                  </label>
                  <select
                    id="hero-location-select"
                    value={selectedLocation}
                    onChange={(e) => onSelectLocation(e.target.value)}
                    className="font-kannada bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl px-3 py-1.5 text-lg sm:text-2xl font-extrabold text-white tracking-tight focus:outline-none focus:ring-2 focus:ring-[#D9A441] cursor-pointer max-w-full [&>option]:text-slate-900"
                  >
                    <option value="All">ಎಲ್ಲಾ ಸ್ಥಳಗಳು (All Places)</option>
                    {KOPPA_PLACE_OPTIONS.map((place) => (
                      <option key={place.id} value={place.labelKn}>
                        {place.labelKn}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="font-kannada text-sm sm:text-base font-medium text-slate-100/95 leading-relaxed">
                  ಕೊಪ್ಪ, ಜಯಪುರ, ಶೃಂಗೇರಿ, ಬಾಳೆಹೊನ್ನೂರು, ಹರಿಹರಪುರ, ಎನ್.ಆರ್. ಪುರ, ಚಿಕ್ಕಮಗಳೂರು ಮತ್ತು ಮಲೆನಾಡು ಸುದ್ದಿಗಳು
                </p>

                <div className="inline-flex flex-wrap items-center gap-2.5 text-xs sm:text-sm font-medium text-white bg-white/12 backdrop-blur-sm border border-white/20 px-3 py-1.5 rounded-lg">
                  <CloudSun className="w-4 h-4 text-[#D9A441] shrink-0" aria-hidden="true" />
                  <span className="tabular-nums font-semibold">26°C</span>
                  <span aria-hidden="true">·</span>
                  <span>Misty &amp; Partly Cloudy</span>
                  <span aria-hidden="true" className="hidden sm:inline">·</span>
                  <span className="hidden sm:inline text-slate-200">{formattedToday}</span>
                </div>
              </div>

              {/* Search Input + Advanced Search Trigger */}
              <div className="flex items-center gap-2 w-full lg:w-[390px] shrink-0">
                <div className="relative flex-1">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search place or Kannada news"
                    aria-label="Search news"
                    className="w-full pl-9 pr-9 py-2.5 text-sm bg-white dark:bg-[#0F1E33] border border-white/25 dark:border-slate-700 rounded-xl text-[#17263A] dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D9A441] shadow-sm min-h-[44px]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => onSearchChange('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {onOpenAdvancedSearch && (
                  <button
                    type="button"
                    onClick={onOpenAdvancedSearch}
                    title="Advanced Filters (Category, Place & Time)"
                    aria-label="Open advanced search filters"
                    className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[#D9A441] hover:bg-[#E5B65C] text-[#10243D] font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="hidden sm:inline">Filter</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Horizontal Category Filter Buttons */}
      <section
        aria-label="News categories"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2"
      >
        <div
          role="tablist"
          aria-label="News categories"
          className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar"
        >
          {ALL_TABS.map((category) => {
            const isActive = !isAdsView && activeCategory === category;
            return (
              <button
                key={category}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => onSelectCategory(category)}
                className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[42px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10243D] dark:focus-visible:ring-[#D9A441] ${
                  isActive
                    ? 'bg-[#10243D] text-white border-[#10243D] dark:bg-[#D9A441] dark:text-[#10243D] dark:border-[#D9A441] shadow-xs'
                    : 'bg-white dark:bg-[#0F1E33] text-[#17263A] dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-[#10243D]/40 dark:hover:border-slate-600'
                }`}
              >
                {renderCategoryIcon(category)}
                <span>{getCategoryLabel(category)}</span>
              </button>
            );
          })}
          {onJumpToAds && (
            <button
              role="tab"
              type="button"
              aria-selected={isAdsView}
              onClick={onJumpToAds}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[42px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10243D] ${
                isAdsView
                  ? 'bg-[#10243D] text-white border-[#10243D] dark:bg-[#D9A441] dark:text-[#10243D]'
                  : 'bg-amber-50 dark:bg-amber-500/10 text-[#10243D] dark:text-amber-300 border-amber-300/80 dark:border-amber-500/30 hover:bg-amber-100/80 dark:hover:bg-amber-500/20'
              }`}
            >
              <Megaphone className="w-4 h-4 shrink-0 text-amber-700 dark:text-[#D9A441]" aria-hidden="true" />
              <span>Local Ads</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
