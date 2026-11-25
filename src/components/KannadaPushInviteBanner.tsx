import { useState } from 'react';
import { BellRing, CheckCircle2, Share, X } from 'lucide-react';
import { isIosDeviceNotStandalone } from '../utils/webPushClient';

interface KannadaPushInviteBannerProps {
  browserPermission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  onEnablePush: () => Promise<{ ok: boolean; message: string }>;
  onDismiss: () => void;
  onOpenSettingsDrawer?: () => void;
}

export function KannadaPushInviteBanner({
  browserPermission,
  isSubscribed,
  onEnablePush,
  onDismiss,
  onOpenSettingsDrawer,
}: KannadaPushInviteBannerProps) {
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusOk, setStatusOk] = useState(false);

  const iosInstallNeeded = isIosDeviceNotStandalone();

  if (isSubscribed && !statusOk) {
    return null;
  }

  const handleEnableClick = async () => {
    if (busy) return;
    setBusy(true);
    setStatusMessage('');
    try {
      const res = await onEnablePush();
      setStatusOk(res.ok);
      setStatusMessage(res.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Mobile Breaking News Notifications"
      className="relative overflow-hidden rounded-2xl border border-[#D9A441]/50 bg-gradient-to-r from-[#10243D] via-[#152E4D] to-[#10243D] text-white px-4 py-3.5 sm:px-5 sm:py-4 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#D9A441]/15 border border-[#D9A441]/40 flex items-center justify-center shrink-0 mt-0.5">
            {statusOk ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            ) : (
              <BellRing className="w-4 h-4 text-[#D9A441]" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="font-kannada text-sm sm:text-[15px] font-bold text-white leading-snug">
              ಕಾಫಿನಾಡು ನ್ಯೂಸ್ ನೋಟಿಫಿಕೇಶನ್ ಆನ್ ಮಾಡಿ, ನಿಮ್ಮ ಮೊಬೈಲ್‌ನಲ್ಲಿಯೇ ತಕ್ಷಣದ ಸ್ಥಳೀಯ ಸುದ್ದಿಗಳನ್ನು ಪಡೆಯಿರಿ.
            </p>
            <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
              Enable Coffeenadu News notifications and receive important local updates directly on your mobile.
            </p>

            {iosInstallNeeded && !statusMessage && (
              <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-200 pt-0.5">
                <Share className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>iPhone/iPad: Tap Share → Add to Home Screen first to enable mobile alerts.</span>
              </p>
            )}

            {statusMessage && (
              <p
                className={`text-xs font-semibold pt-0.5 ${
                  statusOk ? 'text-emerald-300' : 'text-amber-200'
                }`}
              >
                {statusMessage}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 pl-12 sm:pl-0">
          {statusOk ? (
            onOpenSettingsDrawer && (
              <button
                type="button"
                onClick={onOpenSettingsDrawer}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Customize Alerts
              </button>
            )
          ) : browserPermission === 'denied' ? (
            onOpenSettingsDrawer ? (
              <button
                type="button"
                onClick={onOpenSettingsDrawer}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-[#D9A441] hover:bg-[#E5B65C] text-[#10243D] px-3.5 py-2 text-xs font-extrabold transition-colors cursor-pointer"
              >
                <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Alert Settings</span>
              </button>
            ) : (
              <span className="text-[11px] font-semibold text-amber-200 px-2">
                Allow notifications in site settings
              </span>
            )
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleEnableClick()}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-[#D9A441] hover:bg-[#E5B65C] text-[#10243D] px-3.5 py-2 text-[11px] sm:text-xs font-extrabold uppercase tracking-wide transition-colors cursor-pointer disabled:opacity-60"
            >
              <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{busy ? 'Activating...' : 'ENABLE BREAKING NEWS ALERTS'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification prompt"
            className="min-h-[40px] inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 hover:bg-white/15 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Maybe Later</span>
          </button>
        </div>
      </div>
    </section>
  );
}
