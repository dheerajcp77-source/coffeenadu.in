import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import { trackAdInteraction, type AdTrackPlacement } from '../services/adsClient';
import type { AdPlatformSettings, Advertisement } from '../types/ads';
import {
  formatReadableAdDate,
  isAdCurrentlyActive,
  orderAdsForFairSlider,
  rememberRecentForPlacement,
  selectRotatedAdsForPlacement,
} from '../utils/adHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { AdActionButtons } from './AdActionButtons';
import { AdImage } from './AdImage';
import { AdShareBar } from './AdShareBar';

interface AdSliderProps {
  ads: Advertisement[];
  settings?: AdPlatformSettings | null;
  onOpenAd: (ad: Advertisement) => void;
  onViewAllAds?: () => void;
  title?: string;
  placement?: AdTrackPlacement;
  homepagePosition?: 'below_headline' | 'between_news' | 'above_footer' | 'custom';
  showAllActive?: boolean;
  variant?: 'default' | 'compact' | 'rail';
  isPreview?: boolean;
}

export function AdSlider({
  ads,
  settings,
  onOpenAd,
  onViewAllAds,
  title = 'Local Business Spotlight',
  placement = 'homepageSection',
  homepagePosition = 'below_headline',
  showAllActive = false,
  variant = 'default',
  isPreview = false,
}: AdSliderProps) {
  const activeAds = useMemo(() => {
    if (showAllActive) {
      return orderAdsForFairSlider(ads.filter((ad) => isAdCurrentlyActive(ad)));
    }
    return selectRotatedAdsForPlacement(ads, settings, 'homepageSection', {
      homepagePosition,
    });
  }, [ads, settings, showAllActive, homepagePosition]);

  const rotationMode = settings?.rotationMode || 'both';
  const allowAuto = rotationMode === 'automatic' || rotationMode === 'both';
  const allowManual = rotationMode === 'manual' || rotationMode === 'both';
  const intervalMs = Math.max(2000, (settings?.rotationSpeedSeconds || 5) * 1000);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(0);
  const scrollSyncTimerRef = useRef<number | null>(null);
  const impressedIdsRef = useRef<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const total = activeAds.length;
  const currentAd = activeAds[activeIndex] || activeAds[0] || null;

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (total === 0) return;
    if (activeIndexRef.current >= total) {
      setActiveIndex(0);
      activeIndexRef.current = 0;
      if (trackRef.current) {
        trackRef.current.scrollTo({ left: 0, behavior: 'auto' });
      }
    }
  }, [total]);

  // Track real impression when active slide is displayed
  useEffect(() => {
    if (!currentAd || isPreview) return;
    const key = `${placement}:${homepagePosition}:${currentAd.id}`;
    if (!impressedIdsRef.current.has(key)) {
      impressedIdsRef.current.add(key);
      rememberRecentForPlacement(`homepageSection:${homepagePosition}`, currentAd.id);
      void trackAdInteraction(currentAd.id, 'impression', { placement, isPreview });
    }
  }, [currentAd, placement, homepagePosition, isPreview]);

  const scrollToSlide = useCallback(
    (targetIndex: number) => {
      if (total === 0) return;
      const wrapped = ((targetIndex % total) + total) % total;
      setActiveIndex(wrapped);
      activeIndexRef.current = wrapped;
      const el = trackRef.current;
      if (!el) return;
      el.scrollTo({
        left: wrapped * el.clientWidth,
        behavior: 'smooth',
      });
    },
    [total]
  );

  useEffect(() => {
    if (!allowAuto || total <= 1 || isPaused) return;
    const activeRotationMs =
      currentAd?.rotation?.customIntervalSeconds && currentAd.rotation.customIntervalSeconds >= 2
        ? currentAd.rotation.customIntervalSeconds * 1000
        : intervalMs;
    const timer = window.setInterval(() => {
      scrollToSlide(activeIndexRef.current + 1);
    }, activeRotationMs);
    return () => window.clearInterval(timer);
  }, [allowAuto, total, isPaused, scrollToSlide, intervalMs, currentAd?.rotation?.customIntervalSeconds]);

  useEffect(() => {
    return () => {
      if (scrollSyncTimerRef.current !== null) {
        window.clearTimeout(scrollSyncTimerRef.current);
      }
    };
  }, []);

  const handleTrackScroll = () => {
    if (scrollSyncTimerRef.current !== null) {
      window.clearTimeout(scrollSyncTimerRef.current);
    }
    scrollSyncTimerRef.current = window.setTimeout(() => {
      const el = trackRef.current;
      if (!el || el.clientWidth <= 0) return;
      const computed = Math.round(el.scrollLeft / el.clientWidth);
      const bounded = Math.max(0, Math.min(total - 1, computed));
      if (bounded !== activeIndexRef.current) {
        setActiveIndex(bounded);
        activeIndexRef.current = bounded;
      }
    }, 80);
  };

  if (total === 0) return null;

  const isRail = variant === 'rail';

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Local Advertisements Slider"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => {
        window.setTimeout(() => setIsPaused(false), 2000);
      }}
      className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-2xs"
    >
      {/* Header Strip */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/90">
        <div className="flex items-center gap-2 text-xs font-bold text-[#0F274A] min-w-0">
          <Megaphone className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
          <span className="truncate">{title}</span>
          {total > 1 && (
            <>
              <span className="text-slate-400 font-normal" aria-hidden="true">·</span>
              <span className="text-[11px] font-medium text-slate-500 tabular-nums whitespace-nowrap">
                {activeIndex + 1} / {total}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onViewAllAds && (
            <button
              type="button"
              onClick={onViewAllAds}
              className="text-xs font-semibold text-[#0F274A] hover:underline cursor-pointer whitespace-nowrap"
            >
              All Local Ads
            </button>
          )}
          {allowManual && total > 1 && (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollToSlide(activeIndex - 1)}
                aria-label="Previous advertisement"
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => scrollToSlide(activeIndex + 1)}
                aria-label="Next advertisement"
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Smooth Track */}
      <div
        ref={trackRef}
        onScroll={handleTrackScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {activeAds.map((ad) => {
          const excerpt = stripRichTextToPlainText(ad.description);
          return (
            <article
              key={ad.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                void trackAdInteraction(ad.id, 'click', { placement, isPreview });
                onOpenAd(ad);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void trackAdInteraction(ad.id, 'click', { placement, isPreview });
                  onOpenAd(ad);
                } else if (allowManual && e.key === 'ArrowRight' && total > 1) {
                  e.preventDefault();
                  scrollToSlide(activeIndex + 1);
                } else if (allowManual && e.key === 'ArrowLeft' && total > 1) {
                  e.preventDefault();
                  scrollToSlide(activeIndex - 1);
                }
              }}
              className={`group w-full shrink-0 snap-start snap-always cursor-pointer bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F274A] ${
                isRail ? 'flex flex-col' : 'grid grid-cols-1 sm:grid-cols-12'
              }`}
            >
              {/* Clean Original Advertisement Image (Unmodified, Zero Overlay) */}
              <div
                className={`${
                  isRail
                    ? 'w-full border-b'
                    : 'sm:col-span-5 border-b sm:border-b-0 sm:border-r'
                } bg-slate-50 border-slate-100 flex items-center justify-center p-2`}
              >
                <AdImage
                  src={ad.mainImageUrl}
                  alt={ad.title}
                  fit="contain"
                  className={`w-full ${isRail ? 'h-44' : variant === 'compact' ? 'h-36 sm:h-40' : 'h-44 sm:h-48'} bg-slate-50 rounded-lg`}
                />
              </div>

              {/* Editorial Ad Summary */}
              <div className={`${isRail ? '' : 'sm:col-span-7'} p-4 sm:p-5 flex flex-col justify-between gap-3`}>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <span className="font-mono font-bold text-[#0F274A]">{ad.adNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ad.category}</span>
                    {ad.advertiserName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-[140px]">{ad.advertiserName}</span>
                      </>
                    )}
                    {ad.expiryDate && !isRail && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">Until {formatReadableAdDate(ad.expiryDate)}</span>
                      </>
                    )}
                  </div>

                  <h3 className="font-kannada text-base sm:text-lg font-extrabold text-slate-950 group-hover:text-[#0F274A] transition-colors leading-snug line-clamp-2">
                    {ad.title}
                  </h3>

                  {excerpt && (
                    <p className="font-kannada text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-2">
                      {excerpt}
                    </p>
                  )}

                  {ad.businessAddress && (
                    <p className="font-kannada text-[11px] text-slate-500 truncate">
                      {ad.businessAddress}
                    </p>
                  )}
                </div>

                <div
                  className="flex flex-wrap items-center justify-between gap-2 pt-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <AdActionButtons
                    ad={ad}
                    placement={placement}
                    onOpenAd={onOpenAd}
                    isPreview={isPreview}
                    compact
                  />
                  <AdShareBar
                    ad={ad}
                    settings={settings}
                    placement={placement}
                    compact
                    isPreview={isPreview}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Pagination Indicators */}
      {allowManual && total > 1 && (
        <div
          className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-1.5"
          role="tablist"
          aria-label="Advertisement slider navigation"
        >
          {activeAds.map((ad, idx) => {
            const isCurrent = idx === activeIndex;
            return (
              <button
                key={ad.id}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                aria-label={`Advertisement ${idx + 1}: ${ad.title}`}
                onClick={() => scrollToSlide(idx)}
                className={`h-1.5 flex-1 rounded-full transition-colors cursor-pointer ${
                  isCurrent ? 'bg-[#0F274A]' : 'bg-slate-200 hover:bg-slate-300'
                }`}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
