import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Clock, Pause, Play } from 'lucide-react';
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
  intervalMs?: number;
}

const DEFAULT_AUTO_SLIDE_INTERVAL_MS = 5000;

export function FeaturedLeadCarousel({
  leadArticles,
  onOpenArticle,
  intervalMs = DEFAULT_AUTO_SLIDE_INTERVAL_MS,
}: FeaturedLeadCarouselProps) {
  const safeIntervalMs = Math.min(15000, Math.max(3000, intervalMs || DEFAULT_AUTO_SLIDE_INTERVAL_MS));
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const activeIndexRef = useRef(0);
  const scrollSyncTimerRef = useRef<number | null>(null);
  const touchResumeTimerRef = useRef<number | null>(null);
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
  const topLeadId = leadArticles[0]?.id || '';
  const leadKeyList = leadArticles.map((a) => a.id).join('|');
  const effectivelyPaused = hoverPaused || manualPaused || prefersReducedMotion;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const check = () => {
      const reducedClass = document.documentElement.classList.contains('cn-reduced-motion');
      setPrefersReducedMotion(mq.matches || reducedClass);
    };
    check();
    mq.addEventListener?.('change', check);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mq.removeEventListener?.('change', check);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Always reset carousel to the newest top lead story whenever lead list or top lead ID updates
  useEffect(() => {
    if (total === 0) return;
    setActiveIndex(0);
    activeIndexRef.current = 0;
    if (trackRef.current) {
      trackRef.current.scrollTo({ left: 0, behavior: 'auto' });
    }
  }, [topLeadId, leadKeyList, total]);

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
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    },
    [total, prefersReducedMotion]
  );

  useEffect(() => {
    if (total <= 1 || effectivelyPaused) return;
    const timer = window.setInterval(() => {
      scrollToSlide(activeIndexRef.current + 1);
    }, safeIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [total, effectivelyPaused, activeIndex, safeIntervalMs, scrollToSlide]);

  useEffect(() => {
    return () => {
      if (scrollSyncTimerRef.current !== null) {
        window.clearTimeout(scrollSyncTimerRef.current);
      }
      if (touchResumeTimerRef.current !== null) {
        window.clearTimeout(touchResumeTimerRef.current);
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
      className="relative cn-reveal"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => {
        setHoverPaused(false);
        finishMouseDrag();
      }}
      onFocusCapture={() => setHoverPaused(true)}
      onBlurCapture={() => setHoverPaused(false)}
      onTouchStart={() => {
        if (touchResumeTimerRef.current !== null) {
          window.clearTimeout(touchResumeTimerRef.current);
        }
        setHoverPaused(true);
      }}
      onTouchEnd={() => {
        touchResumeTimerRef.current = window.setTimeout(() => setHoverPaused(false), 2500);
      }}
    >
      <span
        className="hidden sm:block absolute -left-7 top-6 w-3 h-3 rounded-full border-2 border-[#D9A441] bg-white dark:bg-[#0B1626] z-10"
        aria-hidden="true"
      />

      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured Lead Stories"
        className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-[#0B1626]"
      >
        <div
          ref={trackRef}
          onScroll={handleTrackScroll}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={finishMouseDrag}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {leadArticles.map((leadArticle, idx) => (
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
              className="group relative w-full shrink-0 snap-start snap-always cursor-pointer flex flex-col bg-[#0B1626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D9A441]"
            >
              {/* Adaptive Full-Fit Photo Stage: fits square, wide, or portrait photos 100% uncut */}
              <div className="relative w-full bg-[#091220] border-b border-slate-800/80 overflow-hidden">
                <NewsImage
                  src={resolveArticleImage(leadArticle) || koppaLandscapeImg}
                  alt={stripRichTextToPlainText(leadArticle.titleKannada)}
                  fitMode="natural"
                  maxHeightClass="max-h-[340px] sm:max-h-[430px]"
                  watermarkApplied={Boolean(leadArticle.watermarkApplied && leadArticle.imageUrl)}
                  className="bg-[#091220]"
                />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#10243D] via-[#10243D]/45 to-transparent"
                  aria-hidden="true"
                />
              </div>

              {/* Deep Navy Editorial Content Strip */}
              <div className="relative flex-1 flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-b from-[#10243D] to-[#0B1626] news-watermark-light">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded bg-[#D9A441] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#10243D]">
                      Featured Story
                    </span>
                    {idx === 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                        Breaking
                      </span>
                    )}
                    <span className="font-semibold text-amber-200 tracking-wide font-kannada">
                      {getKannadaLocationLabel(leadArticle.location)}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-slate-200 tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-[#D9A441]" aria-hidden="true" />
                    <span>{leadArticle.publishedDate}</span>
                    <span>·</span>
                    <span>{leadArticle.readTimeMinutes}m read</span>
                  </span>
                </div>

                <div className="my-3.5 max-w-2xl space-y-2">
                  <h2
                    className="article-rich-content article-rich-inline-compact font-kannada text-xl sm:text-2xl lg:text-[28px] font-bold text-white leading-snug text-balance"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(leadArticle.titleKannada) }}
                  />
                  <div
                    className="article-rich-content article-rich-inline-compact font-kannada text-xs sm:text-sm text-slate-200 leading-relaxed line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(leadArticle.summaryKannada) }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#10243D] bg-[#D9A441] group-hover:bg-[#E5B65C] rounded-lg transition-colors min-h-[38px]">
                      <span>Read More</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                    <ArticleShareBar article={leadArticle} compact variant="dark" />
                  </div>

                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    {getCategoryShortIcon(leadArticle.category)}
                    <span>{leadArticle.category}</span>
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {total > 1 && (
          <div className="bg-[#081220] border-t border-slate-800 px-3 sm:px-4 py-2.5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex - 1)}
              aria-label="Previous featured story"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-slate-800/90 text-slate-100 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

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
                    aria-label={`Slide ${idx + 1}: ${stripRichTextToPlainText(item.titleKannada)}`}
                    onClick={() => scrollToSlide(idx)}
                    className="relative h-2 flex-1 rounded-full overflow-hidden bg-slate-700 hover:bg-slate-600 transition-colors cursor-pointer"
                  >
                    {isActive && (
                      <span
                        key={`${item.id}-${activeIndex}-${effectivelyPaused ? 'paused' : 'run'}`}
                        style={{
                          animationDuration: `${safeIntervalMs}ms`,
                          animationPlayState: effectivelyPaused ? 'paused' : 'running',
                        }}
                        className={`block h-full w-full rounded-full bg-[#D9A441] ${
                          effectivelyPaused ? '' : 'cn-lead-progress-bar'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setManualPaused((prev) => !prev)}
              aria-pressed={manualPaused}
              aria-label={manualPaused ? 'Play featured lead slideshow' : 'Pause featured lead slideshow'}
              title={manualPaused ? 'Play slideshow' : 'Pause slideshow'}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-slate-800/90 text-slate-100 hover:bg-slate-700 hover:text-[#D9A441] transition-colors cursor-pointer shrink-0"
            >
              {manualPaused ? (
                <Play className="w-3.5 h-3.5 fill-current text-[#D9A441]" aria-hidden="true" />
              ) : (
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => scrollToSlide(activeIndex + 1)}
              aria-label="Next featured story"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-slate-800/90 text-slate-100 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
