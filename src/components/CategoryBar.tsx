import React, { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  Building2,
  Calendar,
  Car,
  ChevronDown,
  CloudSun,
  Compass,
  Film,
  Flag,
  Globe,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  LayoutGrid,
  MapPin,
  Megaphone,
  Mountain,
  Newspaper,
  PhoneCall,
  Route,
  Search,
  SearchCheck,
  ShieldAlert,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Store,
  Tag,
  Theater,
  Trophy,
  Users,
  Vote,
  Wrench,
  X,
} from 'lucide-react';
import koppaLandscapeImg from '../assets/images/koppa_town_landscape_1794709366123.jpg';
import { KOPPA_PLACE_OPTIONS } from '../constants/newsData';
import { DEFAULT_FEED_CATEGORIES } from '../constants/platformCatalog';
import type { FilterCategory, NewsCategory } from '../types/news';
import type {
  FeedCategoryConfig,
  FeedCategoryId,
  PlatformLanguage,
  WeatherRainfallRecord,
} from '../types/platform';
import { getOrderedEnabledFeedCategories } from '../utils/unifiedFeedHelpers';

interface CategoryBarProps {
  /** Legacy News FilterCategory support (preserved for any callers) */
  activeCategory?: FilterCategory;
  onSelectCategory?: (category: FilterCategory) => void;
  /** Unified 31-Category Community Feed Filter */
  feedCategories?: FeedCategoryConfig[];
  activeFeedCategory: FeedCategoryId;
  onSelectFeedCategory: (categoryId: FeedCategoryId) => void;
  showCategoryGrid?: boolean;
  language?: PlatformLanguage;
  isAdsView?: boolean;
  onJumpToAds?: () => void;
  selectedLocation: string;
  onSelectLocation: (location: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenAdvancedSearch?: () => void;
  latestWeather?: WeatherRainfallRecord | null;
  /** Optional slot rendered between Hero/Search and the 31-Category Grid (e.g. Community Invitation Banner) */
  bannerSlot?: React.ReactNode;
}

function renderNewsCategoryIcon(category: FilterCategory) {
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
      return <Route className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Education':
      return <GraduationCap className="w-4 h-4 shrink-0" aria-hidden="true" />;
    case 'Culture':
      return <Theater className="w-4 h-4 shrink-0" aria-hidden="true" />;
  }
}

export const FEED_CATEGORY_ICON_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'layout-grid', label: 'Grid (All)' },
  { key: 'newspaper', label: 'Newspaper' },
  { key: 'map-pin', label: 'Location Pin' },
  { key: 'mountain', label: 'Malnad / Hills' },
  { key: 'sprout', label: 'Agriculture' },
  { key: 'shopping-bag', label: 'Buy & Sell' },
  { key: 'store', label: 'Shops & Business' },
  { key: 'briefcase', label: 'Jobs' },
  { key: 'home', label: 'Property' },
  { key: 'car', label: 'Vehicles' },
  { key: 'search-check', label: 'Lost & Found' },
  { key: 'wrench', label: 'Local Services' },
  { key: 'graduation-cap', label: 'Education' },
  { key: 'heart-pulse', label: 'Health' },
  { key: 'calendar', label: 'Events' },
  { key: 'compass', label: 'Tourism' },
  { key: 'users', label: 'Community' },
  { key: 'megaphone', label: 'Public Info' },
  { key: 'tag', label: 'Offers & Deals' },
  { key: 'landmark', label: 'Govt Schemes' },
  { key: 'phone-call', label: 'Contacts / Helpline' },
  { key: 'film', label: 'Entertainment' },
  { key: 'shield-alert', label: 'Crime / Safety' },
  { key: 'vote', label: 'Politics' },
  { key: 'trophy', label: 'Sports' },
  { key: 'theater', label: 'Culture' },
  { key: 'route', label: 'Civic & Roads' },
  { key: 'sparkles', label: 'Special Stories' },
  { key: 'building-2', label: 'State' },
  { key: 'flag', label: 'Nation' },
  { key: 'globe', label: 'General / World' },
];

export function renderFeedCategoryIcon(iconKey: string) {
  const cls = 'w-4 h-4 shrink-0';
  switch (iconKey) {
    case 'layout-grid':
      return <LayoutGrid className={cls} aria-hidden="true" />;
    case 'newspaper':
      return <Newspaper className={cls} aria-hidden="true" />;
    case 'map-pin':
      return <MapPin className={cls} aria-hidden="true" />;
    case 'mountain':
      return <Mountain className={cls} aria-hidden="true" />;
    case 'sprout':
      return <Sprout className={cls} aria-hidden="true" />;
    case 'heart-pulse':
      return <HeartPulse className={cls} aria-hidden="true" />;
    case 'film':
      return <Film className={cls} aria-hidden="true" />;
    case 'shield-alert':
      return <ShieldAlert className={cls} aria-hidden="true" />;
    case 'globe':
      return <Globe className={cls} aria-hidden="true" />;
    case 'users':
      return <Users className={cls} aria-hidden="true" />;
    case 'shopping-bag':
      return <ShoppingBag className={cls} aria-hidden="true" />;
    case 'briefcase':
      return <Briefcase className={cls} aria-hidden="true" />;
    case 'store':
      return <Store className={cls} aria-hidden="true" />;
    case 'calendar':
      return <Calendar className={cls} aria-hidden="true" />;
    case 'graduation-cap':
      return <GraduationCap className={cls} aria-hidden="true" />;
    case 'compass':
      return <Compass className={cls} aria-hidden="true" />;
    case 'home':
      return <Home className={cls} aria-hidden="true" />;
    case 'car':
      return <Car className={cls} aria-hidden="true" />;
    case 'search-check':
      return <SearchCheck className={cls} aria-hidden="true" />;
    case 'megaphone':
      return <Megaphone className={cls} aria-hidden="true" />;
    case 'wrench':
      return <Wrench className={cls} aria-hidden="true" />;
    case 'landmark':
      return <Landmark className={cls} aria-hidden="true" />;
    case 'tag':
      return <Tag className={cls} aria-hidden="true" />;
    case 'phone-call':
      return <PhoneCall className={cls} aria-hidden="true" />;
    case 'vote':
      return <Vote className={cls} aria-hidden="true" />;
    case 'trophy':
      return <Trophy className={cls} aria-hidden="true" />;
    case 'theater':
      return <Theater className={cls} aria-hidden="true" />;
    case 'route':
      return <Route className={cls} aria-hidden="true" />;
    case 'sparkles':
      return <Sparkles className={cls} aria-hidden="true" />;
    case 'building-2':
      return <Building2 className={cls} aria-hidden="true" />;
    case 'flag':
      return <Flag className={cls} aria-hidden="true" />;
    default:
      return <LayoutGrid className={cls} aria-hidden="true" />;
  }
}

export function getCategoryLabel(category: FilterCategory): string {
  if (category === 'All') return 'All News';
  return category;
}

export function getCategoryShortIcon(category: NewsCategory) {
  return renderNewsCategoryIcon(category);
}

export const PUBLISHED_NEWS_CATEGORY_IDS: ReadonlySet<FeedCategoryId> = new Set<FeedCategoryId>([
  'news',
  'local',
  'malnad',
  'politics',
  'health',
  'education',
  'agriculture',
  'sports',
  'crime',
  'entertainment',
  'culture',
  'civic-roads',
  'special',
  'state',
  'nation',
  'general',
]);

export function CategoryBar({
  feedCategories,
  activeFeedCategory,
  onSelectFeedCategory,
  showCategoryGrid = true,
  language = 'kn',
  isAdsView = false,
  selectedLocation,
  onSelectLocation,
  searchQuery,
  onSearchChange,
  onOpenAdvancedSearch,
  latestWeather,
  bannerSlot,
}: CategoryBarProps) {
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const lastToggleAtRef = useRef(0);
  const newsScrollRef = useRef<HTMLDivElement | null>(null);

  // Smooth scroll-collapse for the scenic Malnad hero banner with hysteresis so there is zero flicker.
  useEffect(() => {
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        const now = Date.now();
        if (now - lastToggleAtRef.current < 280) return;

        if (!collapsedRef.current && y > 130) {
          collapsedRef.current = true;
          lastToggleAtRef.current = now;
          setHeroCollapsed(true);
        } else if (collapsedRef.current && y < 48) {
          collapsedRef.current = false;
          lastToggleAtRef.current = now;
          setHeroCollapsed(false);
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const visibleCategories = getOrderedEnabledFeedCategories(
    feedCategories && feedCategories.length > 0 ? feedCategories : DEFAULT_FEED_CATEGORIES
  );

  // Separate Published News categories (horizontal bar ABOVE) from Community categories (responsive grid BELOW)
  const newsCategories = visibleCategories.filter((cat) => PUBLISHED_NEWS_CATEGORY_IDS.has(cat.id));
  const communityCategories = visibleCategories.filter(
    (cat) => !PUBLISHED_NEWS_CATEGORY_IDS.has(cat.id)
  );

  const scrollNewsStrip = (direction: 'left' | 'right') => {
    const el = newsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -280 : 280, behavior: 'smooth' });
  };

  const formattedToday = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const weatherTemp =
    latestWeather?.tempMaxC !== undefined && latestWeather?.tempMaxC !== null
      ? `${latestWeather.tempMaxC}°C`
      : '26°C';
  const weatherDesc =
    language === 'kn'
      ? latestWeather?.conditionKn || 'ಮಂಜು ಮತ್ತು ಭಾಗಶಃ ಮೋಡ'
      : latestWeather?.conditionEn || 'Misty & Partly Cloudy';

  return (
    <div className="bg-[#FBF9F5] dark:bg-[#11100E] transition-colors">
      {/* Collapsible Scenic Malnad Hero Banner (Warm Obsidian & Golden-Hour Bronze Scrim) */}
      <div
        data-testid="malnad-hero-wrapper"
        data-collapsed={heroCollapsed ? 'true' : 'false'}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          heroCollapsed ? 'grid-rows-[0fr] opacity-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100'
        }`}
      >
        <section
          aria-label="Koppa and Malnad overview"
          aria-hidden={heroCollapsed}
          className="overflow-hidden min-h-0"
        >
          <div className="relative max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 sm:pt-3">
            <div className="relative min-h-[168px] sm:min-h-[192px] sm:rounded-2xl overflow-hidden border-b sm:border border-[#D4A238]/35 dark:border-[#3A3122] bg-[#1C1814] shadow-xs">
              <img
                src={koppaLandscapeImg}
                alt="Koppa Taluk hills and morning road"
                referrerPolicy="no-referrer"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
                className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none opacity-55 dark:opacity-40"
              />
              <div
                className="absolute inset-0 bg-gradient-to-r from-[#1A1510]/95 via-[#2A2116]/84 to-[#42321B]/50"
                aria-hidden="true"
              />

              <div className="relative z-10 px-4 sm:px-7 lg:px-9 py-5 sm:py-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs font-semibold text-[#F4ECDC]">
                    <span className="text-[#E9BE5F] font-extrabold uppercase tracking-wider">
                      {language === 'kn' ? 'ಮಲೆನಾಡು ಡಿಜಿಟಲ್ ವೇದಿಕೆ' : 'Malnad Digital Community'}
                    </span>
                    <span aria-hidden="true" className="text-[#E9BE5F]/45">
                      ·
                    </span>
                    <span>
                      {language === 'kn'
                        ? 'ಕೊಪ್ಪ, ಜಯಪುರ, ಹರಿಹರಪುರ, ಶೃಂಗೇರಿ, ಬಾಳೆಹೊನ್ನೂರು & ಎನ್.ಆರ್. ಪುರ'
                        : 'Koppa, Jayapura, Hariharapura, Sringeri, Balehonnur & N.R. Pura'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#E9BE5F] shrink-0" aria-hidden="true" />
                    <label htmlFor="hero-location-select" className="sr-only">
                      Select place in Malnad
                    </label>
                    <select
                      id="hero-location-select"
                      value={selectedLocation}
                      onChange={(e) => onSelectLocation(e.target.value)}
                      className="font-kannada bg-[#1C1712]/85 hover:bg-[#1C1712] border border-[#E9BE5F]/35 rounded-xl px-3 py-1.5 text-base sm:text-lg font-extrabold text-white tracking-tight focus:outline-none focus:ring-2 focus:ring-[#E2B44B] cursor-pointer max-w-full [&>option]:bg-white [&>option]:text-[#1C1917]"
                    >
                      <option value="All">ಎಲ್ಲಾ ಸ್ಥಳಗಳು (All Places)</option>
                      {KOPPA_PLACE_OPTIONS.map((place) => (
                        <option key={place.id} value={place.labelKn}>
                          {place.labelKn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="inline-flex flex-wrap items-center gap-2 text-xs sm:text-sm font-medium text-[#FAF5EA] bg-[#181410]/65 backdrop-blur-xs border border-[#E9BE5F]/25 px-3 py-1.5 rounded-lg">
                    <CloudSun className="w-4 h-4 text-[#E9BE5F] shrink-0" aria-hidden="true" />
                    <span className="tabular-nums font-bold">{weatherTemp}</span>
                    <span aria-hidden="true">·</span>
                    <span className={language === 'kn' ? 'font-kannada' : ''}>{weatherDesc}</span>
                    <span aria-hidden="true" className="hidden sm:inline">
                      ·
                    </span>
                    <span className="hidden sm:inline text-[#DDD2BE]">{formattedToday}</span>
                  </div>
                </div>

                {/* Main Search Input + Filter Button */}
                <div className="flex items-center gap-2 w-full lg:w-[400px] shrink-0">
                  <div className="relative flex-1">
                    <Search
                      className="w-4 h-4 text-[#7D7265] dark:text-[#A89F91] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => onSearchChange(e.target.value)}
                      placeholder={
                        language === 'kn'
                          ? 'ಸುದ್ದಿ, ಅಂಗಡಿ, ವಸ್ತು, ಉದ್ಯೋಗ ಹುಡುಕಿ...'
                          : 'Search news, shops, items, jobs...'
                      }
                      aria-label="Search Coffeenadu community"
                      className="w-full pl-9 pr-9 py-2.5 text-sm bg-[#FBF9F5] dark:bg-[#1B1815] border border-[#E0D5BE] dark:border-[#3A3227] rounded-xl text-[#1C1917] dark:text-[#FBF9F5] placeholder:text-[#7D7265] dark:placeholder:text-[#A89F91] focus:outline-none focus:ring-2 focus:ring-[#D4A238] shadow-xs min-h-[44px]"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => onSearchChange('')}
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#7D7265] hover:text-[#1C1917] dark:text-[#A89F91] dark:hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {onOpenAdvancedSearch && (
                    <button
                      type="button"
                      onClick={onOpenAdvancedSearch}
                      title="Advanced Search & Filters"
                      aria-label="Open advanced search filters"
                      className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-gradient-to-r from-[#D4A238] to-[#E6BC5C] hover:from-[#E0B148] hover:to-[#F0CA70] text-[#181512] font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      <span className="hidden sm:inline">{language === 'kn' ? 'ಫಿಲ್ಟರ್' : 'Filter'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Compact inline toolbar shown ONLY when hero is collapsed */}
      {heroCollapsed && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E7DFCE] dark:border-[#2E2922] bg-white dark:bg-[#1A1815] px-3 py-2 text-xs shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-[#B8861B] dark:text-[#E2B44B] shrink-0" />
              <select
                aria-label="Quick place filter"
                value={selectedLocation}
                onChange={(e) => onSelectLocation(e.target.value)}
                className="font-kannada font-semibold text-xs bg-transparent text-[#1C1917] dark:text-[#FBF9F5] focus:outline-none cursor-pointer [&>option]:bg-white [&>option]:text-[#1C1917] dark:[&>option]:bg-[#1A1815] dark:[&>option]:text-[#FBF9F5]"
              >
                <option value="All">ಎಲ್ಲಾ ಸ್ಥಳಗಳು (All)</option>
                {KOPPA_PLACE_OPTIONS.map((place) => (
                  <option key={place.id} value={place.labelKn}>
                    {place.labelKn}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                collapsedRef.current = false;
                setHeroCollapsed(false);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#926710] dark:text-[#E2B44B] hover:underline cursor-pointer"
            >
              <ChevronDown className="w-3.5 h-3.5 rotate-180" />
              <span>{language === 'kn' ? 'ಮೇಲ್ಭಾಗಕ್ಕೆ' : 'Top Banner'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Community Invitation Banner Slot */}
      {bannerSlot}

      {/* SECTION 1 (ABOVE Community Categories): Separate Horizontal Published News Filter Bar */}
      {showCategoryGrid && newsCategories.length > 0 && (
        <section
          aria-label="Published news categories filter"
          data-testid="news-categories-horizontal-bar"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-1"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wider text-[#926710] dark:text-[#E2B44B] flex items-center gap-2">
              <span className={language === 'kn' ? 'font-kannada normal-case tracking-normal text-sm' : ''}>
                {language === 'kn' ? 'ಸುದ್ದಿ ವಿಭಾಗಗಳು' : 'News Categories'}
              </span>
              <span className="text-[#B8AD9E] dark:text-[#6E655A] font-normal" aria-hidden="true">
                ·
              </span>
              <span className="text-[11px] font-semibold text-[#6B6258] dark:text-[#A89F91] normal-case tracking-normal">
                {language === 'kn' ? 'ಪ್ರಕಟಿತ ಸುದ್ದಿ ಫಿಲ್ಟರ್' : 'Published news filter'}
              </span>
            </h2>

            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => scrollNewsStrip('left')}
                aria-label="Scroll news categories left"
                className="w-7 h-7 rounded-lg border border-[#E4DAC6] dark:border-[#332D24] bg-white dark:bg-[#1A1815] text-[#6B6258] dark:text-[#C5BBA9] hover:border-[#C5932B] hover:text-[#926710] dark:hover:text-[#E2B44B] inline-flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronDown className="w-3.5 h-3.5 rotate-90" />
              </button>
              <button
                type="button"
                onClick={() => scrollNewsStrip('right')}
                aria-label="Scroll news categories right"
                className="w-7 h-7 rounded-lg border border-[#E4DAC6] dark:border-[#332D24] bg-white dark:bg-[#1A1815] text-[#6B6258] dark:text-[#C5BBA9] hover:border-[#C5932B] hover:text-[#926710] dark:hover:text-[#E2B44B] inline-flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
              </button>
            </div>
          </div>

          <div
            ref={newsScrollRef}
            role="tablist"
            aria-label="Filter published news articles by category"
            className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1"
          >
            {newsCategories.map((cat) => {
              const isActive = !isAdsView && activeFeedCategory === cat.id;
              const label =
                cat.id === 'news'
                  ? language === 'kn'
                    ? 'ಎಲ್ಲಾ ಸುದ್ದಿ'
                    : 'All News'
                  : language === 'kn'
                    ? cat.labelKn
                    : cat.labelEn;

              return (
                <button
                  key={cat.id}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  data-category-id={cat.id}
                  data-category-group="news"
                  onClick={() => onSelectFeedCategory(cat.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs sm:text-[13px] font-bold whitespace-nowrap shrink-0 min-h-[42px] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5932B] ${
                    isActive
                      ? 'bg-gradient-to-r from-[#C5932B] to-[#DEB04B] text-[#181512] border-[#B6841E] shadow-xs'
                      : 'bg-white dark:bg-[#1A1815] text-[#2B2520] dark:text-[#EFE8DC] border-[#E7DFCE] dark:border-[#2F2A22] hover:border-[#C5932B] dark:hover:border-[#E2B44B] hover:bg-[#FAF5E8] dark:hover:bg-[#231F19]'
                  }`}
                >
                  <span
                    className={
                      isActive
                        ? 'text-[#181512]'
                        : 'text-[#B07E17] dark:text-[#E2B44B]'
                    }
                  >
                    {renderFeedCategoryIcon(cat.icon)}
                  </span>
                  <span className={language === 'kn' ? 'font-kannada' : ''}>{label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 2 (BELOW News Categories): Community Categories Grid (Offers, Govt Info, Helplines, Buy & Sell, etc.) */}
      {showCategoryGrid && communityCategories.length > 0 && (
        <section
          aria-label="Community categories"
          data-testid="all-categories-grid-section"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3.5 pb-2"
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h2 className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wider text-[#1C1917] dark:text-[#FBF9F5] flex items-center gap-2">
              <span className={language === 'kn' ? 'font-kannada normal-case tracking-normal text-sm' : ''}>
                {language === 'kn' ? 'ಸಮುದಾಯ ವಿಭಾಗಗಳು' : 'Community Categories'}
              </span>
              <span className="text-[#B8AD9E] dark:text-[#6E655A] font-normal" aria-hidden="true">
                ·
              </span>
              <span className="text-[11px] font-semibold text-[#6B6258] dark:text-[#A89F91] normal-case tracking-normal">
                {language === 'kn' ? 'ಒಂದೇ ಸಮುದಾಯ ಫೀಡ್' : 'Local community & services'}
              </span>
            </h2>

            {!isAdsView && activeFeedCategory !== 'all' && (
              <button
                type="button"
                onClick={() => onSelectFeedCategory('all')}
                className="text-xs font-bold text-[#926710] dark:text-[#E2B44B] hover:underline cursor-pointer shrink-0"
              >
                {language === 'kn' ? 'ಎಲ್ಲಾ ತೋರಿಸಿ' : 'Reset to All'}
              </button>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Filter Coffeenadu community feed by community category"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
          >
            {communityCategories.map((cat) => {
              const isActive = !isAdsView && activeFeedCategory === cat.id;
              const isAllTile = cat.id === 'all';
              const label = language === 'kn' ? cat.labelKn : cat.labelEn;

              return (
                <button
                  key={cat.id}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  data-category-id={cat.id}
                  data-category-group="community"
                  onClick={() => onSelectFeedCategory(cat.id)}
                  className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer min-h-[46px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5932B] ${
                    isActive
                      ? 'bg-[#1C1917] text-[#FBF9F5] border-[#1C1917] dark:bg-gradient-to-r dark:from-[#D4A238] dark:to-[#E6BC5C] dark:text-[#181512] dark:border-[#D4A238] shadow-xs'
                      : isAllTile
                        ? 'bg-[#FBF4E2] dark:bg-[#241F17] text-[#1C1917] dark:text-[#FBF9F5] border-[#DFC996] dark:border-[#4A3D26] hover:border-[#C5932B]'
                        : 'bg-white dark:bg-[#1A1815] text-[#2B2520] dark:text-[#EFE8DC] border-[#E7DFCE] dark:border-[#2E2922] hover:border-[#C5932B] dark:hover:border-[#E2B44B]/70 hover:bg-[#FAF6EC] dark:hover:bg-[#231F19]'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? 'bg-[#D4A238]/20 text-[#E6BC5C] dark:bg-[#181512]/15 dark:text-[#181512]'
                        : isAllTile
                          ? 'bg-[#1C1917] text-[#E6BC5C] dark:bg-[#D4A238] dark:text-[#181512]'
                          : 'bg-[#F6F0E1] dark:bg-[#252019] text-[#A67618] dark:text-[#E2B44B] group-hover:bg-[#EFE4C8] dark:group-hover:bg-[#312A20]'
                    }`}
                  >
                    {renderFeedCategoryIcon(cat.icon)}
                  </span>
                  <span
                    className={`text-xs sm:text-[13px] font-bold leading-snug line-clamp-2 break-words min-w-0 ${
                      language === 'kn' ? 'font-kannada' : ''
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
