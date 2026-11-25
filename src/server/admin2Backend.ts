import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { Express, NextFunction, Request, Response } from 'express';
import { SEED_ARTICLES } from '../constants/seedArticles.ts';
import {
  ALL_ADMIN_PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type Admin2AccountPublic,
  type Admin2AnalyticsSummary,
  type Admin2AuditLog,
  type Admin2AutomationItem,
  type Admin2AutomationRun,
  type Admin2LoginHistoryItem,
  type Admin2ManagedDraft,
  type Admin2MediaAsset,
  type Admin2Notification,
  type Admin2NotificationPreferences,
  type Admin2RecentViewedArticle,
  type Admin2SessionInfo,
  type Admin2SessionUser,
  type Admin2WebsiteSettings,
  type AdminPermission,
  type AdminRole,
  type AiStudioResponse,
  type AiStudioTool,
  type ArticleCmsOverlay,
  type ArticleSeoMeta,
} from '../types/admin2.ts';
import {
  AD_CATEGORIES,
  DEFAULT_KANNADA_SHARE_TEMPLATE,
  type AdAnalyticsDailyBucket,
  type AdAnalyticsRange,
  type AdApprovalStatus,
  type AdCampaignSchedule,
  type AdCtaType,
  type AdDeviceTarget,
  type AdDisplayFrequency,
  type AdExtraImage,
  type AdPlacementSlotKey,
  type AdPlacementsConfig,
  type AdPlatformSettings,
  type AdPriority,
  type AdRotationOverrides,
  type AdSharingConfig,
  type AdStatus,
  type Advertisement,
} from '../types/ads.ts';
import {
  computeAdStats,
  createDefaultAdPlacements,
  createDefaultAdPlatformSettings,
  formatAdNumber,
  getCurrentIstHm,
  getTodayIstYmd,
  isAdCurrentlyActive,
  isValidTimeHm,
  isValidYmd,
  sanitizeExternalWebsiteUrl,
  sanitizePhoneDigits,
} from '../utils/adHelpers.ts';
import type {
  ArticleViewRecordMeta,
  SheetsNewsItem,
  SheetsStorageManager,
  VerifiedAdminUser,
} from './sheetsStorageProxy.ts';

const PROTECTED_SUPER_ADMINS = [
  { email: 'shwethashwethak85@gmail.com', fullName: 'Shwetha (Chief Editor)' },
  { email: 'dheerajcp77@gmail.com', fullName: 'Dheeraj CP (Super Admin)' },
] as const;

const PROTECTED_EMAIL_SET = new Set<string>(PROTECTED_SUPER_ADMINS.map((a) => a.email));
const VALID_PERMISSION_SET = new Set<AdminPermission>(ALL_ADMIN_PERMISSIONS.map((p) => p.key));
const VALID_ROLES = new Set<AdminRole>(['super_admin', 'admin', 'editor', 'reporter', 'analyst', 'custom']);

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REMEMBER_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REMEMBER_DEVICE_COOKIE = 'cn2_remember';
const ACTION_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const GEMINI_EDITORIAL_MODEL = 'gemini-4-hydrogen';

interface Admin2AccountRecord {
  id: string;
  fullName: string;
  email: string;
  role: AdminRole;
  customRoleLabel?: string;
  permissions: AdminPermission[];
  status: 'active' | 'pending_activation' | 'suspended';
  protectedSuperAdmin: boolean;
  passwordHash?: string;
  activationTokenHash?: string;
  activationExpiresAt?: number;
  resetTokenHash?: string;
  resetExpiresAt?: number;
  createdAt: string;
  createdBy: string;
  lastLoginAt?: string;
}

interface Admin2SessionRecord {
  id: string;
  accountId: string;
  email: string;
  fullName: string;
  role: AdminRole;
  authProvider?: 'admin2_password' | 'firebase';
  createdAt: string;
  lastSeenAt: string;
  expiresAt: number;
  ip: string;
  userAgent: string;
}

interface RememberedDeviceRecord {
  id: string;
  tokenHash: string;
  accountId: string;
  email: string;
  fullName: string;
  authProvider: 'admin2_password' | 'firebase';
  createdAt: string;
  lastUsedAt: string;
  expiresAt: number;
  ip: string;
  userAgent: string;
}

interface DailyTrafficBucket {
  date: string; // YYYY-MM-DD
  pageViews: number;
  articleReads: number;
  visitorHashes: string[];
  sources: Record<string, number>;
  devices: Record<string, number>;
}

interface ArticleViewStatsRecord {
  id: string;
  title: string;
  category: string;
  location: string;
  publishedDate: string;
  totalViews: number;
  lastViewedAt: string;
}

interface Admin2PersistedState {
  version: number;
  accounts: Admin2AccountRecord[];
  sessions: Admin2SessionRecord[];
  rememberedDevices: RememberedDeviceRecord[];
  auditLogs: Admin2AuditLog[];
  loginHistory: Admin2LoginHistoryItem[];
  notifications: Admin2Notification[];
  notificationPreferences: Admin2NotificationPreferences;
  drafts: Admin2ManagedDraft[];
  overlays: Record<string, ArticleCmsOverlay>;
  archivedSnapshots: Record<string, Record<string, unknown>>;
  mediaMetadata: Record<
    string,
    {
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
      processingHistory: string[];
    }
  >;
  mediaFolders: string[];
  automations: Admin2AutomationItem[];
  settings: Admin2WebsiteSettings;
  trafficByDay: Record<string, DailyTrafficBucket>;
  articleViewStats: Record<string, ArticleViewStatsRecord>;
  recentlyViewedArticles: Admin2RecentViewedArticle[];
  ads: Advertisement[];
  adSequenceCounter: number;
  adPlatformSettings: AdPlatformSettings;
  adAnalyticsByDay: Record<string, AdAnalyticsDailyBucket>;
}

export interface Admin2Request extends Request {
  admin2User?: Admin2SessionUser;
}

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasswordScrypt(password: string, storedHash?: string): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function stripMarkup(raw: string): string {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || '127.0.0.1';
}

function parseCookieHeader(headerValue: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headerValue) return result;
  for (const part of headerValue.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function isRequestHttps(req: Request): boolean {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return Boolean(req.secure || xfProto.includes('https'));
}

function classifyReferrer(referer?: string): string {
  if (!referer) return 'Direct';
  const lower = referer.toLowerCase();
  if (lower.includes('whatsapp') || lower.includes('wa.me')) return 'WhatsApp';
  if (lower.includes('google.')) return 'Google Search';
  if (lower.includes('facebook.') || lower.includes('fb.')) return 'Facebook';
  if (lower.includes('instagram.')) return 'Instagram';
  if (lower.includes('t.co') || lower.includes('twitter.') || lower.includes('x.com')) return 'X / Twitter';
  if (lower.includes('youtube.') || lower.includes('youtu.be')) return 'YouTube';
  if (
    lower.includes('coffeenadu.in') ||
    lower.includes('coffeenad-news') ||
    lower.includes('localhost') ||
    lower.includes('127.0.0.1')
  ) {
    return 'Direct';
  }
  return 'Referral';
}

function classifyDevice(ua?: string): string {
  const lower = (ua || '').toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(lower)) return 'Tablet';
  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/.test(lower)) return 'Mobile';
  return 'Desktop';
}

function sanitizePermissions(perms: unknown, fallbackRole: AdminRole): AdminPermission[] {
  if (!Array.isArray(perms)) return [...ROLE_DEFAULT_PERMISSIONS[fallbackRole]];
  const clean = new Set<AdminPermission>();
  for (const item of perms) {
    if (typeof item === 'string' && VALID_PERMISSION_SET.has(item as AdminPermission)) {
      clean.add(item as AdminPermission);
    }
  }
  if (clean.size === 0) {
    for (const p of ROLE_DEFAULT_PERMISSIONS[fallbackRole]) clean.add(p);
  }
  return Array.from(clean);
}

function createDefaultAutomations(): Admin2AutomationItem[] {
  const nowIso = new Date().toISOString();
  const nextDailyIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: 'auto-watermark-logo',
      name: 'CoffeeNadu Circular Logo Watermark',
      category: 'branding',
      description:
        'Automatically applies the circular CoffeeNadu logo watermark to the top-left of newly uploaded news & event photographs without modifying original local files.',
      enabled: true,
      managedBy: 'client_canvas',
      scheduleLabel: 'On every news & event upload',
      status: 'active',
      lastRunAt: nowIso,
      nextRunAt: null,
      lastError: null,
      canRunManually: false,
      preserveTriggerNote: 'Preserves existing circular logo sizing and top-left positioning.',
      config: { position: 'top-left', circularFrame: true, slightlyLargerForNewNews: true },
      history: [],
    },
    {
      id: 'auto-watermark-middle-text',
      name: 'Middle 2x "COFFEENADU NEWS" Image Overlay',
      category: 'branding',
      description:
        'Renders the two repeated semi-transparent "COFFEENADU NEWS" text overlays across the center band of newly uploaded news photos (main + extra photos).',
      enabled: true,
      managedBy: 'client_canvas',
      scheduleLabel: 'On every new news photo upload',
      status: 'active',
      lastRunAt: nowIso,
      nextRunAt: null,
      lastError: null,
      canRunManually: false,
      preserveTriggerNote: 'Preserves exact 2x middle overlay styling & formatting on new uploads without altering previously published images.',
      config: { repeatCount: 2, overlayText: 'COFFEENADU NEWS' },
      history: [],
    },
    {
      id: 'auto-drive-image-optimization',
      name: 'Google Drive Photo Compression & Thumbnail Cache',
      category: 'branding',
      description:
        'Compresses uploads, generates lightweight thumbnails, detects SHA-256 duplicates, and warms local disk cache for instant delivery from Google Drive.',
      enabled: true,
      managedBy: 'server_worker',
      scheduleLabel: 'On every Drive image upload',
      status: 'active',
      lastRunAt: nowIso,
      nextRunAt: null,
      lastError: null,
      canRunManually: true,
      config: { webpWhereSupported: true, maxWidthPx: 1400, preserveOriginalFile: true },
      history: [],
    },
    {
      id: 'auto-scheduled-publisher',
      name: 'Scheduled News Auto-Publisher',
      category: 'publishing',
      description:
        'Checks every 60 seconds for editor-approved scheduled articles whose publish timestamp has arrived and publishes them to Google Sheets. Never auto-publishes unapproved AI drafts.',
      enabled: true,
      managedBy: 'server_worker',
      scheduleLabel: 'Every 60 seconds',
      status: 'active',
      lastRunAt: nowIso,
      nextRunAt: new Date(Date.now() + 60 * 1000).toISOString(),
      lastError: null,
      canRunManually: true,
      preserveTriggerNote: 'Strictly requires explicit human editor approval before any scheduled article can go live.',
      config: { intervalSeconds: 60, blockUnapprovedAiDrafts: true },
      history: [],
    },
    {
      id: 'auto-cache-invalidation',
      name: 'Google Sheets Read Cache Refresh & Invalidation',
      category: 'storage',
      description:
        'Refreshes the 7-minute server RAM & disk snapshot cache immediately after any publish, edit, archive, or restore event so readers always see fresh headlines.',
      enabled: true,
      managedBy: 'server_worker',
      scheduleLabel: 'On write + 7 min TTL',
      status: 'active',
      lastRunAt: nowIso,
      nextRunAt: new Date(Date.now() + 7 * 60 * 1000).toISOString(),
      lastError: null,
      canRunManually: true,
      config: { cacheTtlMinutes: 7 },
      history: [],
    },
    {
      id: 'auto-view-batch-flusher',
      name: 'Batched Article View Counter Sync',
      category: 'storage',
      description:
        'Aggregates live reader views in memory and syncs them in batches to Google Sheets every 60 seconds or every 10 views to protect Apps Script daily quota.',
      enabled: true,
      managedBy: 'server_worker',
      scheduleLabel: 'Every 60 seconds / 10 views',
      status: 'active',
      lastRunAt: nowIso,
      nextRunAt: new Date(Date.now() + 60 * 1000).toISOString(),
      lastError: null,
      canRunManually: true,
      config: { batchThreshold: 10 },
      history: [],
    },
    {
      id: 'auto-daily-backup',
      name: 'Automated Google Drive Backup Trigger',
      category: 'storage',
      description:
        'Coordinates with existing Google Apps Script daily & monthly JSON backup triggers in Google Drive. Never duplicates or modifies existing Apps Script time triggers.',
      enabled: true,
      managedBy: 'apps_script_trigger',
      scheduleLabel: 'Daily (Apps Script) + On-demand',
      status: 'active',
      lastRunAt: null,
      nextRunAt: nextDailyIso,
      lastError: null,
      canRunManually: true,
      preserveTriggerNote: 'Existing Apps Script triggers are preserved untouched; manual run triggers createBackup safely.',
      config: { retainDailyDays: 30, retainMonthly: true },
      history: [],
    },
    {
      id: 'auto-daily-report',
      name: 'Daily Editorial & Traffic Digest',
      category: 'reporting',
      description:
        'Generates a real-data daily summary of published articles, views, top stories, and storage health inside the Notification Centre.',
      enabled: true,
      managedBy: 'server_worker',
      scheduleLabel: 'Daily summary / On-demand',
      status: 'active',
      lastRunAt: null,
      nextRunAt: nextDailyIso,
      lastError: null,
      canRunManually: true,
      config: { postToNotificationCentre: true },
      history: [],
    },
    {
      id: 'auto-error-security-alerts',
      name: 'System Error & Admin Security Alerts',
      category: 'alerts',
      description:
        'Monitors failed admin logins, Apps Script connectivity issues, and Drive cache anomalies, posting instant alerts to the Notification Centre.',
      enabled: true,
      managedBy: 'server_worker',
      scheduleLabel: 'Real-time event monitoring',
      status: 'active',
      lastRunAt: nowIso,
      nextRunAt: null,
      lastError: null,
      canRunManually: true,
      config: { alertOnFailedLogin: true, alertOnStorageError: true },
      history: [],
    },
  ];
}

function createDefaultSettings(): Admin2WebsiteSettings {
  return {
    siteName: 'Coffeenadu News',
    siteTagline: 'Koppa Taluk Local Kannada News, Bus Timings & Programs',
    canonicalBaseUrl: 'https://coffeenadu.in',
    defaultLanguage: 'Kannada',
    whatsappNumber: '9481033743',
    whatsappGroupUrl: '',
    defaultSeoTitle: 'Coffeenadu News — Koppa Taluk Local Kannada News',
    defaultMetaDescription:
      'Local Koppa Taluk Kannada news publishing portal featuring daily news, agriculture, civic updates, bus timings, and community programs.',
    ga4MeasurementId: '',
    searchConsoleSiteUrl: 'https://coffeenadu.in',
    watermarkLogoEnabled: true,
    watermarkMiddleTextEnabled: true,
    watermarkMiddleText: 'COFFEENADU NEWS',
    breakingTickerNotice: '',
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  };
}

function createDefaultNotificationPrefs(): Admin2NotificationPreferences {
  return {
    publishingSuccess: true,
    publishingFailure: true,
    imageProcessing: true,
    backupAlerts: true,
    storageWarnings: true,
    automationErrors: true,
    adminSecurityActivity: true,
    readerMessages: true,
  };
}

export class Admin2Backend {
  private readonly dataDir: string;
  private readonly stateFile: string;
  private readonly secretFile: string;
  private readonly adMediaDir: string;
  private readonly hmacSecret: string;
  private readonly sheetsStorage: SheetsStorageManager;
  private state: Admin2PersistedState;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private readonly startedAt = Date.now();
  private geminiClient: GoogleGenAI | null = null;

  constructor(baseDataDir: string, sheetsStorage: SheetsStorageManager) {
    this.sheetsStorage = sheetsStorage;
    const resolvedDir = this.resolveWritableDir(baseDataDir);
    this.dataDir = resolvedDir;
    this.stateFile = path.join(resolvedDir, 'admin2-state.json');
    this.secretFile = path.join(resolvedDir, '.admin2-secret');
    this.adMediaDir = path.join(resolvedDir, 'ads-media');
    try {
      fs.mkdirSync(this.adMediaDir, { recursive: true });
    } catch {
      // Non-fatal fallback
    }
    this.hmacSecret = this.loadOrGenerateSecret();
    this.state = this.loadOrInitState();

    // Wire external admin verifier, live storage event hook & persistent article view ledger
    this.sheetsStorage.setExternalAdminVerifier((token, req) => this.verifyForSheetsProxy(token, req));
    this.sheetsStorage.setEventHook((ev) => this.handleStorageEvent(ev));
    this.sheetsStorage.setArticleViewHooks(
      (articleId, meta) => this.recordConfirmedArticleView(articleId, meta),
      (articleId, sheetsViewsWithPending) =>
        this.getEffectiveArticleViews(articleId, sheetsViewsWithPending)
    );

    // Start 60-second scheduled publishing worker
    this.startSchedulerWorker();
  }

  private resolveWritableDir(preferred: string): string {
    try {
      fs.mkdirSync(preferred, { recursive: true });
      fs.accessSync(preferred, fs.constants.W_OK);
      return preferred;
    } catch {
      const fallback = path.join(os.tmpdir(), 'coffeenadu-admin2-data');
      fs.mkdirSync(fallback, { recursive: true });
      return fallback;
    }
  }

  private loadOrGenerateSecret(): string {
    if (process.env.ADMIN2_SESSION_SECRET && process.env.ADMIN2_SESSION_SECRET.length >= 32) {
      return process.env.ADMIN2_SESSION_SECRET;
    }
    try {
      if (fs.existsSync(this.secretFile)) {
        const existing = fs.readFileSync(this.secretFile, 'utf8').trim();
        if (existing.length >= 32) return existing;
      }
    } catch {
      // Generate below
    }
    const generated = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(this.secretFile, generated, { mode: 0o600 });
    } catch {
      // Non-fatal
    }
    return generated;
  }

  private createInitialState(): Admin2PersistedState {
    const now = new Date().toISOString();
    const seededAccounts: Admin2AccountRecord[] = PROTECTED_SUPER_ADMINS.map((owner, idx) => ({
      id: `adm-owner-${idx + 1}`,
      fullName: owner.fullName,
      email: owner.email,
      role: 'super_admin',
      permissions: [...ROLE_DEFAULT_PERMISSIONS.super_admin],
      status: 'active',
      protectedSuperAdmin: true,
      createdAt: now,
      createdBy: 'system',
    }));

    return {
      version: 1,
      accounts: seededAccounts,
      sessions: [],
      rememberedDevices: [],
      auditLogs: [
        {
          id: makeId('audit'),
          timestamp: now,
          actorEmail: 'system',
          actorRole: 'system',
          action: 'admin2.initialized',
          targetType: 'system',
          targetId: 'admin2',
          details: 'CoffeeNadu News Admin 2.0 initialized with protected Super Admin accounts.',
          severity: 'info',
        },
      ],
      loginHistory: [],
      notifications: [
        {
          id: makeId('notif'),
          timestamp: now,
          category: 'security',
          severity: 'info',
          title: 'CoffeeNadu News Admin 2.0 Active',
          message:
            'Enterprise CMS, AI News Studio, Media Centre, SEO Management, and Multi-Admin RBAC are connected to your live Google Sheets & Drive backend.',
          read: false,
        },
      ],
      notificationPreferences: createDefaultNotificationPrefs(),
      drafts: [],
      overlays: {},
      archivedSnapshots: {},
      mediaMetadata: {},
      mediaFolders: ['General News', 'Lead Stories', 'Extra Photos', 'Programs & Events', 'Archive'],
      automations: createDefaultAutomations(),
      settings: createDefaultSettings(),
      trafficByDay: {},
      articleViewStats: {},
      recentlyViewedArticles: [],
      ads: [],
      adSequenceCounter: 0,
      adPlatformSettings: createDefaultAdPlatformSettings(),
      adAnalyticsByDay: {},
    };
  }

  private loadOrInitState(): Admin2PersistedState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) as Partial<Admin2PersistedState>;
        const defaults = this.createInitialState();
        const loadedAds = Array.isArray(raw.ads) ? raw.ads : [];
        const maxExistingAdSeq = loadedAds.reduce((maxSeq, ad) => {
          const match = typeof ad?.adNumber === 'string' ? ad.adNumber.match(/^AD(\d+)$/i) : null;
          const n = match ? Number(match[1]) : 0;
          return Number.isFinite(n) && n > maxSeq ? n : maxSeq;
        }, 0);
        const rawSeq =
          typeof raw.adSequenceCounter === 'number' && Number.isFinite(raw.adSequenceCounter)
            ? Math.max(0, Math.floor(raw.adSequenceCounter))
            : 0;

        const merged: Admin2PersistedState = {
          ...defaults,
          ...raw,
          notificationPreferences: {
            ...defaults.notificationPreferences,
            ...(raw.notificationPreferences || {}),
          },
          settings: {
            ...defaults.settings,
            ...(raw.settings || {}),
          },
          accounts: Array.isArray(raw.accounts) && raw.accounts.length > 0 ? raw.accounts : defaults.accounts,
          sessions: Array.isArray(raw.sessions) ? raw.sessions.filter((s) => s.expiresAt > Date.now()) : [],
          rememberedDevices: Array.isArray(raw.rememberedDevices)
            ? raw.rememberedDevices.filter((d) => d.expiresAt > Date.now())
            : [],
          auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs.slice(0, 500) : defaults.auditLogs,
          loginHistory: Array.isArray(raw.loginHistory) ? raw.loginHistory.slice(0, 300) : [],
          notifications: Array.isArray(raw.notifications) ? raw.notifications.slice(0, 200) : defaults.notifications,
          drafts: Array.isArray(raw.drafts) ? raw.drafts : [],
          overlays: raw.overlays && typeof raw.overlays === 'object' ? raw.overlays : {},
          archivedSnapshots:
            raw.archivedSnapshots && typeof raw.archivedSnapshots === 'object' ? raw.archivedSnapshots : {},
          mediaMetadata: raw.mediaMetadata && typeof raw.mediaMetadata === 'object' ? raw.mediaMetadata : {},
          mediaFolders:
            Array.isArray(raw.mediaFolders) && raw.mediaFolders.length > 0
              ? raw.mediaFolders
              : defaults.mediaFolders,
          automations:
            Array.isArray(raw.automations) && raw.automations.length > 0
              ? raw.automations
              : defaults.automations,
          trafficByDay: raw.trafficByDay && typeof raw.trafficByDay === 'object' ? raw.trafficByDay : {},
          articleViewStats:
            raw.articleViewStats && typeof raw.articleViewStats === 'object' ? raw.articleViewStats : {},
          recentlyViewedArticles: Array.isArray(raw.recentlyViewedArticles)
            ? raw.recentlyViewedArticles.slice(0, 40)
            : [],
          ads: loadedAds,
          adSequenceCounter: Math.max(rawSeq, maxExistingAdSeq),
          adPlatformSettings: (() => {
            const def = createDefaultAdPlatformSettings();
            const rawSettings = raw.adPlatformSettings;
            if (!rawSettings || typeof rawSettings !== 'object') return def;
            return {
              ...def,
              ...rawSettings,
              globalPlacementsEnabled: {
                ...def.globalPlacementsEnabled,
                ...(rawSettings.globalPlacementsEnabled || {}),
              },
              customCategories: Array.isArray(rawSettings.customCategories)
                ? rawSettings.customCategories.filter((c): c is string => typeof c === 'string' && Boolean(c.trim()))
                : def.customCategories,
            };
          })(),
          adAnalyticsByDay:
            raw.adAnalyticsByDay && typeof raw.adAnalyticsByDay === 'object' ? raw.adAnalyticsByDay : {},
        };

        // Ensure existing admin/editor accounts gain ads.manage cleanly
        for (const acc of merged.accounts) {
          if (
            (acc.role === 'admin' || acc.role === 'editor') &&
            !acc.permissions.includes('ads.manage')
          ) {
            acc.permissions.push('ads.manage');
          }
        }

        // Ensure protected super admins always exist & stay active super_admin
        for (const owner of PROTECTED_SUPER_ADMINS) {
          const existing = merged.accounts.find((a) => a.email.toLowerCase() === owner.email);
          if (!existing) {
            merged.accounts.unshift({
              id: makeId('adm-owner'),
              fullName: owner.fullName,
              email: owner.email,
              role: 'super_admin',
              permissions: [...ROLE_DEFAULT_PERMISSIONS.super_admin],
              status: 'active',
              protectedSuperAdmin: true,
              createdAt: new Date().toISOString(),
              createdBy: 'system',
            });
          } else {
            existing.protectedSuperAdmin = true;
            existing.role = 'super_admin';
            existing.status = 'active';
            existing.permissions = [...ROLE_DEFAULT_PERMISSIONS.super_admin];
          }
        }
        return merged;
      }
    } catch {
      // Fallback to clean initial state
    }

    const fresh = this.createInitialState();
    this.persistStateNow(fresh);
    return fresh;
  }

  private persistStateNow(target: Admin2PersistedState = this.state): void {
    try {
      const tmp = `${this.stateFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(target, null, 2), 'utf8');
      fs.renameSync(tmp, this.stateFile);
    } catch {
      // Non-fatal
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistStateNow();
    }, 350);
    this.persistTimer.unref?.();
  }

  // ===========================================================================
  // AUDIT LOGGING & NOTIFICATIONS
  // ===========================================================================

  private addAuditLog(entry: Omit<Admin2AuditLog, 'id' | 'timestamp'>): void {
    this.state.auditLogs.unshift({
      id: makeId('audit'),
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (this.state.auditLogs.length > 500) {
      this.state.auditLogs = this.state.auditLogs.slice(0, 500);
    }
    this.schedulePersist();
  }

  private addNotification(entry: Omit<Admin2Notification, 'id' | 'timestamp' | 'read'>): void {
    const prefs = this.state.notificationPreferences;
    if (entry.category === 'publishing' && entry.severity === 'success' && !prefs.publishingSuccess) return;
    if (entry.category === 'publishing' && entry.severity === 'error' && !prefs.publishingFailure) return;
    if (entry.category === 'image' && !prefs.imageProcessing) return;
    if (entry.category === 'backup' && !prefs.backupAlerts) return;
    if (entry.category === 'storage' && !prefs.storageWarnings) return;
    if (entry.category === 'automation' && entry.severity === 'error' && !prefs.automationErrors) return;
    if (entry.category === 'security' && !prefs.adminSecurityActivity) return;

    this.state.notifications.unshift({
      id: makeId('notif'),
      timestamp: new Date().toISOString(),
      read: false,
      ...entry,
    });
    if (this.state.notifications.length > 200) {
      this.state.notifications = this.state.notifications.slice(0, 200);
    }
    this.schedulePersist();
  }

  private recordLoginAttempt(item: Omit<Admin2LoginHistoryItem, 'id' | 'timestamp'>): void {
    this.state.loginHistory.unshift({
      id: makeId('login'),
      timestamp: new Date().toISOString(),
      ...item,
    });
    if (this.state.loginHistory.length > 300) {
      this.state.loginHistory = this.state.loginHistory.slice(0, 300);
    }
    if (!item.success) {
      this.addNotification({
        category: 'security',
        severity: 'warning',
        title: 'Failed Admin Sign-In Attempt',
        message: `Unsuccessful sign-in for ${item.email || 'unknown'} (${item.reason || 'invalid credentials'}) from ${item.ip || 'unknown IP'}.`,
      });
    }
    this.schedulePersist();
  }

  private handleStorageEvent(ev: {
    type:
      | 'news_created'
      | 'news_updated'
      | 'news_deleted'
      | 'image_uploaded'
      | 'backup_created'
      | 'backup_restored'
      | 'view_recorded'
      | 'error';
    actorEmail?: string;
    entityId?: string;
    details: string;
  }): void {
    if (ev.type === 'view_recorded') {
      const today = getTodayKey();
      const bucket = this.ensureTrafficBucket(today);
      bucket.articleReads += 1;
      this.schedulePersist();
      return;
    }

    const actor = ev.actorEmail || 'admin';
    if (ev.type === 'news_created') {
      const cleanDetails = stripMarkup(ev.details).slice(0, 140);
      this.addAuditLog({
        actorEmail: actor,
        actorRole: this.getRoleForEmail(actor),
        action: 'news.published',
        targetType: 'article',
        targetId: ev.entityId || 'new',
        details: cleanDetails,
        severity: 'info',
      });
      this.addNotification({
        category: 'publishing',
        severity: 'success',
        title: 'Article Published to Google Sheets',
        message: cleanDetails,
        entityId: ev.entityId,
      });
      if (ev.entityId) {
        this.appendRevision(ev.entityId, actor, 'Published article', cleanDetails, 'published');
      }
      return;
    }

    if (ev.type === 'news_updated') {
      const cleanDetails = stripMarkup(ev.details).slice(0, 140);
      this.addAuditLog({
        actorEmail: actor,
        actorRole: this.getRoleForEmail(actor),
        action: 'news.updated',
        targetType: 'article',
        targetId: ev.entityId || 'unknown',
        details: cleanDetails,
        severity: 'info',
      });
      if (ev.entityId) {
        this.appendRevision(ev.entityId, actor, 'Updated article content', cleanDetails, 'published');
      }
      return;
    }

    if (ev.type === 'news_deleted') {
      this.addAuditLog({
        actorEmail: actor,
        actorRole: this.getRoleForEmail(actor),
        action: 'news.deleted',
        targetType: 'article',
        targetId: ev.entityId || 'unknown',
        details: ev.details,
        severity: 'warning',
      });
      this.addNotification({
        category: 'publishing',
        severity: 'warning',
        title: 'Article Removed',
        message: ev.details,
        entityId: ev.entityId,
      });
      return;
    }

    if (ev.type === 'image_uploaded') {
      this.addAuditLog({
        actorEmail: actor,
        actorRole: this.getRoleForEmail(actor),
        action: 'media.uploaded',
        targetType: 'drive_image',
        targetId: ev.entityId || 'drive',
        details: ev.details,
        severity: 'info',
      });
      this.addNotification({
        category: 'image',
        severity: 'success',
        title: 'Branded Photo Stored in Google Drive',
        message: ev.details,
        entityId: ev.entityId,
      });
      this.recordAutomationRun('auto-drive-image-optimization', 'success', 120, ev.details);
      return;
    }

    if (ev.type === 'backup_created' || ev.type === 'backup_restored') {
      this.addAuditLog({
        actorEmail: actor,
        actorRole: this.getRoleForEmail(actor),
        action: ev.type === 'backup_created' ? 'backup.created' : 'backup.restored',
        targetType: 'backup',
        targetId: ev.entityId || 'drive-backup',
        details: ev.details,
        severity: ev.type === 'backup_restored' ? 'warning' : 'info',
      });
      this.addNotification({
        category: 'backup',
        severity: 'success',
        title: ev.type === 'backup_created' ? 'Google Drive Backup Completed' : 'Backup Restored',
        message: ev.details,
        entityId: ev.entityId,
      });
      if (ev.type === 'backup_created') {
        this.recordAutomationRun('auto-daily-backup', 'success', 450, ev.details);
      }
    }
  }

  private getRoleForEmail(email: string): string {
    const acc = this.state.accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
    return acc?.role || 'admin';
  }

  private appendRevision(
    articleId: string,
    editorEmail: string,
    summary: string,
    titleSnapshot: string,
    statusSnapshot: 'published' | 'draft' | 'scheduled' | 'archived'
  ): void {
    const existing = this.state.overlays[articleId] || {
      articleId,
      status: statusSnapshot,
      language: 'Kannada',
      revisions: [],
    };
    existing.revisions.unshift({
      id: makeId('rev'),
      timestamp: new Date().toISOString(),
      editorEmail,
      summary,
      titleSnapshot: stripMarkup(titleSnapshot).slice(0, 160),
      statusSnapshot,
    });
    existing.revisions = existing.revisions.slice(0, 30);
    this.state.overlays[articleId] = existing;
    this.schedulePersist();
  }

  private recordAutomationRun(
    automationId: string,
    status: 'success' | 'error' | 'skipped',
    durationMs: number,
    summary: string,
    error?: string
  ): void {
    const auto = this.state.automations.find((a) => a.id === automationId);
    if (!auto) return;
    const nowIso = new Date().toISOString();
    auto.lastRunAt = nowIso;
    auto.lastError = error || null;
    auto.status = !auto.enabled ? 'paused' : status === 'error' ? 'error' : 'active';
    const run: Admin2AutomationRun = {
      id: makeId('run'),
      timestamp: nowIso,
      status,
      durationMs,
      summary,
      error,
    };
    auto.history.unshift(run);
    if (auto.history.length > 25) auto.history = auto.history.slice(0, 25);
    if (status === 'error') {
      this.addNotification({
        category: 'automation',
        severity: 'error',
        title: `Automation Error: ${auto.name}`,
        message: error || summary,
        entityId: automationId,
      });
    }
    this.schedulePersist();
  }

  // ===========================================================================
  // PUBLIC TRAFFIC LEDGER (REAL VISITORS ONLY — ZERO FABRICATION)
  // ===========================================================================

  private ensureTrafficBucket(dayKey: string): DailyTrafficBucket {
    let bucket = this.state.trafficByDay[dayKey];
    if (!bucket) {
      bucket = {
        date: dayKey,
        pageViews: 0,
        articleReads: 0,
        visitorHashes: [],
        sources: {},
        devices: {},
      };
      this.state.trafficByDay[dayKey] = bucket;

      // Retain last 90 days of traffic buckets
      const keys = Object.keys(this.state.trafficByDay).sort();
      while (keys.length > 90) {
        const oldest = keys.shift();
        if (oldest) delete this.state.trafficByDay[oldest];
      }
    }
    return bucket;
  }

  public recordPublicPageTraffic(req: Request): void {
    if (req.method !== 'GET') return;
    const reqPath = req.path || '/';
    if (
      reqPath.startsWith('/api/') ||
      reqPath.startsWith('/admin') ||
      reqPath.startsWith('/assets/') ||
      reqPath.startsWith('/uploads/') ||
      reqPath.startsWith('/@') ||
      reqPath.includes('.')
    ) {
      return;
    }

    const today = getTodayKey();
    const bucket = this.ensureTrafficBucket(today);
    bucket.pageViews += 1;

    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || '');
    const visitorHash = sha256Hex(`${today}|${ip}|${ua}`).slice(0, 16);
    if (!bucket.visitorHashes.includes(visitorHash) && bucket.visitorHashes.length < 25000) {
      bucket.visitorHashes.push(visitorHash);
    }

    const source = classifyReferrer(typeof req.headers.referer === 'string' ? req.headers.referer : undefined);
    bucket.sources[source] = (bucket.sources[source] || 0) + 1;

    const device = classifyDevice(ua);
    bucket.devices[device] = (bucket.devices[device] || 0) + 1;

    this.schedulePersist();
  }

  private loadLocalFallbackArticles(): Array<{
    id: string;
    title: string;
    category: string;
    location: string;
    publishedDate: string;
    views: number;
  }> {
    const byId = new Map<
      string,
      {
        id: string;
        title: string;
        category: string;
        location: string;
        publishedDate: string;
        views: number;
      }
    >();

    for (const seed of SEED_ARTICLES) {
      if (!seed?.id) continue;
      byId.set(seed.id, {
        id: seed.id,
        title: stripMarkup(seed.titleKannada || seed.id),
        category: seed.category || 'Local',
        location: seed.location || 'ಕೊಪ್ಪ',
        publishedDate: seed.publishedDate || '',
        views: Number(seed.viewCount) || 0,
      });
    }

    try {
      const storePath = path.join(this.dataDir, 'news-store.json');
      if (fs.existsSync(storePath)) {
        const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        if (Array.isArray(parsed)) {
          for (const raw of parsed as Array<Record<string, unknown>>) {
            const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
            if (!id) continue;
            byId.set(id, {
              id,
              title: stripMarkup(String(raw.titleKannada || id)),
              category: String(raw.category || 'Local'),
              location: String(raw.location || 'ಕೊಪ್ಪ'),
              publishedDate: String(raw.publishedDate || ''),
              views: Number(raw.viewCount) || 0,
            });
          }
        }
      }
    } catch {
      // Non-fatal fallback to seed articles
    }

    return Array.from(byId.values());
  }

  public getEffectiveArticleViews(articleId: string, knownBaseViews = 0): number {
    const cleanId = articleId.trim();
    const recorded = this.state.articleViewStats[cleanId]?.totalViews || 0;
    return Math.max(Number(knownBaseViews) || 0, recorded);
  }

  public recordConfirmedArticleView(
    articleId: string,
    meta: ArticleViewRecordMeta = {}
  ): { views: number; lastViewedAt: string } {
    const cleanId = articleId.trim();
    const nowIso = new Date().toISOString();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanId)) {
      return { views: 0, lastViewedAt: nowIso };
    }

    const existing = this.state.articleViewStats[cleanId];
    const cachedSheet = this.sheetsStorage.findCachedNewsItem(cleanId);
    const localMatch =
      cachedSheet || existing
        ? null
        : this.loadLocalFallbackArticles().find((a) => a.id === cleanId) || null;

    const priorKnownViews = Math.max(
      0,
      Number(existing?.totalViews) || 0,
      Number(meta.cachedSheetsViewsBefore) || 0,
      Number(meta.baselineViews) || 0,
      Number(localMatch?.views) || 0
    );
    const nextTotalViews = priorKnownViews + 1;

    const resolvedTitle =
      stripMarkup(
        String(meta.title || cachedSheet?.title || localMatch?.title || existing?.title || cleanId)
      ).slice(0, 220) || cleanId;
    const resolvedCategory =
      String(
        meta.category || cachedSheet?.category || localMatch?.category || existing?.category || 'Local'
      ).trim() || 'Local';
    const resolvedLocation =
      String(
        meta.location || cachedSheet?.location || localMatch?.location || existing?.location || 'ಕೊಪ್ಪ'
      ).trim() || 'ಕೊಪ್ಪ';
    const resolvedPublishedDate = String(
      meta.publishedDate ||
        cachedSheet?.publishedDate ||
        localMatch?.publishedDate ||
        existing?.publishedDate ||
        ''
    ).trim();

    this.state.articleViewStats[cleanId] = {
      id: cleanId,
      title: resolvedTitle,
      category: resolvedCategory,
      location: resolvedLocation,
      publishedDate: resolvedPublishedDate,
      totalViews: nextTotalViews,
      lastViewedAt: nowIso,
    };

    const recentEntry: Admin2RecentViewedArticle = {
      id: cleanId,
      title: resolvedTitle,
      category: resolvedCategory,
      location: resolvedLocation,
      publishedDate: resolvedPublishedDate,
      views: nextTotalViews,
      viewedAt: nowIso,
    };
    this.state.recentlyViewedArticles = [
      recentEntry,
      ...this.state.recentlyViewedArticles.filter((item) => item.id !== cleanId),
    ].slice(0, 30);

    const today = getTodayKey();
    const bucket = this.ensureTrafficBucket(today);
    bucket.articleReads += 1;

    this.persistStateNow();
    return { views: nextTotalViews, lastViewedAt: nowIso };
  }

  public getArticleViewsMap(): Record<string, number> {
    const out: Record<string, number> = {
      ...this.sheetsStorage.getCachedArticleViewsMap(),
    };
    for (const item of this.loadLocalFallbackArticles()) {
      out[item.id] = Math.max(out[item.id] || 0, item.views);
    }
    for (const [id, stat] of Object.entries(this.state.articleViewStats)) {
      out[id] = Math.max(out[id] || 0, Number(stat.totalViews) || 0);
    }
    return out;
  }

  // ===========================================================================
  // SESSION SIGNING & AUTHENTICATION BRIDGE (FIREBASE + ADMIN 2.0 RBAC)
  // ===========================================================================

  private signSessionToken(sessionId: string): string {
    const sig = crypto.createHmac('sha256', this.hmacSecret).update(sessionId).digest('base64url');
    return `cn2.${sessionId}.${sig}`;
  }

  private verifyAdmin2SessionToken(token: string): { account: Admin2AccountRecord; session: Admin2SessionRecord } | null {
    if (!token.startsWith('cn2.')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, sessionId, providedSig] = parts;
    if (!sessionId || !providedSig) return null;

    const expectedSig = crypto.createHmac('sha256', this.hmacSecret).update(sessionId).digest('base64url');
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      this.state.sessions = this.state.sessions.filter((s) => s.id !== sessionId);
      this.schedulePersist();
      return null;
    }

    const account = this.state.accounts.find((acc) => acc.id === session.accountId);
    if (!account || account.status !== 'active') return null;

    session.lastSeenAt = new Date().toISOString();
    return { account, session };
  }

  private createTrackedSession(
    account: Admin2AccountRecord,
    authProvider: 'admin2_password' | 'firebase',
    ip: string,
    userAgent: string
  ): { token: string; user: Admin2SessionUser; session: Admin2SessionRecord } {
    const nowIso = new Date().toISOString();
    const session: Admin2SessionRecord = {
      id: makeId('sess'),
      accountId: account.id,
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      authProvider,
      createdAt: nowIso,
      lastSeenAt: nowIso,
      expiresAt: Date.now() + SESSION_TTL_MS,
      ip,
      userAgent,
    };
    this.state.sessions.unshift(session);
    if (this.state.sessions.length > 100) {
      this.state.sessions = this.state.sessions.slice(0, 100);
    }
    account.lastLoginAt = nowIso;

    const token = this.signSessionToken(session.id);
    const user: Admin2SessionUser = {
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      customRoleLabel: account.customRoleLabel,
      permissions: [...account.permissions],
      protectedSuperAdmin: account.protectedSuperAdmin,
      authProvider,
      sessionId: session.id,
    };
    return { token, user, session };
  }

  private issueRememberedDeviceCookie(
    req: Request,
    res: Response,
    account: Admin2AccountRecord,
    authProvider: 'admin2_password' | 'firebase',
    ip: string,
    userAgent: string
  ): void {
    const existingRaw = parseCookieHeader(req.headers.cookie)[REMEMBER_DEVICE_COOKIE];
    if (existingRaw) {
      const existingHash = sha256Hex(existingRaw);
      this.state.rememberedDevices = this.state.rememberedDevices.filter((d) => d.tokenHash !== existingHash);
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(rawToken);
    const nowIso = new Date().toISOString();
    const record: RememberedDeviceRecord = {
      id: makeId('remdev'),
      tokenHash,
      accountId: account.id,
      email: account.email,
      fullName: account.fullName,
      authProvider,
      createdAt: nowIso,
      lastUsedAt: nowIso,
      expiresAt: Date.now() + REMEMBER_DEVICE_TTL_MS,
      ip,
      userAgent,
    };
    this.state.rememberedDevices.unshift(record);
    if (this.state.rememberedDevices.length > 200) {
      this.state.rememberedDevices = this.state.rememberedDevices.slice(0, 200);
    }

    const maxAgeSec = Math.floor(REMEMBER_DEVICE_TTL_MS / 1000);
    const parts = [
      `${REMEMBER_DEVICE_COOKIE}=${encodeURIComponent(rawToken)}`,
      `Max-Age=${maxAgeSec}`,
      'Path=/api/admin2/auth',
      'HttpOnly',
      'SameSite=Lax',
    ];
    if (isRequestHttps(req)) {
      parts.push('Secure');
    }
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  private verifyRememberedDeviceCookie(
    req: Request
  ): { account: Admin2AccountRecord; record: RememberedDeviceRecord } | null {
    const rawToken = parseCookieHeader(req.headers.cookie)[REMEMBER_DEVICE_COOKIE];
    if (!rawToken || rawToken.length < 24) return null;
    const tokenHash = sha256Hex(rawToken);
    const now = Date.now();
    const record = this.state.rememberedDevices.find((d) => d.tokenHash === tokenHash);
    if (!record) return null;
    if (record.expiresAt <= now) {
      this.state.rememberedDevices = this.state.rememberedDevices.filter((d) => d.id !== record.id);
      this.schedulePersist();
      return null;
    }
    const account = this.state.accounts.find((a) => a.id === record.accountId);
    if (!account || account.status !== 'active') {
      this.state.rememberedDevices = this.state.rememberedDevices.filter((d) => d.id !== record.id);
      this.schedulePersist();
      return null;
    }
    return { account, record };
  }

  private revokeAndClearRememberedCookie(req: Request, res: Response): void {
    const rawToken = parseCookieHeader(req.headers.cookie)[REMEMBER_DEVICE_COOKIE];
    if (rawToken) {
      const tokenHash = sha256Hex(rawToken);
      this.state.rememberedDevices = this.state.rememberedDevices.filter((d) => d.tokenHash !== tokenHash);
    }
    const parts = [
      `${REMEMBER_DEVICE_COOKIE}=`,
      'Max-Age=0',
      'Path=/api/admin2/auth',
      'HttpOnly',
      'SameSite=Lax',
    ];
    if (isRequestHttps(req)) {
      parts.push('Secure');
    }
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  private revokeRememberedDevicesForAccount(accountId: string): void {
    this.state.rememberedDevices = this.state.rememberedDevices.filter((d) => d.accountId !== accountId);
  }

  private async resolveBearerToAdmin2User(token: string): Promise<Admin2SessionUser | null> {
    if (!token) return null;

    // 1. Admin 2.0 HMAC session token
    if (token.startsWith('cn2.')) {
      const verified = this.verifyAdmin2SessionToken(token);
      if (!verified) return null;
      return {
        id: verified.account.id,
        fullName: verified.account.fullName,
        email: verified.account.email,
        role: verified.account.role,
        customRoleLabel: verified.account.customRoleLabel,
        permissions: [...verified.account.permissions],
        protectedSuperAdmin: verified.account.protectedSuperAdmin,
        authProvider: verified.session.authProvider || 'admin2_password',
        sessionId: verified.session.id,
      };
    }

    // 2. Existing Firebase Auth ID token
    const fb = await this.sheetsStorage.verifyFirebaseTokenRaw(token);
    if (!fb || !fb.emailVerified) return null;

    const emailLower = fb.email.toLowerCase();
    let account = this.state.accounts.find((acc) => acc.email.toLowerCase() === emailLower);

    if (!account && PROTECTED_EMAIL_SET.has(emailLower)) {
      account = {
        id: makeId('adm-owner'),
        fullName: fb.displayName || emailLower,
        email: emailLower,
        role: 'super_admin',
        permissions: [...ROLE_DEFAULT_PERMISSIONS.super_admin],
        status: 'active',
        protectedSuperAdmin: true,
        createdAt: new Date().toISOString(),
        createdBy: 'system',
      };
      this.state.accounts.push(account);
      this.schedulePersist();
    }

    if (!account) {
      // Allow env-configured EXTRA_ADMIN_EMAILS as Editor automatically
      const extraAdmins = (process.env.EXTRA_ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (extraAdmins.includes(emailLower)) {
        account = {
          id: makeId('adm-env'),
          fullName: fb.displayName || emailLower,
          email: emailLower,
          role: 'admin',
          permissions: [...ROLE_DEFAULT_PERMISSIONS.admin],
          status: 'active',
          protectedSuperAdmin: false,
          createdAt: new Date().toISOString(),
          createdBy: 'env',
        };
        this.state.accounts.push(account);
        this.schedulePersist();
      }
    }

    if (!account || account.status !== 'active') return null;

    account.lastLoginAt = new Date().toISOString();
    return {
      id: account.id,
      fullName: account.fullName || fb.displayName || emailLower,
      email: account.email,
      role: account.role,
      customRoleLabel: account.customRoleLabel,
      permissions: [...account.permissions],
      protectedSuperAdmin: account.protectedSuperAdmin,
      authProvider: 'firebase',
    };
  }

  private async verifyForSheetsProxy(token: string, _req: Request): Promise<VerifiedAdminUser | null> {
    const user = await this.resolveBearerToAdmin2User(token);
    if (!user) return null;
    return {
      uid: user.id,
      email: user.email,
      displayName: user.fullName,
    };
  }

  private requireAuth(requiredPermission?: AdminPermission) {
    return async (req: Admin2Request, res: Response, next: NextFunction): Promise<void> => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        res.status(401).json({ ok: false, error: 'Administrator authentication required.' });
        return;
      }
      const user = await this.resolveBearerToAdmin2User(token);
      if (!user) {
        res.status(401).json({ ok: false, error: 'Invalid, expired, or suspended administrator session.' });
        return;
      }
      if (
        requiredPermission &&
        !user.protectedSuperAdmin &&
        user.role !== 'super_admin' &&
        !user.permissions.includes(requiredPermission)
      ) {
        res.status(403).json({
          ok: false,
          error: `Permission denied. Missing required capability: ${requiredPermission}.`,
        });
        return;
      }
      req.admin2User = user;
      next();
    };
  }

  private toPublicAccount(acc: Admin2AccountRecord): Admin2AccountPublic {
    const activeSessions = this.state.sessions.filter(
      (s) => s.accountId === acc.id && s.expiresAt > Date.now()
    ).length;
    return {
      id: acc.id,
      fullName: acc.fullName,
      email: acc.email,
      role: acc.role,
      customRoleLabel: acc.customRoleLabel,
      permissions: [...acc.permissions],
      status: acc.status,
      protectedSuperAdmin: acc.protectedSuperAdmin,
      hasPassword: Boolean(acc.passwordHash),
      createdAt: acc.createdAt,
      createdBy: acc.createdBy,
      lastLoginAt: acc.lastLoginAt,
      activeSessionCount: activeSessions,
    };
  }

  // ===========================================================================
  // SCHEDULED PUBLISHING WORKER (STRICT HUMAN APPROVAL GATE)
  // ===========================================================================

  private startSchedulerWorker(): void {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.schedulerTimer = setInterval(() => {
      void this.runScheduledPublishingCycle();
    }, 60 * 1000);
    this.schedulerTimer.unref?.();
  }

  private async runScheduledPublishingCycle(): Promise<{ publishedCount: number; skippedCount: number }> {
    const auto = this.state.automations.find((a) => a.id === 'auto-scheduled-publisher');
    if (auto && !auto.enabled) {
      return { publishedCount: 0, skippedCount: 0 };
    }
    const started = Date.now();
    const now = Date.now();
    let publishedCount = 0;
    let skippedCount = 0;

    const dueDrafts = this.state.drafts.filter((d) => {
      if (d.status !== 'scheduled' || !d.scheduledFor) return false;
      const targetTs = Date.parse(d.scheduledFor);
      return Number.isFinite(targetTs) && targetTs <= now;
    });

    for (const draft of dueDrafts) {
      // Safety rule: NEVER auto-publish AI drafts without explicit human approval
      if (draft.aiGenerated && !draft.approvedBy) {
        skippedCount += 1;
        continue;
      }
      if (!draft.approvedBy) {
        skippedCount += 1;
        continue;
      }

      try {
        const res = await this.sheetsStorage.createNewsFromServer(
          {
            newsId: draft.customSlug || undefined,
            isCustomSlug: Boolean(draft.customSlug),
            title: draft.titleKannada,
            description: draft.summaryKannada,
            fullContent: draft.bodyKannada,
            extraImages: draft.extraImages || [],
            category: draft.category || 'Local',
            location: draft.location || 'ಕೊಪ್ಪ',
            language: draft.language === 'English' ? 'en' : 'kn',
            imageUrl: draft.imageUrl || '',
            imageThumbUrl: draft.imageThumbUrl || '',
            imageDriveId: draft.imageDriveId || '',
            imageCaption: draft.imageCaption || '',
            imageKey: draft.imageKey || 'none',
            watermarkApplied: Boolean(draft.watermarkApplied),
            author: draft.reporter || 'Coffeenadu Desk',
            featured: Boolean(draft.isFeatured),
            featuredUntil: draft.featuredUntil ?? '',
          },
          draft.approvedBy
        );

        if (res.ok && res.newsId) {
          publishedCount += 1;
          this.state.drafts = this.state.drafts.filter((item) => item.id !== draft.id);
          this.state.overlays[res.newsId] = {
            articleId: res.newsId,
            status: 'published',
            language: draft.language || 'Kannada',
            aiGenerated: draft.aiGenerated,
            seo: draft.seo,
            revisions: [
              {
                id: makeId('rev'),
                timestamp: new Date().toISOString(),
                editorEmail: draft.approvedBy,
                summary: `Published automatically from schedule (${draft.scheduledFor})`,
                titleSnapshot: stripMarkup(draft.titleKannada).slice(0, 140),
                statusSnapshot: 'published',
              },
            ],
          };
        } else {
          this.addNotification({
            category: 'publishing',
            severity: 'error',
            title: 'Scheduled Publish Failed',
            message: `Could not publish "${stripMarkup(draft.titleKannada).slice(0, 80)}": ${res.error || 'Unknown error'}`,
            entityId: draft.id,
          });
        }
      } catch (err) {
        this.recordAutomationRun(
          'auto-scheduled-publisher',
          'error',
          Date.now() - started,
          'Scheduled publish error',
          err instanceof Error ? err.message : 'Publish failed'
        );
      }
    }

    if (auto) {
      auto.nextRunAt = new Date(Date.now() + 60 * 1000).toISOString();
    }
    if (publishedCount > 0) {
      this.recordAutomationRun(
        'auto-scheduled-publisher',
        'success',
        Date.now() - started,
        `Published ${publishedCount} scheduled article(s)`
      );
      this.schedulePersist();
    }
    return { publishedCount, skippedCount };
  }

  // ===========================================================================
  // GEMINI AI NEWS STUDIO (STRICT SOURCE-GROUNDED, DRAFTS ONLY)
  // ===========================================================================

  private getGeminiClient(): GoogleGenAI | null {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) return null;
    if (!this.geminiClient) {
      this.geminiClient = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
    }
    return this.geminiClient;
  }

  private async runAiStudioAssist(input: {
    tool: AiStudioTool;
    sourceMaterial: string;
    headlineHint?: string;
    category?: string;
    location?: string;
    tone?: string;
  }): Promise<AiStudioResponse> {
    const ai = this.getGeminiClient();
    const disclaimer =
      'AI-generated draft strictly grounded in your supplied source notes. Remains a draft until reviewed and approved by an authorized editor.';

    if (!ai) {
      return {
        ok: false,
        tool: input.tool,
        model: GEMINI_EDITORIAL_MODEL,
        outputText: '',
        disclaimer,
        error: 'Gemini server API key (GEMINI_API_KEY) is not configured in environment secrets.',
      };
    }

    const systemInstruction = [
      'You are the senior editorial desk assistant for CoffeeNadu News (Koppa Taluk, Chikkamagaluru, Karnataka).',
      'STRICT JOURNALISM RULES:',
      '1. Use ONLY the facts, names, dates, numbers, locations, and quotes explicitly present in the user-supplied source material.',
      '2. NEVER invent facts, quotes, statistics, official statements, names, dates, or external sources.',
      '3. If a detail is missing from the source material, mark it cleanly as [Verify with reporter] rather than guessing.',
      '4. Maintain crisp, neutral, newspaper-grade journalism suitable for Kannada and English local readership.',
      '5. Always respond with valid JSON matching the requested schema for the selected tool.',
    ].join('\n');

    const toolInstructions: Record<AiStudioTool, string> = {
      draft_kannada:
        'Draft a complete Kannada newspaper article strictly from the supplied notes. Return JSON: {"headline":"...","summary":"2-sentence Kannada summary","paragraphs":["para1","para2","para3"],"seoTitle":"<=60 chars","metaDescription":"<=155 chars"}.',
      draft_english:
        'Draft a complete English newspaper article strictly from the supplied notes. Return JSON: {"headline":"...","summary":"2-sentence summary","paragraphs":["para1","para2","para3"],"seoTitle":"<=60 chars","metaDescription":"<=155 chars"}.',
      translate_kn_en:
        'Translate the supplied Kannada news text faithfully into publication-ready English without adding any new facts. Return JSON: {"headline":"...","summary":"...","paragraphs":["..."]}.',
      translate_en_kn:
        'Translate the supplied English news text faithfully into natural, publication-ready Kannada newspaper prose without adding any new facts. Return JSON: {"headline":"...","summary":"...","paragraphs":["..."]}.',
      headlines:
        'Generate 5 concise, accurate news headlines (3 Kannada + 2 English) strictly grounded in the supplied notes. Return JSON: {"options":["...","...","...","...","..."]}.',
      summary:
        'Write a crisp 2–3 sentence news lead/summary strictly from the supplied article without adding facts. Return JSON: {"summary":"...","options":["Short WhatsApp blurb","Homepage card summary"]}.',
      seo_title:
        'Create 4 SEO-optimized titles (under 60 characters each) grounded in the supplied story and Koppa/Chikkamagaluru context if mentioned. Return JSON: {"seoTitle":"best title","options":["opt1","opt2","opt3","opt4"]}.',
      meta_description:
        'Create 3 SEO meta descriptions (120–155 characters each) strictly from the supplied story. Return JSON: {"metaDescription":"best meta","options":["opt1","opt2","opt3"]}.',
      grammar:
        'Proofread and correct grammar, punctuation, and spelling in the supplied Kannada/English text without changing meaning or adding facts. Return JSON: {"paragraphs":["corrected paragraph 1"],"summary":"Summary of corrections made"}.',
      readability:
        'Improve paragraph flow, clarity, and journalistic readability of the supplied copy while preserving 100% of facts. Return JSON: {"paragraphs":["improved paragraph 1"],"summary":"Readability improvements applied"}.',
      image_caption:
        'Write an accurate news photo caption in Kannada and English based strictly on the supplied description. Return JSON: {"captionKn":"...","captionEn":"..."}.',
      image_alt:
        'Write accessible, descriptive SEO image alt text (under 125 characters) strictly from the supplied description. Return JSON: {"altText":"...","options":["alt option 1","alt option 2"]}.',
      verify_facts:
        'Audit every factual claim (names, dates, figures, places, quotes) in the supplied draft against standard newsroom verification checks. Flag claims that need reporter confirmation. Return JSON: {"summary":"Overall verification readiness note","verificationFindings":[{"claim":"...","status":"supported|unverified|needs_source","note":"..."}]}.',
    };

    const userPrompt = [
      `Tool: ${input.tool}`,
      input.category ? `Category: ${input.category}` : '',
      input.location ? `Location: ${input.location}` : '',
      input.headlineHint ? `Headline Hint: ${input.headlineHint}` : '',
      input.tone ? `Editorial Tone: ${input.tone}` : '',
      '',
      'Task Instructions:',
      toolInstructions[input.tool],
      '',
      'Supplied Source Material:',
      input.sourceMaterial.slice(0, 12000),
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_EDITORIAL_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });

      const rawText = (response.text || '').trim();
      let structured: AiStudioResponse['structured'] | undefined;
      try {
        structured = JSON.parse(rawText) as AiStudioResponse['structured'];
      } catch {
        structured = undefined;
      }

      let formattedText = rawText;
      if (structured) {
        const parts: string[] = [];
        if (structured.headline) parts.push(structured.headline);
        if (structured.summary) parts.push(structured.summary);
        if (Array.isArray(structured.paragraphs) && structured.paragraphs.length > 0) {
          parts.push(structured.paragraphs.join('\n\n'));
        }
        if (structured.seoTitle) parts.push(`SEO Title: ${structured.seoTitle}`);
        if (structured.metaDescription) parts.push(`Meta Description: ${structured.metaDescription}`);
        if (structured.captionKn) parts.push(`Kannada Caption: ${structured.captionKn}`);
        if (structured.captionEn) parts.push(`English Caption: ${structured.captionEn}`);
        if (structured.altText) parts.push(`Image Alt Text: ${structured.altText}`);
        if (Array.isArray(structured.options) && structured.options.length > 0) {
          parts.push(structured.options.map((o, i) => `${i + 1}. ${o}`).join('\n'));
        }
        if (Array.isArray(structured.verificationFindings) && structured.verificationFindings.length > 0) {
          parts.push(
            structured.verificationFindings
              .map((f) => `[${f.status.toUpperCase()}] ${f.claim} — ${f.note}`)
              .join('\n')
          );
        }
        if (parts.length > 0) formattedText = parts.join('\n\n');
      }

      return {
        ok: true,
        tool: input.tool,
        model: GEMINI_EDITORIAL_MODEL,
        outputText: formattedText,
        structured,
        disclaimer,
      };
    } catch (err) {
      return {
        ok: false,
        tool: input.tool,
        model: GEMINI_EDITORIAL_MODEL,
        outputText: '',
        disclaimer,
        error: err instanceof Error ? err.message : 'Gemini editorial assist request failed.',
      };
    }
  }

  // ===========================================================================
  // ANALYTICS, MEDIA & SEO AGGREGATORS (100% REAL DATA)
  // ===========================================================================

  private buildAnalyticsSummary(news: SheetsNewsItem[], rangeDays: number): Admin2AnalyticsSummary {
    const daysToInclude = rangeDays > 0 ? Math.min(90, rangeDays) : 30;
    const today = new Date();
    const dailySeries: Admin2AnalyticsSummary['dailySeries'] = [];
    const sourceTotals: Record<string, number> = {};
    const deviceTotals: Record<string, number> = {};

    let totalPageViews = 0;
    let totalArticleReads = 0;
    const uniqueUnion = new Set<string>();

    for (let i = daysToInclude - 1; i >= 0; i -= 1) {
      const dt = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dayKey = dt.toISOString().slice(0, 10);
      const bucket = this.state.trafficByDay[dayKey];
      const pv = bucket?.pageViews || 0;
      const uv = bucket?.visitorHashes?.length || 0;
      const ar = bucket?.articleReads || 0;
      dailySeries.push({ date: dayKey, pageViews: pv, uniqueVisitors: uv, articleReads: ar });

      totalPageViews += pv;
      totalArticleReads += ar;
      if (bucket) {
        for (const h of bucket.visitorHashes) uniqueUnion.add(`${dayKey}:${h}`);
        for (const [src, cnt] of Object.entries(bucket.sources || {})) {
          sourceTotals[src] = (sourceTotals[src] || 0) + cnt;
        }
        for (const [dev, cnt] of Object.entries(bucket.devices || {})) {
          deviceTotals[dev] = (deviceTotals[dev] || 0) + cnt;
        }
      }
    }

    const totalSources = Object.values(sourceTotals).reduce((a, b) => a + b, 0);
    const trafficSources = Object.entries(sourceTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({
        source,
        count,
        pct: totalSources > 0 ? Math.round((count / totalSources) * 100) : 0,
      }));

    const totalDevices = Object.values(deviceTotals).reduce((a, b) => a + b, 0);
    const deviceBreakdown = Object.entries(deviceTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([device, count]) => ({
        device,
        count,
        pct: totalDevices > 0 ? Math.round((count / totalDevices) * 100) : 0,
      }));

    const mergedArticleMap = new Map<
      string,
      {
        id: string;
        title: string;
        category: string;
        location: string;
        publishedDate: string;
        views: number;
      }
    >();

    for (const item of news) {
      mergedArticleMap.set(item.newsId, {
        id: item.newsId,
        title: stripMarkup(item.title),
        category: item.category || 'Local',
        location: item.location || 'ಕೊಪ್ಪ',
        publishedDate: item.publishedDate || '',
        views: this.getEffectiveArticleViews(item.newsId, Number(item.views) || 0),
      });
    }

    for (const localItem of this.loadLocalFallbackArticles()) {
      const existing = mergedArticleMap.get(localItem.id);
      if (existing) {
        existing.views = Math.max(existing.views, this.getEffectiveArticleViews(localItem.id, localItem.views));
      } else {
        mergedArticleMap.set(localItem.id, {
          ...localItem,
          views: this.getEffectiveArticleViews(localItem.id, localItem.views),
        });
      }
    }

    for (const [id, stat] of Object.entries(this.state.articleViewStats)) {
      const existing = mergedArticleMap.get(id);
      if (existing) {
        existing.views = Math.max(existing.views, Number(stat.totalViews) || 0);
      } else {
        mergedArticleMap.set(id, {
          id,
          title: stripMarkup(stat.title || id),
          category: stat.category || 'Local',
          location: stat.location || 'ಕೊಪ್ಪ',
          publishedDate: stat.publishedDate || '',
          views: Number(stat.totalViews) || 0,
        });
      }
    }

    const mergedArticles = Array.from(mergedArticleMap.values());
    const catMap = new Map<string, { articles: number; views: number }>();
    let totalSheetArticleViews = 0;
    for (const item of mergedArticles) {
      const views = Number(item.views) || 0;
      totalSheetArticleViews += views;
      const cur = catMap.get(item.category || 'Local') || { articles: 0, views: 0 };
      cur.articles += 1;
      cur.views += views;
      catMap.set(item.category || 'Local', cur);
    }

    const categoryPerformance = Array.from(catMap.entries())
      .map(([category, stats]) => ({ category, ...stats }))
      .sort((a, b) => b.views - a.views);

    const topArticles = [...mergedArticles]
      .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
      .slice(0, 12);

    const recentlyViewedArticles = this.state.recentlyViewedArticles
      .slice(0, 20)
      .map((recent) => {
        const merged = mergedArticleMap.get(recent.id);
        return {
          ...recent,
          title: merged?.title || stripMarkup(recent.title || recent.id),
          category: merged?.category || recent.category || 'Local',
          location: merged?.location || recent.location || 'ಕೊಪ್ಪ',
          publishedDate: merged?.publishedDate || recent.publishedDate || '',
          views: Math.max(Number(recent.views) || 0, merged?.views || 0),
        };
      });

    return {
      rangeDays: daysToInclude,
      dailySeries,
      totals: {
        pageViews: totalPageViews,
        uniqueVisitors: uniqueUnion.size,
        articleReads: totalArticleReads,
        totalSheetArticleViews,
        totalPublishedArticles: mergedArticles.length,
      },
      trafficSources,
      deviceBreakdown,
      categoryPerformance,
      topArticles,
      recentlyViewedArticles,
      ga4Connected: Boolean(this.state.settings.ga4MeasurementId.trim()),
      ga4MeasurementId: this.state.settings.ga4MeasurementId.trim(),
      searchConsoleConnected: Boolean(this.state.settings.searchConsoleSiteUrl.trim()),
      searchConsoleSiteUrl: this.state.settings.searchConsoleSiteUrl.trim(),
    };
  }

  private async buildMediaCatalog(): Promise<Admin2MediaAsset[]> {
    const [news, events] = await Promise.all([
      this.sheetsStorage.getAllNewsForAdmin(),
      this.sheetsStorage.getAllEventsForAdmin(),
    ]);

    const byUrl = new Map<string, Admin2MediaAsset>();

    // Seed from saved media metadata first
    for (const meta of Object.values(this.state.mediaMetadata)) {
      byUrl.set(meta.imageUrl, {
        ...meta,
        usageArticles: [],
      });
    }

    const attachUsage = (
      imageUrl: string,
      opts: {
        driveFileId?: string;
        thumbUrl?: string;
        watermarkApplied?: boolean;
        uploadedAt?: string;
        folder: string;
        articleId: string;
        title: string;
        role: 'main' | 'extra' | 'event';
      }
    ) => {
      if (!imageUrl || imageUrl.startsWith('data:image/')) return;
      let existing = byUrl.get(imageUrl);
      if (!existing) {
        const extractedDriveId =
          opts.driveFileId ||
          (imageUrl.startsWith('/api/media/drive/')
            ? imageUrl.replace('/api/media/drive/', '').split('?')[0]
            : undefined);
        existing = {
          id: extractedDriveId || sha256Hex(imageUrl).slice(0, 14),
          driveFileId: extractedDriveId,
          imageUrl,
          thumbUrl: opts.thumbUrl || imageUrl,
          fileName: extractedDriveId ? `drive-${extractedDriveId.slice(0, 10)}.jpg` : 'news-photo.jpg',
          folder: opts.folder,
          mimeType: 'image/jpeg',
          watermarkApplied: Boolean(opts.watermarkApplied),
          middleOverlayApplied: Boolean(opts.watermarkApplied),
          uploadedAt: opts.uploadedAt || new Date().toISOString(),
          usageArticles: [],
          processingHistory: opts.watermarkApplied
            ? ['CoffeeNadu circular logo watermark applied', 'Stored in Google Drive']
            : ['Stored in Google Drive'],
        };
        byUrl.set(imageUrl, existing);
      }
      if (!existing.usageArticles.some((u) => u.articleId === opts.articleId && u.role === opts.role)) {
        existing.usageArticles.push({
          articleId: opts.articleId,
          title: stripMarkup(opts.title).slice(0, 90),
          role: opts.role,
        });
      }
    };

    for (const item of news) {
      if (item.imageUrl) {
        attachUsage(item.imageUrl, {
          driveFileId: item.imageDriveId,
          thumbUrl: item.imageThumbUrl,
          watermarkApplied: item.watermarkApplied,
          uploadedAt: item.publishedTimestamp
            ? new Date(item.publishedTimestamp).toISOString()
            : item.publishedDate,
          folder: item.featured ? 'Lead Stories' : 'General News',
          articleId: item.newsId,
          title: item.title,
          role: 'main',
        });
      }
      if (Array.isArray(item.extraImages)) {
        for (const extra of item.extraImages) {
          if (extra?.imageUrl) {
            attachUsage(extra.imageUrl, {
              driveFileId: extra.imageDriveId,
              thumbUrl: extra.imageThumbUrl,
              watermarkApplied: extra.watermarkApplied,
              uploadedAt: item.publishedTimestamp
                ? new Date(item.publishedTimestamp).toISOString()
                : item.publishedDate,
              folder: 'Extra Photos',
              articleId: item.newsId,
              title: item.title,
              role: 'extra',
            });
          }
        }
      }
    }

    for (const ev of events) {
      if (ev.imageUrl) {
        attachUsage(ev.imageUrl, {
          driveFileId: ev.imageDriveId,
          thumbUrl: ev.imageThumbUrl,
          watermarkApplied: ev.watermarkApplied,
          uploadedAt: ev.createdAt || ev.eventDate,
          folder: 'Programs & Events',
          articleId: ev.eventId,
          title: ev.titleKannada,
          role: 'event',
        });
      }
    }

    return Array.from(byUrl.values()).sort((a, b) => {
      const ta = Date.parse(a.uploadedAt) || 0;
      const tb = Date.parse(b.uploadedAt) || 0;
      return tb - ta;
    });
  }

  private buildSeoAudit(news: SheetsNewsItem[]) {
    const baseUrl = this.state.settings.canonicalBaseUrl.replace(/\/+$/, '') || 'https://coffeenadu.in';
    const items = news.map((art) => {
      const overlay = this.state.overlays[art.newsId];
      const seo = overlay?.seo || {};
      const plainTitle = stripMarkup(art.title);
      const plainDesc = stripMarkup(art.description);
      const seoTitle = (seo.seoTitle || plainTitle).trim();
      const metaDescription = (seo.metaDescription || plainDesc).trim();
      const canonicalUrl = (seo.canonicalUrl || `${baseUrl}/?article=${encodeURIComponent(art.newsId)}`).trim();
      const imageAltText = (seo.imageAltText || stripMarkup(art.imageCaption || '')).trim();

      const issues: string[] = [];
      if (seoTitle.length < 15) issues.push('SEO title is very short (<15 chars)');
      if (seoTitle.length > 75) issues.push('SEO title exceeds 75 characters');
      if (metaDescription.length < 40) issues.push('Meta description is short (<40 chars)');
      if (metaDescription.length > 170) issues.push('Meta description exceeds 170 characters');
      if (art.imageUrl && !imageAltText) issues.push('Missing image alt text');

      const score = Math.max(0, 100 - issues.length * 18);
      return {
        articleId: art.newsId,
        title: plainTitle,
        category: art.category,
        publishedDate: art.publishedDate,
        seoTitle,
        metaDescription,
        canonicalUrl,
        ogTitle: seo.ogTitle || seoTitle,
        ogDescription: seo.ogDescription || metaDescription,
        imageAltText,
        focusKeyword: seo.focusKeyword || '',
        hasImage: Boolean(art.imageUrl),
        jsonLdValid: Boolean(plainTitle && canonicalUrl),
        score,
        issues,
      };
    });

    const avgScore =
      items.length > 0 ? Math.round(items.reduce((s, x) => s + x.score, 0) / items.length) : 100;
    const missingAltCount = items.filter((i) => i.hasImage && !i.imageAltText).length;
    const warningCount = items.filter((i) => i.issues.length > 0).length;

    return {
      siteDefaults: {
        canonicalBaseUrl: baseUrl,
        defaultSeoTitle: this.state.settings.defaultSeoTitle,
        defaultMetaDescription: this.state.settings.defaultMetaDescription,
        sitemapUrl: `${baseUrl}/sitemap.xml`,
      },
      summary: {
        totalChecked: items.length,
        averageScore: avgScore,
        missingAltCount,
        warningCount,
        sitemapValid: true,
        openGraphEnabled: true,
        jsonLdEnabled: true,
      },
      items,
    };
  }

  // ===========================================================================
  // SITEMAP.XML & EXPRESS ROUTE MOUNTING
  // ===========================================================================

  public mountRoutes(app: Express): void {
    // Dynamic SEO Sitemap (real published articles from Google Sheets)
    app.get('/sitemap.xml', async (_req, res) => {
      const baseUrl =
        this.state.settings.canonicalBaseUrl.replace(/\/+$/, '') || 'https://coffeenadu.in';
      const todayIso = new Date().toISOString().slice(0, 10);
      let news: SheetsNewsItem[] = [];
      try {
        news = await this.sheetsStorage.getAllNewsForAdmin();
      } catch {
        news = [];
      }

      const staticUrls = ['/', '/ads', '/events', '/bus-timings', '/chat'].map(
        (p) =>
          `  <url>\n    <loc>${baseUrl}${p}</loc>\n    <lastmod>${todayIso}</lastmod>\n    <changefreq>${p === '/' ? 'hourly' : 'daily'}</changefreq>\n    <priority>${p === '/' ? '1.0' : '0.8'}</priority>\n  </url>`
      );

      const articleUrls = news.slice(0, 500).map((item) => {
        const lastmod = item.publishedTimestamp
          ? new Date(item.publishedTimestamp).toISOString().slice(0, 10)
          : todayIso;
        return `  <url>\n    <loc>${baseUrl}/?article=${encodeURIComponent(item.newsId)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
      });

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...staticUrls,
        ...articleUrls,
        '</urlset>',
      ].join('\n');

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(xml);
    });

    // -------------------------------------------------------------------------
    // AUTHENTICATION ENDPOINTS (Admin 2.0 Password + Activation + Firebase Bridge)
    // -------------------------------------------------------------------------

    app.post('/api/admin2/auth/login', (req, res) => {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const rememberMe = Boolean(req.body?.rememberMe);
      const ip = getClientIp(req);
      const userAgent = String(req.headers['user-agent'] || 'Unknown Browser').slice(0, 180);

      if (!email || !password) {
        res.status(400).json({ ok: false, error: 'Email and password are required.' });
        return;
      }

      const account = this.state.accounts.find((a) => a.email.toLowerCase() === email);
      if (!account) {
        this.recordLoginAttempt({
          email,
          provider: 'admin2_password',
          success: false,
          reason: 'Account not found',
          ip,
          userAgent,
        });
        res.status(401).json({ ok: false, error: 'Invalid email or password.' });
        return;
      }

      if (account.status === 'suspended') {
        this.recordLoginAttempt({
          email,
          provider: 'admin2_password',
          success: false,
          reason: 'Account suspended',
          ip,
          userAgent,
        });
        res.status(403).json({
          ok: false,
          error: 'This administrator account has been suspended. Contact a Super Admin.',
        });
        return;
      }

      if (account.status === 'pending_activation' || !account.passwordHash) {
        this.recordLoginAttempt({
          email,
          provider: 'admin2_password',
          success: false,
          reason: 'Password not yet configured',
          ip,
          userAgent,
        });
        res.status(401).json({
          ok: false,
          error: account.protectedSuperAdmin
            ? 'Sign in with Google Sign-In first, or set your Admin 2.0 password inside Security Settings.'
            : 'This account has not been activated yet. Use the activation link provided by your Super Admin.',
        });
        return;
      }

      if (!verifyPasswordScrypt(password, account.passwordHash)) {
        this.recordLoginAttempt({
          email,
          provider: 'admin2_password',
          success: false,
          reason: 'Incorrect password',
          ip,
          userAgent,
        });
        res.status(401).json({ ok: false, error: 'Invalid email or password.' });
        return;
      }

      const { token, user, session } = this.createTrackedSession(account, 'admin2_password', ip, userAgent);

      if (rememberMe) {
        this.issueRememberedDeviceCookie(req, res, account, 'admin2_password', ip, userAgent);
      } else {
        this.revokeAndClearRememberedCookie(req, res);
      }

      this.recordLoginAttempt({
        email: account.email,
        provider: 'admin2_password',
        success: true,
        ip,
        userAgent,
      });
      this.addAuditLog({
        actorEmail: account.email,
        actorRole: account.role,
        action: 'auth.login',
        targetType: 'session',
        targetId: session.id,
        details: `Signed in via Admin 2.0 credentials from ${ip}${rememberMe ? ' (Remember Me enabled)' : ''}`,
        severity: 'info',
        ip,
      });
      this.persistStateNow();

      res.json({ ok: true, token, user });
    });

    app.post('/api/admin2/auth/firebase-exchange', async (req, res) => {
      const authHeader = req.headers.authorization || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const idToken = String(req.body?.idToken || bearerToken || '').trim();
      const rememberMe = Boolean(req.body?.rememberMe);
      const ip = getClientIp(req);
      const userAgent = String(req.headers['user-agent'] || 'Unknown Browser').slice(0, 180);

      if (!idToken || idToken.startsWith('cn2.')) {
        res.status(400).json({ ok: false, error: 'Valid Firebase authentication token is required.' });
        return;
      }

      const fb = await this.sheetsStorage.verifyFirebaseTokenRaw(idToken);
      if (!fb || !fb.emailVerified) {
        this.recordLoginAttempt({
          email: fb?.email || 'unknown',
          provider: 'firebase',
          success: false,
          reason: 'Unverified or invalid Firebase ID token',
          ip,
          userAgent,
        });
        res.status(401).json({ ok: false, error: 'Invalid or unverified Google/Firebase sign-in.' });
        return;
      }

      const emailLower = fb.email.toLowerCase();
      let account = this.state.accounts.find((acc) => acc.email.toLowerCase() === emailLower);

      if (!account && PROTECTED_EMAIL_SET.has(emailLower)) {
        account = {
          id: makeId('adm-owner'),
          fullName: fb.displayName || emailLower,
          email: emailLower,
          role: 'super_admin',
          permissions: [...ROLE_DEFAULT_PERMISSIONS.super_admin],
          status: 'active',
          protectedSuperAdmin: true,
          createdAt: new Date().toISOString(),
          createdBy: 'system',
        };
        this.state.accounts.push(account);
      }

      if (!account) {
        const extraAdmins = (process.env.EXTRA_ADMIN_EMAILS || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (extraAdmins.includes(emailLower)) {
          account = {
            id: makeId('adm-env'),
            fullName: fb.displayName || emailLower,
            email: emailLower,
            role: 'admin',
            permissions: [...ROLE_DEFAULT_PERMISSIONS.admin],
            status: 'active',
            protectedSuperAdmin: false,
            createdAt: new Date().toISOString(),
            createdBy: 'env',
          };
          this.state.accounts.push(account);
        }
      }

      if (!account) {
        this.recordLoginAttempt({
          email: emailLower,
          provider: 'firebase',
          success: false,
          reason: 'Account not authorized for Admin 2.0',
          ip,
          userAgent,
        });
        res.status(403).json({
          ok: false,
          error: `Signed in as ${emailLower}, which does not have administrator permissions for CoffeeNadu News.`,
        });
        return;
      }

      if (account.status !== 'active') {
        this.recordLoginAttempt({
          email: emailLower,
          provider: 'firebase',
          success: false,
          reason: `Account status is ${account.status}`,
          ip,
          userAgent,
        });
        res.status(403).json({
          ok: false,
          error: 'This administrator account is not active. Contact a Super Admin.',
        });
        return;
      }

      const { token, user, session } = this.createTrackedSession(account, 'firebase', ip, userAgent);

      if (rememberMe) {
        this.issueRememberedDeviceCookie(req, res, account, 'firebase', ip, userAgent);
      } else {
        this.revokeAndClearRememberedCookie(req, res);
      }

      this.recordLoginAttempt({
        email: account.email,
        provider: 'firebase',
        success: true,
        ip,
        userAgent,
      });
      this.addAuditLog({
        actorEmail: account.email,
        actorRole: account.role,
        action: 'auth.login',
        targetType: 'session',
        targetId: session.id,
        details: `Signed in via Google/Firebase (tracked session) from ${ip}${rememberMe ? ' (Remember Me enabled)' : ''}`,
        severity: 'info',
        ip,
      });
      this.persistStateNow();

      res.json({ ok: true, token, user });
    });

    app.get('/api/admin2/auth/remembered', (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const matched = this.verifyRememberedDeviceCookie(req);
      if (!matched) {
        res.json({ ok: true, remembered: false });
        return;
      }
      res.json({
        ok: true,
        remembered: true,
        email: matched.account.email,
        fullName: matched.account.fullName,
        authProvider: matched.record.authProvider,
      });
    });

    app.post('/api/admin2/auth/login-remembered', (req, res) => {
      const ip = getClientIp(req);
      const userAgent = String(req.headers['user-agent'] || 'Unknown Browser').slice(0, 180);
      const requestedEmail = String(req.body?.email || '').trim().toLowerCase();
      const matched = this.verifyRememberedDeviceCookie(req);
      if (!matched) {
        this.revokeAndClearRememberedCookie(req, res);
        res.status(401).json({
          ok: false,
          error: 'Saved device login has expired or was revoked. Please enter your credentials.',
        });
        return;
      }
      if (requestedEmail && matched.account.email.toLowerCase() !== requestedEmail) {
        res.status(401).json({
          ok: false,
          error: 'Saved login belongs to a different account. Enter your password to switch accounts.',
        });
        return;
      }

      const { account, record } = matched;
      // Rotate remembered-device token on each explicit Login Now
      this.state.rememberedDevices = this.state.rememberedDevices.filter((d) => d.id !== record.id);
      this.issueRememberedDeviceCookie(req, res, account, record.authProvider, ip, userAgent);

      const { token, user, session } = this.createTrackedSession(account, record.authProvider, ip, userAgent);
      this.recordLoginAttempt({
        email: account.email,
        provider: record.authProvider,
        success: true,
        ip,
        userAgent,
      });
      this.addAuditLog({
        actorEmail: account.email,
        actorRole: account.role,
        action: 'auth.login',
        targetType: 'session',
        targetId: session.id,
        details: `Signed in via Remember Me (explicit Login Now) from ${ip}`,
        severity: 'info',
        ip,
      });
      this.persistStateNow();

      res.json({ ok: true, token, user });
    });

    app.post('/api/admin2/auth/forget-device', (req, res) => {
      this.revokeAndClearRememberedCookie(req, res);
      this.persistStateNow();
      res.json({ ok: true });
    });

    app.post('/api/admin2/auth/activate', (req, res) => {
      const token = String(req.body?.token || '').trim();
      const password = String(req.body?.password || '');
      if (!token || password.length < 10) {
        res.status(400).json({
          ok: false,
          error: 'Activation token and a strong password (minimum 10 characters) are required.',
        });
        return;
      }

      const hashed = sha256Hex(token);
      const account = this.state.accounts.find(
        (a) => a.activationTokenHash === hashed && (a.activationExpiresAt || 0) > Date.now()
      );
      if (!account) {
        res.status(400).json({
          ok: false,
          error: 'Activation link is invalid or has expired. Ask a Super Admin to issue a fresh link.',
        });
        return;
      }

      account.passwordHash = hashPasswordScrypt(password);
      account.status = 'active';
      account.activationTokenHash = undefined;
      account.activationExpiresAt = undefined;

      this.addAuditLog({
        actorEmail: account.email,
        actorRole: account.role,
        action: 'auth.account_activated',
        targetType: 'admin_account',
        targetId: account.id,
        details: `Account activated and password set for ${account.email}`,
        severity: 'info',
        ip: getClientIp(req),
      });
      this.addNotification({
        category: 'security',
        severity: 'success',
        title: 'Administrator Account Activated',
        message: `${account.fullName} (${account.email}) completed secure account activation.`,
        entityId: account.id,
      });
      this.persistStateNow();

      res.json({ ok: true, email: account.email, message: 'Account activated successfully. You may now sign in.' });
    });

    app.post('/api/admin2/auth/reset-password', (req, res) => {
      const token = String(req.body?.token || '').trim();
      const password = String(req.body?.password || '');
      if (!token || password.length < 10) {
        res.status(400).json({
          ok: false,
          error: 'Reset token and a strong new password (minimum 10 characters) are required.',
        });
        return;
      }

      const hashed = sha256Hex(token);
      const account = this.state.accounts.find(
        (a) => a.resetTokenHash === hashed && (a.resetExpiresAt || 0) > Date.now()
      );
      if (!account) {
        res.status(400).json({ ok: false, error: 'Password reset link is invalid or expired.' });
        return;
      }

      account.passwordHash = hashPasswordScrypt(password);
      account.resetTokenHash = undefined;
      account.resetExpiresAt = undefined;
      // Revoke existing sessions and remembered devices on password reset
      this.state.sessions = this.state.sessions.filter((s) => s.accountId !== account.id);
      this.revokeRememberedDevicesForAccount(account.id);

      this.addAuditLog({
        actorEmail: account.email,
        actorRole: account.role,
        action: 'auth.password_reset',
        targetType: 'admin_account',
        targetId: account.id,
        details: `Password reset completed and prior sessions & remembered devices revoked for ${account.email}`,
        severity: 'warning',
        ip: getClientIp(req),
      });
      this.persistStateNow();

      res.json({ ok: true, email: account.email, message: 'Password updated successfully. Please sign in.' });
    });

    app.post('/api/admin2/auth/logout', this.requireAuth(), (req: Admin2Request, res) => {
      const sessionId = req.admin2User?.sessionId;
      const reason = String(req.body?.reason || 'user_logout').slice(0, 64);
      const clearRemembered = Boolean(req.body?.clearRemembered);
      if (sessionId) {
        this.state.sessions = this.state.sessions.filter((s) => s.id !== sessionId);
      }
      if (clearRemembered) {
        this.revokeAndClearRememberedCookie(req, res);
      }
      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: 'auth.logout',
        targetType: 'session',
        targetId: sessionId || req.admin2User!.id,
        details: `Signed out cleanly (${reason})`,
        severity: 'info',
        ip: getClientIp(req),
      });
      this.persistStateNow();
      res.json({ ok: true, revoked: true });
    });

    app.get('/api/admin2/auth/me', this.requireAuth(), (req: Admin2Request, res) => {
      res.json({ ok: true, user: req.admin2User });
    });

    app.post('/api/admin2/auth/set-own-password', this.requireAuth(), (req: Admin2Request, res) => {
      const password = String(req.body?.password || '');
      if (password.length < 10) {
        res.status(400).json({ ok: false, error: 'Password must be at least 10 characters long.' });
        return;
      }
      const account = this.state.accounts.find((a) => a.id === req.admin2User?.id);
      if (!account) {
        res.status(404).json({ ok: false, error: 'Account record not found.' });
        return;
      }
      account.passwordHash = hashPasswordScrypt(password);
      this.revokeRememberedDevicesForAccount(account.id);
      this.addAuditLog({
        actorEmail: account.email,
        actorRole: account.role,
        action: 'auth.password_updated',
        targetType: 'admin_account',
        targetId: account.id,
        details: 'Administrator updated their Admin 2.0 password and revoked remembered devices.',
        severity: 'warning',
        ip: getClientIp(req),
      });
      this.persistStateNow();
      res.json({ ok: true, message: 'Password saved securely with scrypt hashing.' });
    });

    // -------------------------------------------------------------------------
    // 1. DASHBOARD OVERVIEW (REAL DATA ONLY)
    // -------------------------------------------------------------------------

    app.get('/api/admin2/dashboard', this.requireAuth('dashboard.view'), async (req: Admin2Request, res) => {
      try {
        const [news, events, stats] = await Promise.all([
          this.sheetsStorage.getAllNewsForAdmin(),
          this.sheetsStorage.getAllEventsForAdmin(),
          this.sheetsStorage.getAdminStatsFromServer(req.admin2User?.email),
        ]);

        const draftsCount = this.state.drafts.filter((d) => d.status === 'draft').length;
        const scheduledCount = this.state.drafts.filter((d) => d.status === 'scheduled').length;
        const archivedCount =
          Object.values(this.state.overlays).filter((o) => o.status === 'archived').length +
          this.state.drafts.filter((d) => d.status === 'archived').length;

        const analytics = this.buildAnalyticsSummary(news, 14);
        const todayKey = getTodayKey();
        const todayBucket = this.state.trafficByDay[todayKey];
        const telemetry = this.sheetsStorage.getTelemetrySnapshot();
        const driveCache = this.sheetsStorage.getDriveCacheStats();

        const activeAutomations = this.state.automations.filter((a) => a.enabled && a.status === 'active').length;
        const errorAutomations = this.state.automations.filter((a) => a.status === 'error').length;

        const publishedCount = Math.max(news.length, analytics.totals.totalPublishedArticles);

        res.json({
          ok: true,
          articles: {
            total: publishedCount + draftsCount + scheduledCount + archivedCount,
            published: publishedCount,
            drafts: draftsCount,
            scheduled: scheduledCount,
            archived: archivedCount,
            eventsCount: events.length,
          },
          traffic: {
            todayVisitors: todayBucket?.visitorHashes?.length || 0,
            todayPageViews: todayBucket?.pageViews || 0,
            totalPageViews14d: analytics.totals.pageViews,
            totalSheetViews: analytics.totals.totalSheetArticleViews,
            dailySeries: analytics.dailySeries,
          },
          popularArticles: analytics.topArticles.slice(0, 6),
          recentlyViewedArticles: analytics.recentlyViewedArticles.slice(0, 8),
          recentActivity: this.state.auditLogs.slice(0, 10),
          recentNotifications: this.state.notifications.slice(0, 8),
          unreadNotifications: this.state.notifications.filter((n) => !n.read).length,
          systemStatus: {
            sheetsConnected: telemetry.configured,
            appsScriptStatus: telemetry.lastError ? 'degraded' : telemetry.configured ? 'connected' : 'not_configured',
            appsScriptCallsToday: telemetry.appsScriptCallsToday,
            dailyFreeLimitCalls: telemetry.dailyFreeLimitCalls,
            cacheHitRatePct: telemetry.cacheHitRatePct,
            driveCachedFiles: driveCache.fileCount,
            driveCachedBytes: driveCache.totalBytes,
            latestBackupAt: (stats?.lastBackupAt as string) || null,
            backupStatus: (stats?.backupStatus as string) || (telemetry.configured ? 'Ready' : 'Not configured'),
            availableBackups: Number(stats?.availableBackups) || 0,
            automationsActive: activeAutomations,
            automationsTotal: this.state.automations.length,
            automationsErrored: errorAutomations,
          },
        });
      } catch (err) {
        res.status(502).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to assemble dashboard overview.',
        });
      }
    });

    // Public live article view counts map (keeps feed/admin UI synchronized with server ledger)
    app.get('/api/articles/views', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
      res.json({
        ok: true,
        viewsById: this.getArticleViewsMap(),
      });
    });

    // -------------------------------------------------------------------------
    // 2 & 3. CMS DRAFTS, SCHEDULING, ARCHIVING, REVISIONS & BULK OPERATIONS
    // -------------------------------------------------------------------------

    app.get('/api/admin2/cms/state', this.requireAuth('dashboard.view'), (_req, res) => {
      res.json({
        ok: true,
        drafts: this.state.drafts,
        overlays: this.state.overlays,
        archivedSnapshots: Object.entries(this.state.archivedSnapshots).map(([id, data]) => ({
          id,
          ...(data as Record<string, unknown>),
        })),
      });
    });

    app.post('/api/admin2/cms/drafts', this.requireAuth('news.create'), (req: Admin2Request, res) => {
      const body = req.body || {};
      const titleKannada = String(body.titleKannada || '').trim();
      const bodyKannada = Array.isArray(body.bodyKannada)
        ? body.bodyKannada.map((p: unknown) => String(p || '').trim()).filter(Boolean)
        : [];
      if (!titleKannada) {
        res.status(400).json({ ok: false, error: 'Headline is required to save a draft.' });
        return;
      }

      const requestedStatus =
        body.status === 'scheduled' || body.status === 'archived' ? body.status : 'draft';
      const aiGenerated = Boolean(body.aiGenerated);
      const canPublish =
        req.admin2User!.protectedSuperAdmin ||
        req.admin2User!.role === 'super_admin' ||
        req.admin2User!.permissions.includes('news.publish');

      // Enforce: AI-generated drafts remain drafts unless an authorized editor explicitly approves & schedules
      const finalStatus = requestedStatus === 'scheduled' && !canPublish ? 'draft' : requestedStatus;
      const nowIso = new Date().toISOString();

      const draft: Admin2ManagedDraft = {
        id: makeId('draft'),
        customSlug: typeof body.customSlug === 'string' ? body.customSlug.trim() : undefined,
        titleKannada,
        summaryKannada: String(body.summaryKannada || stripMarkup(bodyKannada[0] || titleKannada)).trim(),
        bodyKannada: bodyKannada.length > 0 ? bodyKannada : [String(body.summaryKannada || titleKannada).trim()],
        category: String(body.category || 'Local'),
        location: String(body.location || 'ಕೊಪ್ಪ'),
        reporter: String(body.reporter || req.admin2User!.fullName || 'Coffeenadu Desk'),
        language:
          body.language === 'English' || body.language === 'Bilingual' ? body.language : 'Kannada',
        imageKey: typeof body.imageKey === 'string' ? body.imageKey : 'none',
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
        imageThumbUrl: typeof body.imageThumbUrl === 'string' ? body.imageThumbUrl : undefined,
        imageDriveId: typeof body.imageDriveId === 'string' ? body.imageDriveId : undefined,
        imageCaption: typeof body.imageCaption === 'string' ? body.imageCaption : undefined,
        extraImages: Array.isArray(body.extraImages) ? body.extraImages : undefined,
        isFeatured: Boolean(body.isFeatured),
        featuredUntil: typeof body.featuredUntil === 'number' ? body.featuredUntil : undefined,
        watermarkApplied: Boolean(body.watermarkApplied),
        status: finalStatus,
        scheduledFor:
          finalStatus === 'scheduled' && typeof body.scheduledFor === 'string'
            ? body.scheduledFor
            : undefined,
        aiGenerated,
        approvedBy: finalStatus === 'scheduled' && canPublish ? req.admin2User!.email : undefined,
        seo: body.seo && typeof body.seo === 'object' ? (body.seo as ArticleSeoMeta) : undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: req.admin2User!.email,
      };

      this.state.drafts.unshift(draft);
      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: finalStatus === 'scheduled' ? 'news.scheduled' : 'news.draft_created',
        targetType: 'draft',
        targetId: draft.id,
        details: `${aiGenerated ? '[AI Draft] ' : ''}${stripMarkup(draft.titleKannada).slice(0, 120)}`,
        severity: 'info',
      });
      this.persistStateNow();
      res.status(201).json({ ok: true, draft });
    });

    app.put('/api/admin2/cms/drafts/:id', this.requireAuth('news.edit'), (req: Admin2Request, res) => {
      const idx = this.state.drafts.findIndex((d) => d.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ ok: false, error: 'Draft not found.' });
        return;
      }
      const existing = this.state.drafts[idx];
      const body = req.body || {};
      const canPublish =
        req.admin2User!.protectedSuperAdmin ||
        req.admin2User!.role === 'super_admin' ||
        req.admin2User!.permissions.includes('news.publish');

      const nextStatus =
        body.status === 'scheduled' || body.status === 'archived' || body.status === 'draft'
          ? body.status
          : existing.status;

      if (nextStatus === 'scheduled' && !canPublish) {
        res.status(403).json({ ok: false, error: 'Scheduling articles requires news.publish permission.' });
        return;
      }

      const updated: Admin2ManagedDraft = {
        ...existing,
        customSlug: body.customSlug !== undefined ? String(body.customSlug || '').trim() || undefined : existing.customSlug,
        titleKannada: body.titleKannada !== undefined ? String(body.titleKannada).trim() : existing.titleKannada,
        summaryKannada: body.summaryKannada !== undefined ? String(body.summaryKannada).trim() : existing.summaryKannada,
        bodyKannada: Array.isArray(body.bodyKannada) ? body.bodyKannada : existing.bodyKannada,
        category: body.category !== undefined ? String(body.category) : existing.category,
        location: body.location !== undefined ? String(body.location) : existing.location,
        reporter: body.reporter !== undefined ? String(body.reporter) : existing.reporter,
        language:
          body.language === 'Kannada' || body.language === 'English' || body.language === 'Bilingual'
            ? body.language
            : existing.language,
        imageKey: body.imageKey !== undefined ? String(body.imageKey) : existing.imageKey,
        imageUrl: body.imageUrl !== undefined ? String(body.imageUrl || '') || undefined : existing.imageUrl,
        imageThumbUrl:
          body.imageThumbUrl !== undefined ? String(body.imageThumbUrl || '') || undefined : existing.imageThumbUrl,
        imageDriveId:
          body.imageDriveId !== undefined ? String(body.imageDriveId || '') || undefined : existing.imageDriveId,
        imageCaption:
          body.imageCaption !== undefined ? String(body.imageCaption || '') || undefined : existing.imageCaption,
        extraImages: Array.isArray(body.extraImages) ? body.extraImages : existing.extraImages,
        isFeatured: body.isFeatured !== undefined ? Boolean(body.isFeatured) : existing.isFeatured,
        featuredUntil: body.featuredUntil !== undefined ? body.featuredUntil : existing.featuredUntil,
        watermarkApplied:
          body.watermarkApplied !== undefined ? Boolean(body.watermarkApplied) : existing.watermarkApplied,
        status: nextStatus,
        scheduledFor:
          nextStatus === 'scheduled'
            ? String(body.scheduledFor || existing.scheduledFor || '') || undefined
            : undefined,
        approvedBy: nextStatus === 'scheduled' && canPublish ? req.admin2User!.email : existing.approvedBy,
        seo: body.seo !== undefined ? (body.seo as ArticleSeoMeta) : existing.seo,
        updatedAt: new Date().toISOString(),
      };

      this.state.drafts[idx] = updated;
      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: 'news.draft_updated',
        targetType: 'draft',
        targetId: updated.id,
        details: `Updated draft (${updated.status}): ${stripMarkup(updated.titleKannada).slice(0, 110)}`,
        severity: 'info',
      });
      this.persistStateNow();
      res.json({ ok: true, draft: updated });
    });

    app.post('/api/admin2/cms/drafts/:id/publish', this.requireAuth('news.publish'), async (req: Admin2Request, res) => {
      const draft = this.state.drafts.find((d) => d.id === req.params.id);
      if (!draft) {
        res.status(404).json({ ok: false, error: 'Draft not found.' });
        return;
      }

      try {
        const created = await this.sheetsStorage.createNewsFromServer(
          {
            newsId: draft.customSlug || undefined,
            isCustomSlug: Boolean(draft.customSlug),
            title: draft.titleKannada,
            description: draft.summaryKannada,
            fullContent: draft.bodyKannada,
            extraImages: draft.extraImages || [],
            category: draft.category || 'Local',
            location: draft.location || 'ಕೊಪ್ಪ',
            language: draft.language === 'English' ? 'en' : 'kn',
            imageUrl: draft.imageUrl || '',
            imageThumbUrl: draft.imageThumbUrl || '',
            imageDriveId: draft.imageDriveId || '',
            imageCaption: draft.imageCaption || '',
            imageKey: draft.imageKey || 'none',
            watermarkApplied: Boolean(draft.watermarkApplied),
            author: draft.reporter || 'Coffeenadu Desk',
            featured: Boolean(draft.isFeatured),
            featuredUntil: draft.featuredUntil ?? '',
          },
          req.admin2User!.email
        );

        if (!created.ok || !created.newsId) {
          res.status(400).json({ ok: false, error: created.error || 'Unable to publish draft to Google Sheets.' });
          return;
        }

        this.state.drafts = this.state.drafts.filter((d) => d.id !== draft.id);
        this.state.overlays[created.newsId] = {
          articleId: created.newsId,
          status: 'published',
          language: draft.language || 'Kannada',
          aiGenerated: draft.aiGenerated,
          seo: draft.seo,
          revisions: [
            {
              id: makeId('rev'),
              timestamp: new Date().toISOString(),
              editorEmail: req.admin2User!.email,
              summary: draft.aiGenerated
                ? 'Editor approved & published AI-assisted draft'
                : 'Published draft to live site',
              titleSnapshot: stripMarkup(draft.titleKannada).slice(0, 140),
              statusSnapshot: 'published',
            },
          ],
        };
        this.persistStateNow();
        res.json({ ok: true, newsId: created.newsId, item: created.item });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Publish failed.' });
      }
    });

    app.delete('/api/admin2/cms/drafts/:id', this.requireAuth('news.delete'), (req: Admin2Request, res) => {
      const before = this.state.drafts.length;
      this.state.drafts = this.state.drafts.filter((d) => d.id !== req.params.id);
      if (this.state.drafts.length === before) {
        res.status(404).json({ ok: false, error: 'Draft not found.' });
        return;
      }
      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: 'news.draft_deleted',
        targetType: 'draft',
        targetId: String(req.params.id),
        details: 'Deleted draft permanently',
        severity: 'warning',
      });
      this.persistStateNow();
      res.json({ ok: true });
    });

    app.post('/api/admin2/cms/articles/:id/archive', this.requireAuth('news.archive'), async (req: Admin2Request, res) => {
      const articleId = String(req.params.id || '').trim();
      const snapshot = req.body?.articleSnapshot;
      if (!articleId || !snapshot || typeof snapshot !== 'object') {
        res.status(400).json({ ok: false, error: 'Article snapshot is required to safely archive.' });
        return;
      }

      try {
        // Save full snapshot BEFORE removing from live sheet so 100% can be restored later
        this.state.archivedSnapshots[articleId] = {
          ...snapshot,
          archivedAt: new Date().toISOString(),
          archivedBy: req.admin2User!.email,
        };
        const del = await this.sheetsStorage.deleteNewsFromServer(articleId, req.admin2User!.email, false);
        if (!del.ok) {
          delete this.state.archivedSnapshots[articleId];
          res.status(400).json({ ok: false, error: del.error || 'Could not archive article.' });
          return;
        }
        const existingOverlay = this.state.overlays[articleId] || {
          articleId,
          status: 'archived' as const,
          language: 'Kannada' as const,
          revisions: [],
        };
        existingOverlay.status = 'archived';
        existingOverlay.archivedAt = new Date().toISOString();
        this.state.overlays[articleId] = existingOverlay;
        this.appendRevision(
          articleId,
          req.admin2User!.email,
          'Unpublished & moved to Archive',
          String((snapshot as { titleKannada?: string }).titleKannada || articleId),
          'archived'
        );
        this.persistStateNow();
        res.json({ ok: true });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Archive failed.' });
      }
    });

    app.post('/api/admin2/cms/articles/:id/restore', this.requireAuth('news.publish'), async (req: Admin2Request, res) => {
      const articleId = String(req.params.id || '').trim();
      const snapshot = this.state.archivedSnapshots[articleId] as Record<string, unknown> | undefined;
      if (!snapshot) {
        res.status(404).json({ ok: false, error: 'Archived snapshot not found.' });
        return;
      }

      try {
        const restored = await this.sheetsStorage.createNewsFromServer(
          {
            newsId: articleId,
            title: snapshot.titleKannada || snapshot.title || '',
            description: snapshot.summaryKannada || snapshot.description || '',
            fullContent: snapshot.bodyKannada || snapshot.fullContent || [],
            extraImages: snapshot.extraImages || [],
            category: snapshot.category || 'Local',
            location: snapshot.location || 'ಕೊಪ್ಪ',
            imageUrl: snapshot.imageUrl || '',
            imageThumbUrl: snapshot.imageThumbUrl || '',
            imageDriveId: snapshot.imageDriveId || '',
            imageCaption: snapshot.imageCaption || '',
            imageKey: snapshot.imageKey || 'none',
            watermarkApplied: Boolean(snapshot.watermarkApplied),
            author: snapshot.reporter || 'Coffeenadu Desk',
            featured: Boolean(snapshot.isFeatured),
            featuredUntil: snapshot.featuredUntil ?? '',
          },
          req.admin2User!.email
        );

        if (!restored.ok) {
          res.status(400).json({ ok: false, error: restored.error || 'Could not restore archived article.' });
          return;
        }

        delete this.state.archivedSnapshots[articleId];
        if (this.state.overlays[articleId]) {
          this.state.overlays[articleId].status = 'published';
          this.state.overlays[articleId].archivedAt = undefined;
        }
        this.appendRevision(
          articleId,
          req.admin2User!.email,
          'Restored from Archive to live site',
          String(snapshot.titleKannada || articleId),
          'published'
        );
        this.persistStateNow();
        res.json({ ok: true, newsId: restored.newsId || articleId });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Restore failed.' });
      }
    });

    app.put('/api/admin2/cms/articles/:id/meta', this.requireAuth('news.edit'), (req: Admin2Request, res) => {
      const articleId = String(req.params.id || '').trim();
      if (!articleId) {
        res.status(400).json({ ok: false, error: 'Article ID required.' });
        return;
      }
      const existing = this.state.overlays[articleId] || {
        articleId,
        status: 'published' as const,
        language: 'Kannada' as const,
        revisions: [],
      };
      if (
        req.body?.language === 'Kannada' ||
        req.body?.language === 'English' ||
        req.body?.language === 'Bilingual'
      ) {
        existing.language = req.body.language;
      }
      if (req.body?.seo && typeof req.body.seo === 'object') {
        existing.seo = { ...(existing.seo || {}), ...(req.body.seo as ArticleSeoMeta) };
      }
      this.state.overlays[articleId] = existing;
      this.persistStateNow();
      res.json({ ok: true, overlay: existing });
    });

    // -------------------------------------------------------------------------
    // 5. AI NEWS STUDIO
    // -------------------------------------------------------------------------

    app.post('/api/admin2/ai/assist', this.requireAuth('ai.use'), async (req: Admin2Request, res) => {
      const tool = String(req.body?.tool || '') as AiStudioTool;
      const sourceMaterial = String(req.body?.sourceMaterial || '').trim();
      if (!tool || sourceMaterial.length < 10) {
        res.status(400).json({
          ok: false,
          error: 'Please select an AI tool and provide source material (at least 10 characters).',
        });
        return;
      }

      const result = await this.runAiStudioAssist({
        tool,
        sourceMaterial,
        headlineHint: typeof req.body?.headlineHint === 'string' ? req.body.headlineHint : undefined,
        category: typeof req.body?.category === 'string' ? req.body.category : undefined,
        location: typeof req.body?.location === 'string' ? req.body.location : undefined,
        tone: typeof req.body?.tone === 'string' ? req.body.tone : undefined,
      });

      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: `ai.${tool}`,
        targetType: 'ai_studio',
        targetId: tool,
        details: result.ok ? `AI News Studio generated draft assist (${tool})` : `AI assist error: ${result.error}`,
        severity: result.ok ? 'info' : 'warning',
      });

      res.status(result.ok ? 200 : 502).json(result);
    });

    // -------------------------------------------------------------------------
    // 6. MEDIA CENTRE
    // -------------------------------------------------------------------------

    app.get('/api/admin2/media', this.requireAuth('media.manage'), async (_req, res) => {
      try {
        const assets = await this.buildMediaCatalog();
        const shaCounts = new Map<string, number>();
        for (const a of assets) {
          if (a.sha256) shaCounts.set(a.sha256, (shaCounts.get(a.sha256) || 0) + 1);
        }
        const duplicateSha = Array.from(shaCounts.entries())
          .filter(([, count]) => count > 1)
          .map(([hash]) => hash);

        res.json({
          ok: true,
          assets,
          folders: this.state.mediaFolders,
          duplicateHashes: duplicateSha,
          driveCache: this.sheetsStorage.getDriveCacheStats(),
        });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Unable to load media.' });
      }
    });

    app.post('/api/admin2/media/register', this.requireAuth('media.manage'), (req: Admin2Request, res) => {
      const imageUrl = String(req.body?.imageUrl || '').trim();
      if (!imageUrl) {
        res.status(400).json({ ok: false, error: 'imageUrl is required.' });
        return;
      }
      const id = String(req.body?.driveFileId || makeId('media'));
      const folder = String(req.body?.folder || 'General News').trim() || 'General News';
      if (!this.state.mediaFolders.includes(folder)) {
        this.state.mediaFolders.push(folder);
      }

      const sha = typeof req.body?.sha256 === 'string' ? req.body.sha256 : undefined;
      const existingDuplicate = sha
        ? Object.values(this.state.mediaMetadata).find((m) => m.sha256 === sha && m.imageUrl !== imageUrl)
        : undefined;

      this.state.mediaMetadata[imageUrl] = {
        id,
        driveFileId: typeof req.body?.driveFileId === 'string' ? req.body.driveFileId : undefined,
        imageUrl,
        thumbUrl: typeof req.body?.thumbUrl === 'string' ? req.body.thumbUrl : imageUrl,
        fileName: String(req.body?.fileName || 'coffeenadu-photo.jpg'),
        folder,
        mimeType: String(req.body?.mimeType || 'image/jpeg'),
        sizeBytes: typeof req.body?.sizeBytes === 'number' ? req.body.sizeBytes : undefined,
        sha256: sha,
        watermarkApplied: Boolean(req.body?.watermarkApplied),
        middleOverlayApplied: Boolean(req.body?.middleOverlayApplied),
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.admin2User!.email,
        processingHistory: Array.isArray(req.body?.processingHistory)
          ? req.body.processingHistory.map((s: unknown) => String(s))
          : ['Uploaded to Google Drive'],
      };
      this.persistStateNow();
      res.status(201).json({
        ok: true,
        asset: this.state.mediaMetadata[imageUrl],
        duplicateOf: existingDuplicate?.fileName || null,
      });
    });

    app.patch('/api/admin2/media/folder', this.requireAuth('media.manage'), (req: Admin2Request, res) => {
      const imageUrl = String(req.body?.imageUrl || '').trim();
      const folder = String(req.body?.folder || '').trim();
      if (!imageUrl || !folder) {
        res.status(400).json({ ok: false, error: 'imageUrl and folder are required.' });
        return;
      }
      if (!this.state.mediaFolders.includes(folder)) {
        this.state.mediaFolders.push(folder);
      }
      const existing = this.state.mediaMetadata[imageUrl] || {
        id: sha256Hex(imageUrl).slice(0, 14),
        imageUrl,
        fileName: 'news-photo.jpg',
        folder,
        mimeType: 'image/jpeg',
        watermarkApplied: true,
        middleOverlayApplied: true,
        uploadedAt: new Date().toISOString(),
        processingHistory: ['Organized in Media Centre'],
      };
      existing.folder = folder;
      existing.processingHistory = [`Moved to folder "${folder}"`, ...existing.processingHistory].slice(0, 15);
      this.state.mediaMetadata[imageUrl] = existing;
      this.persistStateNow();
      res.json({ ok: true, folders: this.state.mediaFolders });
    });

    app.post('/api/admin2/media/folders', this.requireAuth('media.manage'), (req, res) => {
      const name = String(req.body?.name || '').trim().slice(0, 48);
      if (!name) {
        res.status(400).json({ ok: false, error: 'Folder name is required.' });
        return;
      }
      if (!this.state.mediaFolders.includes(name)) {
        this.state.mediaFolders.push(name);
        this.persistStateNow();
      }
      res.status(201).json({ ok: true, folders: this.state.mediaFolders });
    });

    // -------------------------------------------------------------------------
    // 8. NOTIFICATION CENTRE
    // -------------------------------------------------------------------------

    app.get('/api/admin2/notifications', this.requireAuth('dashboard.view'), (_req, res) => {
      res.json({
        ok: true,
        notifications: this.state.notifications,
        unreadCount: this.state.notifications.filter((n) => !n.read).length,
        preferences: this.state.notificationPreferences,
      });
    });

    app.post('/api/admin2/notifications/read', this.requireAuth('dashboard.view'), (req, res) => {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      const markAll = Boolean(req.body?.all);
      if (markAll) {
        for (const n of this.state.notifications) n.read = true;
      } else if (id) {
        const target = this.state.notifications.find((n) => n.id === id);
        if (target) target.read = true;
      }
      this.schedulePersist();
      res.json({
        ok: true,
        unreadCount: this.state.notifications.filter((n) => !n.read).length,
      });
    });

    app.put('/api/admin2/notifications/preferences', this.requireAuth('dashboard.view'), (req: Admin2Request, res) => {
      const incoming = req.body || {};
      this.state.notificationPreferences = {
        publishingSuccess:
          incoming.publishingSuccess !== undefined
            ? Boolean(incoming.publishingSuccess)
            : this.state.notificationPreferences.publishingSuccess,
        publishingFailure:
          incoming.publishingFailure !== undefined
            ? Boolean(incoming.publishingFailure)
            : this.state.notificationPreferences.publishingFailure,
        imageProcessing:
          incoming.imageProcessing !== undefined
            ? Boolean(incoming.imageProcessing)
            : this.state.notificationPreferences.imageProcessing,
        backupAlerts:
          incoming.backupAlerts !== undefined
            ? Boolean(incoming.backupAlerts)
            : this.state.notificationPreferences.backupAlerts,
        storageWarnings:
          incoming.storageWarnings !== undefined
            ? Boolean(incoming.storageWarnings)
            : this.state.notificationPreferences.storageWarnings,
        automationErrors:
          incoming.automationErrors !== undefined
            ? Boolean(incoming.automationErrors)
            : this.state.notificationPreferences.automationErrors,
        adminSecurityActivity:
          incoming.adminSecurityActivity !== undefined
            ? Boolean(incoming.adminSecurityActivity)
            : this.state.notificationPreferences.adminSecurityActivity,
        readerMessages:
          incoming.readerMessages !== undefined
            ? Boolean(incoming.readerMessages)
            : this.state.notificationPreferences.readerMessages,
      };
      this.persistStateNow();
      res.json({ ok: true, preferences: this.state.notificationPreferences });
    });

    // -------------------------------------------------------------------------
    // 9. ANALYTICS CENTRE
    // -------------------------------------------------------------------------

    app.get('/api/admin2/analytics', this.requireAuth('analytics.view'), async (req, res) => {
      try {
        const rangeDays = Number(req.query.days) || 14;
        const news = await this.sheetsStorage.getAllNewsForAdmin();
        const summary = this.buildAnalyticsSummary(news, rangeDays);
        res.json({ ok: true, ...summary });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Analytics load failed.' });
      }
    });

    // -------------------------------------------------------------------------
    // 10. SEO MANAGEMENT
    // -------------------------------------------------------------------------

    app.get('/api/admin2/seo/audit', this.requireAuth('seo.manage'), async (_req, res) => {
      try {
        const news = await this.sheetsStorage.getAllNewsForAdmin();
        const audit = this.buildSeoAudit(news);
        res.json({ ok: true, ...audit });
      } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'SEO audit failed.' });
      }
    });

    app.put('/api/admin2/seo/article/:id', this.requireAuth('seo.manage'), (req: Admin2Request, res) => {
      const articleId = String(req.params.id || '').trim();
      const existing = this.state.overlays[articleId] || {
        articleId,
        status: 'published' as const,
        language: 'Kannada' as const,
        revisions: [],
      };
      existing.seo = {
        ...(existing.seo || {}),
        seoTitle: typeof req.body?.seoTitle === 'string' ? req.body.seoTitle.trim().slice(0, 120) : existing.seo?.seoTitle,
        metaDescription:
          typeof req.body?.metaDescription === 'string'
            ? req.body.metaDescription.trim().slice(0, 300)
            : existing.seo?.metaDescription,
        canonicalUrl:
          typeof req.body?.canonicalUrl === 'string'
            ? req.body.canonicalUrl.trim().slice(0, 260)
            : existing.seo?.canonicalUrl,
        ogTitle: typeof req.body?.ogTitle === 'string' ? req.body.ogTitle.trim().slice(0, 120) : existing.seo?.ogTitle,
        ogDescription:
          typeof req.body?.ogDescription === 'string'
            ? req.body.ogDescription.trim().slice(0, 300)
            : existing.seo?.ogDescription,
        imageAltText:
          typeof req.body?.imageAltText === 'string'
            ? req.body.imageAltText.trim().slice(0, 200)
            : existing.seo?.imageAltText,
        focusKeyword:
          typeof req.body?.focusKeyword === 'string'
            ? req.body.focusKeyword.trim().slice(0, 80)
            : existing.seo?.focusKeyword,
      };
      this.state.overlays[articleId] = existing;
      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: 'seo.article_updated',
        targetType: 'article',
        targetId: articleId,
        details: `Updated SEO metadata for ${articleId}`,
        severity: 'info',
      });
      this.persistStateNow();
      res.json({ ok: true, seo: existing.seo });
    });

    // -------------------------------------------------------------------------
    // 11. AUTOMATION CENTRE
    // -------------------------------------------------------------------------

    app.get('/api/admin2/automations', this.requireAuth('automations.manage'), (_req, res) => {
      res.json({ ok: true, automations: this.state.automations });
    });

    app.patch('/api/admin2/automations/:id', this.requireAuth('automations.manage'), (req: Admin2Request, res) => {
      const auto = this.state.automations.find((a) => a.id === req.params.id);
      if (!auto) {
        res.status(404).json({ ok: false, error: 'Automation not found.' });
        return;
      }
      if (typeof req.body?.enabled === 'boolean') {
        auto.enabled = req.body.enabled;
        auto.status = auto.enabled ? (auto.lastError ? 'error' : 'active') : 'paused';
      }
      if (req.body?.config && typeof req.body.config === 'object') {
        // Never allow disabling the human approval safety lock on scheduled publishing
        const safeConfig = { ...auto.config, ...req.body.config };
        if (auto.id === 'auto-scheduled-publisher') {
          safeConfig.blockUnapprovedAiDrafts = true;
        }
        auto.config = safeConfig;
      }
      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: 'automation.updated',
        targetType: 'automation',
        targetId: auto.id,
        details: `${auto.name} set to ${auto.enabled ? 'enabled' : 'paused'}`,
        severity: 'info',
      });
      this.persistStateNow();
      res.json({ ok: true, automation: auto });
    });

    app.post('/api/admin2/automations/:id/run', this.requireAuth('automations.manage'), async (req: Admin2Request, res) => {
      const auto = this.state.automations.find((a) => a.id === req.params.id);
      if (!auto) {
        res.status(404).json({ ok: false, error: 'Automation not found.' });
        return;
      }
      const start = Date.now();
      try {
        let summary = 'Completed';
        if (auto.id === 'auto-cache-invalidation') {
          this.sheetsStorage.invalidateAllCaches();
          summary = 'Server Google Sheets read caches invalidated cleanly.';
        } else if (auto.id === 'auto-view-batch-flusher') {
          const flush = await this.sheetsStorage.flushPendingViews();
          summary = flush.flushed
            ? `Flushed ${flush.count} article/event view batch(es) to Google Sheets.`
            : 'No pending views needed flushing.';
        } else if (auto.id === 'auto-scheduled-publisher') {
          const cycle = await this.runScheduledPublishingCycle();
          summary = `Checked scheduled queue: ${cycle.publishedCount} published, ${cycle.skippedCount} awaiting editor approval.`;
        } else if (auto.id === 'auto-daily-backup') {
          const backup = await this.sheetsStorage.triggerBackupFromServer(req.admin2User!.email);
          if (!backup?.ok) throw new Error(String(backup?.error || 'Backup call failed.'));
          summary = `Backup created in Google Drive (${String(backup.fileName || 'snapshot')}).`;
        } else if (auto.id === 'auto-drive-image-optimization') {
          const stats = this.sheetsStorage.getDriveCacheStats();
          summary = `Verified Drive image cache: ${stats.fileCount} cached image file(s) ready.`;
        } else if (auto.id === 'auto-daily-report') {
          const news = await this.sheetsStorage.getAllNewsForAdmin();
          const todayBucket = this.state.trafficByDay[getTodayKey()];
          summary = `Daily Digest: ${news.length} live articles, ${todayBucket?.pageViews || 0} page views today.`;
          this.addNotification({
            category: 'storage',
            severity: 'info',
            title: 'Daily Editorial & Traffic Report',
            message: summary,
          });
        } else if (auto.id === 'auto-error-security-alerts') {
          const failedLogins24h = this.state.loginHistory.filter(
            (l) => !l.success && Date.now() - Date.parse(l.timestamp) < 24 * 60 * 60 * 1000
          ).length;
          summary = `Security scan complete: ${failedLogins24h} failed login(s) in last 24h, ${this.state.sessions.length} active session(s).`;
        } else {
          summary = `${auto.name} verified active.`;
        }

        this.recordAutomationRun(auto.id, 'success', Date.now() - start, summary);
        this.addAuditLog({
          actorEmail: req.admin2User!.email,
          actorRole: req.admin2User!.role,
          action: 'automation.manual_run',
          targetType: 'automation',
          targetId: auto.id,
          details: summary,
          severity: 'info',
        });
        res.json({ ok: true, summary, automation: auto });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Automation execution failed.';
        this.recordAutomationRun(auto.id, 'error', Date.now() - start, message, message);
        res.status(502).json({ ok: false, error: message, automation: auto });
      }
    });

    // -------------------------------------------------------------------------
    // 12. ADMINISTRATOR MANAGEMENT (MULTI-ADMIN RBAC WITH DELEGATED SAFEGUARDS)
    // -------------------------------------------------------------------------

    app.get('/api/admin2/admins', this.requireAuth('admins.manage'), (_req, res) => {
      res.json({
        ok: true,
        accounts: this.state.accounts.map((a) => this.toPublicAccount(a)),
        allPermissions: ALL_ADMIN_PERMISSIONS,
        roleDefaults: ROLE_DEFAULT_PERMISSIONS,
      });
    });

    app.post('/api/admin2/admins', this.requireAuth('admins.manage'), (req: Admin2Request, res) => {
      const actor = req.admin2User!;
      const fullName = String(req.body?.fullName || '').trim().slice(0, 100);
      const email = String(req.body?.email || '').trim().toLowerCase();
      const role = String(req.body?.role || 'editor') as AdminRole;
      const customRoleLabel =
        role === 'custom' && typeof req.body?.customRoleLabel === 'string'
          ? req.body.customRoleLabel.trim().slice(0, 50)
          : undefined;

      if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ ok: false, error: 'Valid full name and email address are required.' });
        return;
      }
      if (!VALID_ROLES.has(role)) {
        res.status(400).json({ ok: false, error: 'Invalid administrator role.' });
        return;
      }
      if (this.state.accounts.some((a) => a.email.toLowerCase() === email)) {
        res.status(409).json({ ok: false, error: `An administrator account for ${email} already exists.` });
        return;
      }

      // Delegated admin safeguards
      const actorIsSuper = actor.protectedSuperAdmin || actor.role === 'super_admin';
      if (role === 'super_admin' && !actorIsSuper) {
        res.status(403).json({ ok: false, error: 'Only a Super Admin can create Super Admin accounts.' });
        return;
      }

      const requestedPermissions = sanitizePermissions(req.body?.permissions, role);
      if (!actorIsSuper) {
        const disallowed = requestedPermissions.filter((p) => !actor.permissions.includes(p));
        if (disallowed.length > 0) {
          res.status(403).json({
            ok: false,
            error: `Delegated administrators cannot grant permissions they do not hold (${disallowed.join(', ')}).`,
          });
          return;
        }
      }

      const rawActivationToken = crypto.randomBytes(24).toString('hex');
      const newAccount: Admin2AccountRecord = {
        id: makeId('adm'),
        fullName,
        email,
        role,
        customRoleLabel,
        permissions: role === 'super_admin' ? [...ROLE_DEFAULT_PERMISSIONS.super_admin] : requestedPermissions,
        status: 'pending_activation',
        protectedSuperAdmin: false,
        activationTokenHash: sha256Hex(rawActivationToken),
        activationExpiresAt: Date.now() + ACTION_TOKEN_TTL_MS,
        createdAt: new Date().toISOString(),
        createdBy: actor.email,
      };

      this.state.accounts.push(newAccount);
      this.addAuditLog({
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'admins.created',
        targetType: 'admin_account',
        targetId: newAccount.id,
        details: `Created ${role} account for ${fullName} (${email}) with ${newAccount.permissions.length} permission(s).`,
        severity: 'warning',
        ip: getClientIp(req),
      });
      this.addNotification({
        category: 'security',
        severity: 'info',
        title: 'New Administrator Invited',
        message: `${actor.email} created a ${role} account for ${fullName} (${email}).`,
        entityId: newAccount.id,
      });
      this.persistStateNow();

      res.status(201).json({
        ok: true,
        account: this.toPublicAccount(newAccount),
        activationToken: rawActivationToken,
        activationPath: `/admin?activate=${rawActivationToken}`,
        expiresInHours: 48,
      });
    });

    app.patch('/api/admin2/admins/:id', this.requireAuth('admins.manage'), (req: Admin2Request, res) => {
      const actor = req.admin2User!;
      const target = this.state.accounts.find((a) => a.id === req.params.id);
      if (!target) {
        res.status(404).json({ ok: false, error: 'Administrator account not found.' });
        return;
      }

      const actorIsSuper = actor.protectedSuperAdmin || actor.role === 'super_admin';
      if (target.protectedSuperAdmin) {
        res.status(403).json({
          ok: false,
          error: 'Protected Super Admin accounts cannot be downgraded, modified, or suspended.',
        });
        return;
      }
      if (target.role === 'super_admin' && !actorIsSuper) {
        res.status(403).json({ ok: false, error: 'Only a Super Admin can modify another Super Admin.' });
        return;
      }

      if (typeof req.body?.fullName === 'string' && req.body.fullName.trim()) {
        target.fullName = req.body.fullName.trim().slice(0, 100);
      }
      if (typeof req.body?.role === 'string' && VALID_ROLES.has(req.body.role as AdminRole)) {
        const nextRole = req.body.role as AdminRole;
        if (nextRole === 'super_admin' && !actorIsSuper) {
          res.status(403).json({ ok: false, error: 'Cannot escalate account to Super Admin.' });
          return;
        }
        target.role = nextRole;
      }
      if (req.body?.customRoleLabel !== undefined) {
        target.customRoleLabel =
          target.role === 'custom' ? String(req.body.customRoleLabel || '').trim().slice(0, 50) : undefined;
      }
      if (Array.isArray(req.body?.permissions)) {
        const nextPerms = sanitizePermissions(req.body.permissions, target.role);
        if (!actorIsSuper) {
          const disallowed = nextPerms.filter((p) => !actor.permissions.includes(p));
          if (disallowed.length > 0) {
            res.status(403).json({
              ok: false,
              error: `Cannot grant permissions beyond your own role: ${disallowed.join(', ')}`,
            });
            return;
          }
        }
        target.permissions =
          target.role === 'super_admin' ? [...ROLE_DEFAULT_PERMISSIONS.super_admin] : nextPerms;
      }
      if (req.body?.status === 'active' || req.body?.status === 'suspended') {
        target.status = req.body.status;
        if (target.status === 'suspended') {
          this.state.sessions = this.state.sessions.filter((s) => s.accountId !== target.id);
          this.revokeRememberedDevicesForAccount(target.id);
        }
      }

      this.addAuditLog({
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'admins.updated',
        targetType: 'admin_account',
        targetId: target.id,
        details: `Updated ${target.email} (role=${target.role}, status=${target.status})`,
        severity: 'warning',
        ip: getClientIp(req),
      });
      this.persistStateNow();
      res.json({ ok: true, account: this.toPublicAccount(target) });
    });

    app.post('/api/admin2/admins/:id/reset-link', this.requireAuth('admins.manage'), (req: Admin2Request, res) => {
      const actor = req.admin2User!;
      const target = this.state.accounts.find((a) => a.id === req.params.id);
      if (!target) {
        res.status(404).json({ ok: false, error: 'Account not found.' });
        return;
      }
      if (target.protectedSuperAdmin && !actor.protectedSuperAdmin) {
        res.status(403).json({ ok: false, error: 'Cannot generate reset link for a protected Super Admin.' });
        return;
      }

      const rawToken = crypto.randomBytes(24).toString('hex');
      const isActivation = target.status === 'pending_activation';
      if (isActivation) {
        target.activationTokenHash = sha256Hex(rawToken);
        target.activationExpiresAt = Date.now() + ACTION_TOKEN_TTL_MS;
      } else {
        target.resetTokenHash = sha256Hex(rawToken);
        target.resetExpiresAt = Date.now() + ACTION_TOKEN_TTL_MS;
      }

      this.addAuditLog({
        actorEmail: actor.email,
        actorRole: actor.role,
        action: isActivation ? 'admins.activation_reissued' : 'admins.reset_issued',
        targetType: 'admin_account',
        targetId: target.id,
        details: `Issued one-time ${isActivation ? 'activation' : 'password reset'} link for ${target.email}`,
        severity: 'warning',
        ip: getClientIp(req),
      });
      this.persistStateNow();
      res.json({
        ok: true,
        kind: isActivation ? 'activate' : 'reset',
        token: rawToken,
        path: isActivation ? `/admin?activate=${rawToken}` : `/admin?reset=${rawToken}`,
        expiresInHours: 48,
      });
    });

    app.post('/api/admin2/admins/:id/revoke-sessions', this.requireAuth('admins.manage'), (req: Admin2Request, res) => {
      const target = this.state.accounts.find((a) => a.id === req.params.id);
      if (!target) {
        res.status(404).json({ ok: false, error: 'Account not found.' });
        return;
      }
      const before = this.state.sessions.length;
      this.state.sessions = this.state.sessions.filter((s) => s.accountId !== target.id);
      this.revokeRememberedDevicesForAccount(target.id);
      const revokedCount = before - this.state.sessions.length;

      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: 'security.sessions_revoked',
        targetType: 'admin_account',
        targetId: target.id,
        details: `Revoked ${revokedCount} active session(s) for ${target.email}`,
        severity: 'warning',
        ip: getClientIp(req),
      });
      this.persistStateNow();
      res.json({ ok: true, revokedCount });
    });

    app.delete('/api/admin2/admins/:id', this.requireAuth('admins.manage'), (req: Admin2Request, res) => {
      const actor = req.admin2User!;
      const target = this.state.accounts.find((a) => a.id === req.params.id);
      if (!target) {
        res.status(404).json({ ok: false, error: 'Account not found.' });
        return;
      }
      if (target.protectedSuperAdmin) {
        res.status(403).json({ ok: false, error: 'Protected Super Admin accounts cannot be deleted.' });
        return;
      }
      if (target.id === actor.id) {
        res.status(400).json({ ok: false, error: 'You cannot delete your own active account.' });
        return;
      }
      if (target.role === 'super_admin' && !actor.protectedSuperAdmin) {
        res.status(403).json({ ok: false, error: 'Only a protected Super Admin can remove a Super Admin.' });
        return;
      }

      this.state.accounts = this.state.accounts.filter((a) => a.id !== target.id);
      this.state.sessions = this.state.sessions.filter((s) => s.accountId !== target.id);
      this.revokeRememberedDevicesForAccount(target.id);
      this.addAuditLog({
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'admins.deleted',
        targetType: 'admin_account',
        targetId: target.id,
        details: `Removed administrator account ${target.email}`,
        severity: 'critical',
        ip: getClientIp(req),
      });
      this.persistStateNow();
      res.json({ ok: true });
    });

    // -------------------------------------------------------------------------
    // 15. SECURITY & AUDIT LOGS
    // -------------------------------------------------------------------------

    app.get('/api/admin2/security/overview', this.requireAuth('security.view'), (req: Admin2Request, res) => {
      const now = Date.now();
      this.state.sessions = this.state.sessions.filter((s) => s.expiresAt > now);
      const sessions: Admin2SessionInfo[] = this.state.sessions.map((s) => ({
        id: s.id,
        accountId: s.accountId,
        email: s.email,
        fullName: s.fullName,
        role: s.role,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: new Date(s.expiresAt).toISOString(),
        ip: s.ip,
        userAgent: s.userAgent,
        isCurrent: s.id === req.admin2User?.sessionId,
      }));

      const securityAlerts = this.state.notifications.filter((n) => n.category === 'security').slice(0, 30);

      res.json({
        ok: true,
        sessions,
        auditLogs: this.state.auditLogs.slice(0, 200),
        loginHistory: this.state.loginHistory.slice(0, 150),
        securityAlerts,
        rolePermissionsMatrix: ROLE_DEFAULT_PERMISSIONS,
        allPermissions: ALL_ADMIN_PERMISSIONS,
      });
    });

    app.post(
      '/api/admin2/security/sessions/:sessionId/revoke',
      this.requireAuth('security.view'),
      (req: Admin2Request, res) => {
        const sid = String(req.params.sessionId || '');
        const session = this.state.sessions.find((s) => s.id === sid);
        if (!session) {
          res.status(404).json({ ok: false, error: 'Session not found.' });
          return;
        }
        this.state.sessions = this.state.sessions.filter((s) => s.id !== sid);
        this.addAuditLog({
          actorEmail: req.admin2User!.email,
          actorRole: req.admin2User!.role,
          action: 'security.session_revoked',
          targetType: 'session',
          targetId: sid,
          details: `Revoked active session for ${session.email} (${session.ip})`,
          severity: 'warning',
          ip: getClientIp(req),
        });
        this.persistStateNow();
        res.json({ ok: true });
      }
    );

    // -------------------------------------------------------------------------
    // 16. WEBSITE SETTINGS
    // -------------------------------------------------------------------------

    app.get('/api/admin2/settings', this.requireAuth('settings.manage'), (_req, res) => {
      res.json({ ok: true, settings: this.state.settings });
    });

    app.put('/api/admin2/settings', this.requireAuth('settings.manage'), (req: Admin2Request, res) => {
      const b = req.body || {};
      const next: Admin2WebsiteSettings = {
        ...this.state.settings,
        siteName: typeof b.siteName === 'string' && b.siteName.trim() ? b.siteName.trim().slice(0, 80) : this.state.settings.siteName,
        siteTagline:
          typeof b.siteTagline === 'string' ? b.siteTagline.trim().slice(0, 180) : this.state.settings.siteTagline,
        canonicalBaseUrl:
          typeof b.canonicalBaseUrl === 'string' && /^https?:\/\//i.test(b.canonicalBaseUrl.trim())
            ? b.canonicalBaseUrl.trim().replace(/\/+$/, '')
            : this.state.settings.canonicalBaseUrl,
        defaultLanguage:
          b.defaultLanguage === 'Kannada' || b.defaultLanguage === 'English' || b.defaultLanguage === 'Bilingual'
            ? b.defaultLanguage
            : this.state.settings.defaultLanguage,
        whatsappNumber:
          typeof b.whatsappNumber === 'string'
            ? b.whatsappNumber.replace(/[^\d+]/g, '').slice(0, 20)
            : this.state.settings.whatsappNumber,
        whatsappGroupUrl:
          typeof b.whatsappGroupUrl === 'string' ? b.whatsappGroupUrl.trim().slice(0, 240) : this.state.settings.whatsappGroupUrl,
        defaultSeoTitle:
          typeof b.defaultSeoTitle === 'string' ? b.defaultSeoTitle.trim().slice(0, 120) : this.state.settings.defaultSeoTitle,
        defaultMetaDescription:
          typeof b.defaultMetaDescription === 'string'
            ? b.defaultMetaDescription.trim().slice(0, 300)
            : this.state.settings.defaultMetaDescription,
        ga4MeasurementId:
          typeof b.ga4MeasurementId === 'string' ? b.ga4MeasurementId.trim().slice(0, 40) : this.state.settings.ga4MeasurementId,
        searchConsoleSiteUrl:
          typeof b.searchConsoleSiteUrl === 'string'
            ? b.searchConsoleSiteUrl.trim().slice(0, 200)
            : this.state.settings.searchConsoleSiteUrl,
        watermarkLogoEnabled:
          typeof b.watermarkLogoEnabled === 'boolean' ? b.watermarkLogoEnabled : this.state.settings.watermarkLogoEnabled,
        watermarkMiddleTextEnabled:
          typeof b.watermarkMiddleTextEnabled === 'boolean'
            ? b.watermarkMiddleTextEnabled
            : this.state.settings.watermarkMiddleTextEnabled,
        watermarkMiddleText:
          typeof b.watermarkMiddleText === 'string' && b.watermarkMiddleText.trim()
            ? b.watermarkMiddleText.trim().slice(0, 40)
            : this.state.settings.watermarkMiddleText,
        breakingTickerNotice:
          typeof b.breakingTickerNotice === 'string'
            ? b.breakingTickerNotice.trim().slice(0, 240)
            : this.state.settings.breakingTickerNotice,
        updatedAt: new Date().toISOString(),
        updatedBy: req.admin2User!.email,
      };

      this.state.settings = next;
      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: 'settings.updated',
        targetType: 'settings',
        targetId: 'website',
        details: 'Updated Website Settings configuration.',
        severity: 'info',
        ip: getClientIp(req),
      });
      this.persistStateNow();
      res.json({ ok: true, settings: next });
    });

    // -------------------------------------------------------------------------
    // 17. SYSTEM HEALTH
    // -------------------------------------------------------------------------

    app.get('/api/admin2/health', this.requireAuth('dashboard.view'), async (req: Admin2Request, res) => {
      const mem = process.memoryUsage();
      const telemetry = this.sheetsStorage.getTelemetrySnapshot();
      const driveCache = this.sheetsStorage.getDriveCacheStats();
      const ping = req.query.ping === '1'
        ? await this.sheetsStorage.pingAppsScript(req.admin2User?.email)
        : null;

      res.json({
        ok: true,
        server: {
          status: 'healthy',
          uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
          nodeVersion: process.version,
          memoryRssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
          memoryHeapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
          timestamp: new Date().toISOString(),
        },
        integrations: {
          googleSheetsConfigured: telemetry.configured,
          appsScriptLastSuccessAt: telemetry.lastAppsScriptSuccessAt,
          appsScriptLastError: telemetry.lastError,
          appsScriptCallsToday: telemetry.appsScriptCallsToday,
          dailyFreeLimitCalls: telemetry.dailyFreeLimitCalls,
          cacheHitRatePct: telemetry.cacheHitRatePct,
          pendingViewsCount: telemetry.pendingViewsCount,
          driveCacheFiles: driveCache.fileCount,
          driveCacheBytes: driveCache.totalBytes,
          geminiAiReady: Boolean((process.env.GEMINI_API_KEY || '').trim()),
          geminiModel: GEMINI_EDITORIAL_MODEL,
          sitemapRoute: '/sitemap.xml',
          ping,
        },
        security: {
          activeAdminSessions: this.state.sessions.filter((s) => s.expiresAt > Date.now()).length,
          totalAdminAccounts: this.state.accounts.length,
          protectedSuperAdmins: this.state.accounts.filter((a) => a.protectedSuperAdmin).length,
          auditLogEntries: this.state.auditLogs.length,
        },
      });
    });

    // -------------------------------------------------------------------------
    // 18. LOCAL ADVERTISEMENTS MANAGEMENT SYSTEM (PUBLIC + ADMIN RBAC)
    // -------------------------------------------------------------------------

    const sanitizeAdImageUrl = (raw: unknown): string => {
      if (typeof raw !== 'string') return '';
      const trimmed = raw.trim();
      if (!trimmed) return '';
      if (/^\/api\/(?:media\/drive|ads\/media)\/[a-zA-Z0-9._-]+(?:\?[^\s]*)?$/.test(trimmed)) {
        return trimmed;
      }
      if (/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/i.test(trimmed) && trimmed.length <= 700_000) {
        return trimmed;
      }
      if (/^https:\/\//i.test(trimmed) && trimmed.length <= 500) {
        return trimmed;
      }
      return '';
    };

    const sanitizeAdDescriptionServer = (raw: unknown): string => {
      if (typeof raw !== 'string') return '';
      return raw
        .replace(/\u200B/g, '')
        .replace(/<(script|style|iframe|object|embed|svg|link|meta)[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<(script|style|iframe|object|embed|svg|link|meta)[^>]*\/?>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript:/gi, '')
        .trim()
        .slice(0, 12_000);
    };

    const sanitizeAdditionalAdImages = (raw: unknown): AdExtraImage[] => {
      if (!Array.isArray(raw)) return [];
      const clean: AdExtraImage[] = [];
      for (const item of raw.slice(0, 10)) {
        if (!item || typeof item !== 'object') continue;
        const entry = item as Record<string, unknown>;
        const imageUrl = sanitizeAdImageUrl(entry.imageUrl);
        if (!imageUrl) continue;
        const imageThumbUrl = sanitizeAdImageUrl(entry.imageThumbUrl);
        const imageDriveId =
          typeof entry.imageDriveId === 'string' && /^[a-zA-Z0-9_-]{6,120}$/.test(entry.imageDriveId.trim())
            ? entry.imageDriveId.trim()
            : undefined;
        const caption =
          typeof entry.caption === 'string' ? stripMarkup(entry.caption).slice(0, 180) : undefined;
        clean.push({
          imageUrl,
          ...(imageThumbUrl ? { imageThumbUrl } : {}),
          ...(imageDriveId ? { imageDriveId } : {}),
          ...(caption ? { caption } : {}),
        });
      }
      return clean;
    };

    const VALID_AD_CATEGORIES_LOWER = new Set(AD_CATEGORIES.map((c) => c.toLowerCase()));

    const sanitizeAdCategory = (raw: unknown): string => {
      if (typeof raw === 'string') {
        const clean = stripMarkup(raw).slice(0, 48);
        if (!clean) return 'Business';
        const matched = AD_CATEGORIES.find((c) => c.toLowerCase() === clean.toLowerCase());
        if (matched) return matched;
        const customMatch = (this.state.adPlatformSettings.customCategories || []).find(
          (c) => c.toLowerCase() === clean.toLowerCase()
        );
        if (customMatch) return customMatch;
        if (!VALID_AD_CATEGORIES_LOWER.has(clean.toLowerCase())) {
          return clean;
        }
      }
      return 'Business';
    };

    const sanitizeAdStatus = (raw: unknown): AdStatus => {
      if (raw === 'active' || raw === 'inactive' || raw === 'paused' || raw === 'draft') return raw;
      return 'active';
    };

    const sanitizeApprovalStatus = (raw: unknown): AdApprovalStatus => {
      if (raw === 'approved' || raw === 'pending_approval' || raw === 'rejected') return raw;
      return 'approved';
    };

    const sanitizeAdPriority = (raw: unknown): AdPriority => {
      if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
      return 'medium';
    };

    const sanitizeAdDevice = (raw: unknown): AdDeviceTarget => {
      if (raw === 'all' || raw === 'desktop' || raw === 'mobile') return raw;
      return 'all';
    };

    const sanitizeAdFrequency = (raw: unknown): AdDisplayFrequency => {
      if (raw === 'every_visit' || raw === 'once_per_session' || raw === 'once_per_day') return raw;
      return 'once_per_session';
    };

    const sanitizeCtaType = (raw: unknown): AdCtaType => {
      if (
        raw === 'contact_now' ||
        raw === 'call_now' ||
        raw === 'whatsapp_now' ||
        raw === 'visit_website' ||
        raw === 'get_directions' ||
        raw === 'learn_more'
      ) {
        return raw;
      }
      return 'learn_more';
    };

    const clampNum = (raw: unknown, min: number, max: number, fallback: number): number => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, Math.round(n)));
    };

    const sanitizePlacements = (raw: unknown): AdPlacementsConfig => {
      const def = createDefaultAdPlacements();
      if (!raw || typeof raw !== 'object') return def;
      const r = raw as Record<string, unknown>;

      const ap = r.articlePopup && typeof r.articlePopup === 'object' ? (r.articlePopup as Record<string, unknown>) : {};
      const ea = r.endOfArticle && typeof r.endOfArticle === 'object' ? (r.endOfArticle as Record<string, unknown>) : {};
      const hp = r.homepagePopup && typeof r.homepagePopup === 'object' ? (r.homepagePopup as Record<string, unknown>) : {};
      const we = r.websiteEntry && typeof r.websiteEntry === 'object' ? (r.websiteEntry as Record<string, unknown>) : {};
      const hs = r.homepageSection && typeof r.homepageSection === 'object' ? (r.homepageSection as Record<string, unknown>) : {};
      const ai = r.articleInline && typeof r.articleInline === 'object' ? (r.articleInline as Record<string, unknown>) : {};

      const scrollPct = Number(ap.scrollTriggerPercent);
      const safeScroll: 25 | 50 | 75 = scrollPct === 25 || scrollPct === 75 ? scrollPct : 50;

      return {
        articlePopup: {
          enabled: Boolean(ap.enabled),
          scrollTriggerPercent: safeScroll,
          size: ap.size === 'medium' || ap.size === 'large' ? ap.size : 'compact',
          position:
            ap.position === 'bottom-right' ||
            ap.position === 'bottom-left' ||
            ap.position === 'top-right' ||
            ap.position === 'bottom-center'
              ? ap.position
              : 'bottom-left',
          delaySeconds: clampNum(ap.delaySeconds, 0, 60, 1),
        },
        endOfArticle: {
          enabled: Boolean(ea.enabled),
          position: ea.position === 'after_related' ? 'after_related' : 'before_related',
        },
        homepagePopup: {
          enabled: Boolean(hp.enabled),
          delaySeconds: clampNum(hp.delaySeconds, 0, 60, 3),
          position:
            hp.position === 'bottom-right' || hp.position === 'bottom-left' ? hp.position : 'center',
          design: hp.design === 'banner' || hp.design === 'spotlight' ? hp.design : 'card',
          frequency: sanitizeAdFrequency(hp.frequency),
        },
        websiteEntry: {
          enabled: Boolean(we.enabled),
          delaySeconds: clampNum(we.delaySeconds, 0, 30, 0),
          minDurationSeconds: clampNum(we.minDurationSeconds, 0, 15, 3),
          layout: we.layout === 'fullscreen' ? 'fullscreen' : 'large',
        },
        homepageSection: {
          enabled: Boolean(hs.enabled),
          position:
            hs.position === 'between_news' || hs.position === 'above_footer' || hs.position === 'custom'
              ? hs.position
              : 'below_headline',
          customPosition:
            hs.customPosition === 'top_banner' || hs.customPosition === 'after_events'
              ? hs.customPosition
              : 'right_rail',
        },
        articleInline: {
          enabled: Boolean(ai.enabled),
          belowHeadline: Boolean(ai.belowHeadline),
          belowSummary: Boolean(ai.belowSummary),
          betweenParagraphs: Boolean(ai.betweenParagraphs),
          paragraphIndex: clampNum(ai.paragraphIndex, 1, 15, 2),
          aboveSharing: Boolean(ai.aboveSharing),
        },
      };
    };

    const sanitizeSchedule = (raw: unknown): AdCampaignSchedule | undefined => {
      if (!raw || typeof raw !== 'object') return undefined;
      const r = raw as Record<string, unknown>;
      const startTime = typeof r.startTime === 'string' && isValidTimeHm(r.startTime) ? r.startTime.trim() : undefined;
      const expiryTime = typeof r.expiryTime === 'string' && isValidTimeHm(r.expiryTime) ? r.expiryTime.trim() : undefined;
      const dailyStartTime =
        typeof r.dailyStartTime === 'string' && isValidTimeHm(r.dailyStartTime) ? r.dailyStartTime.trim() : undefined;
      const dailyEndTime =
        typeof r.dailyEndTime === 'string' && isValidTimeHm(r.dailyEndTime) ? r.dailyEndTime.trim() : undefined;
      const daysOfWeek = Array.isArray(r.daysOfWeek)
        ? Array.from(
            new Set(
              r.daysOfWeek
                .map((d) => Number(d))
                .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
            )
          ).sort()
        : undefined;
      if (!startTime && !expiryTime && !dailyStartTime && !dailyEndTime && (!daysOfWeek || daysOfWeek.length === 0)) {
        return undefined;
      }
      return {
        ...(startTime ? { startTime } : {}),
        ...(expiryTime ? { expiryTime } : {}),
        ...(daysOfWeek && daysOfWeek.length > 0 ? { daysOfWeek } : {}),
        ...(dailyStartTime ? { dailyStartTime } : {}),
        ...(dailyEndTime ? { dailyEndTime } : {}),
      };
    };

    const sanitizeRotationOverrides = (raw: unknown): AdRotationOverrides | undefined => {
      if (!raw || typeof raw !== 'object') return undefined;
      const r = raw as Record<string, unknown>;
      return {
        allowAutoRotation: r.allowAutoRotation !== false,
        weight: clampNum(r.weight, 1, 10, 5),
        ...(r.customIntervalSeconds !== undefined && Number(r.customIntervalSeconds) > 0
          ? { customIntervalSeconds: clampNum(r.customIntervalSeconds, 2, 60, 5) }
          : {}),
      };
    };

    const sanitizeSharingConfig = (raw: unknown): AdSharingConfig | undefined => {
      if (!raw || typeof raw !== 'object') return undefined;
      const r = raw as Record<string, unknown>;
      const customShareMessage =
        typeof r.customShareMessage === 'string' ? r.customShareMessage.trim().slice(0, 1800) : '';
      const customSlug =
        typeof r.customSlug === 'string'
          ? r.customSlug
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9-]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .slice(0, 80)
          : '';
      if (!customShareMessage && !customSlug) return undefined;
      return {
        ...(customShareMessage ? { customShareMessage } : {}),
        ...(customSlug ? { customSlug } : {}),
      };
    };

    const nextAvailableAdNumber = (): string => {
      let nextSeq = (this.state.adSequenceCounter || 0) + 1;
      const existingNumbers = new Set(this.state.ads.map((a) => a.adNumber.toUpperCase()));
      while (existingNumbers.has(formatAdNumber(nextSeq))) {
        nextSeq += 1;
      }
      return formatAdNumber(nextSeq);
    };

    const generatePreviewToken = (): string => crypto.randomBytes(12).toString('hex');

    const matchesPreviewToken = (ad: Advertisement, rawToken: unknown): boolean => {
      if (typeof rawToken !== 'string' || !rawToken.trim() || !ad.previewToken) return false;
      const provided = Buffer.from(rawToken.trim());
      const expected = Buffer.from(ad.previewToken);
      if (provided.length !== expected.length) return false;
      return crypto.timingSafeEqual(provided, expected);
    };

    // Public: list currently active, published, approved, non-expired advertisements + platform settings
    app.get('/api/ads', (_req, res) => {
      const todayYmd = getTodayIstYmd();
      const nowHm = getCurrentIstHm();
      const activeAds = this.state.ads
        .filter((ad) => isAdCurrentlyActive(ad, todayYmd, nowHm))
        .sort((a, b) => {
          const pMap: Record<AdPriority, number> = { high: 3, medium: 2, low: 1 };
          const pDiff = (pMap[b.priority || 'medium'] || 2) - (pMap[a.priority || 'medium'] || 2);
          if (pDiff !== 0) return pDiff;
          const dateDiff = b.publishDate.localeCompare(a.publishDate);
          if (dateDiff !== 0) return dateDiff;
          return b.createdAt.localeCompare(a.createdAt);
        });
      res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=40');
      res.json({
        ok: true,
        items: activeAds,
        settings: this.state.adPlatformSettings,
        total: activeAds.length,
      });
    });

    // Public: serve disk-persisted clean ad images when Google Drive is not configured
    app.get('/api/ads/media/:fileName', (req, res) => {
      const fileName = String(req.params.fileName || '').trim();
      if (!/^[a-zA-Z0-9_-]{8,100}\.(jpg|jpeg|png|webp)$/i.test(fileName)) {
        res.status(400).end();
        return;
      }
      const targetPath = path.join(this.adMediaDir, fileName);
      if (!targetPath.startsWith(this.adMediaDir + path.sep) || !fs.existsSync(targetPath)) {
        res.status(404).end();
        return;
      }
      const ext = path.extname(fileName).toLowerCase();
      const contentType =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.sendFile(targetPath);
    });

    // Public: single active advertisement details by id, ADxxx number, or custom slug (or draft/scheduled with valid preview token)
    app.get('/api/ads/:id', (req, res) => {
      const lookup = String(req.params.id || '').trim();
      if (!lookup) {
        res.status(400).json({ ok: false, error: 'Missing advertisement ID.' });
        return;
      }
      const previewToken = typeof req.query.preview === 'string' ? req.query.preview.trim() : '';
      const todayYmd = getTodayIstYmd();
      const nowHm = getCurrentIstHm();
      const candidate = this.state.ads.find(
        (ad) =>
          ad.id === lookup ||
          ad.adNumber.toUpperCase() === lookup.toUpperCase() ||
          (ad.sharing?.customSlug && ad.sharing.customSlug.toLowerCase() === lookup.toLowerCase())
      );

      if (!candidate) {
        res.status(404).json({ ok: false, error: 'Advertisement not found or no longer active.' });
        return;
      }

      const isPrivatePreview = Boolean(previewToken && matchesPreviewToken(candidate, previewToken));
      if (!isPrivatePreview && !isAdCurrentlyActive(candidate, todayYmd, nowHm)) {
        res.status(404).json({ ok: false, error: 'Advertisement not found or no longer active.' });
        return;
      }

      res.setHeader('Cache-Control', isPrivatePreview ? 'no-store' : 'public, max-age=20, stale-while-revalidate=40');
      res.json({
        ok: true,
        item: candidate,
        isPreview: isPrivatePreview,
        settings: this.state.adPlatformSettings,
      });
    });

    // Public: real granular impression / click / CTA / placement / device tracking
    app.post('/api/ads/:id/track', (req, res) => {
      const lookup = String(req.params.id || '').trim();
      const found = this.state.ads.find((ad) => ad.id === lookup);
      if (!found) {
        res.status(404).json({ ok: false, error: 'Advertisement not found.' });
        return;
      }

      const rawType = typeof req.body?.eventType === 'string' ? req.body.eventType : req.body?.type;
      const eventType =
        rawType === 'click' ||
        rawType === 'whatsapp' ||
        rawType === 'phone' ||
        rawType === 'website' ||
        rawType === 'directions' ||
        rawType === 'share'
          ? rawType
          : 'impression';

      const rawPlacement = typeof req.body?.placement === 'string' ? req.body.placement.trim() : 'direct';
      const placementKey: AdPlacementSlotKey | 'directory' | 'direct' =
        rawPlacement === 'articlePopup' ||
        rawPlacement === 'endOfArticle' ||
        rawPlacement === 'homepagePopup' ||
        rawPlacement === 'websiteEntry' ||
        rawPlacement === 'homepageSection' ||
        rawPlacement === 'articleInline' ||
        rawPlacement === 'directory' ||
        rawPlacement === 'direct'
          ? rawPlacement
          : 'direct';

      const uaDevice: 'desktop' | 'mobile' =
        classifyDevice(req.headers['user-agent']) === 'Mobile' ? 'mobile' : 'desktop';
      const device: 'desktop' | 'mobile' =
        req.body?.device === 'mobile' || req.body?.device === 'desktop'
          ? req.body.device
          : uaDevice;

      const rawVisitorId = typeof req.body?.visitorId === 'string' ? req.body.visitorId.trim().slice(0, 80) : '';
      const visitorHash = sha256Hex(
        rawVisitorId || `${getClientIp(req)}|${String(req.headers['user-agent'] || '').slice(0, 120)}`
      ).slice(0, 24);

      if (!found.counters) {
        found.counters = {
          whatsappClicks: 0,
          phoneClicks: 0,
          websiteClicks: 0,
          directionsClicks: 0,
          shareClicks: 0,
          byPlacement: {},
          byDevice: { desktop: 0, mobile: 0 },
        };
      }

      const todayKey = getTodayIstYmd();
      if (!this.state.adAnalyticsByDay[todayKey]) {
        this.state.adAnalyticsByDay[todayKey] = {
          date: todayKey,
          impressions: 0,
          clicks: 0,
          whatsappClicks: 0,
          phoneClicks: 0,
          websiteClicks: 0,
          directionsClicks: 0,
          shareClicks: 0,
          desktopImpressions: 0,
          mobileImpressions: 0,
          visitorHashes: [],
          byAd: {},
        };
      }
      const dayBucket = this.state.adAnalyticsByDay[todayKey];
      if (!dayBucket.byAd[found.id]) {
        dayBucket.byAd[found.id] = {
          impressions: 0,
          clicks: 0,
          whatsappClicks: 0,
          phoneClicks: 0,
          websiteClicks: 0,
          directionsClicks: 0,
          shareClicks: 0,
          visitorHashes: [],
          byPlacement: {},
          byDevice: { desktop: 0, mobile: 0 },
        };
      }
      const adDay = dayBucket.byAd[found.id];

      if (!dayBucket.visitorHashes.includes(visitorHash) && dayBucket.visitorHashes.length < 50_000) {
        dayBucket.visitorHashes.push(visitorHash);
      }
      if (!adDay.visitorHashes.includes(visitorHash) && adDay.visitorHashes.length < 25_000) {
        adDay.visitorHashes.push(visitorHash);
      }

      if (eventType === 'impression') {
        found.views = (Number(found.views) || 0) + 1;
        found.counters.byPlacement[placementKey] = (found.counters.byPlacement[placementKey] || 0) + 1;
        found.counters.byDevice[device] = (found.counters.byDevice[device] || 0) + 1;

        dayBucket.impressions += 1;
        if (device === 'mobile') dayBucket.mobileImpressions += 1;
        else dayBucket.desktopImpressions += 1;

        adDay.impressions += 1;
        adDay.byPlacement[placementKey] = (adDay.byPlacement[placementKey] || 0) + 1;
        adDay.byDevice[device] = (adDay.byDevice[device] || 0) + 1;
      } else {
        found.clicks = (Number(found.clicks) || 0) + 1;
        dayBucket.clicks += 1;
        adDay.clicks += 1;

        if (eventType === 'whatsapp') {
          found.counters.whatsappClicks += 1;
          dayBucket.whatsappClicks += 1;
          adDay.whatsappClicks += 1;
        } else if (eventType === 'phone') {
          found.counters.phoneClicks += 1;
          dayBucket.phoneClicks += 1;
          adDay.phoneClicks += 1;
        } else if (eventType === 'website') {
          found.counters.websiteClicks += 1;
          dayBucket.websiteClicks += 1;
          adDay.websiteClicks += 1;
        } else if (eventType === 'directions') {
          found.counters.directionsClicks += 1;
          dayBucket.directionsClicks += 1;
          adDay.directionsClicks += 1;
        } else if (eventType === 'share') {
          found.counters.shareClicks += 1;
          dayBucket.shareClicks += 1;
          adDay.shareClicks += 1;
        }
      }

      this.schedulePersist();
      res.status(202).json({ ok: true, views: found.views, clicks: found.clicks });
    });

    // Admin: list all advertisements + stats + global platform settings
    app.get('/api/admin2/ads', this.requireAuth('ads.manage'), (_req, res) => {
      const todayYmd = getTodayIstYmd();
      const nowHm = getCurrentIstHm();
      const sorted = [...this.state.ads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json({
        ok: true,
        ads: sorted,
        stats: computeAdStats(sorted, todayYmd, nowHm),
        nextAdNumber: nextAvailableAdNumber(),
        todayYmd,
        settings: this.state.adPlatformSettings,
      });
    });

    // Admin: get global advertisement platform settings
    app.get('/api/admin2/ads/settings', this.requireAuth('ads.manage'), (_req, res) => {
      res.json({ ok: true, settings: this.state.adPlatformSettings });
    });

    // Admin: update global advertisement platform settings
    app.put('/api/admin2/ads/settings', this.requireAuth('ads.manage'), (req: Admin2Request, res) => {
      const b = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const current = this.state.adPlatformSettings;

      const rotationMode =
        b.rotationMode === 'automatic' || b.rotationMode === 'manual' || b.rotationMode === 'both'
          ? b.rotationMode
          : current.rotationMode;

      const rotationOrder =
        b.rotationOrder === 'random' || b.rotationOrder === 'priority' ? b.rotationOrder : current.rotationOrder;

      const defaultShareMessage =
        typeof b.defaultShareMessage === 'string' && b.defaultShareMessage.trim()
          ? b.defaultShareMessage.trim().slice(0, 2000)
          : current.defaultShareMessage || DEFAULT_KANNADA_SHARE_TEMPLATE;

      const customCategories = Array.isArray(b.customCategories)
        ? Array.from(
            new Set(
              b.customCategories
                .map((c) => (typeof c === 'string' ? stripMarkup(c).slice(0, 48) : ''))
                .filter((c) => Boolean(c) && !VALID_AD_CATEGORIES_LOWER.has(c.toLowerCase()))
            )
          ).slice(0, 30)
        : current.customCategories;

      const rawGlobalPlacements =
        b.globalPlacementsEnabled && typeof b.globalPlacementsEnabled === 'object'
          ? (b.globalPlacementsEnabled as Record<string, unknown>)
          : null;

      const globalPlacementsEnabled: Record<AdPlacementSlotKey, boolean> = rawGlobalPlacements
        ? {
            articlePopup: rawGlobalPlacements.articlePopup !== false,
            endOfArticle: rawGlobalPlacements.endOfArticle !== false,
            homepagePopup: rawGlobalPlacements.homepagePopup !== false,
            websiteEntry: rawGlobalPlacements.websiteEntry !== false,
            homepageSection: rawGlobalPlacements.homepageSection !== false,
            articleInline: rawGlobalPlacements.articleInline !== false,
          }
        : current.globalPlacementsEnabled;

      const nextSettings: AdPlatformSettings = {
        rotationMode,
        rotationSpeedSeconds:
          b.rotationSpeedSeconds !== undefined
            ? clampNum(b.rotationSpeedSeconds, 2, 60, current.rotationSpeedSeconds)
            : current.rotationSpeedSeconds,
        maxAdsPerPlacement:
          b.maxAdsPerPlacement !== undefined
            ? clampNum(b.maxAdsPerPlacement, 1, 20, current.maxAdsPerPlacement)
            : current.maxAdsPerPlacement,
        rotationOrder,
        avoidRepeatInSession:
          b.avoidRepeatInSession !== undefined
            ? Boolean(b.avoidRepeatInSession)
            : current.avoidRepeatInSession,
        defaultShareMessage,
        customCategories,
        approvalWorkflowEnabled:
          b.approvalWorkflowEnabled !== undefined
            ? Boolean(b.approvalWorkflowEnabled)
            : current.approvalWorkflowEnabled,
        defaultDisplayFrequency:
          b.defaultDisplayFrequency !== undefined
            ? sanitizeAdFrequency(b.defaultDisplayFrequency)
            : current.defaultDisplayFrequency,
        defaultMaxImpressionsPerVisitor:
          b.defaultMaxImpressionsPerVisitor !== undefined
            ? clampNum(b.defaultMaxImpressionsPerVisitor, 0, 100, current.defaultMaxImpressionsPerVisitor)
            : current.defaultMaxImpressionsPerVisitor,
        globalPlacementsEnabled,
        updatedAt: new Date().toISOString(),
        updatedBy: req.admin2User!.email,
      };

      this.state.adPlatformSettings = nextSettings;
      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: 'ads.settings_updated',
        targetType: 'settings',
        targetId: 'adPlatformSettings',
        details: `Updated ad platform settings (rotation=${nextSettings.rotationMode}, speed=${nextSettings.rotationSpeedSeconds}s, approval=${nextSettings.approvalWorkflowEnabled})`,
        severity: 'info',
        ip: getClientIp(req),
      });
      this.persistStateNow();
      res.json({ ok: true, settings: nextSettings });
    });

    // Admin: real analytics endpoint with daily / weekly / monthly / all breakdowns
    app.get('/api/admin2/ads/analytics', this.requireAuth('ads.manage'), (req, res) => {
      const rawRange = typeof req.query.range === 'string' ? req.query.range : 'monthly';
      const range: AdAnalyticsRange =
        rawRange === 'daily' || rawRange === 'weekly' || rawRange === 'monthly' || rawRange === 'all'
          ? rawRange
          : 'monthly';
      const filterAdId = typeof req.query.adId === 'string' ? req.query.adId.trim() : '';

      const todayYmd = getTodayIstYmd();
      const cutoffDays = range === 'daily' ? 0 : range === 'weekly' ? 6 : range === 'monthly' ? 29 : 3650;
      const [ty, tm, td] = todayYmd.split('-').map(Number);
      const cutoffDate = new Date(Date.UTC(ty, tm - 1, td - cutoffDays)).toISOString().slice(0, 10);

      const sortedDays = Object.values(this.state.adAnalyticsByDay)
        .filter((b) => range === 'all' || b.date >= cutoffDate)
        .sort((a, b) => a.date.localeCompare(b.date));

      const uniqueVisitorSet = new Set<string>();
      const byPlacement: Record<string, number> = {};
      const perAdMap = new Map<
        string,
        {
          impressions: number;
          clicks: number;
          whatsappClicks: number;
          phoneClicks: number;
          websiteClicks: number;
          directionsClicks: number;
          shareClicks: number;
          desktopImpressions: number;
          mobileImpressions: number;
          visitorHashes: Set<string>;
          byPlacement: Record<string, number>;
        }
      >();

      let impressions = 0;
      let clicks = 0;
      let whatsappClicks = 0;
      let phoneClicks = 0;
      let websiteClicks = 0;
      let directionsClicks = 0;
      let shareClicks = 0;
      let desktopImpressions = 0;
      let mobileImpressions = 0;

      const series = sortedDays.map((day) => {
        let dayImpressions = 0;
        let dayClicks = 0;
        const dayVisitorHashes = new Set<string>();

        for (const [adId, adStats] of Object.entries(day.byAd || {})) {
          if (filterAdId && adId !== filterAdId) continue;

          dayImpressions += adStats.impressions || 0;
          dayClicks += adStats.clicks || 0;
          for (const h of adStats.visitorHashes || []) {
            dayVisitorHashes.add(h);
            uniqueVisitorSet.add(h);
          }

          if (filterAdId) {
            whatsappClicks += adStats.whatsappClicks || 0;
            phoneClicks += adStats.phoneClicks || 0;
            websiteClicks += adStats.websiteClicks || 0;
            directionsClicks += adStats.directionsClicks || 0;
            shareClicks += adStats.shareClicks || 0;
            desktopImpressions += adStats.byDevice?.desktop || 0;
            mobileImpressions += adStats.byDevice?.mobile || 0;
          }

          let entry = perAdMap.get(adId);
          if (!entry) {
            entry = {
              impressions: 0,
              clicks: 0,
              whatsappClicks: 0,
              phoneClicks: 0,
              websiteClicks: 0,
              directionsClicks: 0,
              shareClicks: 0,
              desktopImpressions: 0,
              mobileImpressions: 0,
              visitorHashes: new Set<string>(),
              byPlacement: {},
            };
            perAdMap.set(adId, entry);
          }
          entry.impressions += adStats.impressions || 0;
          entry.clicks += adStats.clicks || 0;
          entry.whatsappClicks += adStats.whatsappClicks || 0;
          entry.phoneClicks += adStats.phoneClicks || 0;
          entry.websiteClicks += adStats.websiteClicks || 0;
          entry.directionsClicks += adStats.directionsClicks || 0;
          entry.shareClicks += adStats.shareClicks || 0;
          entry.desktopImpressions += adStats.byDevice?.desktop || 0;
          entry.mobileImpressions += adStats.byDevice?.mobile || 0;
          for (const h of adStats.visitorHashes || []) entry.visitorHashes.add(h);
          for (const [pl, count] of Object.entries(adStats.byPlacement || {})) {
            entry.byPlacement[pl] = (entry.byPlacement[pl] || 0) + (count || 0);
            byPlacement[pl] = (byPlacement[pl] || 0) + (count || 0);
          }
        }

        if (filterAdId) {
          impressions += dayImpressions;
          clicks += dayClicks;
          return {
            date: day.date,
            impressions: dayImpressions,
            uniqueVisitors: dayVisitorHashes.size,
            clicks: dayClicks,
          };
        }

        impressions += day.impressions || 0;
        clicks += day.clicks || 0;
        whatsappClicks += day.whatsappClicks || 0;
        phoneClicks += day.phoneClicks || 0;
        websiteClicks += day.websiteClicks || 0;
        directionsClicks += day.directionsClicks || 0;
        shareClicks += day.shareClicks || 0;
        desktopImpressions += day.desktopImpressions || 0;
        mobileImpressions += day.mobileImpressions || 0;
        for (const h of day.visitorHashes || []) uniqueVisitorSet.add(h);

        return {
          date: day.date,
          impressions: day.impressions || 0,
          uniqueVisitors: (day.visitorHashes || []).length,
          clicks: day.clicks || 0,
        };
      });

      const scopedAds = filterAdId ? this.state.ads.filter((a) => a.id === filterAdId) : this.state.ads;
      const perAd = scopedAds.map((ad) => {
        const tracked = perAdMap.get(ad.id);
        // Include historical ad totals in 'all' range when day buckets didn't exist yet
        const adImps = tracked
          ? range === 'all'
            ? Math.max(tracked.impressions, Number(ad.views) || 0)
            : tracked.impressions
          : range === 'all'
          ? Number(ad.views) || 0
          : 0;
        const adClicks = tracked
          ? range === 'all'
            ? Math.max(tracked.clicks, Number(ad.clicks) || 0)
            : tracked.clicks
          : range === 'all'
          ? Number(ad.clicks) || 0
          : 0;
        const ctrPct = adImps > 0 ? Number(((adClicks / adImps) * 100).toFixed(2)) : 0;
        return {
          adId: ad.id,
          adNumber: ad.adNumber,
          title: ad.title,
          advertiserName: ad.advertiserName,
          category: ad.category,
          status: ad.status,
          impressions: adImps,
          uniqueVisitors: tracked ? tracked.visitorHashes.size : 0,
          clicks: adClicks,
          ctrPct,
          whatsappClicks: tracked ? tracked.whatsappClicks : ad.counters?.whatsappClicks || 0,
          phoneClicks: tracked ? tracked.phoneClicks : ad.counters?.phoneClicks || 0,
          websiteClicks: tracked ? tracked.websiteClicks : ad.counters?.websiteClicks || 0,
          directionsClicks: tracked ? tracked.directionsClicks : ad.counters?.directionsClicks || 0,
          shareClicks: tracked ? tracked.shareClicks : ad.counters?.shareClicks || 0,
          desktopImpressions: tracked ? tracked.desktopImpressions : ad.counters?.byDevice?.desktop || 0,
          mobileImpressions: tracked ? tracked.mobileImpressions : ad.counters?.byDevice?.mobile || 0,
          byPlacement: tracked ? tracked.byPlacement : ((ad.counters?.byPlacement as Record<string, number>) || {}),
        };
      });

      if (range === 'all') {
        const sumViews = this.state.ads.reduce((acc, a) => acc + (Number(a.views) || 0), 0);
        const sumClicks = this.state.ads.reduce((acc, a) => acc + (Number(a.clicks) || 0), 0);
        impressions = Math.max(impressions, sumViews);
        clicks = Math.max(clicks, sumClicks);
      }

      const best = [...perAd]
        .filter((p) => p.impressions > 0 || p.clicks > 0)
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)[0];

      res.json({
        ok: true,
        range,
        totals: {
          impressions,
          uniqueVisitors: uniqueVisitorSet.size,
          clicks,
          ctrPct: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
          whatsappClicks,
          phoneClicks,
          websiteClicks,
          directionsClicks,
          shareClicks,
          desktopImpressions,
          mobileImpressions,
        },
        byPlacement,
        series,
        perAd: perAd.sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks),
        bestPerformingAd: best
          ? {
              adId: best.adId,
              adNumber: best.adNumber,
              title: best.title,
              impressions: best.impressions,
              clicks: best.clicks,
              ctrPct: best.ctrPct,
            }
          : null,
      });
    });

    // Admin: clean local disk image upload fallback (no watermark / no overlays)
    app.post('/api/admin2/ads/upload-image', this.requireAuth('ads.manage'), (req: Admin2Request, res) => {
      try {
        const rawBase64 = typeof req.body?.base64Data === 'string' ? req.body.base64Data : '';
        const rawThumb = typeof req.body?.thumbBase64 === 'string' ? req.body.thumbBase64 : '';
        const match = rawBase64.match(/^data:image\/(jpeg|jpg|png|webp);base64,([a-zA-Z0-9+/=]+)$/i);
        if (!match) {
          res.status(400).json({ ok: false, error: 'Valid base64 JPEG/PNG/WebP image is required.' });
          return;
        }
        const extRaw = match[1].toLowerCase();
        const ext = extRaw === 'jpeg' || extRaw === 'jpg' ? 'jpg' : extRaw;
        const fullBuffer = Buffer.from(match[2], 'base64');
        if (fullBuffer.length === 0 || fullBuffer.length > 4 * 1024 * 1024) {
          res.status(400).json({ ok: false, error: 'Image file size must be under 4 MB.' });
          return;
        }

        fs.mkdirSync(this.adMediaDir, { recursive: true });
        const token = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
        const fullName = `ad-${token}.${ext}`;
        fs.writeFileSync(path.join(this.adMediaDir, fullName), fullBuffer);

        let thumbName = fullName;
        const thumbMatch = rawThumb.match(/^data:image\/(jpeg|jpg|png|webp);base64,([a-zA-Z0-9+/=]+)$/i);
        if (thumbMatch) {
          const tExtRaw = thumbMatch[1].toLowerCase();
          const tExt = tExtRaw === 'jpeg' || tExtRaw === 'jpg' ? 'jpg' : tExtRaw;
          const thumbBuf = Buffer.from(thumbMatch[2], 'base64');
          if (thumbBuf.length > 0 && thumbBuf.length <= 1024 * 1024) {
            thumbName = `ad-${token}-thumb.${tExt}`;
            fs.writeFileSync(path.join(this.adMediaDir, thumbName), thumbBuf);
          }
        }

        res.status(201).json({
          ok: true,
          imageUrl: `/api/ads/media/${fullName}`,
          imageThumbUrl: `/api/ads/media/${thumbName}`,
        });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to save advertisement image.',
        });
      }
    });

    // Admin: create new advertisement (auto-assigns sequential AD001, AD002...)
    app.post('/api/admin2/ads', this.requireAuth('ads.manage'), (req: Admin2Request, res) => {
      const b = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const title = stripMarkup(typeof b.title === 'string' ? b.title : '').slice(0, 160);
      if (!title) {
        res.status(400).json({ ok: false, error: 'Advertisement title is required.' });
        return;
      }

      const mainImageUrl = sanitizeAdImageUrl(b.mainImageUrl);
      if (!mainImageUrl) {
        res.status(400).json({ ok: false, error: 'Main advertisement image is required.' });
        return;
      }

      const todayYmd = getTodayIstYmd();
      const publishDate = isValidYmd(typeof b.publishDate === 'string' ? b.publishDate : '')
        ? String(b.publishDate)
        : todayYmd;
      const expiryDate = isValidYmd(typeof b.expiryDate === 'string' ? b.expiryDate : '')
        ? String(b.expiryDate)
        : publishDate;

      if (expiryDate < publishDate) {
        res.status(400).json({ ok: false, error: 'Expiry date cannot be earlier than publish date.' });
        return;
      }

      const description = sanitizeAdDescriptionServer(b.description);
      if (!stripMarkup(description)) {
        res.status(400).json({ ok: false, error: 'Advertisement description is required.' });
        return;
      }

      let websiteUrl: string | undefined;
      if (typeof b.websiteUrl === 'string' && b.websiteUrl.trim()) {
        const safeUrl = sanitizeExternalWebsiteUrl(b.websiteUrl);
        if (!safeUrl) {
          res.status(400).json({ ok: false, error: 'Website link must be a valid http:// or https:// URL.' });
          return;
        }
        websiteUrl = safeUrl;
      }

      let ctaUrl: string | undefined;
      if (typeof b.ctaUrl === 'string' && b.ctaUrl.trim()) {
        const safeCtaUrl = sanitizeExternalWebsiteUrl(b.ctaUrl);
        if (!safeCtaUrl) {
          res.status(400).json({ ok: false, error: 'CTA Link URL must be a valid http:// or https:// URL.' });
          return;
        }
        ctaUrl = safeCtaUrl;
      }

      const adNumber = nextAvailableAdNumber();
      const seqMatch = adNumber.match(/^AD(\d+)$/i);
      this.state.adSequenceCounter = Math.max(
        this.state.adSequenceCounter || 0,
        seqMatch ? Number(seqMatch[1]) : (this.state.adSequenceCounter || 0) + 1
      );

      const nowIso = new Date().toISOString();
      const actorEmail = req.admin2User!.email;
      const mainImageThumbUrl = sanitizeAdImageUrl(b.mainImageThumbUrl);
      const mainImageDriveId =
        typeof b.mainImageDriveId === 'string' && /^[a-zA-Z0-9_-]{6,120}$/.test(b.mainImageDriveId.trim())
          ? b.mainImageDriveId.trim()
          : undefined;

      const requestedStatus = sanitizeAdStatus(b.status);
      const defaultApproval: AdApprovalStatus =
        this.state.adPlatformSettings.approvalWorkflowEnabled &&
        req.admin2User!.role !== 'super_admin' &&
        requestedStatus !== 'draft'
          ? 'pending_approval'
          : 'approved';

      const created: Advertisement = {
        id: makeId('ad'),
        adNumber,
        title,
        campaignName: stripMarkup(typeof b.campaignName === 'string' ? b.campaignName : '').slice(0, 120) || undefined,
        advertiserName: stripMarkup(typeof b.advertiserName === 'string' ? b.advertiserName : '').slice(0, 120) || undefined,
        description,
        mainImageUrl,
        ...(mainImageThumbUrl ? { mainImageThumbUrl } : {}),
        ...(mainImageDriveId ? { mainImageDriveId } : {}),
        additionalImages: sanitizeAdditionalAdImages(b.additionalImages),
        contactNumber: sanitizePhoneDigits(typeof b.contactNumber === 'string' ? b.contactNumber : '') || undefined,
        whatsappNumber: sanitizePhoneDigits(typeof b.whatsappNumber === 'string' ? b.whatsappNumber : '') || undefined,
        businessAddress: stripMarkup(typeof b.businessAddress === 'string' ? b.businessAddress : '').slice(0, 260) || undefined,
        websiteUrl,
        ctaType: sanitizeCtaType(b.ctaType),
        ctaLabel: stripMarkup(typeof b.ctaLabel === 'string' ? b.ctaLabel : '').slice(0, 50) || undefined,
        ctaUrl,
        category: sanitizeAdCategory(b.category),
        status: requestedStatus,
        approvalStatus: b.approvalStatus ? sanitizeApprovalStatus(b.approvalStatus) : defaultApproval,
        previewToken: generatePreviewToken(),
        publishDate,
        expiryDate,
        schedule: sanitizeSchedule(b.schedule),
        priority: sanitizeAdPriority(b.priority),
        targetDevice: sanitizeAdDevice(b.targetDevice),
        displayFrequency: sanitizeAdFrequency(b.displayFrequency),
        maxImpressionsPerVisitor:
          b.maxImpressionsPerVisitor !== undefined ? clampNum(b.maxImpressionsPerVisitor, 0, 100, 0) : 0,
        placements: sanitizePlacements(b.placements),
        rotation: sanitizeRotationOverrides(b.rotation),
        sharing: sanitizeSharingConfig(b.sharing),
        views: 0,
        clicks: 0,
        counters: {
          whatsappClicks: 0,
          phoneClicks: 0,
          websiteClicks: 0,
          directionsClicks: 0,
          shareClicks: 0,
          byPlacement: {},
          byDevice: { desktop: 0, mobile: 0 },
        },
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actorEmail,
        updatedBy: actorEmail,
      };

      this.state.ads.unshift(created);
      this.addAuditLog({
        actorEmail,
        actorRole: req.admin2User!.role,
        action: 'ads.created',
        targetType: 'advertisement',
        targetId: created.id,
        details: `Created advertisement ${created.adNumber} (${created.title}) [${created.status}]`,
        severity: 'info',
        ip: getClientIp(req),
      });
      this.addNotification({
        category: 'publishing',
        severity: 'success',
        title: `Advertisement ${created.adNumber} Saved`,
        message: `${created.title} (${created.status}) saved by ${actorEmail}.`,
        entityId: created.id,
      });
      this.persistStateNow();

      res.status(201).json({
        ok: true,
        ad: created,
        nextAdNumber: nextAvailableAdNumber(),
        stats: computeAdStats(this.state.ads, todayYmd, getCurrentIstHm()),
      });
    });

    // Admin: update existing advertisement
    app.put('/api/admin2/ads/:id', this.requireAuth('ads.manage'), (req: Admin2Request, res) => {
      const target = this.state.ads.find((a) => a.id === req.params.id);
      if (!target) {
        res.status(404).json({ ok: false, error: 'Advertisement not found.' });
        return;
      }

      const b = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const title =
        typeof b.title === 'string' ? stripMarkup(b.title).slice(0, 160) : target.title;
      if (!title) {
        res.status(400).json({ ok: false, error: 'Advertisement title cannot be empty.' });
        return;
      }

      const mainImageUrl =
        b.mainImageUrl !== undefined ? sanitizeAdImageUrl(b.mainImageUrl) : target.mainImageUrl;
      if (!mainImageUrl) {
        res.status(400).json({ ok: false, error: 'Main advertisement image is required.' });
        return;
      }

      const publishDate =
        typeof b.publishDate === 'string' && isValidYmd(b.publishDate)
          ? b.publishDate
          : target.publishDate;
      const expiryDate =
        typeof b.expiryDate === 'string' && isValidYmd(b.expiryDate)
          ? b.expiryDate
          : target.expiryDate;

      if (expiryDate < publishDate) {
        res.status(400).json({ ok: false, error: 'Expiry date cannot be earlier than publish date.' });
        return;
      }

      const description =
        b.description !== undefined ? sanitizeAdDescriptionServer(b.description) : target.description;
      if (!stripMarkup(description)) {
        res.status(400).json({ ok: false, error: 'Advertisement description cannot be empty.' });
        return;
      }

      let websiteUrl = target.websiteUrl;
      if (b.websiteUrl !== undefined) {
        if (typeof b.websiteUrl === 'string' && b.websiteUrl.trim()) {
          const safeUrl = sanitizeExternalWebsiteUrl(b.websiteUrl);
          if (!safeUrl) {
            res.status(400).json({ ok: false, error: 'Website link must be a valid http:// or https:// URL.' });
            return;
          }
          websiteUrl = safeUrl;
        } else {
          websiteUrl = undefined;
        }
      }

      let ctaUrl = target.ctaUrl;
      if (b.ctaUrl !== undefined) {
        if (typeof b.ctaUrl === 'string' && b.ctaUrl.trim()) {
          const safeCtaUrl = sanitizeExternalWebsiteUrl(b.ctaUrl);
          if (!safeCtaUrl) {
            res.status(400).json({ ok: false, error: 'CTA Link URL must be a valid http:// or https:// URL.' });
            return;
          }
          ctaUrl = safeCtaUrl;
        } else {
          ctaUrl = undefined;
        }
      }

      target.title = title;
      if (b.campaignName !== undefined) {
        target.campaignName =
          stripMarkup(typeof b.campaignName === 'string' ? b.campaignName : '').slice(0, 120) || undefined;
      }
      if (b.advertiserName !== undefined) {
        target.advertiserName =
          stripMarkup(typeof b.advertiserName === 'string' ? b.advertiserName : '').slice(0, 120) || undefined;
      }
      target.description = description;
      target.mainImageUrl = mainImageUrl;
      if (b.mainImageThumbUrl !== undefined) {
        const cleanThumb = sanitizeAdImageUrl(b.mainImageThumbUrl);
        target.mainImageThumbUrl = cleanThumb || undefined;
      }
      if (b.mainImageDriveId !== undefined) {
        target.mainImageDriveId =
          typeof b.mainImageDriveId === 'string' && /^[a-zA-Z0-9_-]{6,120}$/.test(b.mainImageDriveId.trim())
            ? b.mainImageDriveId.trim()
            : undefined;
      }
      if (b.additionalImages !== undefined) {
        target.additionalImages = sanitizeAdditionalAdImages(b.additionalImages);
      }
      if (b.contactNumber !== undefined) {
        target.contactNumber = sanitizePhoneDigits(typeof b.contactNumber === 'string' ? b.contactNumber : '') || undefined;
      }
      if (b.whatsappNumber !== undefined) {
        target.whatsappNumber = sanitizePhoneDigits(typeof b.whatsappNumber === 'string' ? b.whatsappNumber : '') || undefined;
      }
      if (b.businessAddress !== undefined) {
        target.businessAddress = stripMarkup(typeof b.businessAddress === 'string' ? b.businessAddress : '').slice(0, 260) || undefined;
      }
      target.websiteUrl = websiteUrl;
      if (b.ctaType !== undefined) target.ctaType = sanitizeCtaType(b.ctaType);
      if (b.ctaLabel !== undefined) {
        target.ctaLabel = stripMarkup(typeof b.ctaLabel === 'string' ? b.ctaLabel : '').slice(0, 50) || undefined;
      }
      target.ctaUrl = ctaUrl;
      if (b.category !== undefined) target.category = sanitizeAdCategory(b.category);
      if (b.status !== undefined) target.status = sanitizeAdStatus(b.status);
      if (b.approvalStatus !== undefined && req.admin2User!.role === 'super_admin') {
        target.approvalStatus = sanitizeApprovalStatus(b.approvalStatus);
      }
      if (!target.previewToken) target.previewToken = generatePreviewToken();
      target.publishDate = publishDate;
      target.expiryDate = expiryDate;
      if (b.schedule !== undefined) target.schedule = sanitizeSchedule(b.schedule);
      if (b.priority !== undefined) target.priority = sanitizeAdPriority(b.priority);
      if (b.targetDevice !== undefined) target.targetDevice = sanitizeAdDevice(b.targetDevice);
      if (b.displayFrequency !== undefined) target.displayFrequency = sanitizeAdFrequency(b.displayFrequency);
      if (b.maxImpressionsPerVisitor !== undefined) {
        target.maxImpressionsPerVisitor = clampNum(b.maxImpressionsPerVisitor, 0, 100, 0);
      }
      if (b.placements !== undefined) target.placements = sanitizePlacements(b.placements);
      if (b.rotation !== undefined) target.rotation = sanitizeRotationOverrides(b.rotation);
      if (b.sharing !== undefined) target.sharing = sanitizeSharingConfig(b.sharing);

      target.updatedAt = new Date().toISOString();
      target.updatedBy = req.admin2User!.email;

      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: 'ads.updated',
        targetType: 'advertisement',
        targetId: target.id,
        details: `Updated advertisement ${target.adNumber} (${target.title}) [${target.status}]`,
        severity: 'info',
        ip: getClientIp(req),
      });
      this.persistStateNow();

      res.json({
        ok: true,
        ad: target,
        stats: computeAdStats(this.state.ads, getTodayIstYmd(), getCurrentIstHm()),
      });
    });

    // Admin: duplicate an advertisement with new sequential ID
    app.post('/api/admin2/ads/:id/duplicate', this.requireAuth('ads.manage'), (req: Admin2Request, res) => {
      const source = this.state.ads.find((a) => a.id === req.params.id);
      if (!source) {
        res.status(404).json({ ok: false, error: 'Advertisement not found.' });
        return;
      }
      const adNumber = nextAvailableAdNumber();
      const seqMatch = adNumber.match(/^AD(\d+)$/i);
      this.state.adSequenceCounter = Math.max(
        this.state.adSequenceCounter || 0,
        seqMatch ? Number(seqMatch[1]) : (this.state.adSequenceCounter || 0) + 1
      );
      const nowIso = new Date().toISOString();
      const actorEmail = req.admin2User!.email;

      const copy: Advertisement = {
        ...JSON.parse(JSON.stringify(source)),
        id: makeId('ad'),
        adNumber,
        title: `${source.title} (Copy)`.slice(0, 160),
        status: 'draft',
        approvalStatus: 'approved',
        previewToken: generatePreviewToken(),
        views: 0,
        clicks: 0,
        counters: {
          whatsappClicks: 0,
          phoneClicks: 0,
          websiteClicks: 0,
          directionsClicks: 0,
          shareClicks: 0,
          byPlacement: {},
          byDevice: { desktop: 0, mobile: 0 },
        },
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actorEmail,
        updatedBy: actorEmail,
      };
      this.state.ads.unshift(copy);
      this.addAuditLog({
        actorEmail,
        actorRole: req.admin2User!.role,
        action: 'ads.duplicated',
        targetType: 'advertisement',
        targetId: copy.id,
        details: `Duplicated ${source.adNumber} into ${copy.adNumber} (${copy.title})`,
        severity: 'info',
        ip: getClientIp(req),
      });
      this.persistStateNow();

      res.status(201).json({
        ok: true,
        ad: copy,
        nextAdNumber: nextAvailableAdNumber(),
        stats: computeAdStats(this.state.ads, getTodayIstYmd(), getCurrentIstHm()),
      });
    });

    // Admin: toggle / update individual placements on an advertisement without deleting it
    app.patch('/api/admin2/ads/:id/placements', this.requireAuth('ads.manage'), (req: Admin2Request, res) => {
      const target = this.state.ads.find((a) => a.id === req.params.id);
      if (!target) {
        res.status(404).json({ ok: false, error: 'Advertisement not found.' });
        return;
      }
      target.placements = sanitizePlacements(req.body?.placements);
      target.updatedAt = new Date().toISOString();
      target.updatedBy = req.admin2User!.email;
      this.persistStateNow();
      res.json({
        ok: true,
        ad: target,
        stats: computeAdStats(this.state.ads, getTodayIstYmd(), getCurrentIstHm()),
      });
    });

    // Admin: approval workflow transition
    app.patch('/api/admin2/ads/:id/approval', this.requireAuth('ads.manage'), (req: Admin2Request, res) => {
      const target = this.state.ads.find((a) => a.id === req.params.id);
      if (!target) {
        res.status(404).json({ ok: false, error: 'Advertisement not found.' });
        return;
      }
      if (req.admin2User!.role !== 'super_admin' && req.admin2User!.role !== 'admin') {
        res.status(403).json({ ok: false, error: 'Only Admin or Super Admin can approve advertisements.' });
        return;
      }
      const nextApproval = sanitizeApprovalStatus(req.body?.approvalStatus);
      target.approvalStatus = nextApproval;
      if (typeof req.body?.approvalNotes === 'string') {
        target.approvalNotes = stripMarkup(req.body.approvalNotes).slice(0, 300) || undefined;
      }
      target.updatedAt = new Date().toISOString();
      target.updatedBy = req.admin2User!.email;

      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: `ads.approval_${nextApproval}`,
        targetType: 'advertisement',
        targetId: target.id,
        details: `Set ${target.adNumber} approval status to ${nextApproval}`,
        severity: 'info',
        ip: getClientIp(req),
      });
      this.persistStateNow();

      res.json({
        ok: true,
        ad: target,
        stats: computeAdStats(this.state.ads, getTodayIstYmd(), getCurrentIstHm()),
      });
    });

    // Admin: activate / pause / deactivate / draft toggle
    app.patch('/api/admin2/ads/:id/status', this.requireAuth('ads.manage'), (req: Admin2Request, res) => {
      const target = this.state.ads.find((a) => a.id === req.params.id);
      if (!target) {
        res.status(404).json({ ok: false, error: 'Advertisement not found.' });
        return;
      }
      const nextStatus = req.body?.status;
      if (nextStatus !== 'active' && nextStatus !== 'inactive' && nextStatus !== 'paused' && nextStatus !== 'draft') {
        res.status(400).json({ ok: false, error: 'Status must be active, paused, inactive, or draft.' });
        return;
      }
      target.status = nextStatus;
      target.updatedAt = new Date().toISOString();
      target.updatedBy = req.admin2User!.email;

      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: `ads.status_${nextStatus}`,
        targetType: 'advertisement',
        targetId: target.id,
        details: `Changed ${target.adNumber} (${target.title}) status to ${nextStatus}`,
        severity: 'info',
        ip: getClientIp(req),
      });
      this.persistStateNow();

      res.json({
        ok: true,
        ad: target,
        stats: computeAdStats(this.state.ads, getTodayIstYmd(), getCurrentIstHm()),
      });
    });

    // Admin: permanently delete advertisement
    app.delete('/api/admin2/ads/:id', this.requireAuth('ads.manage'), (req: Admin2Request, res) => {
      const idx = this.state.ads.findIndex((a) => a.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ ok: false, error: 'Advertisement not found.' });
        return;
      }
      const [removed] = this.state.ads.splice(idx, 1);

      this.addAuditLog({
        actorEmail: req.admin2User!.email,
        actorRole: req.admin2User!.role,
        action: 'ads.deleted',
        targetType: 'advertisement',
        targetId: removed.id,
        details: `Deleted advertisement ${removed.adNumber} (${removed.title})`,
        severity: 'warning',
        ip: getClientIp(req),
      });
      this.persistStateNow();

      res.json({
        ok: true,
        deletedId: removed.id,
        stats: computeAdStats(this.state.ads, getTodayIstYmd(), getCurrentIstHm()),
        nextAdNumber: nextAvailableAdNumber(),
      });
    });
  }

  public getAdShareMetadata(lookup: string, previewToken?: string): {
    id: string;
    adNumber: string;
    title: string;
    description: string;
    mainImageUrl: string;
    category: string;
  } | null {
    const cleanLookup = String(lookup || '').trim();
    if (!cleanLookup) return null;
    const found = this.state.ads.find(
      (ad) =>
        ad.id === cleanLookup ||
        ad.adNumber.toUpperCase() === cleanLookup.toUpperCase() ||
        (ad.sharing?.customSlug && ad.sharing.customSlug.toLowerCase() === cleanLookup.toLowerCase())
    );
    if (!found) return null;

    let previewAuthorized = false;
    if (previewToken && found.previewToken) {
      const a = Buffer.from(previewToken.trim());
      const b = Buffer.from(found.previewToken);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        previewAuthorized = true;
      }
    }

    if (!previewAuthorized && !isAdCurrentlyActive(found, getTodayIstYmd(), getCurrentIstHm())) {
      return null;
    }

    return {
      id: found.id,
      adNumber: found.adNumber,
      title: found.title,
      description: stripMarkup(found.description).slice(0, 260),
      mainImageUrl: found.mainImageUrl,
      category: found.category,
    };
  }
}
