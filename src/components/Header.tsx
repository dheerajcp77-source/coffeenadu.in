import { useState } from 'react';
import {
  Bell,
  Bookmark,
  ChevronDown,
  Compass,
  Moon,
  Search,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { PLATFORM_MODULES } from '../constants/platformCatalog';
import type { FilterCategory } from '../types/news';
import type { PlatformLanguage, PlatformModuleId } from '../types/platform';
import { pickLangText } from '../utils/platformHelpers';
import type { PublicThemeMode } from '../utils/readerPreferences';
import { CoffeeCupLogo } from './CoffeeCupLogo';
import { PlatformIcon } from './platform/PlatformIcon';

interface HeaderProps {
  activeCategory: FilterCategory;
  activePlatformRoute?: string;
  isBusTimingsView?: boolean;
  isEventsView?: boolean;
  isChatView?: boolean;
  isAdsView?: boolean;
  theme: PublicThemeMode;
  lang?: PlatformLanguage;
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
  onToggleLang?: (next: PlatformLanguage) => void;
  onNavigateModule?: (modId: PlatformModuleId) => void;
  onExploreAll?: () => void;
}

const MEGA_GROUPS: Array<{
  id: 'core' | 'commerce' | 'civic' | 'life';
  titleKn: string;
  titleEn: string;
}> = [
  { id: 'core', titleKn: 'ದೈನಂದಿನ ಮಾಹಿತಿ', titleEn: 'Daily Essentials' },
  { id: 'commerce', titleKn: 'ವ್ಯಾಪಾರ & ಉದ್ಯೋಗ', titleEn: 'Business & Jobs' },
  { id: 'civic', titleKn: 'ಸರ್ಕಾರಿ & ನಾಗರಿಕ', titleEn: 'Civic & Health' },
  { id: 'life', titleKn: 'ಪ್ರವಾಸ & ಆಟಗಳು', titleEn: 'Life & Account' },
];

export function Header({
  activeCategory,
  activePlatformRoute = '/',
  isBusTimingsView = false,
  isEventsView = false,
  isChatView = false,
  isAdsView = false,
  theme,
  lang = 'kn',
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
  onToggleLang,
  onNavigateModule,
  onExploreAll,
}: HeaderProps) {
  const [megaOpen, setMegaOpen] = useState(false);

  const isFeedView =
    !isBusTimingsView &&
    !isEventsView &&
    !isChatView &&
    !isAdsView &&
    activePlatformRoute === '/';

  const handleNavModule = (modId: PlatformModuleId) => {
    setMegaOpen(false);
    if (modId === 'news') {
      onResetHome();
      return;
    }
    if (modId === 'transport') {
      onJumpToBusTimings();
      return;
    }
    if (modId === 'events') {
      onJumpToEvents();
      return;
    }
    onNavigateModule?.(modId);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0E1E33]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_12px_rgba(16,36,61,0.05)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-2 flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Brand wordmark + Developed by Dheeraj */}
        <div className="flex flex-col items-start min-w-0 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMegaOpen(false);
              onResetHome();
            }}
            className="inline-flex items-center gap-2 font-masthead text-lg sm:text-2xl font-extrabold tracking-tight text-[#10243D] dark:text-white hover:text-[#176B4A] dark:hover:text-[#D9A441] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10243D] dark:focus-visible:ring-[#D9A441] rounded-sm"
          >
            <CoffeeCupLogo className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
            <span>Coffeenadu News</span>
          </button>
          <span className="pl-10 sm:pl-11 -mt-0.5 text-[10px] sm:text-[11px] font-semibold tracking-wide text-[#738093] dark:text-slate-400 leading-tight whitespace-nowrap">
            Developed by Dheeraj
          </span>
        </div>

        {/* Zone 2: Clean single-line Desktop Navigation + Expandable Mega Menu */}
        <nav aria-label="Primary navigation" className="hidden xl:flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setMegaOpen(false);
              onSelectCategory('All');
            }}
            className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
              isFeedView && activeCategory === 'All'
                ? 'border-[#D9A441] text-[#10243D] dark:text-[#D9A441]'
                : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#10243D] dark:hover:text-white'
            }`}
          >
            {pickLangText('ಸುದ್ದಿ', 'News', lang)}
          </button>

          <button
            type="button"
            onClick={() => handleNavModule('community')}
            className={`text-sm font-bold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
              activePlatformRoute === '/community' || activePlatformRoute.startsWith('/community/')
                ? 'border-[#176B4A] text-[#176B4A] dark:border-[#D9A441] dark:text-[#D9A441]'
                : 'border-transparent text-[#176B4A] dark:text-emerald-300 hover:text-[#10243D] dark:hover:text-[#D9A441]'
            }`}
          >
            {pickLangText('ಸಮುದಾಯ', 'Community', lang)}
          </button>

          <button
            type="button"
            onClick={() => setMegaOpen((prev) => !prev)}
            aria-expanded={megaOpen}
            className={`inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
              megaOpen || activePlatformRoute === '/explore'
                ? 'border-[#176B4A] text-[#176B4A] dark:text-[#D9A441]'
                : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#10243D] dark:hover:text-white'
            }`}
          >
            <span>{pickLangText('ಸೇವೆಗಳು', 'Services', lang)}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${megaOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <button
            type="button"
            onClick={() => handleNavModule('businesses')}
            className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
              activePlatformRoute === '/businesses'
                ? 'border-[#D9A441] text-[#10243D] dark:text-[#D9A441]'
                : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#10243D] dark:hover:text-white'
            }`}
          >
            {pickLangText('ವ್ಯಾಪಾರ', 'Businesses', lang)}
          </button>

          <button
            type="button"
            onClick={() => handleNavModule('jobs')}
            className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
              activePlatformRoute === '/jobs'
                ? 'border-[#D9A441] text-[#10243D] dark:text-[#D9A441]'
                : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#10243D] dark:hover:text-white'
            }`}
          >
            {pickLangText('ಉದ್ಯೋಗ', 'Jobs', lang)}
          </button>

          <button
            type="button"
            onClick={() => handleNavModule('marketplace')}
            className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
              activePlatformRoute === '/marketplace'
                ? 'border-[#D9A441] text-[#10243D] dark:text-[#D9A441]'
                : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#10243D] dark:hover:text-white'
            }`}
          >
            {pickLangText('ಖರೀದಿ-ಮಾರಾಟ', 'Marketplace', lang)}
          </button>

          <button
            type="button"
            onClick={() => {
              setMegaOpen(false);
              onJumpToAds();
            }}
            aria-current={isAdsView ? 'page' : undefined}
            className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
              isAdsView
                ? 'border-[#D9A441] text-[#10243D] dark:text-[#D9A441]'
                : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#10243D] dark:hover:text-white'
            }`}
          >
            Local Ads
          </button>
        </nav>

        {/* Zone 3: Reader utilities & quick actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onToggleLang && (
            <button
              type="button"
              onClick={() => onToggleLang(lang === 'kn' ? 'en' : 'kn')}
              title="Switch Kannada / English"
              className="hidden md:inline-flex items-center justify-center min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] text-xs font-bold text-[#176B4A] dark:text-[#D9A441] hover:border-[#176B4A] transition-colors cursor-pointer whitespace-nowrap"
            >
              {lang === 'kn' ? 'EN' : 'ಕನ್ನಡ'}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search everything on Coffeenadu"
            title="Search Everything"
            className="inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] text-[#17263A] dark:text-slate-200 hover:border-[#10243D] dark:hover:border-[#D9A441] transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (onNavigateModule) handleNavModule('account');
              else onOpenSaved();
            }}
            aria-label={`Account and saved items (${bookmarkCount})`}
            title="Account & Saved Items"
            className="relative hidden sm:inline-flex items-center justify-center min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] text-[#17263A] dark:text-slate-200 hover:border-[#10243D] dark:hover:border-[#D9A441] transition-colors cursor-pointer"
          >
            {onNavigateModule ? <UserCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
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
            onClick={() => {
              setMegaOpen(false);
              onJumpToBusTimings();
            }}
            aria-current={isBusTimingsView ? 'page' : undefined}
            className={`hidden sm:inline-flex items-center px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] ${
              isBusTimingsView
                ? 'bg-[#D9A441] text-[#10243D] hover:bg-[#E5B65C]'
                : 'bg-[#10243D] text-white hover:bg-[#19385F] dark:bg-[#183357] dark:hover:bg-[#1F4270]'
            }`}
          >
            Bus Timings
          </button>

          <button
            type="button"
            onClick={() => {
              setMegaOpen(false);
              if (onExploreAll) onExploreAll();
              else onJumpToEvents();
            }}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] bg-emerald-50 dark:bg-emerald-950/40 text-[#176B4A] dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
          >
            <Compass className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{pickLangText('ಎಲ್ಲಾ ಸೇವೆಗಳು', 'Explore', lang)}</span>
          </button>
        </div>
      </div>

      {/* Desktop Mega Menu Drawer for All 22 Malnad Modules */}
      {megaOpen && (
        <div className="hidden xl:block border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1B2E] shadow-xl">
          <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#176B4A] dark:text-[#D9A441]">
                {pickLangText(
                  'ಕಾಫಿನಾಡು ಮಲೆನಾಡು — ಎಲ್ಲಾ 22 ಸೇವಾ ವಿಭಾಗಗಳು',
                  'Coffeenadu Malnad — All 22 Ecosystem Modules',
                  lang
                )}
              </div>
              <button
                type="button"
                onClick={() => setMegaOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Close services menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-5">
              {MEGA_GROUPS.map((grp) => (
                <div key={grp.id} className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {pickLangText(grp.titleKn, grp.titleEn, lang)}
                  </div>
                  <div className="space-y-1">
                    {PLATFORM_MODULES.filter((m) => m.group === grp.id).map((mod) => (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => handleNavModule(mod.id)}
                        className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#F3F6F8] dark:hover:bg-slate-800/80 transition-colors cursor-pointer group"
                      >
                        <span className="text-[#176B4A] dark:text-[#D9A441] shrink-0">
                          <PlatformIcon icon={mod.icon} className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-kannada text-xs font-bold text-[#10243D] dark:text-white group-hover:text-[#176B4A] dark:group-hover:text-[#D9A441] truncate">
                            {pickLangText(mod.titleKn, mod.titleEn, lang)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
