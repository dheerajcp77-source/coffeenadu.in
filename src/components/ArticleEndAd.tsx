import { useMemo } from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import { trackAdInteraction } from '../services/adsClient';
import type { Advertisement } from '../types/ads';
import { isAdCurrentlyActive, selectFairRotatedAd } from '../utils/adHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { AdImage } from './AdImage';

interface ArticleEndAdProps {
  ads: Advertisement[];
  articleId: string;
  onOpenAd: (ad: Advertisement) => void;
}

export function ArticleEndAd({ ads, articleId, onOpenAd }: ArticleEndAdProps) {
  const activeAds = useMemo(
    () => ads.filter((ad) => isAdCurrentlyActive(ad)),
    [ads]
  );

  const activeIdsKey = useMemo(
    () => activeAds.map((a) => a.id).join('|'),
    [activeAds]
  );

  const selectedAd = useMemo(() => {
    if (activeAds.length === 0) return null;
    return selectFairRotatedAd(activeAds);
    // Re-pick fairly only when navigating to a different article or when eligible ads change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, activeIdsKey]);

  if (!selectedAd) return null;

  const excerpt = stripRichTextToPlainText(selectedAd.description);

  return (
    <section
      aria-label="Local Advertisement"
      className="mt-8 pt-6 border-t border-stone-200 max-w-3xl mx-auto"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500 mb-3">
        <span>
          Local Advertisement · <span className="font-mono text-[#0F274A]">{selectedAd.adNumber}</span> · {selectedAd.category}
        </span>
      </div>

      <article
        role="button"
        tabIndex={0}
        onClick={() => {
          void trackAdInteraction(selectedAd.id, 'click');
          onOpenAd(selectedAd);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void trackAdInteraction(selectedAd.id, 'click');
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
            className="w-full h-44 sm:h-40 bg-white rounded-lg"
          />
        </div>

        <div className="sm:col-span-7 p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
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

          <div>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#0F274A] group-hover:bg-[#173a6e] rounded-lg transition-colors whitespace-nowrap">
              <span>View Advertisement</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </article>
    </section>
  );
}
