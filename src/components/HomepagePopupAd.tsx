import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Megaphone, X } from 'lucide-react';
import { trackAdInteraction } from '../services/adsClient';
import type { AdPlatformSettings, Advertisement } from '../types/ads';
import {
  getTodayIstYmd,
  rememberRecentForPlacement,
  selectRotatedAdsForPlacement,
} from '../utils/adHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { AdActionButtons } from './AdActionButtons';
import { AdImage } from './AdImage';
import { AdShareBar } from './AdShareBar';

interface HomepagePopupAdProps {
  ads: Advertisement[];
  settings?: AdPlatformSettings | null;
  onOpenAd: (ad: Advertisement) => void;
  disabled?: boolean;
  entryOverlayActive?: boolean;
}

const SESSION_POPUP_KEY = 'cn_homepage_popup_seen_session_v1';
const DAILY_POPUP_KEY = 'cn_homepage_popup_seen_day_v1';

export function HomepagePopupAd({
  ads,
  settings,
  onOpenAd,
  disabled = false,
  entryOverlayActive = false,
}: HomepagePopupAdProps) {
  const candidates = useMemo(
    () => selectRotatedAdsForPlacement(ads, settings, 'homepagePopup'),
    [ads, settings]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const trackedRef = useRef<Set<string>>(new Set());

  const activeAd = candidates[currentIndex] || candidates[0] || null;
  const popupCfg = activeAd?.placements?.homepagePopup;
  const delayMs = Math.max(0, (popupCfg?.delaySeconds ?? 3) * 1000);
  const frequency = popupCfg?.frequency || settings?.defaultDisplayFrequency || 'once_per_session';

  useEffect(() => {
    if (disabled || dismissed || entryOverlayActive || !activeAd) {
      setVisible(false);
      return;
    }

    try {
      if (frequency === 'once_per_session' && window.sessionStorage.getItem(SESSION_POPUP_KEY) === '1') {
        return;
      }
      if (
        frequency === 'once_per_day' &&
        window.localStorage.getItem(DAILY_POPUP_KEY) === getTodayIstYmd()
      ) {
        return;
      }
    } catch {
      // Ignore storage restrictions
    }

    const timer = window.setTimeout(() => {
      setVisible(true);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [disabled, dismissed, entryOverlayActive, activeAd, delayMs, frequency]);

  // Auto-rotate inside homepage popup if multiple ads & mode allows automatic
  const rotationMode = settings?.rotationMode || 'both';
  useEffect(() => {
    if (!visible || candidates.length <= 1 || rotationMode === 'manual') return;
    const speedMs = Math.max(3000, (settings?.rotationSpeedSeconds || 5) * 1000);
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % candidates.length);
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [visible, candidates.length, rotationMode, settings?.rotationSpeedSeconds]);

  // Track real impression once visible
  useEffect(() => {
    if (!visible || !activeAd) return;
    rememberRecentForPlacement('homepagePopup:default', activeAd.id);
    if (!trackedRef.current.has(activeAd.id)) {
      trackedRef.current.add(activeAd.id);
      void trackAdInteraction(activeAd.id, 'impression', { placement: 'homepagePopup' });
    }
    try {
      if (frequency === 'once_per_session') {
        window.sessionStorage.setItem(SESSION_POPUP_KEY, '1');
      } else if (frequency === 'once_per_day') {
        window.localStorage.setItem(DAILY_POPUP_KEY, getTodayIstYmd());
      }
    } catch {
      // Ignore
    }
  }, [visible, activeAd, frequency]);

  const handleClose = () => {
    setVisible(false);
    setDismissed(true);
    try {
      window.sessionStorage.setItem(SESSION_POPUP_KEY, '1');
      if (frequency === 'once_per_day') {
        window.localStorage.setItem(DAILY_POPUP_KEY, getTodayIstYmd());
      }
    } catch {
      // Ignore
    }
  };

  if (!visible || !activeAd || disabled || dismissed) return null;

  const position = popupCfg?.position || 'center';
  const design = popupCfg?.design || 'card';
  const excerpt = stripRichTextToPlainText(activeAd.description);
  const showManual = candidates.length > 1 && rotationMode !== 'automatic';

  const containerCls =
    position === 'center'
      ? 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[1px]'
      : position === 'bottom-left'
      ? 'fixed bottom-4 left-4 right-4 sm:right-auto sm:w-[390px] z-50'
      : 'fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[390px] z-50';

  const cardWidthCls =
    position === 'center'
      ? design === 'banner'
        ? 'w-full max-w-2xl'
        : 'w-full max-w-md'
      : 'w-full';

  return (
    <div
      role="dialog"
      aria-modal={position === 'center'}
      aria-label={`Local Advertisement: ${activeAd.title}`}
      className={containerCls}
      onClick={position === 'center' ? handleClose : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${cardWidthCls} overflow-hidden rounded-2xl border shadow-2xl transition-all ${
          design === 'spotlight'
            ? 'border-amber-300 bg-gradient-to-b from-amber-50/40 via-white to-white'
            : 'border-slate-200 bg-white'
        }`}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#0F274A] min-w-0">
            <Megaphone className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
            <span className="truncate">
              Local Spotlight · <span className="font-mono">{activeAd.adNumber}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {showManual && (
              <>
                <button
                  type="button"
                  onClick={() => setCurrentIndex((p) => (p - 1 + candidates.length) % candidates.length)}
                  aria-label="Previous popup advertisement"
                  className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentIndex((p) => (p + 1) % candidates.length)}
                  aria-label="Next popup advertisement"
                  className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close advertisement popup"
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={design === 'banner' && position === 'center' ? 'grid grid-cols-1 sm:grid-cols-12' : ''}>
          <div
            onClick={() => {
              void trackAdInteraction(activeAd.id, 'click', { placement: 'homepagePopup' });
              handleClose();
              onOpenAd(activeAd);
            }}
            className={`${
              design === 'banner' && position === 'center' ? 'sm:col-span-6 border-b sm:border-b-0 sm:border-r' : 'border-b'
            } border-slate-100 bg-slate-50 p-2 flex items-center justify-center cursor-pointer`}
          >
            <AdImage
              src={activeAd.mainImageUrl}
              alt={activeAd.title}
              fit="contain"
              lazy={false}
              className={`w-full ${position === 'center' ? 'h-56 sm:h-64' : 'h-44'} bg-white rounded-lg`}
            />
          </div>

          <div className={`${design === 'banner' && position === 'center' ? 'sm:col-span-6' : ''} p-4 space-y-2.5`}>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <span className="text-[#0F274A]">{activeAd.category}</span>
              {activeAd.advertiserName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{activeAd.advertiserName}</span>
                </>
              )}
            </div>

            <h3
              onClick={() => {
                void trackAdInteraction(activeAd.id, 'click', { placement: 'homepagePopup' });
                handleClose();
                onOpenAd(activeAd);
              }}
              className="font-kannada text-base font-extrabold text-slate-950 hover:text-[#0F274A] cursor-pointer leading-snug line-clamp-2"
            >
              {activeAd.title}
            </h3>

            {excerpt && (
              <p className="font-kannada text-xs text-slate-600 leading-relaxed line-clamp-2">
                {excerpt}
              </p>
            )}

            {activeAd.businessAddress && (
              <p className="inline-flex items-center gap-1 font-kannada text-[11px] text-slate-500 max-w-full">
                <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{activeAd.businessAddress}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <AdActionButtons
                ad={activeAd}
                placement="homepagePopup"
                onOpenAd={(ad) => {
                  handleClose();
                  onOpenAd(ad);
                }}
                compact
              />
              <AdShareBar
                ad={activeAd}
                settings={settings}
                placement="homepagePopup"
                compact
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
