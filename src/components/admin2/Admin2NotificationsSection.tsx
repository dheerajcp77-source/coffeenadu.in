import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  Sliders,
  Smartphone,
} from 'lucide-react';
import {
  fetchAdmin2Notifications,
  markAdmin2NotificationRead,
  updateAdmin2NotificationPrefs,
} from '../../services/admin2Client';
import type { Admin2Notification, Admin2NotificationPreferences } from '../../types/admin2';

interface Admin2NotificationsSectionProps {
  onUnreadCountChange?: (count: number) => void;
}

const PREF_LABELS: Array<{ key: keyof Admin2NotificationPreferences; label: string; desc: string }> = [
  { key: 'publishingSuccess', label: 'Publishing Success Alerts', desc: 'Confirmations when articles go live in Google Sheets' },
  { key: 'publishingFailure', label: 'Publishing Failure Alerts', desc: 'Immediate warning if scheduled or live publishing fails' },
  { key: 'imageProcessing', label: 'Image Branding & Drive Uploads', desc: 'Watermark & Google Drive photo processing activity' },
  { key: 'backupAlerts', label: 'Backup & Restore Status', desc: 'Daily backup completions and restore confirmations' },
  { key: 'storageWarnings', label: 'Storage & Quota Warnings', desc: 'Apps Script quota and cache capacity notices' },
  { key: 'automationErrors', label: 'Automation Errors', desc: 'Alerts when any scheduled job encounters an error' },
  { key: 'adminSecurityActivity', label: 'Admin Security Activity', desc: 'Failed sign-ins, new accounts, and session revocations' },
  { key: 'readerMessages', label: 'Reader Inbox Notifications', desc: 'New messages sent by portal visitors' },
];

export function Admin2NotificationsSection({ onUnreadCountChange }: Admin2NotificationsSectionProps) {
  const [notifications, setNotifications] = useState<Admin2Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [prefs, setPrefs] = useState<Admin2NotificationPreferences | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const supportsWebNotifications =
    typeof window !== 'undefined' && 'Notification' in window;
  const [devicePermission, setDevicePermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'unsupported'
  );
  const [deviceAlertStatus, setDeviceAlertStatus] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAdmin2Notifications();
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
      setPrefs(res.preferences || null);
      onUnreadCountChange?.(res.unreadCount || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleMarkRead = async (id?: string, all?: boolean) => {
    const res = await markAdmin2NotificationRead({ id, all });
    setUnreadCount(res.unreadCount);
    onUnreadCountChange?.(res.unreadCount);
    setNotifications((prev) =>
      prev.map((n) => (all || n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleTogglePref = async (key: keyof Admin2NotificationPreferences) => {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      const res = await updateAdmin2NotificationPrefs({ [key]: !prefs[key] });
      setPrefs(res.preferences);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleEnableDeviceAlerts = async () => {
    if (!supportsWebNotifications) return;
    setDeviceAlertStatus('');
    try {
      const permission = await window.Notification.requestPermission();
      setDevicePermission(permission);
      if (permission === 'granted') {
        setDeviceAlertStatus('Device notifications enabled for CoffeeNadu Admin.');
      } else if (permission === 'denied') {
        setDeviceAlertStatus('Permission blocked in browser settings. Enable notifications in site permissions to receive alerts.');
      }
    } catch {
      setDeviceAlertStatus('Unable to request notification permission in this browser context.');
    }
  };

  const handleSendTestDeviceAlert = async () => {
    if (!supportsWebNotifications || devicePermission !== 'granted') return;
    const title = 'CoffeeNadu Admin Alert';
    const options: NotificationOptions = {
      body: 'Device notifications are active for publishing, backup, and security alerts.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'coffeenadu-admin-test',
      data: { url: '/admin?section=notifications' },
    };
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, options);
          setDeviceAlertStatus('Test notification delivered via installed Service Worker.');
          return;
        }
      }
      new window.Notification(title, options);
      setDeviceAlertStatus('Test notification delivered.');
    } catch {
      setDeviceAlertStatus('Could not dispatch test notification on this device.');
    }
  };

  const filtered =
    categoryFilter === 'all'
      ? notifications
      : notifications.filter((n) => n.category === categoryFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Notification Centre
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Central dashboard for publishing, image branding, backups, storage health, automation errors, and admin security alerts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkRead(undefined, true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark All Read ({unreadCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Notification Feed */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E] xl:col-span-8">
          <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3 dark:border-slate-800">
            {['all', 'publishing', 'image', 'backup', 'storage', 'automation', 'security'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${
                  categoryFilter === cat
                    ? 'bg-[#0B192C] text-white dark:bg-blue-600'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {loading && notifications.length === 0 ? (
            <div className="flex h-40 items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              <Bell className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              No notifications in this category.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((n) => {
                const Icon =
                  n.severity === 'error' || n.severity === 'warning'
                    ? AlertCircle
                    : n.severity === 'success'
                    ? CheckCircle2
                    : Info;
                const iconColor =
                  n.severity === 'error'
                    ? 'text-rose-600'
                    : n.severity === 'warning'
                    ? 'text-amber-600'
                    : n.severity === 'success'
                    ? 'text-emerald-600'
                    : 'text-blue-600';

                return (
                  <li
                    key={n.id}
                    className={`flex items-start justify-between gap-3 py-3 text-xs ${
                      !n.read ? 'bg-blue-50/40 -mx-2 px-2 rounded-lg dark:bg-blue-950/20' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white">{n.title}</p>
                        <p className="mt-0.5 text-slate-600 dark:text-slate-300">{n.message}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-400 tabular-nums">
                          {n.category} · {new Date(n.timestamp).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(n.id)}
                        className="shrink-0 text-[11px] font-semibold text-[#1D4ED8] hover:underline dark:text-blue-400"
                      >
                        Mark Read
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Preferences & Mobile/PWA Device Alerts Panel */}
        <aside className="space-y-5 xl:col-span-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <Smartphone className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Mobile &amp; Browser Alerts
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Opt in to receive system alerts on your phone or desktop when articles publish, backups finish, or security events occur.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {devicePermission === 'unsupported' ? (
                <span className="text-[11px] font-medium text-slate-500">
                  Browser notifications are not supported on this device.
                </span>
              ) : devicePermission === 'granted' ? (
                <button
                  type="button"
                  onClick={() => void handleSendTestDeviceAlert()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  <BellRing className="h-3.5 w-3.5" />
                  Send Test Notification
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleEnableDeviceAlerts()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#17335C] dark:bg-blue-600 transition-colors"
                >
                  <BellRing className="h-3.5 w-3.5" />
                  Enable Device Notifications
                </button>
              )}
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Status: {devicePermission}
              </span>
            </div>
            {deviceAlertStatus && (
              <p className="mt-2.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {deviceAlertStatus}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <Sliders className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Notification Preferences
              </h3>
            </div>
            {prefs && (
              <div className="space-y-3">
                {PREF_LABELS.map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{item.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      disabled={savingPrefs}
                      checked={Boolean(prefs[item.key])}
                      onChange={() => void handleTogglePref(item.key)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#0B192C]"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
