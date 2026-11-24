import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { trackAdInteraction } from '../services/adsClient';
import type { AdPlatformSettings, Advertisement } from '../types/ads';
import { rememberRecentForPlacement, selectRotatedAdsForPlacement } from '../utils/adHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { AdActionButtons } from './AdActionButtons';
import { AdImage } from './AdImage';
import { AdShareBar } from './AdShareBar';

interface WebsiteEntryAdProps {
  ads: Advertisement[];
  settings?: AdPlatformSettings | null;
  onOpenAd: (ad: Advertisement) => void;
  disabled?: boolean;
  onActiveChange?: (active: boolean) => void;
}

const ENTRY_SESSION_KEY = 'cn_website_entry_ad_shown_v1';

export function WebsiteEntryAd({
  ads,
  settings,
  onOpenAd,
  disabled = false,
  onActiveChange,
}: WebsiteEntryAdProps) {
  const candidates = useMemo(
    () => selectRotatedAdsForPlacement(ads, settings, 'websiteEntry'),
    [ads, settings]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(ENTRY_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [secondsLeft, setSecondsLeft] = useState(0);
  const trackedRef = useRef<Set<string>>(new Set());

  const activeAd = candidates[currentIndex] || candidates[0] || null;
  const entryCfg = activeAd?.placements?.websiteEntry;
  const delayMs = Math.max(0, (entryCfg?.delaySeconds ?? 0) * 1000);
  const minDuration = Math.max(0, Math.min(15, entryCfg?.minDurationSeconds ?? 3));

  useEffect(() => {
    onActiveChange?.(visible && !dismissed && !disabled && Boolean(activeAd));
  }, [visible, dismissed, disabled, activeAd, onActiveChange]);

  useEffect(() => {
    if (disabled || dismissed || !activeAd) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSecondsLeft(minDuration);
      setVisible(true);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [disabled, dismissed, activeAd, delayMs, minDuration]);

  useEffect(() => {
    if (!visible || secondsLeft <= 0) return;
    const t = window.setTimeout(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [visible, secondsLeft]);

  useEffect(() => {
    if (!visible || !activeAd) return;
    rememberRecentForPlacement('websiteEntry:default', activeAd.id);
    if (!trackedRef.current.has(activeAd.id)) {
      trackedRef.current.add(activeAd.id);
      void trackAdInteraction(activeAd.id, 'impression', { placement: 'websiteEntry' });
    }
    try {
      window.sessionStorage.setItem(ENTRY_SESSION_KEY, '1');
    } catch {
      // Ignore
    }
  }, [visible, activeAd]);

  const handleClose = () => {
    if (secondsLeft > 0) return;
    setVisible(false);
    setDismissed(true);
    try {
      window.sessionStorage.setItem(ENTRY_SESSION_KEY, '1');
    } catch {
      // Ignore
    }
  };

  if (!visible || dismissed || disabled || !activeAd) return null;

  const isFullscreen = entryCfg?.layout === 'fullscreen';
  const rotationMode = settings?.rotationMode || 'both';
  const showManual = candidates.length > 1 && rotationMode !== 'automatic';
  const excerpt = stripRichTextToPlainText(activeAd.description);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Welcome Advertisement: ${activeAd.title}`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-3 sm:p-6 backdrop-blur-xs"
    >
      <div
        className={`relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${
          isFullscreen
            ? 'w-full h-full max-w-6xl max-h-[94vh]'
            : 'w-full max-w-3xl max-h-[90vh]'
        }`}
      >
        {/* Clear Header Bar with Honest Countdown & Visible Close Button */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0F274A] min-w-0">
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-900">
              Sponsored
            </span>
            <span className="truncate font-mono">{activeAd.adNumber}</span>
            <span className="hidden sm:inline text-slate-400">·</span>
            <span className="hidden sm:inline truncate text-slate-600 font-medium">
              {activeAd.category}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {showManual && (
              <div className="inline-flex items-center gap-1 mr-1">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((p) => (p - 1 + candidates.length) % candidates.length)}
                  aria-label="Previous entry advertisement"
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-semibold text-slate-500 tabular-nums px-1">
                  {currentIndex + 1}/{candidates.length}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentIndex((p) => (p + 1) % candidates.length)}
                  aria-label="Next entry advertisement"
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              disabled={secondsLeft > 0}
              aria-label={secondsLeft > 0 ? `Close available in ${secondsLeft} seconds` : 'Close advertisement and continue to Coffeenadu News'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                secondsLeft > 0
                  ? 'bg-slate-200 text-slate-600 cursor-not-allowed'
                  : 'bg-[#0F274A] text-white hover:bg-[#173a6e] cursor-pointer'
              }`}
            >
              <span>
                {secondsLeft > 0 ? `Continue in ${secondsLeft}s` : 'Continue to Site'}
              </span>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Unmodified Original Creative Image */}
        <div
          onClick={() => {
            void trackAdInteraction(activeAd.id, 'click', { placement: 'websiteEntry' });
            setVisible(false);
            setDismissed(true);
            onOpenAd(activeAd);
          }}
          className="flex-1 overflow-y-auto bg-slate-50 p-3 sm:p-5 flex flex-col items-center justify-center cursor-pointer"
        >
          <AdImage
            src={activeAd.mainImageUrl}
            alt={activeAd.title}
            fit="contain"
            lazy={false}
            className="w-full flex items-center justify-center bg-white rounded-xl border border-slate-200"
            imgClassName={isFullscreen ? 'max-h-[62vh] w-auto mx-auto' : 'max-h-[50vh] w-auto mx-auto'}
          />
        </div>

        {/* Footer Info & CTA */}
        <div className="border-t border-slate-200 bg-white px-4 py-3.5 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <h2 className="font-kannada text-base sm:text-lg font-extrabold text-slate-950 truncate">
              {activeAd.title}
            </h2>
            {excerpt && (
              <p className="font-kannada text-xs text-slate-600 line-clamp-1">
                {excerpt}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <AdActionButtons
              ad={activeAd}
              placement="websiteEntry"
              onOpenAd={(ad) => {
                setVisible(false);
                setDismissed(true);
                onOpenAd(ad);
              }}
            />
            <AdShareBar
              ad={activeAd}
              settings={settings}
              placement="websiteEntry"
              compact
            />
          </div>
        </div>
      </div>
    </div>
  );
}
