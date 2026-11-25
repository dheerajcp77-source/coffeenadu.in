import { Bell, BellOff, CheckCheck, MapPin, ShieldCheck, X } from 'lucide-react';
import { getKannadaLocationLabel } from '../constants/newsData';
import type { NewsArticle } from '../types/news';
import type {
  InAppNotificationItem,
  ReaderNotificationSettings,
} from '../utils/readerPreferences';
import { stripRichTextToPlainText } from '../utils/richText';

interface NotificationCenterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderNotificationSettings;
  onUpdateSettings: (next: ReaderNotificationSettings) => void;
  onRequestBrowserPermission: () => Promise<void>;
  browserPermission: NotificationPermission | 'unsupported';
  notifications: InAppNotificationItem[];
  articles: NewsArticle[];
  onMarkAllRead: () => void;
  onSelectArticle: (article: NewsArticle) => void;
}

export function NotificationCenterDrawer({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onRequestBrowserPermission,
  browserPermission,
  notifications,
  articles,
  onMarkAllRead,
  onSelectArticle,
}: NotificationCenterDrawerProps) {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const openNotificationArticle = (articleId: string) => {
    const found = articles.find((a) => a.id === articleId);
    if (found) {
      onSelectArticle(found);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex justify-end bg-slate-950/65 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-center-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md h-full bg-white dark:bg-[#0F1E33] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        <div className="bg-[#10243D] text-white px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#D9A441]" />
            <div>
              <h2 id="notification-center-title" className="text-sm font-bold">
                Breaking News & Alerts
              </h2>
              <p className="font-kannada text-[11px] text-slate-300">
                ತಾಜಾ ಸುದ್ದಿ ಸೂಚನೆಗಳು
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B1728] space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-[#17263A] dark:text-white">
                Browser Breaking Alerts
              </p>
              <p className="text-[11px] text-[#738093] dark:text-slate-400 mt-0.5">
                {browserPermission === 'unsupported'
                  ? 'Browser notifications are not supported on this device. In-app alerts remain active.'
                  : browserPermission === 'denied'
                  ? 'Browser notifications are blocked in browser settings.'
                  : settings.browserEnabled && browserPermission === 'granted'
                  ? 'Enabled for new breaking news headlines.'
                  : 'Opt-in only — we never ask without your click.'}
              </p>
            </div>
            {browserPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={() => {
                  if (browserPermission !== 'granted') {
                    void onRequestBrowserPermission();
                  } else {
                    onUpdateSettings({
                      ...settings,
                      browserEnabled: !settings.browserEnabled,
                    });
                  }
                }}
                disabled={browserPermission === 'denied'}
                className={`shrink-0 min-h-[36px] px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                  settings.browserEnabled && browserPermission === 'granted'
                    ? 'bg-[#176B4A] text-white'
                    : 'bg-[#10243D] text-white dark:bg-[#D9A441] dark:text-[#10243D]'
                }`}
              >
                {settings.browserEnabled && browserPermission === 'granted' ? 'Active' : 'Enable'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#13253E] px-2.5 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.breakingOnly}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, breakingOnly: e.target.checked })
                }
              />
              <span className="text-[#17263A] dark:text-slate-200 font-medium">
                Breaking news
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#13253E] px-2.5 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.localCategoryAlerts}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, localCategoryAlerts: e.target.checked })
                }
              />
              <span className="text-[#17263A] dark:text-slate-200 font-medium">
                Local alerts
              </span>
            </label>
          </div>
        </div>

        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#738093] dark:text-slate-400">
            Recent Alerts {unreadCount > 0 ? `(${unreadCount} new)` : ''}
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <BellOff className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-[#17263A] dark:text-white">
                No alerts yet
              </p>
              <p className="font-kannada text-xs text-[#738093] dark:text-slate-400 mt-1">
                ಹೊಸ ಪ್ರಮುಖ ಸುದ್ದಿಗಳು ಪ್ರಕಟವಾದಾಗ ಇಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತದೆ.
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const place = getKannadaLocationLabel(item.location).split('(')[0].trim();
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openNotificationArticle(item.articleId)}
                  className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                    !item.read ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#738093] dark:text-slate-400 mb-1">
                    <span className="inline-flex items-center gap-1 font-bold text-[#176B4A] dark:text-emerald-400">
                      <ShieldCheck className="w-3 h-3" />
                      {item.category}
                    </span>
                    <span className="inline-flex items-center gap-1 font-kannada">
                      <MapPin className="w-3 h-3" />
                      {place}
                    </span>
                  </div>
                  <p className="font-kannada text-sm font-bold text-[#17263A] dark:text-slate-100 leading-snug">
                    {stripRichTextToPlainText(item.title)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
