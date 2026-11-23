import { useState } from 'react';
import { Download, Monitor, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar';
}

export function PWAInstallButton({ variant = 'header' }: PWAInstallButtonProps) {
  const { canNativeInstall, canShowIosGuide, isInstalled, promptInstall } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [installing, setInstalling] = useState(false);

  // Auto-hide once launched in installed standalone PWA or Android TWA mode
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (canNativeInstall) {
      setInstalling(true);
      try {
        const outcome = await promptInstall();
        if (outcome === 'unavailable') {
          setShowGuideModal(true);
        }
      } finally {
        setInstalling(false);
      }
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          disabled={installing}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-[#0B192C] hover:bg-amber-300 disabled:opacity-60 transition-colors cursor-pointer"
        >
          <Smartphone className="h-3.5 w-3.5 shrink-0" />
          <span>{installing ? 'Opening Installer…' : 'Install CoffeeNadu App'}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleClick()}
          disabled={installing}
          title="Install CoffeeNadu Admin App"
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25 disabled:opacity-60 transition-colors cursor-pointer"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden md:inline">Install App</span>
        </button>
      )}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#111C2E]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {canShowIosGuide ? 'Install on iPhone / iPad' : 'Install CoffeeNadu Admin PWA'}
                </p>
                <h3
                  id="pwa-install-guide-title"
                  className="mt-0.5 text-base font-bold text-slate-900 dark:text-white"
                >
                  {canShowIosGuide
                    ? 'Add CoffeeNadu Admin to Home Screen'
                    : 'Install on Android Chrome or Desktop'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                aria-label="Close install instructions"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {canShowIosGuide ? (
              <ol className="mt-4 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B192C] text-[11px] font-bold text-white">
                    1
                  </span>
                  <span>
                    Tap the <Share className="mx-0.5 inline h-3.5 w-3.5 align-text-bottom" />{' '}
                    <strong>Share</strong> button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B192C] text-[11px] font-bold text-white">
                    2
                  </span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B192C] text-[11px] font-bold text-white">
                    3
                  </span>
                  <span>
                    Tap <strong>Add</strong> to launch <strong>CoffeeNadu Admin</strong> in full-screen standalone mode.
                  </span>
                </li>
              </ol>
            ) : (
              <div className="mt-4 space-y-3 text-xs text-slate-700 dark:text-slate-300">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                    <Smartphone className="h-3.5 w-3.5 text-amber-500" />
                    Chrome on Android
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Open <strong>https://coffeenad-news.ai.studio/admin</strong> in Chrome, tap the{' '}
                    <strong>⋮</strong> menu, then tap <strong>Install app</strong> or{' '}
                    <strong>Add to Home screen</strong>.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                    <Monitor className="h-3.5 w-3.5 text-blue-500" />
                    Chrome / Edge on Desktop
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Click the <strong>Install</strong> icon on the right side of the browser address bar
                    (or open the browser menu → <strong>Cast, save, and share → Install CoffeeNadu Admin</strong>).
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="mt-5 w-full rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#17335C] dark:bg-blue-600 cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
