import { useState, type ComponentType, type ReactNode } from 'react';
import {
  Activity,
  BadgePlus,
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Compass,
  Cpu,
  Database,
  ExternalLink,
  FilePlus2,
  FolderArchive,
  Gamepad2,
  Globe,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Newspaper,
  Power,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { CoffeeCupLogo } from '../CoffeeCupLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { PWAStatusBanners } from './PWAStatusBanners';
import type { Admin2SessionUser, AdminPermission, AdminSectionId } from '../../types/admin2';

export interface AdminNavItem {
  id: AdminSectionId;
  label: string;
  description: string;
  group:
    | 'Editorial'
    | 'Platform Ecosystem'
    | 'Media & Audience'
    | 'Growth & Automation'
    | 'System & Security';
  icon: ComponentType<{ className?: string }>;
  requiredPermission?: AdminPermission;
}

export const ADMIN2_NAV_ITEMS: AdminNavItem[] = [
  { id: 'dashboard', label: 'Dashboard Overview', description: 'Live visitors, articles, ads & platform metrics', group: 'Editorial', icon: LayoutDashboard, requiredPermission: 'dashboard.view' },
  { id: 'news', label: 'News Management', description: 'Published articles, drafts, breaking news & categories', group: 'Editorial', icon: Newspaper, requiredPermission: 'dashboard.view' },
  { id: 'add-article', label: 'Add New Article', description: 'Publish Kannada & English news stories', group: 'Editorial', icon: FilePlus2, requiredPermission: 'news.create' },
  { id: 'ads', label: 'Local Advertisements', description: 'Manage banner slots, sponsors, clicks & schedules', group: 'Editorial', icon: Megaphone, requiredPermission: 'ads.manage' },
  { id: 'add-ad', label: 'Add Advertisement', description: 'Create a new local ad placement campaign', group: 'Editorial', icon: BadgePlus, requiredPermission: 'ads.manage' },
  { id: 'calendar', label: 'Publishing Calendar', description: 'Schedule programs, festivals & upcoming events', group: 'Editorial', icon: CalendarDays, requiredPermission: 'dashboard.view' },
  { id: 'ai-studio', label: 'AI News Studio', description: 'Editorial drafting & summarization assistant', group: 'Editorial', icon: Sparkles, requiredPermission: 'ai.use' },

  { id: 'platform-hub', label: 'Malnad Services & Listings', description: 'Businesses, Jobs, Marketplace, Agri, Health, Schemes, Tourism, Weather & more', group: 'Platform Ecosystem', icon: Compass, requiredPermission: 'dashboard.view' },
  { id: 'monthly-contest', label: 'Monthly News Contest (₹500)', description: 'Eligible news rankings, private contributor mobiles, anti-abuse alerts, winners & payouts', group: 'Platform Ecosystem', icon: Trophy, requiredPermission: 'dashboard.view' },
  { id: 'community-users', label: 'Community Users', description: 'Private registered mobile numbers, user accounts, live posts & reports', group: 'Platform Ecosystem', icon: Users, requiredPermission: 'dashboard.view' },
  { id: 'platform-moderation', label: 'Submissions & Reports', description: 'Approve or reject user submissions & resolve reports', group: 'Platform Ecosystem', icon: CheckSquare, requiredPermission: 'news.edit' },
  { id: 'platform-homepage', label: 'Homepage & Localities', description: 'Reorder homepage sections, toggle modules & manage villages', group: 'Platform Ecosystem', icon: LayoutTemplate, requiredPermission: 'settings.manage' },
  { id: 'platform-games', label: 'Games & Quizzes', description: 'Create Malnad/Kannada quizzes & manage leaderboard', group: 'Platform Ecosystem', icon: Gamepad2, requiredPermission: 'news.create' },

  { id: 'media', label: 'Media Centre', description: 'Manage uploaded photos, watermarks & folders', group: 'Media & Audience', icon: ImageIcon, requiredPermission: 'media.manage' },
  { id: 'messaging', label: 'Messaging Centre', description: 'Reply to reader messages & support chat', group: 'Media & Audience', icon: Inbox, requiredPermission: 'messaging.manage' },
  { id: 'notifications', label: 'Notification Centre', description: 'Admin alerts & delivery preferences', group: 'Media & Audience', icon: Bell, requiredPermission: 'dashboard.view' },

  { id: 'analytics', label: 'Analytics Centre', description: 'Visitors, WhatsApp shares, searches & device stats', group: 'Growth & Automation', icon: BarChart3, requiredPermission: 'analytics.view' },
  { id: 'seo', label: 'SEO Management', description: 'Metadata, slugs, sitemaps & indexing health', group: 'Growth & Automation', icon: Globe, requiredPermission: 'seo.manage' },
  { id: 'automations', label: 'Automation Centre', description: 'Scheduled syncs & editorial automations', group: 'Growth & Automation', icon: Cpu, requiredPermission: 'automations.manage' },

  { id: 'administrators', label: 'Administrator Management', description: 'Manage admin roles, accounts & permissions', group: 'System & Security', icon: Users, requiredPermission: 'admins.manage' },
  { id: 'storage', label: 'Storage Manager', description: 'Google Sheets, Drive & Apps Script connection', group: 'System & Security', icon: Database, requiredPermission: 'storage.manage' },
  { id: 'backups', label: 'Backup and Restore', description: 'Snapshots, Drive backups & JSON/CSV export', group: 'System & Security', icon: FolderArchive, requiredPermission: 'backups.manage' },
  { id: 'security', label: 'Security and Audit Logs', description: 'Login history, active sessions & audit trail', group: 'System & Security', icon: ShieldCheck, requiredPermission: 'security.view' },
  { id: 'settings', label: 'Website Settings', description: 'Site branding, contacts & global toggles', group: 'System & Security', icon: Settings, requiredPermission: 'settings.manage' },
  { id: 'health', label: 'System Health', description: 'Server status, cache health & diagnostics', group: 'System & Security', icon: Activity, requiredPermission: 'dashboard.view' },
];

const NAV_GROUPS: Array<AdminNavItem['group']> = [
  'Editorial',
  'Platform Ecosystem',
  'Media & Audience',
  'Growth & Automation',
  'System & Security',
];

interface Admin2ShellProps {
  activeSection: AdminSectionId;
  onSelectSection: (section: AdminSectionId) => void;
  sessionUser: Admin2SessionUser;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  unreadNotifications: number;
  unreadMessages: number;
  onNavigateHome: () => void;
  onSignOut: () => void;
  onExitApp?: () => void;
  showExitApp?: boolean;
  onQuickAddArticle: () => void;
  onQuickAddAd: () => void;
  children: ReactNode;
}

export function Admin2Shell({
  activeSection,
  onSelectSection,
  sessionUser,
  darkMode,
  onToggleDarkMode,
  unreadNotifications,
  unreadMessages,
  onNavigateHome,
  onSignOut,
  onExitApp,
  showExitApp = false,
  onQuickAddArticle,
  onQuickAddAd,
  children,
}: Admin2ShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navSearch, setNavSearch] = useState('');

  const hasPermission = (perm?: AdminPermission) => {
    if (!perm) return true;
    if (sessionUser.protectedSuperAdmin || sessionUser.role === 'super_admin') return true;
    return sessionUser.permissions.includes(perm);
  };

  const activeNav = ADMIN2_NAV_ITEMS.find((n) => n.id === activeSection) || ADMIN2_NAV_ITEMS[0];

  const handleNavClick = (id: AdminSectionId) => {
    onSelectSection(id);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-[#0B192C] text-slate-200">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <CoffeeCupLogo className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif text-sm font-bold tracking-tight text-white">
              CoffeeNadu News
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">
              Admin 2.0
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Sidebar Search Filter */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            placeholder="Find module or setting..."
            className="w-full rounded-lg bg-white/5 border border-white/10 pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-300/60"
          />
        </div>
      </div>

      {/* Scrollable Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5" aria-label="Admin 2.0 Navigation">
        {NAV_GROUPS.map((group) => {
          const q = navSearch.trim().toLowerCase();
          const items = ADMIN2_NAV_ITEMS.filter(
            (item) =>
              item.group === group &&
              (!q ||
                item.label.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q))
          );
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400/80">
                {group}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const allowed = hasPermission(item.requiredPermission);
                  const isActive = activeSection === item.id;
                  const badgeCount =
                    item.id === 'notifications'
                      ? unreadNotifications
                      : item.id === 'messaging'
                      ? unreadMessages
                      : 0;

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={!allowed}
                        onClick={() => handleNavClick(item.id)}
                        title={!allowed ? 'Requires elevated role permission' : item.description}
                        className={`group flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${
                          isActive
                            ? 'bg-[#17335C] text-white shadow-xs ring-1 ring-white/10'
                            : allowed
                            ? 'text-slate-300 hover:bg-white/5 hover:text-white'
                            : 'cursor-not-allowed text-slate-600 opacity-50'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              isActive ? 'text-amber-300' : 'text-slate-400 group-hover:text-slate-200'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {badgeCount > 0 && (
                          <span className="shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#0B192C]">
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Bottom Profile, PWA Install & Portal Link */}
      <div className="border-t border-white/10 p-3 space-y-2">
        <PWAInstallButton variant="sidebar" />
        <div className="rounded-lg bg-white/5 px-3 py-2.5">
          <p className="truncate text-xs font-semibold text-white">{sessionUser.fullName}</p>
          <p className="truncate text-[11px] text-slate-400">{sessionUser.email}</p>
          <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-amber-300">
            <span>{sessionUser.customRoleLabel || sessionUser.role.replace('_', ' ')}</span>
            <span className="text-slate-400">
              {sessionUser.authProvider === 'firebase' ? 'Google Auth' : 'RBAC Session'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onNavigateHome}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Live Site
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/15 transition-colors"
            title="Sign Out"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
        {showExitApp && onExitApp && (
          <button
            type="button"
            onClick={onExitApp}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 transition-colors"
            title="Revoke session and exit CoffeeNadu Admin app"
          >
            <Power className="h-3.5 w-3.5" />
            Exit App &amp; Lock Session
          </button>
        )}
      </div>
    </div>
  );

  const mobileBottomItems: Array<{
    id: AdminSectionId | 'menu';
    label: string;
    icon: ComponentType<{ className?: string }>;
    allowed: boolean;
    badge?: number;
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      allowed: hasPermission('dashboard.view'),
    },
    {
      id: 'news',
      label: 'News',
      icon: Newspaper,
      allowed: hasPermission('dashboard.view'),
    },
    {
      id: 'add-article',
      label: 'Add News',
      icon: FilePlus2,
      allowed: hasPermission('news.create'),
    },
    {
      id: 'media',
      label: 'Media',
      icon: ImageIcon,
      allowed: hasPermission('media.manage'),
    },
    {
      id: 'menu',
      label: 'More',
      icon: Menu,
      allowed: true,
      badge: unreadMessages + unreadNotifications,
    },
  ];

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 dark:bg-[#0B1220] dark:text-slate-100">
        {/* Desktop Fixed Navy Sidebar */}
        <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col border-r border-slate-900/20">
          {renderSidebarContent()}
        </aside>

        {/* Mobile Collapsible Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col shadow-2xl">
              {renderSidebarContent()}
            </aside>
          </div>
        )}

        {/* Main Content Workspace */}
        <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
          {/* Top Header Bar */}
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-sm dark:border-slate-800 dark:bg-[#0F172A]/95 sm:px-6">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 min-w-0">
                <span className="hidden sm:inline font-medium">{activeNav.group}</span>
                <ChevronRight className="hidden sm:inline h-3.5 w-3.5 text-slate-400" />
                <h1 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                  {activeNav.label}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <PWAInstallButton variant="header" />

              {hasPermission('news.create') && (
                <button
                  type="button"
                  onClick={onQuickAddArticle}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors sm:px-3 whitespace-nowrap cursor-pointer"
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Publish Article</span>
                </button>
              )}

              {hasPermission('ads.manage') && (
                <button
                  type="button"
                  onClick={onQuickAddAd}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/70 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-[#0B192C] hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25 transition-colors sm:px-3 whitespace-nowrap cursor-pointer"
                  title="Add Advertisement"
                >
                  <BadgePlus className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Add Advertisement</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onSelectSection('notifications')}
                className="relative rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                aria-label="Notification Centre"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold tabular-nums text-white">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleDarkMode}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
              </button>

              {showExitApp && onExitApp && (
                <button
                  type="button"
                  onClick={onExitApp}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50 transition-colors"
                  aria-label="Exit App and Revoke Session"
                  title="Exit App & Revoke Session"
                >
                  <Power className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Exit</span>
                </button>
              )}
            </div>
          </header>

          {/* Offline / Reconnect / App Update Banners */}
          <PWAStatusBanners />

          {/* Active Section Content */}
          <main className="flex-1 p-4 pb-24 sm:p-6 lg:p-7 lg:pb-7">
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </main>

          {/* Mobile & Android App Bottom Navigation Bar */}
          <nav
            aria-label="Mobile Quick Navigation"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-[#0F172A]/95 lg:hidden pb-[env(safe-area-inset-bottom)]"
          >
            <div className="grid grid-cols-5">
              {mobileBottomItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.id !== 'menu' && activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!item.allowed}
                    onClick={() => {
                      if (item.id === 'menu') {
                        setMobileMenuOpen(true);
                      } else if (item.id === 'add-article') {
                        onQuickAddArticle();
                      } else {
                        handleNavClick(item.id);
                      }
                    }}
                    className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${
                      isActive
                        ? 'text-[#0B192C] dark:text-amber-300'
                        : item.allowed
                        ? 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        : 'opacity-40 cursor-not-allowed text-slate-400'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-rose-600" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
