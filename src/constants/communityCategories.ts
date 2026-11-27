import type { CommunityCategoryId, CommunityCategoryMeta } from '../types/community';

/**
 * Exact 13 Kannada categories required for Coffeenadu Community submissions.
 */
export const COMMUNITY_CATEGORIES: CommunityCategoryMeta[] = [
  {
    id: 'my-shop',
    labelKn: 'ನನ್ನ ಅಂಗಡಿ',
    labelEn: 'My Shop / Business',
    showPriceField: false,
    pricePlaceholderKn: '',
    feedGroup: 'shops',
  },
  {
    id: 'for-sale',
    labelKn: 'ಮಾರಾಟಕ್ಕಿದೆ',
    labelEn: 'Items for Sale',
    showPriceField: true,
    pricePlaceholderKn: 'ಉದಾ: ₹3,500',
    feedGroup: 'sale',
  },
  {
    id: 'lost-item',
    labelKn: 'ಕಳೆದುಹೋದ ವಸ್ತು',
    labelEn: 'Lost Item',
    showPriceField: false,
    pricePlaceholderKn: '',
    feedGroup: 'lost-found',
  },
  {
    id: 'found-item',
    labelKn: 'ಸಿಕ್ಕಿರುವ ವಸ್ತು',
    labelEn: 'Found Item',
    showPriceField: false,
    pricePlaceholderKn: '',
    feedGroup: 'lost-found',
  },
  {
    id: 'my-service',
    labelKn: 'ನನ್ನ ಸೇವೆ',
    labelEn: 'My Service',
    showPriceField: true,
    pricePlaceholderKn: 'ಉದಾ: ₹500 ರಿಂದ (ಐಚ್ಛಿಕ)',
    feedGroup: 'services',
  },
  {
    id: 'jobs',
    labelKn: 'ಉದ್ಯೋಗ ಮಾಹಿತಿ',
    labelEn: 'Job Info',
    showPriceField: true,
    pricePlaceholderKn: 'ಉದಾ: ತಿಂಗಳಿಗೆ ₹15,000 (ಐಚ್ಛಿಕ)',
    feedGroup: 'jobs',
  },
  {
    id: 'events',
    labelKn: 'ಕಾರ್ಯಕ್ರಮಗಳು',
    labelEn: 'Events & Programs',
    showPriceField: false,
    pricePlaceholderKn: '',
    feedGroup: 'events',
  },
  {
    id: 'house-land',
    labelKn: 'ಮನೆ / ಜಮೀನು',
    labelEn: 'House / Land',
    showPriceField: true,
    pricePlaceholderKn: 'ಉದಾ: ತಿಂಗಳಿಗೆ ₹6,000 ಅಥವಾ ₹12 ಲಕ್ಷ',
    feedGroup: 'sale',
  },
  {
    id: 'agri-products',
    labelKn: 'ಕೃಷಿ ಉತ್ಪನ್ನಗಳು',
    labelEn: 'Agriculture Products',
    showPriceField: true,
    pricePlaceholderKn: 'ಉದಾ: ಕೆ.ಜಿ ಗೆ ₹420 / ಕ್ವಿಂಟಾಲ್ ದರ',
    feedGroup: 'agriculture',
  },
  {
    id: 'vehicle-sale',
    labelKn: 'ವಾಹನ ಮಾರಾಟ',
    labelEn: 'Vehicle Sale',
    showPriceField: true,
    pricePlaceholderKn: 'ಉದಾ: ₹55,000',
    feedGroup: 'sale',
  },
  {
    id: 'training-tuition',
    labelKn: 'ತರಬೇತಿ / ಟ್ಯೂಷನ್',
    labelEn: 'Training / Tuition',
    showPriceField: true,
    pricePlaceholderKn: 'ಉದಾ: ತಿಂಗಳಿಗೆ ₹800 (ಐಚ್ಛಿಕ)',
    feedGroup: 'services',
  },
  {
    id: 'public-info',
    labelKn: 'ಸಾರ್ವಜನಿಕ ಮಾಹಿತಿ',
    labelEn: 'Public Information',
    showPriceField: false,
    pricePlaceholderKn: '',
    feedGroup: 'announcements',
  },
  {
    id: 'other-info',
    labelKn: 'ಇತರೆ ಮಾಹಿತಿ',
    labelEn: 'Other Information',
    showPriceField: true,
    pricePlaceholderKn: 'ಬೆಲೆ ಇದ್ದರೆ ಮಾತ್ರ ನಮೂದಿಸಿ (ಐಚ್ಛಿಕ)',
    feedGroup: 'announcements',
  },
];

export const COMMUNITY_CATEGORY_MAP: Record<CommunityCategoryId, CommunityCategoryMeta> =
  COMMUNITY_CATEGORIES.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<CommunityCategoryId, CommunityCategoryMeta>
  );

export type CommunityFeedTabId =
  | 'all'
  | 'nearby'
  | 'shops'
  | 'sale'
  | 'jobs'
  | 'lost-found'
  | 'events'
  | 'agriculture'
  | 'services'
  | 'announcements';

export const COMMUNITY_FEED_TABS: Array<{
  id: CommunityFeedTabId;
  labelKn: string;
  labelEn: string;
}> = [
  { id: 'all', labelKn: 'ಇತ್ತೀಚಿನವು', labelEn: 'Latest' },
  { id: 'nearby', labelKn: 'ಹತ್ತಿರದ ಮಾಹಿತಿ', labelEn: 'Nearby' },
  { id: 'shops', labelKn: 'ಅಂಗಡಿ ಮತ್ತು ವ್ಯಾಪಾರ', labelEn: 'Shops' },
  { id: 'sale', labelKn: 'ಮಾರಾಟ & ಆಸ್ತಿ', labelEn: 'For Sale' },
  { id: 'jobs', labelKn: 'ಉದ್ಯೋಗ', labelEn: 'Jobs' },
  { id: 'lost-found', labelKn: 'ಕಳೆದುಹೋದ / ಸಿಕ್ಕ ವಸ್ತು', labelEn: 'Lost & Found' },
  { id: 'events', labelKn: 'ಕಾರ್ಯಕ್ರಮಗಳು', labelEn: 'Events' },
  { id: 'agriculture', labelKn: 'ಕೃಷಿ ಉತ್ಪನ್ನಗಳು', labelEn: 'Agriculture' },
  { id: 'services', labelKn: 'ಸ್ಥಳೀಯ ಸೇವೆಗಳು', labelEn: 'Services' },
  { id: 'announcements', labelKn: 'ಸಾರ್ವಜನಿಕ ಮಾಹಿತಿ', labelEn: 'Announcements' },
];

export const COMMUNITY_LOCATIONS_KN: Array<{ value: string; labelKn: string; labelEn: string }> = [
  { value: 'ಕೊಪ್ಪ', labelKn: 'ಕೊಪ್ಪ', labelEn: 'Koppa' },
  { value: 'ಜಯಪುರ', labelKn: 'ಜಯಪುರ', labelEn: 'Jayapura' },
  { value: 'ಹರಿಹರಪುರ', labelKn: 'ಹರಿಹರಪುರ', labelEn: 'Hariharapura' },
  { value: 'ಶೃಂಗೇರಿ', labelKn: 'ಶೃಂಗೇರಿ', labelEn: 'Sringeri' },
  { value: 'ಬಾಳೆಹೊನ್ನೂರು', labelKn: 'ಬಾಳೆಹೊನ್ನೂರು', labelEn: 'Balehonnur' },
  { value: 'ಎನ್.ಆರ್. ಪುರ', labelKn: 'ಎನ್.ಆರ್. ಪುರ', labelEn: 'N.R. Pura' },
  { value: 'ಬಸರೀಕಟ್ಟೆ', labelKn: 'ಬಸರೀಕಟ್ಟೆ', labelEn: 'Basarikatte' },
  { value: 'ಕುದುರೆಗುಂಡಿ', labelKn: 'ಕುದುರೆಗುಂಡಿ', labelEn: 'Kudregundi' },
  { value: 'ಮೇಗೂರು', labelKn: 'ಮೇಗೂರು', labelEn: 'Megur' },
  { value: 'ನಾರ್ವೆ', labelKn: 'ನಾರ್ವೆ', labelEn: 'Narve' },
  { value: 'ಚಿಕ್ಕಮಗಳೂರು', labelKn: 'ಚಿಕ್ಕಮಗಳೂರು', labelEn: 'Chikkamagaluru' },
  { value: 'ಇತರೆ ಮಲೆನಾಡು ಗ್ರಾಮ', labelKn: 'ಇತರೆ ಮಲೆನಾಡು ಗ್ರಾಮ', labelEn: 'Other Malnad Village' },
];
