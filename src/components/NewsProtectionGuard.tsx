import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

type MaskReason = 'screenshot' | 'pulldown' | 'visibility' | 'blur' | 'print' | null;

const PULLDOWN_COOLDOWN_MS = 5000;

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]')
  );
}

function setRootBlurImmediate(blurred: boolean): void {
  try {
    const rootEl = document.getElementById('news-protected-root');
    if (!rootEl) return;
    if (blurred) {
      rootEl.classList.add('news-privacy-blurred');
    } else {
      rootEl.classList.remove('news-privacy-blurred');
    }
  } catch {
    // Ignore DOM access errors
  }
}

interface NewsProtectionGuardProps {
  enabled: boolean;
}

export function NewsProtectionGuard({ enabled }: NewsProtectionGuardProps) {
  const [maskReason, setMaskReason] = useState<MaskReason>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [notice, setNotice] = useState<string | null>(null);

  const maskReasonRef = useRef<MaskReason>(null);
  const lockUntilRef = useRef<number>(0);
  const noticeTimerRef = useRef<number | null>(null);
  const cooldownIntervalRef = useRef<number | null>(null);

  const clearCooldownTimer = useCallback(() => {
    if (cooldownIntervalRef.current !== null) {
      window.clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
  }, []);

  const syncSecondsRemaining = useCallback(() => {
    const remainingMs = lockUntilRef.current - Date.now();
    if (remainingMs <= 0) {
      setSecondsLeft(0);
      return 0;
    }
    const secs = Math.ceil(remainingMs / 1000);
    setSecondsLeft(secs);
    return secs;
  }, []);

  const applyMask = useCallback(
    (nextReason: MaskReason, cooldownMs = 0) => {
      if (nextReason === null) {
        if (Date.now() < lockUntilRef.current) {
          return;
        }
        clearCooldownTimer();
        lockUntilRef.current = 0;
        maskReasonRef.current = null;
        setSecondsLeft(0);
        setMaskReason(null);
        setRootBlurImmediate(false);
        return;
      }

      setRootBlurImmediate(true);
      maskReasonRef.current = nextReason;
      setMaskReason(nextReason);

      if (cooldownMs > 0) {
        const nextLockUntil = Date.now() + cooldownMs;
        if (nextLockUntil > lockUntilRef.current) {
          lockUntilRef.current = nextLockUntil;
        }
        syncSecondsRemaining();
        if (cooldownIntervalRef.current === null) {
          cooldownIntervalRef.current = window.setInterval(() => {
            const left = syncSecondsRemaining();
            if (left <= 0) {
              clearCooldownTimer();
              const current = maskReasonRef.current;
              const canAutoRestore =
                (current === 'pulldown' || current === 'blur' || current === 'visibility') &&
                document.visibilityState === 'visible' &&
                document.hasFocus();
              if (canAutoRestore) {
                lockUntilRef.current = 0;
                maskReasonRef.current = null;
                setMaskReason(null);
                setRootBlurImmediate(false);
              }
            }
          }, 250);
        }
      }
    },
    [clearCooldownTimer, syncSecondsRemaining]
  );

  const forceUnlock = useCallback(() => {
    if (Date.now() < lockUntilRef.current) return;
    applyMask(null);
  }, [applyMask]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 3200);
  }, []);

  const clearClipboardQuietly = useCallback(() => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        void navigator.clipboard.writeText('').catch(() => {
          // Ignore clipboard permission denials
        });
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    setRootBlurImmediate(enabled && maskReason !== null);
    return () => {
      setRootBlurImmediate(false);
    };
  }, [enabled, maskReason]);

  useEffect(() => {
    if (!enabled) {
      clearCooldownTimer();
      lockUntilRef.current = 0;
      maskReasonRef.current = null;
      setSecondsLeft(0);
      setMaskReason(null);
      setRootBlurImmediate(false);
      setNotice(null);
      return;
    }

    const isTopWindow = (() => {
      try {
        return window.self === window.top;
      } catch {
        return false;
      }
    })();

    const isMobileTouchDevice =
      typeof window !== 'undefined' &&
      (navigator.maxTouchPoints > 0 ||
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(pointer: coarse)').matches));

    // Track top-edge slide-down gesture (Control Center / Quick Settings / Data drawer)
    let gestureStartX = 0;
    let gestureStartY = 0;
    let gestureStartTime = 0;
    let gestureFromTopZone = false;
    let gestureMovedDown = false;
    let hadFocus = (() => {
      try {
        return document.hasFocus();
      } catch {
        return true;
      }
    })();
    let lastViewportHeight = window.visualViewport?.height || window.innerHeight;

    const handleCopyOrCut = (e: ClipboardEvent) => {
      if (isEditableElement(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      clearClipboardQuietly();
      showNotice('Read-only: Copying news content is disabled.');
    };

    const handleSelectStart = (e: Event) => {
      if (isEditableElement(e.target)) return;
      e.preventDefault();
    };

    const handleSelectionChange = () => {
      try {
        const active = document.activeElement;
        if (isEditableElement(active)) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.toString().length > 0) {
          selection.removeAllRanges();
        }
      } catch {
        // Ignore selection errors
      }
    };

    const handleDragStart = (e: DragEvent) => {
      if (e.target instanceof HTMLImageElement || !isEditableElement(e.target)) {
        e.preventDefault();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (e.target instanceof HTMLImageElement) {
        e.preventDefault();
        showNotice('Read-only: Image downloads are disabled.');
        return;
      }
      if (!isEditableElement(e.target)) {
        e.preventDefault();
        showNotice('Read-only: Copying & downloads are disabled.');
      }
    };

    const triggerScreenshotShield = (reason: 'screenshot' | 'pulldown' = 'screenshot') => {
      setRootBlurImmediate(true);
      clearClipboardQuietly();
      applyMask(reason, PULLDOWN_COOLDOWN_MS);
      showNotice('Screenshot is not allowed on Coffeenadu News.');
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!e.touches || e.touches.length === 0) return;

      // 3-finger screenshot gesture on Android
      if (e.touches.length >= 3) {
        if (e.cancelable) {
          e.preventDefault();
        }
        triggerScreenshotShield('screenshot');
        return;
      }

      const touch = e.touches[0];
      gestureStartX = touch.clientX;
      gestureStartY = touch.clientY;
      gestureStartTime = Date.now();
      gestureFromTopZone = touch.clientY <= 120;
      gestureMovedDown = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!gestureFromTopZone || !e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      const deltaY = touch.clientY - gestureStartY;
      const deltaX = Math.abs(touch.clientX - gestureStartX);

      // Slide-down from top edge (pulling down mobile data / Quick Settings / Control Center)
      if (deltaY >= 18 && deltaY > deltaX) {
        gestureMovedDown = true;
        triggerScreenshotShield('pulldown');
      }
    };

    const handleTouchCancel = () => {
      const recentTopSwipe =
        gestureFromTopZone && Date.now() - gestureStartTime < 1500;
      if (recentTopSwipe || gestureMovedDown) {
        triggerScreenshotShield('pulldown');
      }
      gestureFromTopZone = false;
      gestureMovedDown = false;
    };

    const handleTouchEnd = () => {
      gestureFromTopZone = false;
      gestureMovedDown = false;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (e.clientY <= 120) {
        gestureStartX = e.clientX;
        gestureStartY = e.clientY;
        gestureStartTime = Date.now();
        gestureFromTopZone = true;
      }
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (gestureFromTopZone && Date.now() - gestureStartTime < 1500) {
        triggerScreenshotShield('pulldown');
      }
    };

    const handleViewportResize = () => {
      if (!isMobileTouchDevice) return;
      // Ignore keyboard opening when user is typing in Search / Bus Timings
      if (isEditableElement(document.activeElement)) {
        lastViewportHeight = window.visualViewport?.height || window.innerHeight;
        return;
      }
      const currentHeight = window.visualViewport?.height || window.innerHeight;
      const diff = Math.abs(currentHeight - lastViewportHeight);
      lastViewportHeight = currentHeight;
      // Sudden large viewport shift without keyboard can indicate split-screen / capture bar
      if (diff > 140 && !document.hasFocus()) {
        triggerScreenshotShield('pulldown');
      }
    };

    const handleKeyEvent = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const code = (e.code || '').toLowerCase();

      const isPrintScreen =
        key === 'printscreen' || code === 'printscreen' || e.keyCode === 44;

      const isMobileHardwareCaptureKey =
        key === 'audiovolumedown' ||
        key === 'audiovolumeup' ||
        key === 'volumedown' ||
        key === 'volumeup' ||
        key === 'camera' ||
        key === 'mediarecord';

      if (isPrintScreen || isMobileHardwareCaptureKey) {
        if (e.cancelable) {
          e.preventDefault();
        }
        triggerScreenshotShield('screenshot');
        return;
      }

      if (e.type !== 'keydown') return;

      const hasMod = e.ctrlKey || e.metaKey;

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', 's'].includes(key)) {
        e.preventDefault();
        triggerScreenshotShield('screenshot');
        return;
      }

      if (e.key === 'F12' || (hasMod && e.shiftKey && ['i', 'j', 'c'].includes(key))) {
        e.preventDefault();
        showNotice('Read-only: Inspecting & downloading media is disabled.');
        return;
      }

      if (hasMod && !e.shiftKey && ['s', 'p', 'u'].includes(key)) {
        e.preventDefault();
        if (key === 'p') {
          applyMask('print', PULLDOWN_COOLDOWN_MS);
        }
        showNotice('Read-only: Saving or printing articles is disabled.');
        return;
      }

      if (hasMod && !e.shiftKey && ['c', 'x', 'a'].includes(key)) {
        if (!isEditableElement(e.target)) {
          e.preventDefault();
          showNotice('Read-only: Copying news content is disabled.');
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        applyMask('visibility', isMobileTouchDevice ? PULLDOWN_COOLDOWN_MS : 0);
      } else if (document.visibilityState === 'visible') {
        if (maskReasonRef.current === 'visibility' && Date.now() >= lockUntilRef.current) {
          applyMask(null);
        }
      }
    };

    const handlePageHide = () => {
      applyMask('visibility', isMobileTouchDevice ? PULLDOWN_COOLDOWN_MS : 0);
    };

    const handlePageShow = () => {
      if (maskReasonRef.current === 'visibility' && Date.now() >= lockUntilRef.current) {
        applyMask(null);
      }
    };

    const handleWindowBlur = () => {
      if (!isTopWindow && !isMobileTouchDevice) return;
      applyMask('blur', isMobileTouchDevice ? PULLDOWN_COOLDOWN_MS : 0);
    };

    const handleWindowFocus = () => {
      hadFocus = true;
      if (maskReasonRef.current === 'blur' && Date.now() >= lockUntilRef.current) {
        applyMask(null);
      }
    };

    const handleBeforePrint = () => {
      applyMask('print', PULLDOWN_COOLDOWN_MS);
    };

    const handleAfterPrint = () => {
      if (maskReasonRef.current === 'print' && Date.now() >= lockUntilRef.current) {
        applyMask(null);
      }
    };

    // High-frequency mobile focus polling (works in both top-level tabs and embedded views once focused)
    const focusPollId = isMobileTouchDevice
      ? window.setInterval(() => {
          try {
            const focusedNow = document.hasFocus();
            if (focusedNow) {
              hadFocus = true;
            }
            if (document.visibilityState === 'hidden' || (hadFocus && !focusedNow)) {
              applyMask('blur', PULLDOWN_COOLDOWN_MS);
            } else if (
              (maskReasonRef.current === 'blur' || maskReasonRef.current === 'pulldown') &&
              Date.now() >= lockUntilRef.current
            ) {
              applyMask(null);
            }
          } catch {
            // Ignore
          }
        }, 80)
      : null;

    document.addEventListener('copy', handleCopyOrCut, true);
    document.addEventListener('cut', handleCopyOrCut, true);
    document.addEventListener('selectstart', handleSelectStart, true);
    document.addEventListener('selectionchange', handleSelectionChange, true);
    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: false });
    document.addEventListener('touchmove', handleTouchMove, { capture: true, passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, true);
    document.addEventListener('touchend', handleTouchEnd, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointercancel', handlePointerCancel, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('freeze', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('keydown', handleKeyEvent, true);
    window.addEventListener('keyup', handleKeyEvent, true);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    window.visualViewport?.addEventListener('resize', handleViewportResize);

    return () => {
      clearCooldownTimer();
      if (focusPollId !== null) {
        window.clearInterval(focusPollId);
      }
      document.removeEventListener('copy', handleCopyOrCut, true);
      document.removeEventListener('cut', handleCopyOrCut, true);
      document.removeEventListener('selectstart', handleSelectStart, true);
      document.removeEventListener('selectionchange', handleSelectionChange, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchmove', handleTouchMove, true);
      document.removeEventListener('touchcancel', handleTouchCancel, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointercancel', handlePointerCancel, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('freeze', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('keydown', handleKeyEvent, true);
      window.removeEventListener('keyup', handleKeyEvent, true);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      setRootBlurImmediate(false);
    };
  }, [applyMask, clearClipboardQuietly, clearCooldownTimer, enabled, showNotice]);

  if (!enabled) return null;

  const isCoolingDown = secondsLeft > 0;

  return (
    <>
      {/* Full-Viewport Opaque Privacy & Instant Screenshot Blur Shield */}
      {maskReason !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot not allowed protection active"
          onClick={forceUnlock}
          className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center p-6 text-center select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-md w-full bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="w-12 h-12 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" aria-hidden="true" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-white">
                Screenshot Not Allowed
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isCoolingDown
                  ? `Pull-down panel or capture activity detected. Screen stays locked for ${secondsLeft}s to block screenshots.`
                  : 'Screenshots, copying text, downloading images, and printing are blocked on Coffeenadu News.'}
              </p>
              <p className="font-kannada text-xs text-amber-200/90 leading-relaxed pt-1">
                ಸ್ಕ್ರೀನ್‌ಶಾಟ್ ಅನುಮತಿಸಲಾಗುವುದಿಲ್ಲ. ಕಾಫಿನಾಡು ನ್ಯೂಸ್ ಸುದ್ದಿಗಳು ಓದಲು ಮಾತ್ರ — ಪರದೆಯನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ಮರೆಮಾಡಲಾಗಿದೆ.
              </p>
            </div>

            <button
              type="button"
              disabled={isCoolingDown}
              onClick={forceUnlock}
              className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-colors ${
                isCoolingDown
                  ? 'bg-slate-800 text-amber-300 border border-amber-400/40 cursor-not-allowed'
                  : 'text-slate-950 bg-amber-400 hover:bg-amber-300 cursor-pointer'
              }`}
            >
              {isCoolingDown ? (
                <>
                  <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                  <span>Locked for {secondsLeft}s · Screenshot Blocked</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  <span>Resume Reading</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Non-intrusive toast notification when copy/right-click/download is blocked */}
      {notice && maskReason === null && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-xl bg-slate-900/95 text-white border border-slate-700 shadow-lg flex items-center gap-2 text-xs font-medium pointer-events-none max-w-[92vw]"
        >
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="truncate">{notice}</span>
        </div>
      )}
    </>
  );
}
