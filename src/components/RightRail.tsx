import { MapPin, Newspaper, TrendingDown, TrendingUp } from 'lucide-react';
import { KOPPA_BRIEFS, KOPPA_MARKET_RATES, KOPPA_PLACE_OPTIONS } from '../constants/newsData';
import type { AdPlatformSettings, Advertisement } from '../types/ads';
import type { NewsArticle } from '../types/news';
import { HomepageAdSlot } from './HomepageAdSlot';
import { NewsletterAlertCard } from './NewsletterAlertCard';
import { TrendingNewsSection } from './TrendingNewsSection';
import { WhatsAppGroupBanner } from './WhatsAppGroupBanner';

interface RightRailProps {
  selectedLocation: string;
  onSelectLocation: (location: string) => void;
  trendingArticles: NewsArticle[];
  trendingIsViewRanked: boolean;
  onSelectArticle: (article: NewsArticle) => void;
  activeAds?: Advertisement[];
  adSettings?: AdPlatformSettings | null;
  onOpenAd?: (ad: Advertisement) => void;
  onViewAllAds?: () => void;
}

export function RightRail({
  selectedLocation,
  onSelectLocation,
  trendingArticles,
  trendingIsViewRanked,
  onSelectArticle,
  activeAds = [],
  adSettings,
  onOpenAd,
  onViewAllAds,
}: RightRailProps) {
  return (
    <aside aria-label="Trending News, Quick Briefs, and Market Rates" className="space-y-6">
      {/* Trending / Popular Picks Sidebar (Desktop) */}
      <TrendingNewsSection
        articles={trendingArticles}
        isViewRanked={trendingIsViewRanked}
        onSelectArticle={onSelectArticle}
        variant="rail"
      />

      {/* Join our WhatsApp Community */}
      <WhatsAppGroupBanner variant="card" />

      {/* Custom Homepage Right Rail Advertisement Placement */}
      {onOpenAd && activeAds.length > 0 && (
        <HomepageAdSlot
          ads={activeAds}
          settings={adSettings}
          position="custom"
          customPosition="right_rail"
          onOpenAd={onOpenAd}
          onViewAllAds={onViewAllAds}
        />
      )}

      {/* Town / Hobli Quick Filter in Kannada */}
      <section className="bg-white dark:bg-[#1A1815] border border-[#E7DFCE] dark:border-[#2E2922] rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1C1917] dark:text-[#FBF9F5]">
            <MapPin className="w-3.5 h-3.5 text-[#B88623] dark:text-[#E6BC5C]" />
            <span>Places · ಸ್ಥಳಗಳು</span>
          </h2>
          {selectedLocation !== 'All' && (
            <button
              type="button"
              onClick={() => onSelectLocation('All')}
              className="text-xs font-semibold text-[#926710] dark:text-[#E6BC5C] hover:underline cursor-pointer"
            >
              Show All
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSelectLocation('All')}
            className={`font-kannada px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              selectedLocation === 'All'
                ? 'bg-gradient-to-r from-[#C5932B] to-[#DEB04B] text-[#171411] border-[#B88623] font-bold'
                : 'bg-[#FAF7F0] dark:bg-[#14120F] text-[#2A2520] dark:text-[#E8E0D1] border-[#E7DFCE] dark:border-[#3A3122] hover:border-[#C5932B] dark:hover:border-[#E2B44B]/60'
            }`}
          >
            ಎಲ್ಲಾ (Show All)
          </button>
          {KOPPA_PLACE_OPTIONS.map((place) => {
            const active = selectedLocation === place.labelKn;
            return (
              <button
                key={place.id}
                type="button"
                onClick={() => onSelectLocation(place.labelKn)}
                className={`font-kannada px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#C5932B] to-[#DEB04B] text-[#171411] border-[#B88623] font-bold'
                    : 'bg-[#FAF7F0] dark:bg-[#14120F] text-[#2A2520] dark:text-[#E8E0D1] border-[#E7DFCE] dark:border-[#3A3122] hover:border-[#C5932B] dark:hover:border-[#E2B44B]/60'
                }`}
              >
                {place.labelKn}
              </button>
            );
          })}
        </div>
      </section>

      {/* Fast-Scan Local Briefs */}
      <section className="bg-white dark:bg-[#1A1815] border border-[#E7DFCE] dark:border-[#2E2922] rounded-2xl p-4 sm:p-5 shadow-xs">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1C1917] dark:text-[#FBF9F5] mb-3">
          <Newspaper className="w-3.5 h-3.5 text-[#C5932B] dark:text-[#E6BC5C]" />
          <span>Koppa Quick Briefs</span>
        </h2>
        <div className="divide-y divide-[#EFE8D8] dark:divide-[#2A251E]">
          {KOPPA_BRIEFS.map((brief) => (
            <div key={brief.id} className="py-3 first:pt-1 last:pb-0">
              <div className="flex items-center gap-2 text-[11px] font-medium text-[#6B6052] dark:text-[#A89C8B] mb-1">
                <span className="text-[#926710] dark:text-[#E6BC5C] font-bold">
                  {brief.area}
                </span>
                <span aria-hidden="true">·</span>
                <span>{brief.timeLabel}</span>
              </div>
              <p className="font-kannada text-sm text-[#2A2520] dark:text-[#ECE5D7] leading-relaxed">
                {brief.textKannada}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Koppa APMC / Estate Market Reference Rates */}
      <section className="bg-white dark:bg-[#1A1815] border border-[#E7DFCE] dark:border-[#2E2922] rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1C1917] dark:text-[#FBF9F5]">
              Local Market Rates
            </h2>
            <p className="text-[11px] text-[#6B6052] dark:text-[#A89C8B] mt-0.5">
              Koppa Reference Desk
            </p>
          </div>
          <span className="text-[11px] font-semibold text-[#6B6052] dark:text-[#A89C8B]">
            ₹ / Quintal
          </span>
        </div>

        <div className="border border-[#E7DFCE] dark:border-[#2E2922] rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E7DFCE] dark:border-[#2E2922] bg-[#FAF7F0] dark:bg-[#14120F] text-[11px] font-semibold uppercase tracking-wider text-[#6B6052] dark:text-[#A89C8B]">
                <th className="py-2 px-3">Crop</th>
                <th className="py-2 px-3 text-right">Rate</th>
                <th className="py-2 px-3 text-right">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE8D8] dark:divide-[#2A251E] text-xs">
              {KOPPA_MARKET_RATES.map((rate) => {
                const isUp = rate.change >= 0;
                return (
                  <tr key={rate.commodity}>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-[#1C1917] dark:text-[#FBF9F5]">
                        {rate.commodity}
                      </div>
                      <div className="text-[11px] text-[#6B6052] dark:text-[#A89C8B]">
                        {rate.variety}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#1C1917] dark:text-[#FBF9F5] tabular-nums">
                      ₹{rate.pricePerQuintal.toLocaleString('en-IN')}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold tabular-nums ${
                        isUp
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      <span className="inline-flex items-center justify-end gap-0.5">
                        {isUp ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {isUp ? `+${rate.change}` : rate.change}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Daily Digest & Breaking News Opt-In Card */}
      <NewsletterAlertCard />
    </aside>
  );
}
