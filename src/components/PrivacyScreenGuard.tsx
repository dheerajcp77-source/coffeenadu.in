import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';

interface PrivacyScreenGuardProps {
  enabled: boolean;
  children: ReactNode;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function PrivacyScreenGuard({ enabled, children }: PrivacyScreenGuardProps) {
  const [isBlurred, setIsBlurred] = useState(false);
  const [shieldReason, setShieldReason] = useState(
    'Protected News Content — Screenshots, copying, and image downloads are disabled.'
  );
  const requiresManualResumeRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);
  const lastViewportSizeRef = useRef<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 0,
    h: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const triggerShield = useCallback(
    (reason: string, manualResume: boolean) => {
      if (!enabled) return;
      clearResumeTimer();
      setShieldReason(reason);
      if (manualResume) {
        requiresManualResumeRef.current = true;
      }
      setIsBlurred(true);
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        // Ignore selection clearing issues
      }
    },
    [enabled, clearResumeTimer]
  );

  const scheduleAutoResume = useCallback(() => {
    clearResumeTimer();
    resumeTimerRef.current = window.setTimeout(() => {
      if (!requiresManualResumeRef.current && document.visibilityState === 'visible') {
        setIsBlurred(false);
      }
    }, 350);
  }, [clearResumeTimer]);

  useEffect(() => {
    if (!enabled) {
      setIsBlurred(false);
      requiresManualResumeRef.current = false;
      clearResumeTimer();
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        triggerShield(
          'Screen privacy shield active while app is minimized or screenshot tray is open.',
          false
        );
      } else if (!requiresManualResumeRef.current) {
        scheduleAutoResume();
      }
    };

    const handleWindowBlur = () => {
      triggerShield(
        'Screen privacy shield active — content blurs automatically when switching apps or capturing screen.',
        false
      );
    };

    const handleWindowFocus = () => {
      if (!requiresManualResumeRef.current && document.visibilityState === 'visible') {
        scheduleAutoResume();
      }
    };

    const handlePageHide = () => {
      triggerShield('Screen privacy shield active.', false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      const isPrintScreen = e.key === 'PrintScreen' || e.code === 'PrintScreen';
      const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5', 's'].includes(key);
      const isWinSnippet = (e.metaKey || e.ctrlKey) && e.shiftKey && key === 's';
      const isPrint = mod && key === 'p';
      const isCopyOrSave =
        (mod && ['c', 'x', 'a', 's', 'u'].includes(key)) ||
        (mod && e.key === 'Insert');
      const isDevTools =
        e.key === 'F12' || (mod && e.shiftKey && ['i', 'j', 'c', 'k'].includes(key));

      if (isPrintScreen || isMacScreenshot || isWinSnippet) {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText('© Coffeenadu News — Protected Content');
          }
        } catch {
          // Ignore clipboard permissions
        }
        triggerShield(
          'Screenshot attempt detected. News content is hidden to protect Coffeenadu News copyrights.',
          true
        );
        return;
      }

      if (isPrint) {
        e.preventDefault();
        e.stopPropagation();
        triggerShield('Printing and PDF export are disabled for protected news articles.', true);
        return;
      }

      if (isCopyOrSave && !isEditableTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        triggerShield('Copying or saving news articles is disabled.', true);
        return;
      }

      if (isDevTools) {
        e.preventDefault();
        e.stopPropagation();
        triggerShield('Developer inspection is restricted on protected news content.', true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        triggerShield(
          'Screenshot attempt detected. News content is hidden to protect Coffeenadu News copyrights.',
          true
        );
      }
    };

    // Detect mobile 3-finger screenshot swipe gesture (common across Android OEMs)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 3) {
        e.preventDefault();
        triggerShield(
          'Multi-finger screenshot gesture blocked. Tap Resume Reading to continue.',
          true
        );
      }
    };

    // Detect sudden mobile OS overlay/screenshot preview viewport jumps when no input is focused
    const handleViewportResize = () => {
      if (isEditableTarget(document.activeElement)) return;
      const prev = lastViewportSizeRef.current;
      const nextW = window.innerWidth;
      const nextH = window.innerHeight;
      const heightJump = Math.abs(nextH - prev.h);
      lastViewportSizeRef.current = { w: nextW, h: nextH };
      if (prev.h > 0 && heightJump > 180 && nextW === prev.w && !document.hasFocus()) {
        triggerShield('Screen capture protection active.', false);
      }
    };

    const handleBeforePrint = () => {
      triggerShield('Printing is disabled for protected news articles.', true);
    };

    const handleCopyOrCut = (e: Event) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      triggerShield('Copying news text is disabled on Coffeenadu News.', true);
    };

    const handleSelectStart = (e: Event) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
    };

    const handleSelectionChange = () => {
      if (isEditableTarget(document.activeElement)) return;
      try {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          selection.removeAllRanges();
        }
      } catch {
        // Ignore selection clearing errors
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
    };

    const handleDragStart = (e: DragEvent) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('beforeprint', handleBeforePrint);
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('selectstart', handleSelectStart, true);
    document.addEventListener('selectionchange', handleSelectionChange, true);
    document.addEventListener('beforecopy', handleCopyOrCut, true);
    document.addEventListener('copy', handleCopyOrCut, true);
    document.addEventListener('cut', handleCopyOrCut, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('dragstart', handleDragStart, true);
    window.visualViewport?.addEventListener('resize', handleViewportResize);

    return () => {
      clearResumeTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('selectstart', handleSelectStart, true);
      document.removeEventListener('selectionchange', handleSelectionChange, true);
      document.removeEventListener('beforecopy', handleCopyOrCut, true);
      document.removeEventListener('copy', handleCopyOrCut, true);
      document.removeEventListener('cut', handleCopyOrCut, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
    };
  }, [enabled, triggerShield, scheduleAutoResume, clearResumeTimer]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative news-protected news-protected-root">
      <div className={isBlurred ? 'news-privacy-blurred' : undefined}>{children}</div>

      {/* Print-blocked notice when browser print is triggered */}
      <div className="news-print-blocked fixed inset-0 z-[100] bg-white text-slate-900 items-center justify-center p-8 text-center">
        <p className="text-base font-bold">
          © 2026 Coffeenadu News — Printing and copying news articles is disabled.
        </p>
      </div>

      {/* High-priority mobile & desktop privacy blur overlay */}
      {isBlurred && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Screen protection active"
          className="fixed inset-0 z-[90] bg-slate-950/88 backdrop-blur-xl flex items-center justify-center p-6 text-center select-none"
        >
          <div className="max-w-sm w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-white">
                Coffeenadu News Content Protected
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">{shieldReason}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                requiresManualResumeRef.current = false;
                setIsBlurred(false);
              }}
              className="w-full py-2.5 px-4 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer min-h-[42px]"
            >
              Tap to Resume Reading
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
