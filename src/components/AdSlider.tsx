import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import { trackAdInteraction } from '../services/adsClient';
import type { Advertisement } from '../types/ads';
import {
  formatReadableAdDate,
  isAdCurrentlyActive,
  orderAdsForFairSlider,
} from '../utils/adHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { AdImage } from './AdImage';

interface AdSliderProps {
  ads: Advertisement[];
  onOpenAd: (ad: Advertisement) => void;
  onViewAllAds?: () => void;
  title?: string;
}

const AUTO_ROTATE_MS = 4500;

export function AdSlider({
  ads,
  onOpenAd,
  onViewAllAds,
  title = 'Local Business Spotlight',
}: AdSliderProps) {
  const activeAds = useMemo(() => {
    const eligible = ads.filter((ad) => isAdCurrentlyActive(ad));
    return orderAdsForFairSlider(eligible);
  }, [ads]);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(0);
  const scrollSyncTimerRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const total = activeAds.length;

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
    if (total <= 1 || isPaused) return;
    const timer = window.setInterval(() => {
      scrollToSlide(activeIndexRef.current + 1);
    }, AUTO_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [total, isPaused, scrollToSlide]);

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
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 bg-slate-50/90">
        <div className="flex items-center gap-2 text-xs font-bold text-[#0F274A] min-w-0">
          <Megaphone className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
          <span className="truncate">{title}</span>
          <span className="text-slate-400 font-normal" aria-hidden="true">·</span>
          <span className="text-[11px] font-medium text-slate-500 tabular-nums whitespace-nowrap">
            {activeIndex + 1} / {total}
          </span>
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
          {total > 1 && (
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
                void trackAdInteraction(ad.id, 'click');
                onOpenAd(ad);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void trackAdInteraction(ad.id, 'click');
                  onOpenAd(ad);
                } else if (e.key === 'ArrowRight' && total > 1) {
                  e.preventDefault();
                  scrollToSlide(activeIndex + 1);
                } else if (e.key === 'ArrowLeft' && total > 1) {
                  e.preventDefault();
                  scrollToSlide(activeIndex - 1);
                }
              }}
              className="group w-full shrink-0 snap-start snap-always cursor-pointer grid grid-cols-1 sm:grid-cols-12 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F274A]"
            >
              {/* Clean Original Advertisement Image (Unmodified, Zero Overlay) */}
              <div className="sm:col-span-5 bg-slate-50 border-b sm:border-b-0 sm:border-r border-slate-100 flex items-center justify-center p-2">
                <AdImage
                  src={ad.mainImageUrl}
                  alt={ad.title}
                  fit="contain"
                  className="w-full h-44 sm:h-48 bg-slate-50 rounded-lg"
                />
              </div>

              {/* Editorial Ad Summary */}
              <div className="sm:col-span-7 p-4 sm:p-5 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <span className="font-mono font-bold text-[#0F274A]">{ad.adNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ad.category}</span>
                    {ad.expiryDate && (
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

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#0F274A] group-hover:bg-[#173a6e] rounded-lg transition-colors whitespace-nowrap">
                    <span>View Advertisement</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">
                    Local Ad
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Seek Bar */}
      {total > 1 && (
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
