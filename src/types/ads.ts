export type AdStatus = 'active' | 'inactive' | 'draft';

export const AD_CATEGORIES = [
  'Business',
  'Education',
  'Real Estate',
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

export interface AdExtraImage {
  imageUrl: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  caption?: string;
}

export interface Advertisement {
  id: string;
  adNumber: string; // Sequential ID e.g. AD001, AD002, AD003
  title: string;
  description: string; // Rich HTML or plain text description
  mainImageUrl: string;
  mainImageThumbUrl?: string;
  mainImageDriveId?: string;
  additionalImages: AdExtraImage[];
  contactNumber?: string;
  whatsappNumber?: string;
  businessAddress?: string;
  websiteUrl?: string;
  category: AdCategory | string;
  status: AdStatus;
  publishDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  views: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface AdvertisementStats {
  total: number;
  active: number;
  inactive: number;
  expired: number;
  draft: number;
}

export interface AdvertisementPayload {
  title: string;
  description: string;
  mainImageUrl: string;
  mainImageThumbUrl?: string;
  mainImageDriveId?: string;
  additionalImages?: AdExtraImage[];
  contactNumber?: string;
  whatsappNumber?: string;
  businessAddress?: string;
  websiteUrl?: string;
  category: string;
  status: AdStatus;
  publishDate: string;
  expiryDate: string;
}
