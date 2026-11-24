import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { trackAdInteraction } from '../services/adsClient';
import type { Advertisement } from '../types/ads';
import { isAdCurrentlyActive, selectFairRotatedAd } from '../utils/adHelpers';
import { AdImage } from './AdImage';

interface FloatingScrollAdProps {
  ads: Advertisement[];
  onOpenAd: (ad: Advertisement) => void;
  disabled?: boolean;
}

const DISMISS_SESSION_KEY = 'cn_floating_ad_dismissed_v1';
const SCROLL_TRIGGER_PX = 360;

function readInitialDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function FloatingScrollAd({
  ads,
  onOpenAd,
  disabled = false,
}: FloatingScrollAdProps) {
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
    // Pick one fairly rotated ad for this reading session when active ads become available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdsKey]);

  const [dismissed, setDismissed] = useState<boolean>(() => readInitialDismissed());
  const [scrolledEnough, setScrolledEnough] = useState<boolean>(false);

  useEffect(() => {
    if (disabled || dismissed || !selectedAd) return;

    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setScrolledEnough(y >= SCROLL_TRIGGER_PX);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [disabled, dismissed, selectedAd]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_SESSION_KEY, '1');
    } catch {
      // Ignore storage restrictions
    }
  };

  if (disabled || dismissed || !selectedAd) return null;

  const isVisible = scrolledEnough;

  return (
    <aside
      aria-label="Local Advertisement"
      aria-hidden={!isVisible}
      className={`fixed bottom-16 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-auto sm:w-[316px] z-30 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${
        isVisible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-6 opacity-0 pointer-events-none'
      }`}
    >
      <div className="relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm p-2.5 pr-9 shadow-lg">
        {/* Visible Close (X) Button */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Close floating advertisement"
          title="Close advertisement"
          className="absolute right-2 top-2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A]"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        {/* Thumbnail */}
        <button
          type="button"
          onClick={() => {
            void trackAdInteraction(selectedAd.id, 'click');
            onOpenAd(selectedAd);
          }}
          tabIndex={isVisible ? 0 : -1}
          aria-label={`View advertisement ${selectedAd.title}`}
          className="w-16 h-14 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A]"
        >
          <AdImage
            src={selectedAd.mainImageThumbUrl || selectedAd.mainImageUrl}
            alt={selectedAd.title}
            fit="contain"
            className="w-full h-full bg-white"
          />
        </button>

        {/* Short Title + View Ad */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[10px] font-semibold text-slate-500 truncate">
            Local Ad · <span className="font-mono text-[#0F274A]">{selectedAd.adNumber}</span>
          </p>
          <p className="font-kannada text-xs font-bold text-slate-900 truncate leading-snug">
            {selectedAd.title}
          </p>
          <button
            type="button"
            tabIndex={isVisible ? 0 : -1}
            onClick={() => {
              void trackAdInteraction(selectedAd.id, 'click');
              onOpenAd(selectedAd);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0F274A] hover:underline cursor-pointer pt-0.5"
          >
            <span>View Ad</span>
            <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
