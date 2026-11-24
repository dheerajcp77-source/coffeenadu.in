import type { AdPlatformSettings, Advertisement } from '../types/ads';
import { selectRotatedAdsForPlacement } from '../utils/adHelpers';
import { AdSlider } from './AdSlider';

interface HomepageAdSlotProps {
  ads: Advertisement[];
  settings?: AdPlatformSettings | null;
  position: 'below_headline' | 'between_news' | 'above_footer' | 'custom';
  customPosition?: 'right_rail' | 'top_banner' | 'after_events';
  onOpenAd: (ad: Advertisement) => void;
  onViewAllAds?: () => void;
  title?: string;
}

export function HomepageAdSlot({
  ads,
  settings,
  position,
  customPosition,
  onOpenAd,
  onViewAllAds,
  title,
}: HomepageAdSlotProps) {
  const matched = selectRotatedAdsForPlacement(ads, settings, 'homepageSection', {
    homepagePosition: position,
  }).filter((ad) => {
    if (position !== 'custom' || !customPosition) return true;
    const adCustomPos = ad.placements?.homepageSection?.customPosition || 'right_rail';
    return adCustomPos === customPosition;
  });

  if (matched.length === 0) return null;

  const heading =
    title ||
    (position === 'below_headline'
      ? 'Local Business Spotlight'
      : position === 'between_news'
      ? 'Sponsored Local Services'
      : position === 'above_footer'
      ? 'Featured Local Partners'
      : 'Local Advertiser Spotlight');

  return (
    <AdSlider
      ads={matched}
      settings={settings}
      onOpenAd={onOpenAd}
      onViewAllAds={onViewAllAds}
      title={heading}
      placement="homepageSection"
      homepagePosition={position}
      showAllActive={false}
      variant={position === 'custom' && customPosition === 'right_rail' ? 'rail' : 'default'}
    />
  );
}
