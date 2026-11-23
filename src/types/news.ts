export type NewsCategory =
  | 'Local'
  | 'Malnad'
  | 'Agriculture'
  | 'Health'
  | 'Entertainment'
  | 'Crime'
  | 'General'
  | 'Politics'
  | 'Sports'
  | 'Special'
  | 'State'
  | 'Nation'
  | 'Civic & Roads'
  | 'Education'
  | 'Culture';

export type FilterCategory = 'All' | NewsCategory;

export type ImageKey =
  | 'none'
  | 'koppa-landscape'
  | 'malnad-hills'
  | 'coffee-estate'
  | 'health-medical'
  | 'entertainment-stage'
  | 'crime-alert'
  | 'general-news'
  | 'politics-assembly'
  | 'sports-stadium'
  | 'special-feature'
  | 'state-civic'
  | 'nation-parliament'
  | 'tunga-bridge'
  | 'education-library'
  | 'malnad-culture';

export interface PlaceOption {
  id: string;
  labelKn: string;
  labelEn: string;
  aliases: string[];
}

export interface ExtraNewsPhoto {
  imageUrl: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  caption?: string;
  watermarkApplied?: boolean;
}

export interface NewsArticle {
  id: string;
  titleKannada: string;
  summaryKannada: string;
  bodyKannada: string[];
  category: NewsCategory;
  location: string;
  publishedDate: string;
  publishedTime: string;
  publishedTimestamp?: number;
  readTimeMinutes: number;
  reporter: string;
  imageKey?: ImageKey;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  imageCaption?: string;
  extraImages?: ExtraNewsPhoto[];
  isFeatured?: boolean;
  featuredUntil?: number;
  tags?: string;
  authorUid?: string;
  viewCount?: number;
  watermarkApplied?: boolean;
}

export interface ProgramEvent {
  id: string;
  titleKannada: string;
  descriptionKannada: string;
  eventDate: string; // YYYY-MM-DD
  eventTime: string;
  location: string;
  organizer: string;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  authorUid?: string;
  createdTimestamp?: number;
  viewCount?: number;
  watermarkApplied?: boolean;
}

export interface SupportThread {
  id: string;
  senderName: string;
  senderPhone?: string;
  senderLocation: string;
  topic: string;
  lastMessage: string;
  lastSenderRole: 'reader' | 'admin';
  status: 'open' | 'replied' | 'closed';
  unreadByAdmin: boolean;
  unreadByReader: boolean;
  createdTimestamp?: number;
  updatedTimestamp?: number;
}

export interface SupportMessage {
  id: string;
  threadId: string;
  senderRole: 'reader' | 'admin';
  senderName: string;
  text: string;
  createdTimestamp?: number;
}

export interface LocalBrief {
  id: string;
  area: string;
  timeLabel: string;
  textKannada: string;
}

export interface MarketRate {
  commodity: string;
  variety: string;
  pricePerQuintal: number;
  change: number;
}

export interface BusTimingItem {
  timingId: number;
  departureTime: string;
  departureTime24?: string;
  busName: string;
  remarks: string;
  fromPlaceEn?: string;
  fromPlaceKn?: string;
}

export interface BusRouteSchedule {
  routeId: number;
  routeName: string;
  description: string;
  timings: BusTimingItem[];
}

export interface BusPlaceSummary {
  titleId: number;
  placeId: number;
  nameEn: string;
  nameKn: string;
  routeCount: number;
}

export interface BusPlaceScheduleResponse {
  places: BusPlaceSummary[];
  activePlace: BusPlaceSummary;
  routes: BusRouteSchedule[];
}

export type BusAgentTimePreference = 'all' | 'morning' | 'afternoon' | 'evening';

export interface BusAgentChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface BusAgentMatchedRoute {
  placeNameEn: string;
  placeNameKn: string;
  routeId: number;
  routeTitle: string;
  routeSubtitle?: string;
  fromPlaceLabel: string;
  matchType: 'direct' | 'via';
  timings: BusTimingItem[];
}

export interface BusAgentResponse {
  status: 'needs_both' | 'needs_origin' | 'needs_destination' | 'ready';
  reply: string;
  origin?: string;
  destination?: string;
  timePreference?: BusAgentTimePreference;
  matchedRoutes: BusAgentMatchedRoute[];
  suggestedHubs?: string[];
}
