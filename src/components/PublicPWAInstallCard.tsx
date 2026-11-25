import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PublicPWAInstallCard() {
  const { isInstalled, canShowIosGuide, canNativeInstall, promptInstall } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (canNativeInstall) {
      const outcome = await promptInstall();
      if (outcome !== 'accepted') setShowGuide(true);
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <section
        aria-label="Install Coffeenadu News App"
        className="bg-gradient-to-br from-[#10243D] to-[#173359] text-white border border-[#1E3A5F] rounded-xl p-4 sm:p-5 shadow-xs space-y-3"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D9A441]/15 border border-[#D9A441]/40 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-[#D9A441]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#D9A441]">
              Mobile News App
            </h2>
            <p className="font-kannada text-sm font-bold text-white leading-snug mt-0.5">
              ಕಾಫಿನಾಡು ನ್ಯೂಸ್ ಆ್ಯಪ್ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ
            </p>
            <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
              Install Coffeenadu News on your home screen for one-tap Koppa headlines and mobile push alerts.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#D9A441] hover:bg-[#E5B65C] text-[#10243D] text-xs font-extrabold transition-colors cursor-pointer"
        >
          {canShowIosGuide ? (
            <Share className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Download className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{canShowIosGuide ? 'Add to iPhone / iPad' : 'Install Coffeenadu App'}</span>
        </button>
      </section>

      {showGuide && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-pwa-guide-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGuide(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0F1E33] border border-slate-200 dark:border-slate-700 p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3
                  id="public-pwa-guide-title"
                  className="text-sm font-bold text-[#10243D] dark:text-white"
                >
                  Install Coffeenadu News App
                </h3>
                <p className="font-kannada text-xs text-[#738093] dark:text-slate-300 mt-0.5">
                  ಹೋಮ್ ಸ್ಕ್ರೀನ್‌ಗೆ ಸೇರಿಸಿ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install guide"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {canShowIosGuide ? (
              <ol className="text-xs text-[#17263A] dark:text-slate-200 space-y-2 list-decimal pl-4 leading-relaxed">
                <li>
                  Open this page in <strong>Safari</strong> on your iPhone or iPad.
                </li>
                <li>
                  Tap the <strong>Share</strong> icon in the bottom or top toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>, then confirm.
                </li>
              </ol>
            ) : (
              <ol className="text-xs text-[#17263A] dark:text-slate-200 space-y-2 list-decimal pl-4 leading-relaxed">
                <li>
                  Tap your browser menu (<strong>⋮</strong> in Chrome or <strong>⋯</strong> in Edge).
                </li>
                <li>
                  Select <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </li>
                <li>Confirm to launch Coffeenadu News just like a mobile app.</li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[40px] rounded-lg bg-[#10243D] dark:bg-[#D9A441] text-white dark:text-[#10243D] text-xs font-bold cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
