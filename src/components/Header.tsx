import { useState } from 'react';
import {
  Bell,
  Bookmark,
  Bus,
  CalendarDays,
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

  const isHomeCommunityView =
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

  const quickCtaBtnClass = (isActive: boolean) =>
    `inline-flex items-center justify-center gap-1.5 px-3 xl:px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-[#C5932B] to-[#DEB04B] hover:from-[#B6841E] hover:to-[#D4A238] text-[#181512] transition-all whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] shadow-2xs ${
      isActive ? 'ring-2 ring-[#1C1917] dark:ring-[#FBF9F5] ring-offset-1 ring-offset-[#FBF9F5] dark:ring-offset-[#151310]' : ''
    }`;

  return (
    <header className="sticky top-0 z-40 bg-[#FBF9F5]/95 dark:bg-[#151310]/95 backdrop-blur-md border-b border-[#E7DFCE] dark:border-[#2E2922] shadow-[0_1px_12px_rgba(28,25,23,0.06)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-2 flex items-center justify-between gap-2 sm:gap-3">
        {/* Zone 1: Brand wordmark + Developed by Dheeraj */}
        <div className="flex flex-col items-start min-w-0 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMegaOpen(false);
              onResetHome();
            }}
            className="inline-flex items-center gap-2 font-masthead text-lg sm:text-2xl font-extrabold tracking-tight text-[#1C1917] dark:text-[#FBF9F5] hover:text-[#926710] dark:hover:text-[#E2B44B] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5932B] rounded-sm"
          >
            <CoffeeCupLogo className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
            <span>Coffeenadu News</span>
          </button>
          <span className="pl-10 sm:pl-11 -mt-0.5 text-[10px] sm:text-[11px] font-semibold tracking-wide text-[#7D7265] dark:text-[#A89F91] leading-tight whitespace-nowrap">
            Developed by Dheeraj
          </span>
        </div>

        {/* Zone 2: Clean, De-duplicated Desktop Navigation */}
        <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-4 xl:gap-5">
          <button
            type="button"
            onClick={() => {
              setMegaOpen(false);
              onResetHome();
            }}
            className={`text-sm font-bold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
              isHomeCommunityView
                ? 'border-[#C5932B] text-[#1C1917] dark:border-[#E2B44B] dark:text-[#E2B44B]'
                : 'border-transparent text-[#574E44] dark:text-[#C5BBA9] hover:text-[#1C1917] dark:hover:text-[#FBF9F5]'
            }`}
          >
            {pickLangText('ಸಮುದಾಯ', 'Community', lang)}
          </button>

          <button
            type="button"
            onClick={() => {
              setMegaOpen(false);
              onSelectCategory('All');
            }}
            className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
              isHomeCommunityView && activeCategory === 'All' && false
                ? 'border-[#C5932B] text-[#1C1917] dark:text-[#E2B44B]'
                : 'border-transparent text-[#574E44] dark:text-[#C5BBA9] hover:text-[#1C1917] dark:hover:text-[#FBF9F5]'
            }`}
          >
            {pickLangText('ಸುದ್ದಿ', 'News', lang)}
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
                ? 'border-[#C5932B] text-[#1C1917] dark:text-[#E2B44B]'
                : 'border-transparent text-[#574E44] dark:text-[#C5BBA9] hover:text-[#1C1917] dark:hover:text-[#FBF9F5]'
            }`}
          >
            {pickLangText('ಜಾಹೀರಾತು', 'Local Ads', lang)}
          </button>

          <button
            type="button"
            onClick={() => setMegaOpen((prev) => !prev)}
            aria-expanded={megaOpen}
            className={`inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
              megaOpen || activePlatformRoute === '/explore'
                ? 'border-[#C5932B] text-[#926710] dark:border-[#E2B44B] dark:text-[#E2B44B]'
                : 'border-transparent text-[#574E44] dark:text-[#C5BBA9] hover:text-[#1C1917] dark:hover:text-[#FBF9F5]'
            }`}
          >
            <span>{pickLangText('ಸೇವೆಗಳು', 'Services', lang)}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${megaOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </nav>

        {/* Zone 3: Reader utilities + Matching Gold CTA Trio (Explore, Bus Timings, Programs) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onToggleLang && (
            <button
              type="button"
              onClick={() => onToggleLang(lang === 'kn' ? 'en' : 'kn')}
              title="Switch Kannada / English"
              className="inline-flex items-center justify-center min-h-[40px] px-2.5 rounded-xl border border-[#DFD5C0] dark:border-[#342E25] bg-white dark:bg-[#1C1915] text-xs font-bold text-[#926710] dark:text-[#E2B44B] hover:border-[#C5932B] dark:hover:border-[#E2B44B] transition-colors cursor-pointer whitespace-nowrap"
            >
              {lang === 'kn' ? 'EN' : 'ಕನ್ನಡ'}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search everything on Coffeenadu"
            title="Search Everything"
            className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-xl border border-[#DFD5C0] dark:border-[#342E25] bg-white dark:bg-[#1C1915] text-[#1C1917] dark:text-[#F3ECE0] hover:border-[#C5932B] dark:hover:border-[#E2B44B] transition-colors cursor-pointer"
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
            className="relative hidden sm:inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-xl border border-[#DFD5C0] dark:border-[#342E25] bg-white dark:bg-[#1C1915] text-[#1C1917] dark:text-[#F3ECE0] hover:border-[#C5932B] dark:hover:border-[#E2B44B] transition-colors cursor-pointer"
          >
            {onNavigateModule ? <UserCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            {bookmarkCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C5932B] text-[#181512] text-[10px] font-bold flex items-center justify-center">
                {bookmarkCount > 99 ? '99+' : bookmarkCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label="News alerts and notifications"
            title="Breaking News Alerts"
            className="relative inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-xl border border-[#DFD5C0] dark:border-[#342E25] bg-white dark:bg-[#1C1915] text-[#1C1917] dark:text-[#F3ECE0] hover:border-[#C5932B] dark:hover:border-[#E2B44B] transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#D4A238] ring-2 ring-[#FBF9F5] dark:ring-[#151310]" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-xl border border-[#DFD5C0] dark:border-[#342E25] bg-white dark:bg-[#1C1915] text-[#926710] dark:text-[#E2B44B] hover:border-[#C5932B] dark:hover:border-[#E2B44B] transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Desktop/Tablet Primary Quick Buttons: Explore, Bus Timings, Programs (all identical size & style) */}
          <div className="hidden md:flex items-center gap-1.5" data-testid="header-quick-cta-group">
            {onExploreAll && (
              <button
                type="button"
                data-testid="header-explore-btn"
                onClick={() => {
                  setMegaOpen(false);
                  onExploreAll();
                }}
                aria-current={activePlatformRoute === '/explore' ? 'page' : undefined}
                className={quickCtaBtnClass(activePlatformRoute === '/explore')}
              >
                <Compass className="w-3.5 h-3.5 hidden xl:inline-block shrink-0" aria-hidden="true" />
                <span>{pickLangText('ಎಲ್ಲಾ ಸೇವೆಗಳು', 'Explore', lang)}</span>
              </button>
            )}

            <button
              type="button"
              data-testid="header-bus-timings-btn"
              onClick={() => {
                setMegaOpen(false);
                onJumpToBusTimings();
              }}
              aria-current={isBusTimingsView ? 'page' : undefined}
              className={quickCtaBtnClass(isBusTimingsView)}
            >
              <Bus className="w-3.5 h-3.5 hidden xl:inline-block shrink-0" aria-hidden="true" />
              <span>{pickLangText('ಬಸ್ ಸಮಯ', 'Bus Timings', lang)}</span>
            </button>

            <button
              type="button"
              data-testid="header-programs-btn"
              onClick={() => {
                setMegaOpen(false);
                onJumpToEvents();
              }}
              aria-current={isEventsView ? 'page' : undefined}
              className={quickCtaBtnClass(isEventsView)}
            >
              <CalendarDays className="w-3.5 h-3.5 hidden xl:inline-block shrink-0" aria-hidden="true" />
              <span>{pickLangText('ಕಾರ್ಯಕ್ರಮ', 'Programs', lang)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Header Quick Row: Explore · Bus Timings · Programs in identical size */}
      <div
        className="md:hidden border-t border-[#EFE8D8] dark:border-[#26221B] bg-[#FBF9F5]/95 dark:bg-[#151310]/95 px-3 py-2"
        data-testid="mobile-header-quick-cta-group"
      >
        <div className="grid grid-cols-3 gap-2">
          {onExploreAll && (
            <button
              type="button"
              onClick={() => {
                setMegaOpen(false);
                onExploreAll();
              }}
              aria-current={activePlatformRoute === '/explore' ? 'page' : undefined}
              className={`${quickCtaBtnClass(activePlatformRoute === '/explore')} w-full px-2 text-[11px]`}
            >
              <Compass className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{pickLangText('ಎಲ್ಲಾ ಸೇವೆಗಳು', 'Explore', lang)}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setMegaOpen(false);
              onJumpToBusTimings();
            }}
            aria-current={isBusTimingsView ? 'page' : undefined}
            className={`${quickCtaBtnClass(isBusTimingsView)} w-full px-2 text-[11px]`}
          >
            <Bus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{pickLangText('ಬಸ್ ಸಮಯ', 'Bus Timings', lang)}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMegaOpen(false);
              onJumpToEvents();
            }}
            aria-current={isEventsView ? 'page' : undefined}
            className={`${quickCtaBtnClass(isEventsView)} w-full px-2 text-[11px]`}
          >
            <CalendarDays className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{pickLangText('ಕಾರ್ಯಕ್ರಮ', 'Programs', lang)}</span>
          </button>
        </div>
      </div>

      {/* Desktop Services Drawer */}
      {megaOpen && (
        <div className="hidden lg:block border-t border-[#E7DFCE] dark:border-[#2E2922] bg-[#FBF9F5] dark:bg-[#171511] shadow-xl">
          <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#926710] dark:text-[#E2B44B]">
                {pickLangText(
                  'ಕಾಫಿನಾಡು ಮಲೆನಾಡು — ಸೇವಾ ವಿಭಾಗಗಳು',
                  'Coffeenadu Malnad — Regional Services & Directories',
                  lang
                )}
              </div>
              <button
                type="button"
                onClick={() => setMegaOpen(false)}
                className="p-1.5 rounded-lg text-[#6B6258] hover:text-[#1C1917] dark:text-[#A89F91] dark:hover:text-white cursor-pointer"
                aria-label="Close services menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-5">
              {MEGA_GROUPS.map((grp) => (
                <div key={grp.id} className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#7D7265] dark:text-[#A89F91]">
                    {pickLangText(grp.titleKn, grp.titleEn, lang)}
                  </div>
                  <div className="space-y-1">
                    {PLATFORM_MODULES.filter((m) => m.group === grp.id).map((mod) => (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => handleNavModule(mod.id)}
                        className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white dark:hover:bg-[#231F19] transition-colors cursor-pointer group"
                      >
                        <span className="text-[#B07E17] dark:text-[#E2B44B] shrink-0">
                          <PlatformIcon icon={mod.icon} className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-kannada text-xs font-bold text-[#1C1917] dark:text-[#FBF9F5] group-hover:text-[#926710] dark:group-hover:text-[#E2B44B] truncate">
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
