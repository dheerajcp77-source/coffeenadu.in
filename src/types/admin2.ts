export type AdminSectionId =
  | 'dashboard'
  | 'news'
  | 'add-article'
  | 'ads'
  | 'add-ad'
  | 'calendar'
  | 'ai-studio'
  | 'platform-hub'
  | 'community-users'
  | 'monthly-contest'
  | 'platform-moderation'
  | 'platform-homepage'
  | 'platform-games'
  | 'media'
  | 'messaging'
  | 'notifications'
  | 'analytics'
  | 'seo'
  | 'automations'
  | 'administrators'
  | 'storage'
  | 'backups'
  | 'security'
  | 'settings'
  | 'health';

export type AdminRole =
  | 'super_admin'
  | 'admin'
  | 'editor'
  | 'reporter'
  | 'analyst'
  | 'custom';

export type AdminPermission =
  | 'dashboard.view'
  | 'news.create'
  | 'news.edit'
  | 'news.publish'
  | 'news.delete'
  | 'news.archive'
  | 'ads.manage'
  | 'ai.use'
  | 'media.manage'
  | 'messaging.manage'
  | 'analytics.view'
  | 'seo.manage'
  | 'automations.manage'
  | 'admins.manage'
  | 'storage.manage'
  | 'backups.manage'
  | 'security.view'
  | 'settings.manage';

export const ALL_ADMIN_PERMISSIONS: Array<{
  key: AdminPermission;
  label: string;
  group: string;
}> = [
  { key: 'dashboard.view', label: 'View Dashboard Overview', group: 'Editorial' },
  { key: 'news.create', label: 'Create Drafts & Articles', group: 'Editorial' },
  { key: 'news.edit', label: 'Edit Existing News', group: 'Editorial' },
  { key: 'news.publish', label: 'Publish & Schedule Live News', group: 'Editorial' },
  { key: 'news.archive', label: 'Unpublish & Archive News', group: 'Editorial' },
  { key: 'news.delete', label: 'Delete News Permanently', group: 'Editorial' },
  { key: 'ads.manage', label: 'Manage Local Advertisements', group: 'Content & Growth' },
  { key: 'ai.use', label: 'Use AI News Studio (Drafts Only)', group: 'Editorial' },
  { key: 'media.manage', label: 'Upload & Organize Media Centre', group: 'Content & Growth' },
  { key: 'messaging.manage', label: 'Reply to Inbox & Notifications', group: 'Content & Growth' },
  { key: 'analytics.view', label: 'View Analytics & Reports', group: 'Content & Growth' },
  { key: 'seo.manage', label: 'Manage SEO & Sitemap', group: 'Content & Growth' },
  { key: 'automations.manage', label: 'Control Automations & Triggers', group: 'Operations' },
  { key: 'storage.manage', label: 'Manage Sheets & Drive Storage', group: 'Operations' },
  { key: 'backups.manage', label: 'Create & Restore Backups', group: 'Operations' },
  { key: 'admins.manage', label: 'Manage Delegated Admin Accounts', group: 'Administration' },
  { key: 'security.view', label: 'View Security & Audit Logs', group: 'Administration' },
  { key: 'settings.manage', label: 'Update Website Settings', group: 'Administration' },
];

export const ROLE_DEFAULT_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: ALL_ADMIN_PERMISSIONS.map((p) => p.key),
  admin: [
    'dashboard.view',
    'news.create',
    'news.edit',
    'news.publish',
    'news.archive',
    'news.delete',
    'ads.manage',
    'ai.use',
    'media.manage',
    'messaging.manage',
    'analytics.view',
    'seo.manage',
    'automations.manage',
    'storage.manage',
    'backups.manage',
    'security.view',
    'settings.manage',
  ],
  editor: [
    'dashboard.view',
    'news.create',
    'news.edit',
    'news.publish',
    'news.archive',
    'ads.manage',
    'ai.use',
    'media.manage',
    'messaging.manage',
    'seo.manage',
    'analytics.view',
  ],
  reporter: [
    'dashboard.view',
    'news.create',
    'news.edit',
    'ai.use',
    'media.manage',
  ],
  analyst: [
    'dashboard.view',
    'analytics.view',
    'seo.manage',
    'security.view',
  ],
  custom: ['dashboard.view'],
};

export interface Admin2AccountPublic {
  id: string;
  fullName: string;
  email: string;
  role: AdminRole;
  customRoleLabel?: string;
  permissions: AdminPermission[];
  status: 'active' | 'pending_activation' | 'suspended';
  protectedSuperAdmin: boolean;
  hasPassword: boolean;
  createdAt: string;
  createdBy: string;
  lastLoginAt?: string;
  activeSessionCount: number;
}

export interface Admin2SessionInfo {
  id: string;
  accountId: string;
  email: string;
  fullName: string;
  role: AdminRole;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string;
  userAgent: string;
  isCurrent?: boolean;
}

export interface Admin2SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: AdminRole;
  customRoleLabel?: string;
  permissions: AdminPermission[];
  protectedSuperAdmin: boolean;
  authProvider: 'firebase' | 'admin2_password';
  sessionId?: string;
}

export interface Admin2AuditLog {
  id: string;
  timestamp: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
  ip?: string;
}

export interface Admin2LoginHistoryItem {
  id: string;
  timestamp: string;
  email: string;
  provider: 'firebase' | 'admin2_password';
  success: boolean;
  reason?: string;
  ip?: string;
  userAgent?: string;
}

export interface Admin2Notification {
  id: string;
  timestamp: string;
  category:
    | 'publishing'
    | 'image'
    | 'backup'
    | 'storage'
    | 'automation'
    | 'security'
    | 'messaging';
  severity: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  read: boolean;
  entityId?: string;
}

export interface Admin2NotificationPreferences {
  publishingSuccess: boolean;
  publishingFailure: boolean;
  imageProcessing: boolean;
  backupAlerts: boolean;
  storageWarnings: boolean;
  automationErrors: boolean;
  adminSecurityActivity: boolean;
  readerMessages: boolean;
}

export type ArticleWorkflowStatus = 'published' | 'draft' | 'scheduled' | 'archived';

export interface ArticleRevisionEntry {
  id: string;
  timestamp: string;
  editorEmail: string;
  summary: string;
  titleSnapshot: string;
  statusSnapshot: ArticleWorkflowStatus;
}

export interface ArticleSeoMeta {
  seoTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  imageAltText?: string;
  focusKeyword?: string;
  language?: 'Kannada' | 'English' | 'Bilingual';
}

export interface Admin2ManagedDraft {
  id: string;
  customSlug?: string;
  titleKannada: string;
  summaryKannada: string;
  bodyKannada: string[];
  category: string;
  location: string;
  reporter: string;
  language: 'Kannada' | 'English' | 'Bilingual';
  imageKey?: string;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  imageCaption?: string;
  extraImages?: Array<{
    imageUrl: string;
    imageThumbUrl?: string;
    imageDriveId?: string;
    caption?: string;
    watermarkApplied?: boolean;
  }>;
  isFeatured?: boolean;
  featuredUntil?: number;
  watermarkApplied?: boolean;
  status: 'draft' | 'scheduled' | 'archived';
  scheduledFor?: string;
  aiGenerated?: boolean;
  approvedBy?: string;
  seo?: ArticleSeoMeta;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ArticleCmsOverlay {
  articleId: string;
  status: ArticleWorkflowStatus;
  language: 'Kannada' | 'English' | 'Bilingual';
  scheduledFor?: string;
  archivedAt?: string;
  aiGenerated?: boolean;
  seo?: ArticleSeoMeta;
  revisions: ArticleRevisionEntry[];
}

export interface Admin2AutomationRun {
  id: string;
  timestamp: string;
  status: 'success' | 'error' | 'skipped';
  durationMs: number;
  summary: string;
  error?: string;
}

export interface Admin2AutomationItem {
  id: string;
  name: string;
  category: 'branding' | 'publishing' | 'storage' | 'reporting' | 'alerts';
  description: string;
  enabled: boolean;
  managedBy: 'client_canvas' | 'server_worker' | 'apps_script_trigger';
  scheduleLabel: string;
  status: 'active' | 'paused' | 'error';
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  canRunManually: boolean;
  preserveTriggerNote?: string;
  config: Record<string, string | number | boolean>;
  history: Admin2AutomationRun[];
}

export interface Admin2MediaAsset {
  id: string;
  driveFileId?: string;
  imageUrl: string;
  thumbUrl?: string;
  fileName: string;
  folder: string;
  mimeType: string;
  sizeBytes?: number;
  sha256?: string;
  watermarkApplied: boolean;
  middleOverlayApplied: boolean;
  uploadedAt: string;
  uploadedBy?: string;
  usageArticles: Array<{ articleId: string; title: string; role: 'main' | 'extra' | 'event' }>;
  processingHistory: string[];
}

export interface Admin2WebsiteSettings {
  siteName: string;
  siteTagline: string;
  canonicalBaseUrl: string;
  defaultLanguage: 'Kannada' | 'English' | 'Bilingual';
  whatsappNumber: string;
  whatsappGroupUrl: string;
  defaultSeoTitle: string;
  defaultMetaDescription: string;
  ga4MeasurementId: string;
  searchConsoleSiteUrl: string;
  watermarkLogoEnabled: boolean;
  watermarkMiddleTextEnabled: boolean;
  watermarkMiddleText: string;
  breakingTickerNotice: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Admin2RecentViewedArticle {
  id: string;
  title: string;
  category: string;
  location: string;
  publishedDate: string;
  views: number;
  viewedAt: string;
}

export interface Admin2AnalyticsSummary {
  rangeDays: number;
  dailySeries: Array<{
    date: string;
    pageViews: number;
    uniqueVisitors: number;
    articleReads: number;
  }>;
  totals: {
    pageViews: number;
    uniqueVisitors: number;
    articleReads: number;
    totalSheetArticleViews: number;
    totalPublishedArticles: number;
  };
  trafficSources: Array<{ source: string; count: number; pct: number }>;
  deviceBreakdown: Array<{ device: string; count: number; pct: number }>;
  categoryPerformance: Array<{ category: string; articles: number; views: number }>;
  topArticles: Array<{
    id: string;
    title: string;
    category: string;
    location: string;
    publishedDate: string;
    views: number;
  }>;
  recentlyViewedArticles: Admin2RecentViewedArticle[];
  ga4Connected: boolean;
  ga4MeasurementId: string;
  searchConsoleConnected: boolean;
  searchConsoleSiteUrl: string;
}

export type AiStudioTool =
  | 'draft_kannada'
  | 'draft_english'
  | 'translate_kn_en'
  | 'translate_en_kn'
  | 'headlines'
  | 'summary'
  | 'seo_title'
  | 'meta_description'
  | 'grammar'
  | 'readability'
  | 'image_caption'
  | 'image_alt'
  | 'verify_facts';

export interface AiStudioResponse {
  ok: boolean;
  tool: AiStudioTool;
  model: string;
  outputText: string;
  structured?: {
    headline?: string;
    summary?: string;
    paragraphs?: string[];
    options?: string[];
    seoTitle?: string;
    metaDescription?: string;
    captionKn?: string;
    captionEn?: string;
    altText?: string;
    verificationFindings?: Array<{
      claim: string;
      status: 'supported' | 'unverified' | 'needs_source';
      note: string;
    }>;
  };
  disclaimer: string;
  error?: string;
}
