import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import * as webpush from 'web-push';
import { stripRichTextToPlainText } from '../utils/richText.ts';

export interface PushPreferences {
  breakingNews: boolean;
  dailyDigest: boolean;
  localNews: boolean;
  agricultureUpdates: boolean;
  events: boolean;
}

export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  preferences: PushPreferences;
  digestTimeLocal: string;
  timezone: string;
  deliveredArticleIds: string[];
  lastDigestDateKey?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PushVapidKeysFile {
  publicKey: string;
  privateKey: string;
  subject: string;
  createdAt: string;
}

export interface PushArticleSummaryInput {
  id: string;
  titleKannada: string;
  summaryKannada: string;
  category: string;
  location: string;
  publishedTimestamp?: number;
  publishedDate?: string;
  isFeatured?: boolean;
}

export interface SendPushBroadcastInput {
  articleId: string;
  title: string;
  summary?: string;
  category?: string;
  location?: string;
  mode: 'breaking' | 'all';
  bypassDedup?: boolean;
}

export interface PushDeliverySummary {
  ok: boolean;
  targeted: number;
  sent: number;
  failed: number;
  pruned: number;
  skippedAlreadyDelivered: number;
  error?: string;
}

export interface PushStatsSnapshot {
  totalSubscribers: number;
  breakingSubscribers: number;
  digestSubscribers: number;
  localSubscribers: number;
  agricultureSubscribers: number;
  eventsSubscribers: number;
  lastDigestRunAt: string | null;
  lastDigestArticleCount: number;
  vapidPublicKeyConfigured: boolean;
}

export interface PushDispatchResult {
  statusCode?: number;
  gone?: boolean;
  ok: boolean;
  error?: string;
}

export type PushDispatcherFn = (
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  },
  payloadJson: string
) => Promise<PushDispatchResult>;

const PUBLIC_ORIGIN = 'https://coffeenadu.in';
const DEFAULT_VAPID_SUBJECT = 'mailto:desk@coffeenadu.in';
const MAX_DELIVERED_HISTORY = 120;

export function createDefaultPushPreferences(): PushPreferences {
  return {
    breakingNews: true,
    dailyDigest: false,
    localNews: true,
    agricultureUpdates: true,
    events: true,
  };
}

export function sanitizePushPreferences(raw: unknown): PushPreferences {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const defaults = createDefaultPushPreferences();
  return {
    breakingNews: typeof rec.breakingNews === 'boolean' ? rec.breakingNews : defaults.breakingNews,
    dailyDigest: typeof rec.dailyDigest === 'boolean' ? rec.dailyDigest : defaults.dailyDigest,
    localNews: typeof rec.localNews === 'boolean' ? rec.localNews : defaults.localNews,
    agricultureUpdates:
      typeof rec.agricultureUpdates === 'boolean'
        ? rec.agricultureUpdates
        : defaults.agricultureUpdates,
    events: typeof rec.events === 'boolean' ? rec.events : defaults.events,
  };
}

export function sanitizeDigestTimeLocal(raw: unknown): string {
  if (typeof raw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.trim())) {
    return raw.trim();
  }
  return '08:00';
}

function isBlockedPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!lower) return true;
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export function validatePushSubscriptionInput(raw: unknown): {
  valid: boolean;
  error?: string;
  subscription?: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  };
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Subscription object is required.' };
  }
  const obj = raw as Record<string, unknown>;
  const endpoint = typeof obj.endpoint === 'string' ? obj.endpoint.trim() : '';
  if (!endpoint || endpoint.length > 2048) {
    return { valid: false, error: 'Valid push endpoint URL is required.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    return { valid: false, error: 'Invalid push endpoint URL.' };
  }

  if (parsedUrl.protocol !== 'https:') {
    return { valid: false, error: 'Push endpoint must use HTTPS.' };
  }
  if (isBlockedPrivateOrLocalHost(parsedUrl.hostname)) {
    return { valid: false, error: 'Push endpoint host is not allowed.' };
  }

  const keysRaw = obj.keys && typeof obj.keys === 'object' ? (obj.keys as Record<string, unknown>) : null;
  const p256dh = typeof keysRaw?.p256dh === 'string' ? keysRaw.p256dh.trim() : '';
  const auth = typeof keysRaw?.auth === 'string' ? keysRaw.auth.trim() : '';

  if (p256dh.length < 16 || p256dh.length > 512 || auth.length < 8 || auth.length > 256) {
    return { valid: false, error: 'Valid Web Push encryption keys (p256dh & auth) are required.' };
  }

  const expirationTime =
    typeof obj.expirationTime === 'number' && Number.isFinite(obj.expirationTime)
      ? obj.expirationTime
      : null;

  return {
    valid: true,
    subscription: {
      endpoint,
      expirationTime,
      keys: { p256dh, auth },
    },
  };
}

export function hashSubscriptionId(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);
}

export function matchesArticlePushPreferences(
  prefs: PushPreferences,
  category: string,
  mode: 'breaking' | 'all'
): boolean {
  if (mode === 'all') {
    return (
      prefs.breakingNews ||
      prefs.localNews ||
      prefs.agricultureUpdates ||
      prefs.events ||
      prefs.dailyDigest
    );
  }

  if (prefs.breakingNews) return true;
  const cat = (category || '').toLowerCase();
  if (cat.includes('agri') && prefs.agricultureUpdates) return true;
  if ((cat.includes('event') || cat.includes('culture')) && prefs.events) return true;
  if ((cat.includes('local') || cat.includes('civic')) && prefs.localNews) return true;
  return false;
}

export function buildArticlePushPayload(input: {
  articleId: string;
  title: string;
  summary?: string;
  location?: string;
  mode?: 'breaking' | 'all';
}): string {
  const cleanTitle = stripRichTextToPlainText(input.title).trim().slice(0, 140) || 'Coffeenadu News Update';
  const cleanSummary = stripRichTextToPlainText(input.summary || '').trim().slice(0, 220);
  const place = (input.location || '').split('(')[0].trim();
  const bodyParts = [place ? `📍 ${place}` : '', cleanSummary || cleanTitle].filter(Boolean);
  const body = bodyParts.join(' · ').slice(0, 240);
  const encodedId = encodeURIComponent(input.articleId.trim());

  return JSON.stringify({
    title: input.mode === 'all' ? `Coffeenadu News: ${cleanTitle}` : `🔴 BREAKING: ${cleanTitle}`,
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    image: `${PUBLIC_ORIGIN}/api/article-image/${encodedId}`,
    url: `${PUBLIC_ORIGIN}/?article=${encodedId}`,
    articleId: input.articleId.trim(),
    tag: `cn-article-${input.articleId.trim()}`,
  });
}

export function getIstDateKey(nowMs = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(nowMs));
    const y = parts.find((p) => p.type === 'year')?.value || '2026';
    const m = parts.find((p) => p.type === 'month')?.value || '01';
    const d = parts.find((p) => p.type === 'day')?.value || '01';
    return `${y}-${m}-${d}`;
  } catch {
    const ist = new Date(nowMs + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().slice(0, 10);
  }
}

export function getIstHourMinute(nowMs = Date.now()): { hour: number; minute: number; hm: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(nowMs));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
    return {
      hour,
      minute,
      hm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
  } catch {
    const ist = new Date(nowMs + 5.5 * 60 * 60 * 1000);
    const hour = ist.getUTCHours();
    const minute = ist.getUTCMinutes();
    return {
      hour,
      minute,
      hm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
  }
}

export function digestTimeMatchesWindow(digestTimeLocal: string, currentIstHm: string, windowMinutes = 15): boolean {
  const [dh, dm] = sanitizeDigestTimeLocal(digestTimeLocal).split(':').map(Number);
  const [ch, cm] = sanitizeDigestTimeLocal(currentIstHm).split(':').map(Number);
  const targetTotal = dh * 60 + dm;
  const currentTotal = ch * 60 + cm;
  return currentTotal >= targetTotal && currentTotal <= targetTotal + windowMinutes;
}

export function selectArticlesForDailyDigest(
  articles: PushArticleSummaryInput[],
  nowMs = Date.now(),
  lookbackHours = 36,
  maxItems = 4
): PushArticleSummaryInput[] {
  const cutoff = nowMs - lookbackHours * 60 * 60 * 1000;
  const recent = articles
    .filter((a) => {
      const title = stripRichTextToPlainText(a.titleKannada);
      if (!a.id || !title) return false;
      if (typeof a.publishedTimestamp === 'number' && a.publishedTimestamp > 0) {
        return a.publishedTimestamp >= cutoff;
      }
      return false;
    })
    .sort((a, b) => (b.publishedTimestamp ?? 0) - (a.publishedTimestamp ?? 0));

  return recent.slice(0, maxItems);
}

export function buildDailyDigestPushPayload(articles: PushArticleSummaryInput[]): string | null {
  if (!articles.length) return null;
  const headlines = articles
    .slice(0, 3)
    .map((a) => stripRichTextToPlainText(a.titleKannada).trim())
    .filter(Boolean);
  if (!headlines.length) return null;

  const topArticle = articles[0];
  const encodedId = encodeURIComponent(topArticle.id);
  const body = headlines.map((h) => `• ${h.slice(0, 72)}`).join(' ').slice(0, 240);

  return JSON.stringify({
    title: 'Coffeenadu News – ಇಂದಿನ ಪ್ರಮುಖ ಸುದ್ದಿಗಳು',
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    image: `${PUBLIC_ORIGIN}/api/article-image/${encodedId}`,
    url: `${PUBLIC_ORIGIN}/`,
    tag: `cn-digest-${getIstDateKey()}`,
  });
}

export async function dispatchToSubscribersWithPruning(
  subscribers: StoredPushSubscription[],
  options: {
    payloadJson: string;
    articleId?: string;
    digestDateKey?: string;
    bypassDedup?: boolean;
    predicate: (sub: StoredPushSubscription) => boolean;
    dispatcher: PushDispatcherFn;
  }
): Promise<{ updatedSubscribers: StoredPushSubscription[]; summary: PushDeliverySummary }> {
  let targeted = 0;
  let sent = 0;
  let failed = 0;
  let pruned = 0;
  let skippedAlreadyDelivered = 0;

  const nextSubscribers: StoredPushSubscription[] = [];

  for (const sub of subscribers) {
    if (!options.predicate(sub)) {
      nextSubscribers.push(sub);
      continue;
    }

    if (
      options.articleId &&
      !options.bypassDedup &&
      sub.deliveredArticleIds.includes(options.articleId)
    ) {
      skippedAlreadyDelivered += 1;
      nextSubscribers.push(sub);
      continue;
    }

    if (options.digestDateKey && sub.lastDigestDateKey === options.digestDateKey) {
      skippedAlreadyDelivered += 1;
      nextSubscribers.push(sub);
      continue;
    }

    targeted += 1;
    const outcome = await options.dispatcher(
      {
        endpoint: sub.endpoint,
        expirationTime: sub.expirationTime,
        keys: sub.keys,
      },
      options.payloadJson
    );

    if (outcome.ok) {
      sent += 1;
      const nextDelivered = options.articleId
        ? Array.from(new Set([options.articleId, ...sub.deliveredArticleIds])).slice(
            0,
            MAX_DELIVERED_HISTORY
          )
        : sub.deliveredArticleIds;
      nextSubscribers.push({
        ...sub,
        deliveredArticleIds: nextDelivered,
        lastDigestDateKey: options.digestDateKey || sub.lastDigestDateKey,
        updatedAt: new Date().toISOString(),
      });
    } else if (outcome.gone || outcome.statusCode === 404 || outcome.statusCode === 410) {
      pruned += 1;
      // Expired/unregistered endpoint removed permanently
    } else {
      failed += 1;
      nextSubscribers.push(sub);
    }
  }

  return {
    updatedSubscribers: nextSubscribers,
    summary: {
      ok: true,
      targeted,
      sent,
      failed,
      pruned,
      skippedAlreadyDelivered,
    },
  };
}

interface PersistedPushStore {
  subscriptions: StoredPushSubscription[];
  lastDigestRunAt: string | null;
  lastDigestArticleCount: number;
}

export class PushSubscriptionService {
  private readonly subscriptionsFile: string;
  private readonly vapidKeysFile: string;
  private store: PersistedPushStore;
  private vapidKeys: PushVapidKeysFile;
  private digestTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dataDir: string) {
    this.subscriptionsFile = path.join(dataDir, 'push-subscriptions.json');
    this.vapidKeysFile = path.join(dataDir, 'push-vapid-keys.json');
    this.vapidKeys = this.loadOrCreateVapidKeys();
    this.store = this.loadStore();

    try {
      webpush.setVapidDetails(
        this.vapidKeys.subject,
        this.vapidKeys.publicKey,
        this.vapidKeys.privateKey
      );
    } catch {
      // Regenerate valid VAPID pair if stored/env keys were invalid
      const fresh = webpush.generateVAPIDKeys();
      this.vapidKeys = {
        publicKey: fresh.publicKey,
        privateKey: fresh.privateKey,
        subject: DEFAULT_VAPID_SUBJECT,
        createdAt: new Date().toISOString(),
      };
      this.persistVapidKeys();
      webpush.setVapidDetails(
        this.vapidKeys.subject,
        this.vapidKeys.publicKey,
        this.vapidKeys.privateKey
      );
    }
  }

  private loadOrCreateVapidKeys(): PushVapidKeysFile {
    const envPublic = (process.env.VAPID_PUBLIC_KEY || '').trim();
    const envPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
    const envSubjectRaw = (process.env.VAPID_SUBJECT || '').trim();
    const subject =
      envSubjectRaw.startsWith('mailto:') || envSubjectRaw.startsWith('https://')
        ? envSubjectRaw
        : DEFAULT_VAPID_SUBJECT;

    if (envPublic && envPrivate) {
      return {
        publicKey: envPublic,
        privateKey: envPrivate,
        subject,
        createdAt: new Date().toISOString(),
      };
    }

    if (fs.existsSync(this.vapidKeysFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.vapidKeysFile, 'utf8')) as Partial<PushVapidKeysFile>;
        if (parsed.publicKey && parsed.privateKey) {
          return {
            publicKey: parsed.publicKey,
            privateKey: parsed.privateKey,
            subject: parsed.subject || subject,
            createdAt: parsed.createdAt || new Date().toISOString(),
          };
        }
      } catch {
        // Re-generate cleanly
      }
    }

    const generated = webpush.generateVAPIDKeys();
    const record: PushVapidKeysFile = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject,
      createdAt: new Date().toISOString(),
    };
    this.vapidKeys = record;
    this.persistVapidKeys();
    return record;
  }

  private persistVapidKeys(): void {
    try {
      fs.writeFileSync(this.vapidKeysFile, JSON.stringify(this.vapidKeys, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      // Non-fatal in read-only environments
    }
  }

  private loadStore(): PersistedPushStore {
    if (fs.existsSync(this.subscriptionsFile)) {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(this.subscriptionsFile, 'utf8')
        ) as Partial<PersistedPushStore>;
        if (Array.isArray(parsed.subscriptions)) {
          return {
            subscriptions: parsed.subscriptions,
            lastDigestRunAt: typeof parsed.lastDigestRunAt === 'string' ? parsed.lastDigestRunAt : null,
            lastDigestArticleCount: Number(parsed.lastDigestArticleCount) || 0,
          };
        }
      } catch {
        // Fallback to empty store
      }
    }
    return {
      subscriptions: [],
      lastDigestRunAt: null,
      lastDigestArticleCount: 0,
    };
  }

  private persistStore(): void {
    try {
      fs.writeFileSync(this.subscriptionsFile, JSON.stringify(this.store, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      // Non-fatal
    }
  }

  public getPublicVapidKey(): string {
    return this.vapidKeys.publicKey;
  }

  public getStats(): PushStatsSnapshot {
    const subs = this.store.subscriptions;
    return {
      totalSubscribers: subs.length,
      breakingSubscribers: subs.filter((s) => s.preferences.breakingNews).length,
      digestSubscribers: subs.filter((s) => s.preferences.dailyDigest).length,
      localSubscribers: subs.filter((s) => s.preferences.localNews).length,
      agricultureSubscribers: subs.filter((s) => s.preferences.agricultureUpdates).length,
      eventsSubscribers: subs.filter((s) => s.preferences.events).length,
      lastDigestRunAt: this.store.lastDigestRunAt,
      lastDigestArticleCount: this.store.lastDigestArticleCount,
      vapidPublicKeyConfigured: Boolean(this.vapidKeys.publicKey),
    };
  }

  public upsertSubscription(input: {
    subscription: unknown;
    preferences?: unknown;
    digestTimeLocal?: unknown;
    userAgent?: string;
  }): {
    ok: boolean;
    error?: string;
    record?: StoredPushSubscription;
  } {
    const check = validatePushSubscriptionInput(input.subscription);
    if (!check.valid || !check.subscription) {
      return { ok: false, error: check.error || 'Invalid subscription.' };
    }

    const id = hashSubscriptionId(check.subscription.endpoint);
    const nowIso = new Date().toISOString();
    const existingIdx = this.store.subscriptions.findIndex(
      (s) => s.id === id || s.endpoint === check.subscription!.endpoint
    );
    const prefs = sanitizePushPreferences(
      input.preferences ??
        (existingIdx >= 0 ? this.store.subscriptions[existingIdx].preferences : undefined)
    );
    const digestTimeLocal = sanitizeDigestTimeLocal(
      input.digestTimeLocal ??
        (existingIdx >= 0 ? this.store.subscriptions[existingIdx].digestTimeLocal : '08:00')
    );

    const record: StoredPushSubscription = {
      id,
      endpoint: check.subscription.endpoint,
      expirationTime: check.subscription.expirationTime,
      keys: check.subscription.keys,
      preferences: prefs,
      digestTimeLocal,
      timezone: 'Asia/Kolkata',
      deliveredArticleIds:
        existingIdx >= 0 ? this.store.subscriptions[existingIdx].deliveredArticleIds : [],
      lastDigestDateKey:
        existingIdx >= 0 ? this.store.subscriptions[existingIdx].lastDigestDateKey : undefined,
      userAgent: typeof input.userAgent === 'string' ? input.userAgent.slice(0, 180) : undefined,
      createdAt: existingIdx >= 0 ? this.store.subscriptions[existingIdx].createdAt : nowIso,
      updatedAt: nowIso,
    };

    if (existingIdx >= 0) {
      this.store.subscriptions[existingIdx] = record;
    } else {
      this.store.subscriptions.push(record);
    }
    this.persistStore();
    return { ok: true, record };
  }

  public updatePreferencesByEndpoint(input: {
    endpoint: string;
    preferences?: unknown;
    digestTimeLocal?: unknown;
  }): { ok: boolean; error?: string; record?: StoredPushSubscription } {
    const cleanEndpoint = typeof input.endpoint === 'string' ? input.endpoint.trim() : '';
    if (!cleanEndpoint) {
      return { ok: false, error: 'Endpoint is required.' };
    }
    const idx = this.store.subscriptions.findIndex((s) => s.endpoint === cleanEndpoint);
    if (idx === -1) {
      return { ok: false, error: 'Subscription not found.' };
    }
    const current = this.store.subscriptions[idx];
    const updated: StoredPushSubscription = {
      ...current,
      preferences:
        input.preferences !== undefined
          ? sanitizePushPreferences({ ...current.preferences, ...(input.preferences as object) })
          : current.preferences,
      digestTimeLocal:
        input.digestTimeLocal !== undefined
          ? sanitizeDigestTimeLocal(input.digestTimeLocal)
          : current.digestTimeLocal,
      updatedAt: new Date().toISOString(),
    };
    this.store.subscriptions[idx] = updated;
    this.persistStore();
    return { ok: true, record: updated };
  }

  public removeByEndpoint(endpoint: string): { ok: boolean; removed: boolean } {
    const clean = typeof endpoint === 'string' ? endpoint.trim() : '';
    if (!clean) return { ok: true, removed: false };
    const before = this.store.subscriptions.length;
    this.store.subscriptions = this.store.subscriptions.filter((s) => s.endpoint !== clean);
    const removed = this.store.subscriptions.length !== before;
    if (removed) {
      this.persistStore();
    }
    return { ok: true, removed };
  }

  private async dispatchSingleNotification(
    sub: {
      endpoint: string;
      expirationTime?: number | null;
      keys: { p256dh: string; auth: string };
    },
    payloadJson: string
  ): Promise<PushDispatchResult> {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          expirationTime: sub.expirationTime ?? undefined,
          keys: sub.keys,
        },
        payloadJson,
        { TTL: 60 * 60 * 12 }
      );
      return { ok: true };
    } catch (err) {
      const statusCode = Number((err as { statusCode?: number })?.statusCode || 0);
      const gone = statusCode === 404 || statusCode === 410;
      return {
        ok: false,
        statusCode: statusCode || undefined,
        gone,
        error: err instanceof Error ? err.message : 'Push dispatch error',
      };
    }
  }

  public async sendBreakingNotification(
    input: SendPushBroadcastInput
  ): Promise<PushDeliverySummary> {
    const cleanId = (input.articleId || '').trim();
    const cleanTitle = stripRichTextToPlainText(input.title || '').trim();
    if (!cleanId || !cleanTitle) {
      return {
        ok: false,
        targeted: 0,
        sent: 0,
        failed: 0,
        pruned: 0,
        skippedAlreadyDelivered: 0,
        error: 'Article ID and title are required.',
      };
    }

    const payloadJson = buildArticlePushPayload({
      articleId: cleanId,
      title: cleanTitle,
      summary: input.summary,
      location: input.location,
      mode: input.mode,
    });

    const result = await dispatchToSubscribersWithPruning(this.store.subscriptions, {
      payloadJson,
      articleId: cleanId,
      bypassDedup: Boolean(input.bypassDedup),
      predicate: (sub) =>
        matchesArticlePushPreferences(sub.preferences, input.category || 'Local', input.mode),
      dispatcher: (sub, payload) => this.dispatchSingleNotification(sub, payload),
    });

    if (
      result.summary.sent > 0 ||
      result.summary.pruned > 0
    ) {
      this.store.subscriptions = result.updatedSubscribers;
      this.persistStore();
    }

    return result.summary;
  }

  public async sendDailyDigest(options: {
    articles: PushArticleSummaryInput[];
    manualTrigger?: boolean;
  }): Promise<PushDeliverySummary> {
    const recentArticles = selectArticlesForDailyDigest(options.articles, Date.now(), 36, 4);
    const payloadJson = buildDailyDigestPushPayload(recentArticles);
    if (!payloadJson) {
      return {
        ok: false,
        targeted: 0,
        sent: 0,
        failed: 0,
        pruned: 0,
        skippedAlreadyDelivered: 0,
        error: 'No recent real articles available for today’s digest.',
      };
    }

    const todayIst = getIstDateKey();
    const currentHm = getIstHourMinute().hm;

    const result = await dispatchToSubscribersWithPruning(this.store.subscriptions, {
      payloadJson,
      digestDateKey: options.manualTrigger ? undefined : todayIst,
      predicate: (sub) => {
        if (!sub.preferences.dailyDigest) return false;
        if (options.manualTrigger) return true;
        return digestTimeMatchesWindow(sub.digestTimeLocal, currentHm, 15);
      },
      dispatcher: (sub, payload) => this.dispatchSingleNotification(sub, payload),
    });

    this.store.subscriptions = result.updatedSubscribers;
    if (result.summary.sent > 0) {
      this.store.lastDigestRunAt = new Date().toISOString();
      this.store.lastDigestArticleCount = recentArticles.length;
    }
    this.persistStore();
    return result.summary;
  }

  public startDailyDigestScheduler(
    loadRecentArticles: () => Promise<PushArticleSummaryInput[]>
  ): void {
    if (this.digestTimer) return;
    this.digestTimer = setInterval(() => {
      const digestSubscribers = this.store.subscriptions.filter((s) => s.preferences.dailyDigest);
      if (digestSubscribers.length === 0) return;

      const todayIst = getIstDateKey();
      const currentHm = getIstHourMinute().hm;
      const due = digestSubscribers.some(
        (s) =>
          s.lastDigestDateKey !== todayIst &&
          digestTimeMatchesWindow(s.digestTimeLocal, currentHm, 15)
      );
      if (!due) return;

      void loadRecentArticles()
        .then((articles) => this.sendDailyDigest({ articles, manualTrigger: false }))
        .catch(() => {
          // Non-fatal background digest error
        });
    }, 10 * 60 * 1000);
    this.digestTimer.unref?.();
  }

  public stopScheduler(): void {
    if (this.digestTimer) {
      clearInterval(this.digestTimer);
      this.digestTimer = null;
    }
  }

  public mountPublicRoutes(app: Express): void {
    app.get('/api/public/push/vapid-public-key', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        configured: Boolean(this.vapidKeys.publicKey),
        publicKey: this.vapidKeys.publicKey,
      });
    });

    app.post('/api/public/push/subscribe', (req: Request, res: Response) => {
      const result = this.upsertSubscription({
        subscription: req.body?.subscription ?? req.body,
        preferences: req.body?.preferences,
        digestTimeLocal: req.body?.digestTimeLocal,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      });
      if (!result.ok || !result.record) {
        res.status(400).json({ ok: false, error: result.error || 'Invalid push subscription.' });
        return;
      }
      res.json({
        ok: true,
        subscriptionId: result.record.id,
        preferences: result.record.preferences,
        digestTimeLocal: result.record.digestTimeLocal,
      });
    });

    app.put('/api/public/push/preferences', (req: Request, res: Response) => {
      const result = this.updatePreferencesByEndpoint({
        endpoint: req.body?.endpoint,
        preferences: req.body?.preferences,
        digestTimeLocal: req.body?.digestTimeLocal,
      });
      if (!result.ok || !result.record) {
        res.status(404).json({ ok: false, error: result.error || 'Subscription not found.' });
        return;
      }
      res.json({
        ok: true,
        preferences: result.record.preferences,
        digestTimeLocal: result.record.digestTimeLocal,
      });
    });

    app.post('/api/public/push/unsubscribe', (req: Request, res: Response) => {
      const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
      const result = this.removeByEndpoint(endpoint);
      res.json(result);
    });
  }
}
