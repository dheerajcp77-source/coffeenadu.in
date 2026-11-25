import { useState } from 'react';
import {
  Bell,
  Bookmark,
  Bus,
  CalendarDays,
  Flame,
  History,
  Home,
  Megaphone,
  Menu,
  MessageSquareHeart,
  Moon,
  Newspaper,
  Search,
  Sun,
  X,
} from 'lucide-react';
import type { PublicThemeMode } from '../utils/readerPreferences';

export type MobileNavTab = 'home' | 'latest' | 'trending' | 'search' | 'menu';

interface BottomMobileNavProps {
  activeTab: MobileNavTab;
  theme: PublicThemeMode;
  bookmarkCount: number;
  unreadNotificationsCount: number;
  onGoHome: () => void;
  onGoLatest: () => void;
  onGoTrending: () => void;
  onOpenSearch: () => void;
  onOpenSaved: () => void;
  onOpenHistory: () => void;
  onOpenNotifications: () => void;
  onToggleTheme: () => void;
  onNavigateSection: (section: 'bus-timings' | 'events' | 'local-ads' | 'support-chat') => void;
}

export function BottomMobileNav({
  activeTab,
  theme,
  bookmarkCount,
  unreadNotificationsCount,
  onGoHome,
  onGoLatest,
  onGoTrending,
  onOpenSearch,
  onOpenSaved,
  onOpenHistory,
  onOpenNotifications,
  onToggleTheme,
  onNavigateSection,
}: BottomMobileNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navBtnClass = (isActive: boolean) =>
    `flex-1 min-h-[54px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
      isActive
        ? 'text-[#10243D] dark:text-[#D9A441]'
        : 'text-[#738093] dark:text-slate-400 hover:text-[#17263A] dark:hover:text-white'
    }`;

  return (
    <>
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden bg-slate-950/60 backdrop-blur-[1px] flex items-end"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile quick menu"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMenuOpen(false);
          }}
        >
          <div className="w-full rounded-t-2xl bg-white dark:bg-[#0F1E33] border-t border-slate-200 dark:border-slate-800 p-4 pb-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#17263A] dark:text-white">
                  Coffeenadu Quick Menu
                </h3>
                <p className="font-kannada text-[11px] text-[#738093] dark:text-slate-400">
                  ಸೇವೆಗಳು ಮತ್ತು ಓದುಗರ ಆಯ್ಕೆಗಳು
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close mobile menu"
                className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSaved();
                }}
                className="min-h-[48px] flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] px-3 py-2.5 text-left text-xs font-bold text-[#17263A] dark:text-slate-100 cursor-pointer"
              >
                <Bookmark className="w-4 h-4 text-[#176B4A] dark:text-[#D9A441] shrink-0" />
                <span>Saved ({bookmarkCount})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenHistory();
                }}
                className="min-h-[48px] flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] px-3 py-2.5 text-left text-xs font-bold text-[#17263A] dark:text-slate-100 cursor-pointer"
              >
                <History className="w-4 h-4 text-[#10243D] dark:text-sky-400 shrink-0" />
                <span>Reading History</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenNotifications();
                }}
                className="min-h-[48px] flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] px-3 py-2.5 text-left text-xs font-bold text-[#17263A] dark:text-slate-100 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#D9A441] shrink-0" />
                  <span>Alerts</span>
                </span>
                {unreadNotificationsCount > 0 && (
                  <span className="rounded bg-[#D9A441] px-1.5 py-0.5 text-[10px] font-extrabold text-[#10243D]">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleTheme}
                className="min-h-[48px] flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] px-3 py-2.5 text-left text-xs font-bold text-[#17263A] dark:text-slate-100 cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-[#D9A441] shrink-0" />
                ) : (
                  <Moon className="w-4 h-4 text-[#10243D] shrink-0" />
                )}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
            </div>

            <div className="pt-1 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onNavigateSection('bus-timings');
                }}
                className="min-h-[46px] flex items-center gap-2 rounded-xl bg-[#10243D] text-white px-3 text-xs font-bold cursor-pointer"
              >
                <Bus className="w-4 h-4 text-[#D9A441]" />
                <span>Bus Timings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onNavigateSection('events');
                }}
                className="min-h-[46px] flex items-center gap-2 rounded-xl bg-[#176B4A] text-white px-3 text-xs font-bold cursor-pointer"
              >
                <CalendarDays className="w-4 h-4 text-amber-200" />
                <span>Programs & Events</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onNavigateSection('local-ads');
                }}
                className="min-h-[46px] flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-bold text-[#17263A] dark:text-slate-100 cursor-pointer"
              >
                <Megaphone className="w-4 h-4 text-amber-500" />
                <span>Local Ads</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onNavigateSection('support-chat');
                }}
                className="min-h-[46px] flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-bold text-[#17263A] dark:text-slate-100 cursor-pointer"
              >
                <MessageSquareHeart className="w-4 h-4 text-[#176B4A] dark:text-emerald-400" />
                <span>Message Admin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/95 dark:bg-[#0B1626]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe shadow-[0_-4px_18px_rgba(16,36,61,0.08)]"
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
              onGoLatest();
            }}
            className={navBtnClass(activeTab === 'latest' && !menuOpen)}
          >
            <Newspaper className="w-5 h-5" />
            <span>Latest</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onGoTrending();
            }}
            className={navBtnClass(activeTab === 'trending' && !menuOpen)}
          >
            <Flame className="w-5 h-5" />
            <span>Trending</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onOpenSearch();
            }}
            className={navBtnClass(activeTab === 'search' && !menuOpen)}
          >
            <Search className="w-5 h-5" />
            <span>Search</span>
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
