import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { trackAdInteraction } from '../services/adsClient';
import type { AdPlatformSettings, Advertisement } from '../types/ads';
import { rememberRecentForPlacement, selectRotatedAdsForPlacement } from '../utils/adHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { AdActionButtons } from './AdActionButtons';
import { AdImage } from './AdImage';
import { AdShareBar } from './AdShareBar';

interface FloatingScrollAdProps {
  ads: Advertisement[];
  settings?: AdPlatformSettings | null;
  onOpenAd: (ad: Advertisement) => void;
  disabled?: boolean;
  articleId?: string | null;
}

const DISMISS_SESSION_KEY = 'cn_floating_ad_dismissed_v1';
const FEED_SCROLL_TRIGGER_PX = 360;

function readInitialDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function FloatingScrollAd({
  ads,
  settings,
  onOpenAd,
  disabled = false,
  articleId = null,
}: FloatingScrollAdProps) {
  const candidates = useMemo(
    () => selectRotatedAdsForPlacement(ads, settings, 'articlePopup'),
    [ads, settings]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState<boolean>(() => readInitialDismissed());
  const [scrolledEnough, setScrolledEnough] = useState<boolean>(false);
  const [delayElapsed, setDelayElapsed] = useState<boolean>(false);
  const trackedRef = useRef<Set<string>>(new Set());

  const selectedAd = candidates[currentIndex] || candidates[0] || null;
  const popupCfg = selectedAd?.placements?.articlePopup;
  const scrollPct = popupCfg?.scrollTriggerPercent || 50;
  const delayMs = Math.max(0, (popupCfg?.delaySeconds ?? 1) * 1000);
  const size = popupCfg?.size || 'compact';
  const position = popupCfg?.position || 'bottom-left';

  // Reset scroll/delay trigger when navigating between articles
  useEffect(() => {
    setScrolledEnough(false);
    setDelayElapsed(false);
  }, [articleId]);

  useEffect(() => {
    if (disabled || dismissed || !selectedAd) return;

    const checkScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (articleId) {
        const docHeight =
          document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 120) {
          setScrolledEnough(y >= 120);
          return;
        }
        const pct = Math.max(0, Math.min(100, (y / docHeight) * 100));
        setScrolledEnough(pct >= scrollPct);
      } else {
        setScrolledEnough(y >= FEED_SCROLL_TRIGGER_PX);
      }
    };

    checkScroll();
    window.addEventListener('scroll', checkScroll, { passive: true });
    return () => window.removeEventListener('scroll', checkScroll);
  }, [disabled, dismissed, selectedAd, articleId, scrollPct]);

  useEffect(() => {
    if (!scrolledEnough || disabled || dismissed || !selectedAd) {
      setDelayElapsed(false);
      return;
    }
    if (delayMs === 0) {
      setDelayElapsed(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setDelayElapsed(true);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [scrolledEnough, disabled, dismissed, selectedAd, delayMs]);

  const isVisible = !disabled && !dismissed && Boolean(selectedAd) && scrolledEnough && delayElapsed;

  // Auto-rotate if multiple eligible ads and mode permits
  const rotationMode = settings?.rotationMode || 'both';
  useEffect(() => {
    if (!isVisible || candidates.length <= 1 || rotationMode === 'manual') return;
    const speedMs = Math.max(4000, (settings?.rotationSpeedSeconds || 5) * 1000);
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % candidates.length);
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [isVisible, candidates.length, rotationMode, settings?.rotationSpeedSeconds]);

  // Track real impression once visible
  useEffect(() => {
    if (!isVisible || !selectedAd) return;
    rememberRecentForPlacement('articlePopup:default', selectedAd.id);
    const trackKey = `${articleId || 'feed'}:${selectedAd.id}`;
    if (!trackedRef.current.has(trackKey)) {
      trackedRef.current.add(trackKey);
      void trackAdInteraction(selectedAd.id, 'impression', { placement: 'articlePopup' });
    }
  }, [isVisible, selectedAd, articleId]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_SESSION_KEY, '1');
    } catch {
      // Ignore storage restrictions
    }
  };

  if (disabled || dismissed || !selectedAd) return null;

  const sizeWidthCls =
    size === 'large'
      ? 'sm:w-[390px]'
      : size === 'medium'
      ? 'sm:w-[350px]'
      : 'sm:w-[316px]';

  const positionCls =
    position === 'bottom-right'
      ? `bottom-20 left-3 right-3 sm:bottom-20 sm:right-4 sm:left-auto ${sizeWidthCls}`
      : position === 'top-right'
      ? `top-20 left-3 right-3 sm:top-24 sm:right-4 sm:left-auto ${sizeWidthCls}`
      : position === 'bottom-center'
      ? `bottom-20 left-3 right-3 sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto ${sizeWidthCls}`
      : `bottom-20 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-auto ${sizeWidthCls}`;

  const showManual = candidates.length > 1 && rotationMode !== 'automatic';
  const excerpt = stripRichTextToPlainText(selectedAd.description);

  return (
    <aside
      aria-label="Local Advertisement"
      aria-hidden={!isVisible}
      className={`fixed ${positionCls} z-30 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${
        isVisible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-6 opacity-0 pointer-events-none'
      }`}
    >
      <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#0F1E33]/95 backdrop-blur-sm p-2.5 pr-9 shadow-lg">
        {/* Visible Close (X) Button */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Close floating advertisement"
          title="Close advertisement"
          className="absolute right-2 top-2 rounded-md p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10243D]"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-3">
          {/* Thumbnail */}
          <button
            type="button"
            onClick={() => {
              void trackAdInteraction(selectedAd.id, 'click', { placement: 'articlePopup' });
              onOpenAd(selectedAd);
            }}
            tabIndex={isVisible ? 0 : -1}
            aria-label={`View advertisement ${selectedAd.title}`}
            className={`${
              size === 'large' ? 'w-24 h-20' : size === 'medium' ? 'w-20 h-16' : 'w-16 h-14'
            } shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A]`}
          >
            <AdImage
              src={selectedAd.mainImageThumbUrl || selectedAd.mainImageUrl}
              alt={selectedAd.title}
              fit="contain"
              className="w-full h-full bg-white"
            />
          </button>

          {/* Info */}
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
              <span className="truncate">
                Local Ad · <span className="font-mono text-[#0F274A]">{selectedAd.adNumber}</span>
              </span>
              {showManual && (
                <div className="inline-flex items-center gap-0.5 ml-auto">
                  <button
                    type="button"
                    tabIndex={isVisible ? 0 : -1}
                    onClick={() => setCurrentIndex((p) => (p - 1 + candidates.length) % candidates.length)}
                    aria-label="Previous popup ad"
                    className="p-0.5 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    tabIndex={isVisible ? 0 : -1}
                    onClick={() => setCurrentIndex((p) => (p + 1) % candidates.length)}
                    aria-label="Next popup ad"
                    className="p-0.5 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <p className="font-kannada text-xs font-bold text-slate-900 truncate leading-snug">
              {selectedAd.title}
            </p>

            {size !== 'compact' && excerpt && (
              <p className="font-kannada text-[11px] text-slate-600 line-clamp-1">
                {excerpt}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-0.5">
              {size === 'large' ? (
                <AdActionButtons
                  ad={selectedAd}
                  placement="articlePopup"
                  onOpenAd={onOpenAd}
                  compact
                />
              ) : (
                <button
                  type="button"
                  tabIndex={isVisible ? 0 : -1}
                  onClick={() => {
                    void trackAdInteraction(selectedAd.id, 'click', { placement: 'articlePopup' });
                    onOpenAd(selectedAd);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0F274A] hover:underline cursor-pointer"
                >
                  <span>View Ad</span>
                  <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
              {size !== 'compact' && (
                <AdShareBar
                  ad={selectedAd}
                  settings={settings}
                  placement="articlePopup"
                  compact
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
