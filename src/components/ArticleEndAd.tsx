import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { trackAdInteraction } from '../services/adsClient';
import type { AdPlatformSettings, Advertisement } from '../types/ads';
import { rememberRecentForPlacement, selectRotatedAdsForPlacement } from '../utils/adHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { AdActionButtons } from './AdActionButtons';
import { AdImage } from './AdImage';
import { AdShareBar } from './AdShareBar';

interface ArticleEndAdProps {
  ads: Advertisement[];
  settings?: AdPlatformSettings | null;
  articleId: string;
  position?: 'before_related' | 'after_related';
  onOpenAd: (ad: Advertisement) => void;
}

export function ArticleEndAd({
  ads,
  settings,
  articleId,
  position = 'before_related',
  onOpenAd,
}: ArticleEndAdProps) {
  const candidates = useMemo(() => {
    const allEligible = selectRotatedAdsForPlacement(ads, settings, 'endOfArticle');
    return allEligible.filter((ad) => {
      const configuredPos = ad.placements?.endOfArticle?.position || 'before_related';
      return configuredPos === position;
    });
  }, [ads, settings, position]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const impressedRef = useRef<Set<string>>(new Set());

  const total = candidates.length;
  const selectedAd = candidates[currentIndex] || candidates[0] || null;
  const rotationMode = settings?.rotationMode || 'both';
  const allowAuto = rotationMode === 'automatic' || rotationMode === 'both';
  const allowManual = rotationMode === 'manual' || rotationMode === 'both';

  useEffect(() => {
    setCurrentIndex(0);
    impressedRef.current.clear();
  }, [articleId]);

  useEffect(() => {
    if (!allowAuto || total <= 1 || isPaused) return;
    const speedMs = Math.max(2500, (settings?.rotationSpeedSeconds || 5) * 1000);
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [allowAuto, total, isPaused, settings?.rotationSpeedSeconds]);

  // Track real impression per article visit whenever ad displays
  useEffect(() => {
    if (!selectedAd) return;
    rememberRecentForPlacement('endOfArticle:default', selectedAd.id);
    const key = `${articleId}:${position}:${selectedAd.id}`;
    if (!impressedRef.current.has(key)) {
      impressedRef.current.add(key);
      void trackAdInteraction(selectedAd.id, 'impression', { placement: 'endOfArticle' });
    }
  }, [selectedAd, articleId, position]);

  if (!selectedAd) return null;

  const excerpt = stripRichTextToPlainText(selectedAd.description);

  return (
    <section
      aria-label="Local Advertisement"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="mt-8 pt-6 border-t border-stone-200 max-w-3xl mx-auto"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500 mb-3">
        <span>
          Local Advertisement · <span className="font-mono text-[#0F274A]">{selectedAd.adNumber}</span> · {selectedAd.category}
          {total > 1 ? ` · ${currentIndex + 1}/${total}` : ''}
        </span>

        {allowManual && total > 1 && (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentIndex((p) => (p - 1 + total) % total)}
              aria-label="Previous advertisement"
              className="p-1 rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((p) => (p + 1) % total)}
              aria-label="Next advertisement"
              className="p-1 rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <article
        role="button"
        tabIndex={0}
        onClick={() => {
          void trackAdInteraction(selectedAd.id, 'click', { placement: 'endOfArticle' });
          onOpenAd(selectedAd);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void trackAdInteraction(selectedAd.id, 'click', { placement: 'endOfArticle' });
            onOpenAd(selectedAd);
          }
        }}
        className="group rounded-xl border border-stone-200 bg-stone-50/70 hover:border-stone-300 transition-colors overflow-hidden grid grid-cols-1 sm:grid-cols-12 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A]"
      >
        <div className="sm:col-span-5 bg-white border-b sm:border-b-0 sm:border-r border-stone-200 p-2 flex items-center justify-center">
          <AdImage
            src={selectedAd.mainImageUrl}
            alt={selectedAd.title}
            fit="contain"
            className="w-full h-44 sm:h-44 bg-white rounded-lg"
          />
        </div>

        <div className="sm:col-span-7 p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            {selectedAd.advertiserName && (
              <p className="text-[11px] font-semibold text-[#0F274A]">
                {selectedAd.advertiserName}
              </p>
            )}
            <h3 className="font-kannada text-base sm:text-lg font-bold text-stone-950 group-hover:text-[#0F274A] transition-colors leading-snug line-clamp-2">
              {selectedAd.title}
            </h3>

            {excerpt && (
              <p className="font-kannada text-xs sm:text-sm text-stone-600 leading-relaxed line-clamp-2">
                {excerpt}
              </p>
            )}

            {selectedAd.businessAddress && (
              <p className="inline-flex items-center gap-1 font-kannada text-[11px] text-stone-500">
                <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{selectedAd.businessAddress}</span>
              </p>
            )}
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-2 pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            <AdActionButtons
              ad={selectedAd}
              placement="endOfArticle"
              onOpenAd={onOpenAd}
              compact
            />
            <AdShareBar
              ad={selectedAd}
              settings={settings}
              placement="endOfArticle"
              compact
            />
          </div>
        </div>
      </article>

      {allowManual && total > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {candidates.map((ad, idx) => (
            <button
              key={ad.id}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              aria-label={`End of article advertisement ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                idx === currentIndex ? 'w-6 bg-[#0F274A]' : 'w-2 bg-stone-300 hover:bg-stone-400'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
