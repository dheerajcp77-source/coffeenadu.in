import {
  Bell,
  Bookmark,
  CalendarDays,
  Moon,
  Search,
  Sun,
} from 'lucide-react';
import type { FilterCategory } from '../types/news';
import type { PublicThemeMode } from '../utils/readerPreferences';
import { CoffeeCupLogo } from './CoffeeCupLogo';

interface HeaderProps {
  activeCategory: FilterCategory;
  isBusTimingsView?: boolean;
  isEventsView?: boolean;
  isChatView?: boolean;
  isAdsView?: boolean;
  theme: PublicThemeMode;
  bookmarkCount: number;
  unreadNotificationsCount: number;
  onSelectCategory: (category: FilterCategory) => void;
  onResetHome: () => void;
  onJumpToBusTimings: () => void;
  onJumpToEvents: () => void;
  onJumpToAds: () => void;
  onOpenSearch: () => void;
  onOpenSaved: () => void;
  onOpenNotifications: () => void;
  onToggleTheme: () => void;
}

const HEADER_NAV_ITEMS: { label: string; category: FilterCategory }[] = [
  { label: 'All News', category: 'All' },
  { label: 'Local', category: 'Local' },
  { label: 'Malnad', category: 'Malnad' },
  { label: 'Agriculture', category: 'Agriculture' },
  { label: 'Politics', category: 'Politics' },
];

export function Header({
  activeCategory,
  isBusTimingsView = false,
  isEventsView = false,
  isChatView = false,
  isAdsView = false,
  theme,
  bookmarkCount,
  unreadNotificationsCount,
  onSelectCategory,
  onResetHome,
  onJumpToBusTimings,
  onJumpToEvents,
  onJumpToAds,
  onOpenSearch,
  onOpenSaved,
  onOpenNotifications,
  onToggleTheme,
}: HeaderProps) {
  const isFeedView = !isBusTimingsView && !isEventsView && !isChatView && !isAdsView;

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0E1E33]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_12px_rgba(16,36,61,0.05)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-2 flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Brand wordmark + Developed by Dheeraj */}
        <div className="flex flex-col items-start min-w-0 shrink-0">
          <button
            type="button"
            onClick={onResetHome}
            className="inline-flex items-center gap-2 font-masthead text-lg sm:text-2xl font-extrabold tracking-tight text-[#10243D] dark:text-white hover:text-[#176B4A] dark:hover:text-[#D9A441] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10243D] dark:focus-visible:ring-[#D9A441] rounded-sm"
          >
            <CoffeeCupLogo className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
            <span>Coffeenadu News</span>
          </button>
          <span className="pl-10 sm:pl-11 -mt-0.5 text-[10px] sm:text-[11px] font-semibold tracking-wide text-[#738093] dark:text-slate-400 leading-tight whitespace-nowrap">
            Developed by Dheeraj
          </span>
        </div>

        {/* Zone 2: Concise single-line desktop navigation links */}
        <nav
          aria-label="Primary categories"
          className="hidden xl:flex items-center gap-4"
        >
          {HEADER_NAV_ITEMS.map((item) => {
            const isActive = isFeedView && activeCategory === item.category;
            return (
              <button
                key={item.category}
                type="button"
                onClick={() => onSelectCategory(item.category)}
                className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10243D] dark:focus-visible:ring-[#D9A441] rounded-xs ${
                  isActive
                    ? 'border-[#D9A441] text-[#10243D] dark:text-[#D9A441]'
                    : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#10243D] dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onJumpToAds}
            aria-current={isAdsView ? 'page' : undefined}
            className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10243D] dark:focus-visible:ring-[#D9A441] rounded-xs ${
              isAdsView
                ? 'border-[#D9A441] text-[#10243D] dark:text-[#D9A441]'
                : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#10243D] dark:hover:text-white hover:border-amber-400'
            }`}
          >
            Local Ads
          </button>
        </nav>

        {/* Zone 3: Reader utilities & civic actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Open advanced news search"
            title="Search news"
            className="hidden sm:inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] text-[#17263A] dark:text-slate-200 hover:border-[#10243D] dark:hover:border-[#D9A441] transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenSaved}
            aria-label={`Saved articles (${bookmarkCount})`}
            title="Saved Articles & Reading History"
            className="relative hidden sm:inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] text-[#17263A] dark:text-slate-200 hover:border-[#10243D] dark:hover:border-[#D9A441] transition-colors cursor-pointer"
          >
            <Bookmark className="w-4 h-4" />
            {bookmarkCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#176B4A] text-white text-[10px] font-bold flex items-center justify-center">
                {bookmarkCount > 99 ? '99+' : bookmarkCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label="News alerts and notifications"
            title="Breaking News Alerts"
            className="relative inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] text-[#17263A] dark:text-slate-200 hover:border-[#10243D] dark:hover:border-[#D9A441] transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#D9A441] ring-2 ring-white dark:ring-[#0E1E33]" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] text-[#17263A] dark:text-[#D9A441] hover:border-[#10243D] dark:hover:border-[#D9A441] transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onJumpToBusTimings}
            aria-current={isBusTimingsView ? 'page' : undefined}
            className={`px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#10243D] ${
              isBusTimingsView
                ? 'bg-[#D9A441] text-[#10243D] hover:bg-[#E5B65C]'
                : 'bg-[#10243D] text-white hover:bg-[#19385F] dark:bg-[#183357] dark:hover:bg-[#1F4270]'
            }`}
          >
            Bus Timings
          </button>

          <button
            type="button"
            onClick={onJumpToEvents}
            aria-current={isEventsView ? 'page' : undefined}
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#176B4A] ${
              isEventsView
                ? 'bg-[#176B4A] text-white border-[#176B4A] hover:bg-[#13593D]'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-[#176B4A] dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
            }`}
          >
            <CalendarDays className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Programs &amp; Events</span>
          </button>
        </div>
      </div>
    </header>
  );
}
