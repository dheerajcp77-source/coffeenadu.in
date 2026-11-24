export type AdStatus = 'active' | 'inactive' | 'paused' | 'draft';

export type AdApprovalStatus = 'approved' | 'pending_approval' | 'rejected';

export type AdPriority = 'high' | 'medium' | 'low';

export type AdDeviceTarget = 'all' | 'desktop' | 'mobile';

export type AdRotationMode = 'automatic' | 'manual' | 'both';

export type AdRotationOrder = 'priority' | 'random';

export type AdDisplayFrequency = 'every_visit' | 'once_per_session' | 'once_per_day';

export type AdCtaType =
  | 'contact_now'
  | 'call_now'
  | 'whatsapp_now'
  | 'visit_website'
  | 'get_directions'
  | 'learn_more';

export const AD_CTA_LABELS: Record<AdCtaType, string> = {
  contact_now: 'Contact Now',
  call_now: 'Call Now',
  whatsapp_now: 'WhatsApp Now',
  visit_website: 'Visit Website',
  get_directions: 'Get Directions',
  learn_more: 'Learn More',
};

export const AD_CATEGORIES = [
  'Business',
  'Education',
  'Real Estate',
  'Shopping',
  'Shops',
  'Services',
  'Agriculture',
  'Events',
  'Healthcare',
  'Dining & Hospitality',
  'Automobiles',
  'Other',
] as const;

export type AdCategory = (typeof AD_CATEGORIES)[number];

export const DEFAULT_KANNADA_SHARE_TEMPLATE = `📢 ಒಂದು ಉತ್ತಮ ಸ್ಥಳೀಯ ವ್ಯಾಪಾರ ಮತ್ತು ಸೇವೆಯ ಮಾಹಿತಿ!

[ADVERTISEMENT TITLE]

🌐 ಹೆಚ್ಚಿನ ಮಾಹಿತಿಗಾಗಿ ಮತ್ತು ಸಂಪರ್ಕಿಸಲು ಕೆಳಗಿನ ಲಿಂಕ್ ಕ್ಲಿಕ್ ಮಾಡಿ:

[ADVERTISEMENT URL]

☕ ಇಂತಹ ಇನ್ನಷ್ಟು ಸ್ಥಳೀಯ ಮಾಹಿತಿ ಮತ್ತು ಸುದ್ದಿಗಳಿಗಾಗಿ Coffeenadu News ಜೊತೆಯಲ್ಲಿರಿ!

🔗 https://coffeenadu.in`;

export type AdPlacementSlotKey =
  | 'articlePopup'
  | 'endOfArticle'
  | 'homepagePopup'
  | 'websiteEntry'
  | 'homepageSection'
  | 'articleInline';

export interface ArticlePopupPlacementConfig {
  enabled: boolean;
  scrollTriggerPercent: 25 | 50 | 75;
  size: 'compact' | 'medium' | 'large';
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'bottom-center';
  delaySeconds: number;
}

export interface EndOfArticlePlacementConfig {
  enabled: boolean;
  position: 'before_related' | 'after_related';
}

export interface HomepagePopupPlacementConfig {
  enabled: boolean;
  delaySeconds: number;
  position: 'center' | 'bottom-right' | 'bottom-left';
  design: 'card' | 'banner' | 'spotlight';
  frequency: AdDisplayFrequency;
}

export interface WebsiteEntryPlacementConfig {
  enabled: boolean;
  delaySeconds: number;
  minDurationSeconds: number;
  layout: 'fullscreen' | 'large';
}

export interface HomepageSectionPlacementConfig {
  enabled: boolean;
  position: 'below_headline' | 'between_news' | 'above_footer' | 'custom';
  customPosition?: 'right_rail' | 'top_banner' | 'after_events';
}

export interface ArticleInlinePlacementConfig {
  enabled: boolean;
  belowHeadline: boolean;
  belowSummary: boolean;
  betweenParagraphs: boolean;
  paragraphIndex: number; // 1-based paragraph number after which ad appears
  aboveSharing: boolean;
}

export interface AdPlacementsConfig {
  articlePopup: ArticlePopupPlacementConfig;
  endOfArticle: EndOfArticlePlacementConfig;
  homepagePopup: HomepagePopupPlacementConfig;
  websiteEntry: WebsiteEntryPlacementConfig;
  homepageSection: HomepageSectionPlacementConfig;
  articleInline: ArticleInlinePlacementConfig;
}

export interface AdCampaignSchedule {
  startTime?: string; // HH:MM (24h IST)
  expiryTime?: string; // HH:MM (24h IST)
  daysOfWeek?: number[]; // 0 (Sun) - 6 (Sat); empty/undefined = all days
  dailyStartTime?: string; // HH:MM
  dailyEndTime?: string; // HH:MM
}

export interface AdRotationOverrides {
  allowAutoRotation: boolean;
  weight?: number; // 1-10
  customIntervalSeconds?: number;
}

export interface AdSharingConfig {
  customShareMessage?: string;
  customSlug?: string;
}

export interface AdExtraImage {
  imageUrl: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  caption?: string;
}

export interface AdEventCounters {
  whatsappClicks: number;
  phoneClicks: number;
  websiteClicks: number;
  directionsClicks: number;
  shareClicks: number;
  byPlacement: Partial<Record<AdPlacementSlotKey | 'directory' | 'direct', number>>;
  byDevice: {
    desktop: number;
    mobile: number;
  };
}

export interface Advertisement {
  id: string;
  adNumber: string; // Sequential ID e.g. AD001, AD002, AD003
  title: string;
  campaignName?: string;
  advertiserName?: string;
  description: string; // Rich HTML or plain text description
  mainImageUrl: string;
  mainImageThumbUrl?: string;
  mainImageDriveId?: string;
  additionalImages: AdExtraImage[];
  contactNumber?: string;
  whatsappNumber?: string;
  businessAddress?: string;
  websiteUrl?: string;
  ctaType?: AdCtaType;
  ctaLabel?: string;
  ctaUrl?: string;
  category: AdCategory | string;
  status: AdStatus;
  approvalStatus?: AdApprovalStatus;
  approvalNotes?: string;
  previewToken?: string;
  publishDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  schedule?: AdCampaignSchedule;
  priority?: AdPriority;
  targetDevice?: AdDeviceTarget;
  displayFrequency?: AdDisplayFrequency;
  maxImpressionsPerVisitor?: number; // 0 = unlimited
  placements?: AdPlacementsConfig;
  rotation?: AdRotationOverrides;
  sharing?: AdSharingConfig;
  views: number;
  clicks: number;
  counters?: AdEventCounters;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface AdvertisementStats {
  total: number;
  active: number;
  inactive: number;
  scheduled: number;
  expired: number;
  draft: number;
  pendingApproval: number;
}

export interface AdPlatformSettings {
  rotationMode: AdRotationMode;
  rotationSpeedSeconds: number;
  maxAdsPerPlacement: number;
  rotationOrder: AdRotationOrder;
  avoidRepeatInSession: boolean;
  defaultShareMessage: string;
  customCategories: string[];
  approvalWorkflowEnabled: boolean;
  defaultDisplayFrequency: AdDisplayFrequency;
  defaultMaxImpressionsPerVisitor: number;
  globalPlacementsEnabled: Record<AdPlacementSlotKey, boolean>;
  updatedAt: string;
  updatedBy: string;
}

export interface AdAnalyticsDailyBucket {
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  whatsappClicks: number;
  phoneClicks: number;
  websiteClicks: number;
  directionsClicks: number;
  shareClicks: number;
  desktopImpressions: number;
  mobileImpressions: number;
  visitorHashes: string[];
  byAd: Record<
    string,
    {
      impressions: number;
      clicks: number;
      whatsappClicks: number;
      phoneClicks: number;
      websiteClicks: number;
      directionsClicks: number;
      shareClicks: number;
      visitorHashes: string[];
      byPlacement: Record<string, number>;
      byDevice: { desktop: number; mobile: number };
    }
  >;
}

export type AdAnalyticsRange = 'daily' | 'weekly' | 'monthly' | 'all';

export interface AdAnalyticsSummaryResponse {
  ok: boolean;
  range: AdAnalyticsRange;
  totals: {
    impressions: number;
    uniqueVisitors: number;
    clicks: number;
    ctrPct: number;
    whatsappClicks: number;
    phoneClicks: number;
    websiteClicks: number;
    directionsClicks: number;
    shareClicks: number;
    desktopImpressions: number;
    mobileImpressions: number;
  };
  byPlacement: Record<string, number>;
  series: Array<{
    date: string;
    impressions: number;
    uniqueVisitors: number;
    clicks: number;
  }>;
  perAd: Array<{
    adId: string;
    adNumber: string;
    title: string;
    advertiserName?: string;
    category: string;
    status: AdStatus;
    impressions: number;
    uniqueVisitors: number;
    clicks: number;
    ctrPct: number;
    whatsappClicks: number;
    phoneClicks: number;
    websiteClicks: number;
    directionsClicks: number;
    shareClicks: number;
    desktopImpressions: number;
    mobileImpressions: number;
    byPlacement: Record<string, number>;
  }>;
  bestPerformingAd: {
    adId: string;
    adNumber: string;
    title: string;
    impressions: number;
    clicks: number;
    ctrPct: number;
  } | null;
}

export interface AdvertisementPayload {
  title: string;
  campaignName?: string;
  advertiserName?: string;
  description: string;
  mainImageUrl: string;
  mainImageThumbUrl?: string;
  mainImageDriveId?: string;
  additionalImages?: AdExtraImage[];
  contactNumber?: string;
  whatsappNumber?: string;
  businessAddress?: string;
  websiteUrl?: string;
  ctaType?: AdCtaType;
  ctaLabel?: string;
  ctaUrl?: string;
  category: string;
  status: AdStatus;
  approvalStatus?: AdApprovalStatus;
  publishDate: string;
  expiryDate: string;
  schedule?: AdCampaignSchedule;
  priority?: AdPriority;
  targetDevice?: AdDeviceTarget;
  displayFrequency?: AdDisplayFrequency;
  maxImpressionsPerVisitor?: number;
  placements?: AdPlacementsConfig;
  rotation?: AdRotationOverrides;
  sharing?: AdSharingConfig;
}
