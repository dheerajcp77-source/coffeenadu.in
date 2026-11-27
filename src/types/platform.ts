export type PlatformLanguage = 'kn' | 'en';

export type PlatformModuleId =
  | 'news'
  | 'businesses'
  | 'jobs'
  | 'marketplace'
  | 'agriculture'
  | 'transport'
  | 'education'
  | 'health'
  | 'schemes'
  | 'tourism'
  | 'property'
  | 'events'
  | 'community'
  | 'lost-found'
  | 'grievances'
  | 'services'
  | 'weather'
  | 'games'
  | 'offers'
  | 'contacts'
  | 'documents'
  | 'account';

export type DirectoryModuleId = Exclude<
  PlatformModuleId,
  'news' | 'transport' | 'events' | 'weather' | 'games' | 'account'
>;

export type ListingStatus = 'approved' | 'pending' | 'rejected' | 'expired' | 'sold';

export type ListingIconKey =
  | 'newspaper'
  | 'store'
  | 'briefcase'
  | 'shopping-bag'
  | 'sprout'
  | 'bus'
  | 'graduation-cap'
  | 'heart-pulse'
  | 'landmark'
  | 'mountain'
  | 'home'
  | 'calendar'
  | 'megaphone'
  | 'search-check'
  | 'shield-alert'
  | 'wrench'
  | 'cloud-rain'
  | 'gamepad'
  | 'tag'
  | 'phone-call'
  | 'file-text'
  | 'user-check';

export interface PlatformModuleMeta {
  id: PlatformModuleId;
  route: string;
  titleKn: string;
  titleEn: string;
  shortDescKn: string;
  shortDescEn: string;
  icon: ListingIconKey;
  group: 'core' | 'commerce' | 'civic' | 'life';
  categories: Array<{ id: string; labelKn: string; labelEn: string }>;
  allowPublicSubmission: boolean;
  isDirectoryModule: boolean;
}

export interface LocalityOption {
  id: string;
  nameEn: string;
  nameKn: string;
  taluk: string;
  active: boolean;
}

export interface PlatformListing {
  id: string;
  module: DirectoryModuleId;
  title: string;
  titleEn?: string;
  category: string;
  subcategory?: string;
  summary: string;
  description: string;
  location: string;
  address?: string;
  mapUrl?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  imageUrl?: string;
  gallery?: string[];
  tags?: string[];
  price?: number | null;
  priceLabel?: string;
  negotiable?: boolean;
  condition?: 'new' | 'used' | 'refurbished' | '';
  employer?: string;
  jobType?: 'government' | 'private' | 'part-time' | 'contract' | '';
  qualification?: string;
  experience?: string;
  salary?: string;
  applicationDeadline?: string;
  applyUrl?: string;
  openingHours?: string;
  weeklyHoliday?: string;
  emergency24x7?: boolean;
  verified: boolean;
  featured: boolean;
  status: ListingStatus;
  subscriptionPlan?: 'free' | 'standard' | 'featured';
  expiresAt?: string;
  sourceAttribution?: string;
  lastUpdatedLabel?: string;
  documentUrl?: string;
  fileType?: string;
  discountText?: string;
  validUntil?: string;
  grievanceStatus?: 'open' | 'in_review' | 'resolved';
  lostOrFound?: 'lost' | 'found' | '';
  propertyType?: 'rent' | 'sale' | 'lease' | 'estate' | 'land' | 'room' | '';
  areaSize?: string;
  submittedByUid?: string;
  submittedByName?: string;
  submittedByContact?: string;
  views: number;
  callClicks: number;
  whatsappClicks: number;
  applyClicks: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformReport {
  id: string;
  listingId: string;
  listingTitle: string;
  module: DirectoryModuleId;
  reason: string;
  details: string;
  reporterName?: string;
  reporterContact?: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface QuizQuestion {
  id: string;
  questionKn: string;
  questionEn: string;
  options: Array<{ kn: string; en: string }>;
  correctIndex: number;
  explanationKn?: string;
  explanationEn?: string;
}

export interface PlatformQuiz {
  id: string;
  titleKn: string;
  titleEn: string;
  descriptionKn: string;
  descriptionEn: string;
  category: 'malnad' | 'kannada' | 'general' | 'agriculture' | 'daily';
  scheduleType: 'always' | 'daily' | 'weekly';
  active: boolean;
  questions: QuizQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface QuizLeaderboardEntry {
  id: string;
  quizId: string;
  playerName: string;
  location: string;
  score: number;
  total: number;
  durationSec: number;
  createdAt: string;
}

export interface WeatherRainfallRecord {
  id: string;
  location: string;
  dateYmd: string;
  rainfallMm: number;
  tempMinC?: number | null;
  tempMaxC?: number | null;
  conditionKn: string;
  conditionEn: string;
  advisoryKn?: string;
  advisoryEn?: string;
  sourceAttribution: string;
  updatedAt: string;
}

export interface WeatherConfig {
  externalApiConfigured: boolean;
  providerName: string;
  sourceNoteKn: string;
  sourceNoteEn: string;
  lastSyncedAt?: string;
}

export interface HomepageSectionConfig {
  id: string;
  module: PlatformModuleId;
  enabled: boolean;
  order: number;
  titleKn: string;
  titleEn: string;
  descriptionKn: string;
  descriptionEn: string;
  maxItems: number;
}

export interface PlatformSearchResultItem {
  id: string;
  module: PlatformModuleId;
  title: string;
  subtitle?: string;
  summary: string;
  location?: string;
  category?: string;
  route: string;
  imageUrl?: string;
  priceLabel?: string;
  badgeText?: string;
  dateLabel?: string;
  score: number;
  articleId?: string;
  listingId?: string;
}

export interface PlatformAnalyticsSummary {
  totalUniqueVisitors: number;
  dailyVisitors: number;
  weeklyVisitors: number;
  monthlyVisitors: number;
  activeVisitorsApprox: number;
  totalPageViews: number;
  totalWhatsappShares: number;
  totalEnquiries: number;
  deviceBreakdown: { mobile: number; desktop: number };
  topSearchTerms: Array<{ term: string; count: number }>;
  popularSections: Array<{ module: string; visits: number }>;
  locationActivity: Array<{ location: string; count: number }>;
  moduleCounts: Record<string, number>;
  pendingSubmissionsCount: number;
  openReportsCount: number;
  quizAttemptsCount: number;
  recentSubmissions: PlatformListing[];
}

export interface UserSavedBundle {
  articles: string[];
  businesses: string[];
  jobs: string[];
  marketplace: string[];
  otherListings: string[];
}

export type AnnouncementButtonAction =
  | 'open-submit-modal'
  | 'filter:all'
  | 'filter:marketplace'
  | 'filter:news'
  | 'filter:community'
  | 'filter:jobs'
  | 'filter:businesses'
  | 'route:/community'
  | 'route:/marketplace'
  | 'route:/businesses'
  | 'route:/jobs'
  | 'route:/events'
  | 'route:/ads'
  | 'custom-url';

export interface AnnouncementButtonConfig {
  id: string;
  labelKn: string;
  labelEn: string;
  action: AnnouncementButtonAction;
  customUrl?: string;
  variant: 'primary' | 'secondary' | 'outline';
}

export interface HomepageAnnouncementConfig {
  enabled: boolean;
  headingKn: string;
  headingEn: string;
  descriptionKn: string;
  descriptionEn: string;
  imageUrl?: string;
  startDate?: string; // Optional YYYY-MM-DD
  endDate?: string;   // Optional YYYY-MM-DD
  buttons: AnnouncementButtonConfig[];
  updatedAt?: string;
}

export type FeedCategoryId =
  | 'all'
  | 'news'
  | 'local'
  | 'malnad'
  | 'agriculture'
  | 'marketplace'
  | 'businesses'
  | 'jobs'
  | 'property'
  | 'vehicles'
  | 'lost-found'
  | 'services'
  | 'education'
  | 'health'
  | 'events'
  | 'tourism'
  | 'community'
  | 'public-info'
  | 'offers'
  | 'schemes'
  | 'contacts'
  | 'entertainment'
  | 'crime'
  | 'politics'
  | 'sports'
  | 'culture'
  | 'civic-roads'
  | 'special'
  | 'state'
  | 'nation'
  | 'general';

export interface FeedCategoryConfig {
  id: FeedCategoryId;
  labelKn: string;
  labelEn: string;
  icon: string;
  enabled: boolean;
  order: number;
}

export interface PlatformDisplaySettings {
  /** Strictly false by default: hides all view counts across public and admin interfaces while preserving database records. */
  showViewCounts: boolean;
  showBreakingTicker: boolean;
  showTrendingSection: boolean;
  showCategoryGrid: boolean;
  showCommunityFeed: boolean;
  updatedAt?: string;
}

export interface PlatformBootstrapPayload {
  ok: boolean;
  localities: LocalityOption[];
  homepageSections: HomepageSectionConfig[];
  homepageAnnouncement?: HomepageAnnouncementConfig;
  feedCategories?: FeedCategoryConfig[];
  displaySettings?: PlatformDisplaySettings;
  moduleCounts: Record<string, number>;
  featuredListings: PlatformListing[];
  popularSearches: Array<{ term: string; count: number }>;
  weatherConfig: WeatherConfig;
  latestWeatherLogs: WeatherRainfallRecord[];
  activeQuizCount: number;
}
