import { useState } from 'react';
import {
  Bell,
  Bookmark,
  Compass,
  History,
  Home,
  Megaphone,
  Menu,
  MessageSquareHeart,
  Moon,
  Search,
  ShoppingBag,
  Store,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { PLATFORM_MODULES } from '../constants/platformCatalog';
import type { PlatformLanguage, PlatformModuleId } from '../types/platform';
import { pickLangText } from '../utils/platformHelpers';
import type { PublicThemeMode } from '../utils/readerPreferences';
import { PlatformIcon } from './platform/PlatformIcon';

export type MobileNavTab = 'home' | 'explore' | 'services' | 'marketplace' | 'menu';

interface BottomMobileNavProps {
  activeTab: MobileNavTab;
  theme: PublicThemeMode;
  lang?: PlatformLanguage;
  bookmarkCount: number;
  unreadNotificationsCount: number;
  onGoHome: () => void;
  onGoExplore: () => void;
  onGoServices: () => void;
  onGoMarketplace: () => void;
  onOpenSearch: () => void;
  onOpenSaved: () => void;
  onOpenHistory: () => void;
  onOpenNotifications: () => void;
  onToggleTheme: () => void;
  onToggleLang?: (next: PlatformLanguage) => void;
  onNavigateModule: (modId: PlatformModuleId) => void;
  onNavigateSection: (section: 'bus-timings' | 'events' | 'local-ads' | 'support-chat') => void;
}

export function BottomMobileNav({
  activeTab,
  theme,
  lang = 'kn',
  bookmarkCount,
  unreadNotificationsCount,
  onGoHome,
  onGoExplore,
  onGoServices,
  onGoMarketplace,
  onOpenSearch,
  onOpenSaved,
  onOpenHistory,
  onOpenNotifications,
  onToggleTheme,
  onToggleLang,
  onNavigateModule,
  onNavigateSection,
}: BottomMobileNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navBtnClass = (isActive: boolean) =>
    `flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
      isActive
        ? 'text-[#926710] dark:text-[#E6BC5C]'
        : 'text-[#6B6052] dark:text-[#A89C8B] hover:text-[#1C1917] dark:hover:text-[#FBF9F5]'
    }`;

  return (
    <>
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden bg-[#11100E]/70 backdrop-blur-[1px] flex items-end"
          role="dialog"
          aria-modal="true"
          aria-label="Coffeenadu Malnad Menu"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMenuOpen(false);
          }}
        >
          <div className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white dark:bg-[#1A1815] border-t border-[#E7DFCE] dark:border-[#3A3122] p-4 pb-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-[#1C1917] dark:text-[#FBF9F5] font-kannada">
                  {pickLangText('ಕಾಫಿನಾಡು ಮಲೆನಾಡು ಮೆನು', 'Coffeenadu Malnad Menu', lang)}
                </h3>
                <p className="font-kannada text-[11px] text-[#6B6052] dark:text-[#A89C8B]">
                  {pickLangText('ಎಲ್ಲಾ 22 ಸೇವೆಗಳು ಮತ್ತು ಖಾತೆ ಆಯ್ಕೆಗಳು', 'All 22 services & reader controls', lang)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close mobile menu"
                className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center text-[#6B6052] hover:bg-[#F5F1E8] dark:hover:bg-[#26221B] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Utility Controls */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSearch();
                }}
                className="min-h-[44px] flex items-center gap-2 rounded-xl bg-[#1C1917] text-[#FBF9F5] border border-[#3A3122] px-3 text-xs font-bold cursor-pointer"
              >
                <Search className="w-4 h-4 text-[#E6BC5C]" />
                <span>{pickLangText('ಎಲ್ಲವನ್ನೂ ಹುಡುಕಿ', 'Search Everything', lang)}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onNavigateModule('account');
                }}
                className="min-h-[44px] flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#C5932B] to-[#DEB04B] text-[#171411] px-3 text-xs font-extrabold cursor-pointer"
              >
                <UserCheck className="w-4 h-4 text-[#171411]" />
                <span>{pickLangText('ಖಾತೆ & ಉಳಿಸಿದವು', 'Account & Saved', lang)}</span>
              </button>

              {onToggleLang && (
                <button
                  type="button"
                  onClick={() => onToggleLang(lang === 'kn' ? 'en' : 'kn')}
                  className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-[#E7DFCE] dark:border-[#3A3122] bg-[#FAF7F0] dark:bg-[#221F1A] px-3 text-xs font-bold text-[#1C1917] dark:text-[#FBF9F5] cursor-pointer"
                >
                  <span>{lang === 'kn' ? 'Switch to English' : 'ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಿ'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onToggleTheme}
                className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-[#E7DFCE] dark:border-[#3A3122] bg-[#FAF7F0] dark:bg-[#221F1A] px-3 text-xs font-bold text-[#1C1917] dark:text-[#FBF9F5] cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-[#E6BC5C]" />
                ) : (
                  <Moon className="w-4 h-4 text-[#926710]" />
                )}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
            </div>

            {/* All 22 Platform Modules Grid */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#8A7D6B]">
                {pickLangText('ಎಲ್ಲಾ ಮಲೆನಾಡು ವಿಭಾಗಗಳು', 'All Malnad Modules', lang)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORM_MODULES.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigateModule(mod.id);
                    }}
                    className="min-h-[44px] flex items-center gap-2 rounded-xl border border-[#E7DFCE] dark:border-[#2E2922] bg-[#FAF7F0] dark:bg-[#14120F] px-2.5 py-2 text-left text-xs font-bold text-[#1C1917] dark:text-[#FBF9F5] cursor-pointer"
                  >
                    <span className="text-[#926710] dark:text-[#E6BC5C] shrink-0">
                      <PlatformIcon icon={mod.icon} className="w-4 h-4" />
                    </span>
                    <span className="font-kannada truncate">
                      {pickLangText(mod.titleKn, mod.titleEn, lang)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reader Library & Support Row */}
            <div className="pt-2 border-t border-[#EFE8D8] dark:border-[#2E2922] grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSaved();
                }}
                className="min-h-[44px] flex items-center gap-2 rounded-xl border border-[#E7DFCE] dark:border-[#3A3122] px-3 font-bold text-[#1C1917] dark:text-[#F0E9DC] cursor-pointer"
              >
                <Bookmark className="w-4 h-4 text-[#B88623] dark:text-[#E6BC5C]" />
                <span>Saved ({bookmarkCount})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenHistory();
                }}
                className="min-h-[44px] flex items-center gap-2 rounded-xl border border-[#E7DFCE] dark:border-[#3A3122] px-3 font-bold text-[#1C1917] dark:text-[#F0E9DC] cursor-pointer"
              >
                <History className="w-4 h-4 text-[#926710] dark:text-[#E6BC5C]" />
                <span>History</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenNotifications();
                }}
                className="min-h-[44px] flex items-center gap-2 rounded-xl border border-[#E7DFCE] dark:border-[#3A3122] px-3 font-bold text-[#1C1917] dark:text-[#F0E9DC] cursor-pointer"
              >
                <Bell className="w-4 h-4 text-[#C5932B]" />
                <span>Alerts ({unreadNotificationsCount})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onNavigateSection('local-ads');
                }}
                className="min-h-[44px] flex items-center gap-2 rounded-xl border border-[#E7DFCE] dark:border-[#3A3122] px-3 font-bold text-[#1C1917] dark:text-[#F0E9DC] cursor-pointer"
              >
                <Megaphone className="w-4 h-4 text-[#C5932B]" />
                <span>Local Ads</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onNavigateSection('support-chat');
                }}
                className="col-span-2 min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-[#DFC996] dark:border-[#4A3B22] bg-[#FAF7F0] dark:bg-[#221F1A] px-3 font-bold text-[#1C1917] dark:text-[#F0E9DC] cursor-pointer"
              >
                <MessageSquareHeart className="w-4 h-4 text-[#B88623] dark:text-[#E6BC5C]" />
                <span>{pickLangText('ಆಡ್ಮಿನ್‌ಗೆ ಸಂದೇಶ ಕಳುಹಿಸಿ', 'Message Admin', lang)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed 5-Tab Mobile Bottom Bar: Home · Explore · Services · Marketplace · Menu */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/95 dark:bg-[#151310]/95 backdrop-blur-md border-t border-[#E7DFCE] dark:border-[#2E2922] pb-safe shadow-[0_-4px_18px_rgba(28,25,23,0.08)]"
        aria-label="Mobile bottom navigation"
      >
        <div className="flex items-stretch justify-around px-1">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onGoHome();
            }}
            className={navBtnClass(activeTab === 'home' && !menuOpen)}
          >
            <Home className="w-5 h-5" />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onGoExplore();
            }}
            className={navBtnClass(activeTab === 'explore' && !menuOpen)}
          >
            <Compass className="w-5 h-5" />
            <span>Explore</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onGoServices();
            }}
            className={navBtnClass(activeTab === 'services' && !menuOpen)}
          >
            <Store className="w-5 h-5" />
            <span>Services</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onGoMarketplace();
            }}
            className={navBtnClass(activeTab === 'marketplace' && !menuOpen)}
          >
            <ShoppingBag className="w-5 h-5" />
            <span>Marketplace</span>
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className={navBtnClass(menuOpen)}
          >
            <div className="relative">
              <Menu className="w-5 h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#D9A441]" />
              )}
            </div>
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </>
  );
}
