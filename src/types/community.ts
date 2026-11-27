export type CommunityCategoryId =
  | 'my-shop'
  | 'for-sale'
  | 'lost-item'
  | 'found-item'
  | 'my-service'
  | 'jobs'
  | 'events'
  | 'house-land'
  | 'agri-products'
  | 'vehicle-sale'
  | 'training-tuition'
  | 'public-info'
  | 'other-info';

export type CommunityPostStatus = 'published' | 'hidden' | 'removed';

export type CommunityUserStatus = 'active' | 'suspended';

export interface CommunityCategoryMeta {
  id: CommunityCategoryId;
  labelKn: string;
  labelEn: string;
  showPriceField: boolean;
  pricePlaceholderKn: string;
  feedGroup:
    | 'shops'
    | 'sale'
    | 'jobs'
    | 'lost-found'
    | 'events'
    | 'agriculture'
    | 'services'
    | 'announcements';
}

/**
 * Private server-side user record.
 * NEVER serialize or return this directly on public endpoints.
 */
export interface CommunityUserPrivate {
  id: string;
  fullName: string;
  mobileNumber: string; // Normalized 10-digit Indian mobile — ADMIN ONLY
  registeredAt: string;
  lastActiveAt: string;
  status: CommunityUserStatus;
  suspendedReason?: string;
}

/**
 * Self-profile returned ONLY to the authenticated user themselves.
 * Uses masked mobile so raw number is never leaked casually into DOM/logs.
 */
export interface CommunitySelfProfile {
  fullName: string;
  maskedMobile: string;
  registeredAt: string;
  status: CommunityUserStatus;
  totalPosts: number;
}

/**
 * Full server-side post record (includes private owner reference).
 * NEVER return this directly from public API routes; always project via toPublicCommunityPost().
 */
export interface CommunityPostRecord {
  id: string;
  slug: string;
  authorUserId: string; // PRIVATE — never exposed publicly
  authorName: string; // Public contributor name only
  title: string;
  category: CommunityCategoryId;
  description: string;
  location: string;
  photos: string[]; // Validated media URLs (/api/community/media/... or safe data URLs)
  price?: string;
  optionalPublicContact?: string; // ONLY present if contributor explicitly entered it
  status: CommunityPostStatus;
  hiddenReason?: string;
  createdAt: string;
  updatedAt: string;
  viewsCount: number;
  sharesCount: number;
}

/**
 * Strictly sanitized public representation of a community post.
 * Contains ZERO private user IDs, mobile numbers, or auth metadata.
 */
export interface PublicCommunityPost {
  id: string;
  slug: string;
  authorName: string;
  title: string;
  category: CommunityCategoryId;
  description: string;
  location: string;
  photos: string[];
  price?: string;
  optionalPublicContact?: string;
  createdAt: string;
  updatedAt: string;
  viewsCount: number;
  sharesCount: number;
  isOwner?: boolean;
}

export interface CommunityReportRecord {
  id: string;
  postId: string;
  postTitle: string;
  reason: string;
  details?: string;
  createdAt: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolvedAt?: string;
  resolvedBy?: string;
}

/**
 * Admin-only view of a registered user including private mobile number & post stats.
 */
export interface AdminCommunityUserSummary {
  id: string;
  fullName: string;
  mobileNumber: string;
  registeredAt: string;
  lastActiveAt: string;
  status: CommunityUserStatus;
  suspendedReason?: string;
  totalPosts: number;
  publishedPosts: number;
  hiddenPosts: number;
}

export interface AdminCommunityPostView extends CommunityPostRecord {
  authorMobileNumber: string; // Admin-only reference
  openReportsCount: number;
}

export interface CommunityPostMutationInput {
  title: string;
  category: CommunityCategoryId;
  description: string;
  location: string;
  price?: string;
  optionalPublicContact?: string;
  photos?: string[];
}
