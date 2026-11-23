import { useEffect, useState } from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { applyPwaUpdate, subscribeToPwaUpdate } from '../../pwa/registerSW';

export function PWAStatusBanners() {
  const { isOnline, justReconnected } = useOnlineStatus();
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    return subscribeToPwaUpdate(setHasUpdate);
  }, []);

  if (isOnline && !justReconnected && !hasUpdate) {
    return null;
  }

  return (
    <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-[#0D1626] sm:px-6">
      {!isOnline && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-600/40 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span className="flex items-center gap-2 font-semibold">
            <WifiOff className="h-4 w-4 shrink-0" />
            You are offline — publishing, uploads, and live admin APIs require an active internet connection.
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-amber-400/60 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-amber-950 hover:bg-white dark:bg-amber-900/40 dark:text-amber-100"
          >
            Retry
          </button>
        </div>
      )}

      {isOnline && justReconnected && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <Wifi className="h-4 w-4 shrink-0" />
          Connection restored — CoffeeNadu Admin is synced with the live backend.
        </div>
      )}

      {hasUpdate && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950 dark:border-blue-700/50 dark:bg-blue-950/40 dark:text-blue-100"
        >
          <span className="font-semibold">
            A new version of CoffeeNadu Admin is ready.
          </span>
          <button
            type="button"
            disabled={updating}
            onClick={() => {
              setUpdating(true);
              void applyPwaUpdate();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0B192C] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#17335C] disabled:opacity-60 dark:bg-blue-600"
          >
            <RefreshCw className={`h-3 w-3 ${updating ? 'animate-spin' : ''}`} />
            {updating ? 'Updating…' : 'Update Now'}
          </button>
        </div>
      )}
    </div>
  );
}
