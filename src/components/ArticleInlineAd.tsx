import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { trackAdInteraction } from '../services/adsClient';
import type { AdPlatformSettings, Advertisement } from '../types/ads';
import { rememberRecentForPlacement, selectRotatedAdsForPlacement } from '../utils/adHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { AdActionButtons } from './AdActionButtons';
import { AdImage } from './AdImage';
import { AdShareBar } from './AdShareBar';

interface ArticleInlineAdProps {
  ads: Advertisement[];
  settings?: AdPlatformSettings | null;
  articleId: string;
  slot: 'belowHeadline' | 'belowSummary' | 'betweenParagraphs' | 'aboveSharing';
  paragraphNumber?: number;
  onOpenAd: (ad: Advertisement) => void;
}

export function ArticleInlineAd({
  ads,
  settings,
  articleId,
  slot,
  paragraphNumber,
  onOpenAd,
}: ArticleInlineAdProps) {
  const candidates = useMemo(() => {
    const eligible = selectRotatedAdsForPlacement(ads, settings, 'articleInline', {
      inlineSlot: slot,
    });
    if (slot !== 'betweenParagraphs' || typeof paragraphNumber !== 'number') {
      return eligible;
    }
    return eligible.filter(
      (ad) => (ad.placements?.articleInline?.paragraphIndex || 2) === paragraphNumber
    );
  }, [ads, settings, slot, paragraphNumber]);

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
    const speedMs = Math.max(3000, (settings?.rotationSpeedSeconds || 5) * 1000);
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [allowAuto, total, isPaused, settings?.rotationSpeedSeconds]);

  useEffect(() => {
    if (!selectedAd) return;
    rememberRecentForPlacement(`articleInline:${slot}`, selectedAd.id);
    const key = `${articleId}:${slot}:${paragraphNumber || 0}:${selectedAd.id}`;
    if (!impressedRef.current.has(key)) {
      impressedRef.current.add(key);
      void trackAdInteraction(selectedAd.id, 'impression', { placement: 'articleInline' });
    }
  }, [selectedAd, articleId, slot, paragraphNumber]);

  if (!selectedAd) return null;

  const excerpt = stripRichTextToPlainText(selectedAd.description);

  return (
    <aside
      aria-label="Sponsored Local Advertisement"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="my-5 rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-slate-200/80 bg-white/80 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <span>
          Sponsored · <span className="font-mono text-[#0F274A]">{selectedAd.adNumber}</span> · {selectedAd.category}
        </span>
        {allowManual && total > 1 && (
          <div className="inline-flex items-center gap-1">
            <span className="tabular-nums text-[10px] text-slate-400 mr-1">
              {currentIndex + 1}/{total}
            </span>
            <button
              type="button"
              onClick={() => setCurrentIndex((p) => (p - 1 + total) % total)}
              aria-label="Previous inline advertisement"
              className="p-0.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((p) => (p + 1) % total)}
              aria-label="Next inline advertisement"
              className="p-0.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          void trackAdInteraction(selectedAd.id, 'click', { placement: 'articleInline' });
          onOpenAd(selectedAd);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void trackAdInteraction(selectedAd.id, 'click', { placement: 'articleInline' });
            onOpenAd(selectedAd);
          }
        }}
        className="grid grid-cols-1 sm:grid-cols-12 items-center cursor-pointer hover:bg-white/70 transition-colors"
      >
        <div className="sm:col-span-4 bg-white p-2 flex items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-200/80">
          <AdImage
            src={selectedAd.mainImageUrl}
            alt={selectedAd.title}
            fit="contain"
            className="w-full h-32 bg-white rounded-md"
          />
        </div>
        <div className="sm:col-span-8 p-3.5 space-y-1.5">
          <h3 className="font-kannada text-sm sm:text-base font-bold text-slate-950 leading-snug line-clamp-2">
            {selectedAd.title}
          </h3>
          {excerpt && (
            <p className="font-kannada text-xs text-slate-600 line-clamp-2 leading-relaxed">
              {excerpt}
            </p>
          )}
          {selectedAd.businessAddress && (
            <p className="inline-flex items-center gap-1 font-kannada text-[11px] text-slate-500">
              <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{selectedAd.businessAddress}</span>
            </p>
          )}
          <div
            className="flex flex-wrap items-center justify-between gap-2 pt-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <AdActionButtons
              ad={selectedAd}
              placement="articleInline"
              onOpenAd={onOpenAd}
              compact
            />
            <AdShareBar
              ad={selectedAd}
              settings={settings}
              placement="articleInline"
              compact
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
