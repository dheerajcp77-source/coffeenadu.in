import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import koppaLandscapeImg from '../assets/images/koppa_town_landscape_1794709366123.jpg';
import { getKannadaLocationLabel, resolveArticleImage } from '../constants/newsData';
import type { NewsArticle } from '../types/news';
import { sanitizeRichTextHtml, stripRichTextToPlainText } from '../utils/richText';
import { ArticleShareBar } from './ArticleShareBar';
import { getCategoryShortIcon } from './CategoryBar';
import { NewsImage } from './NewsImage';

interface FeaturedLeadCarouselProps {
  leadArticles: NewsArticle[];
  onOpenArticle: (article: NewsArticle) => void;
}

const AUTO_SLIDE_INTERVAL_MS = 3000;

export function FeaturedLeadCarousel({
  leadArticles,
  onOpenArticle,
}: FeaturedLeadCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const activeIndexRef = useRef(0);
  const scrollSyncTimerRef = useRef<number | null>(null);
  const pointerDragRef = useRef<{
    active: boolean;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });

  const total = leadArticles.length;

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

  // Automatically slide to next featured lead story one-by-one to the left
  useEffect(() => {
    if (total <= 1 || isPaused) return;
    const timer = window.setInterval(() => {
      scrollToSlide(activeIndexRef.current + 1);
    }, AUTO_SLIDE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [total, isPaused, activeIndex, scrollToSlide]);

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
      const computedIndex = Math.round(el.scrollLeft / el.clientWidth);
      const bounded = Math.max(0, Math.min(total - 1, computedIndex));
      if (bounded !== activeIndexRef.current) {
        setActiveIndex(bounded);
        activeIndexRef.current = bounded;
      }
    }, 80);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    const el = trackRef.current;
    if (!el) return;
    pointerDragRef.current = {
      active: true,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pointerDragRef.current.active) return;
    const el = trackRef.current;
    if (!el) return;
    const delta = e.clientX - pointerDragRef.current.startX;
    if (Math.abs(delta) > 8) {
      pointerDragRef.current.moved = true;
    }
    el.scrollLeft = pointerDragRef.current.startScrollLeft - delta;
  };

  const finishMouseDrag = () => {
    if (!pointerDragRef.current.active) return;
    const wasMoved = pointerDragRef.current.moved;
    pointerDragRef.current.active = false;
    if (wasMoved && trackRef.current && trackRef.current.clientWidth > 0) {
      const nearest = Math.round(trackRef.current.scrollLeft / trackRef.current.clientWidth);
      scrollToSlide(nearest);
    }
    window.setTimeout(() => {
      pointerDragRef.current.moved = false;
    }, 60);
  };

  if (total === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        setIsPaused(false);
        finishMouseDrag();
      }}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => {
        window.setTimeout(() => setIsPaused(false), 2000);
      }}
    >
      <span
        className="absolute -left-6 sm:-left-7 top-6 w-3 h-3 rounded-full border-2 border-amber-400 bg-white z-10"
        aria-hidden="true"
      />

      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured Lead News"
        className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-950"
      >
        {/* Horizontal Smooth-Sliding Track */}
        <div
          ref={trackRef}
          onScroll={handleTrackScroll}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={finishMouseDrag}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {leadArticles.map((leadArticle) => (
            <article
              key={leadArticle.id}
              onClick={() => {
                if (pointerDragRef.current.moved) return;
                onOpenArticle(leadArticle);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenArticle(leadArticle);
                } else if (e.key === 'ArrowRight' && total > 1) {
                  e.preventDefault();
                  scrollToSlide(activeIndex + 1);
                } else if (e.key === 'ArrowLeft' && total > 1) {
                  e.preventDefault();
                  scrollToSlide(activeIndex - 1);
                }
              }}
              role="button"
              tabIndex={0}
              className="group relative w-full shrink-0 snap-start snap-always cursor-pointer flex flex-col bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
            >
              {/* Adaptive Full-Fit Photo Stage: fits square, wide, or portrait photos 100% uncut */}
              <div className="relative w-full bg-slate-950 border-b border-slate-800/80 overflow-hidden">
                <NewsImage
                  src={resolveArticleImage(leadArticle) || koppaLandscapeImg}
                  alt={stripRichTextToPlainText(leadArticle.titleKannada)}
                  fitMode="natural"
                  maxHeightClass="max-h-[340px] sm:max-h-[420px]"
                  watermarkApplied={Boolean(leadArticle.watermarkApplied && leadArticle.imageUrl)}
                  className="bg-slate-950"
                />
              </div>

              {/* Dark Editorial Content Strip */}
              <div className="relative flex-1 flex flex-col justify-between p-4 sm:p-5 bg-slate-950 news-watermark-light">
                {/* Top row */}
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-amber-300 tracking-wide font-kannada">
                    Featured · {getKannadaLocationLabel(leadArticle.location)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-200 tabular-nums">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{leadArticle.publishedDate}</span>
                  </span>
                </div>

                {/* Center Kannada Headline & Summary */}
                <div className="my-3.5 max-w-2xl space-y-2">
                  <h2
                    className="article-rich-content article-rich-inline-compact font-kannada text-xl sm:text-2xl lg:text-[26px] font-bold text-white leading-snug text-balance"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(leadArticle.titleKannada) }}
                  />
                  <div
                    className="article-rich-content article-rich-inline-compact font-kannada text-xs sm:text-sm text-slate-200 leading-relaxed line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(leadArticle.summaryKannada) }}
                  />
                </div>

                {/* Bottom row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-white group-hover:bg-amber-300 rounded-lg transition-colors">
                      <span>Read More</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                    <ArticleShareBar article={leadArticle} compact variant="dark" />
                  </div>

                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                    {getCategoryShortIcon(leadArticle.category)}
                    <span>{leadArticle.category}</span>
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Minimal Seek Bar & Swipe Buttons Only */}
        {total > 1 && (
          <div className="bg-slate-950 border-t border-slate-800 px-3 sm:px-4 py-2.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex - 1)}
              aria-label="Previous featured story"
              className="p-2 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

            {/* Interactive Seek Bar */}
            <div
              className="flex-1 flex items-center gap-1.5"
              role="tablist"
              aria-label="Featured lead seek bar"
            >
              {leadArticles.map((item, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Slide ${idx + 1}: ${item.titleKannada}`}
                    onClick={() => scrollToSlide(idx)}
                    className={`h-2 flex-1 rounded-full transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-amber-400'
                        : 'bg-slate-700 hover:bg-slate-500'
                    }`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex + 1)}
              aria-label="Next featured story"
              className="p-2 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
