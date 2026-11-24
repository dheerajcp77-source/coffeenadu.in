import 'dotenv/config';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import express, { type NextFunction, type Request, type Response } from 'express';
import sharp from 'sharp';
import { SEED_ARTICLES as PORTAL_SEED_ARTICLES } from './src/constants/seedArticles.ts';
import { Admin2Backend } from './src/server/admin2Backend.ts';
import { SheetsStorageManager } from './src/server/sheetsStorageProxy.ts';

void execFile;
void promisify;
void os;
type NewsCategory =
  | 'Local'
  | 'Agriculture'
  | 'Civic & Roads'
  | 'Education'
  | 'Culture'
  | 'Sports';

type ImageKey =
  | 'none'
  | 'koppa-landscape'
  | 'coffee-estate'
  | 'tunga-bridge'
  | 'malnad-culture';

interface NewsArticle {
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
  imageCaption?: string;
  isFeatured?: boolean;
  authorUid?: string;
}

interface BusTimingItem {
  timingId: number;
  departureTime: string;
  departureTime24?: string;
  busName: string;
  remarks: string;
  fromPlaceEn?: string;
  fromPlaceKn?: string;
}

interface BusRouteSchedule {
  routeId: number;
  routeName: string;
  description: string;
  timings: BusTimingItem[];
}

interface BusPlaceSummary {
  titleId: number;
  placeId: number;
  nameEn: string;
  nameKn: string;
  routeCount: number;
}

interface BusPlaceScheduleResponse {
  places: BusPlaceSummary[];
  activePlace: BusPlaceSummary;
  routes: BusRouteSchedule[];
}

type BusAgentTimePreference = 'all' | 'morning' | 'afternoon' | 'evening';

interface BusAgentChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface BusAgentMatchedRoute {
  placeNameEn: string;
  placeNameKn: string;
  routeId: number;
  routeTitle: string;
  routeSubtitle?: string;
  fromPlaceLabel: string;
  matchType: 'direct' | 'via';
  timings: BusTimingItem[];
}

interface BusAgentResponse {
  status: 'needs_both' | 'needs_origin' | 'needs_destination' | 'ready';
  reply: string;
  origin?: string;
  destination?: string;
  timePreference?: BusAgentTimePreference;
  matchedRoutes: BusAgentMatchedRoute[];
  suggestedHubs?: string[];
}

const NEWS_CATEGORIES: NewsCategory[] = [
  'Local',
  'Agriculture',
  'Civic & Roads',
  'Education',
  'Culture',
  'Sports',
];

const KOPPA_LOCATIONS: string[] = [
  'Koppa Town',
  'Jayapura',
  'Hariharapura',
  'Basarikatte',
  'Kudregundi',
  'Megur',
  'Narve',
];

const REMOVED_LEGACY_ARTICLE_IDS = new Set(['koppa-fog-advisory-01']);

const SEED_ARTICLES: NewsArticle[] = (PORTAL_SEED_ARTICLES as unknown as NewsArticle[]).filter(
  (article) => !REMOVED_LEGACY_ARTICLE_IDS.has(article.id)
);

interface AdminAuthRecord {
  email: string;
  passwordHash: string;
  recoveryKeyHash: string;
  updatedAt: string;
}

interface PendingOtp {
  codeHash: string;
  expiresAt: number;
}

interface AuthenticatedRequest extends Request {
  adminEmail?: string;
}

function resolveWritableDataDir(): string {
  const preferred = path.resolve(process.cwd(), 'data');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'coffeenadu-news-data');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function resolveServerPort(): number {
  const portFlagIdx = process.argv.findIndex((arg) => arg === '--port' || arg === '-p');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const cliPort = Number(process.argv[portFlagIdx + 1]);
    if (Number.isInteger(cliPort) && cliPort > 0 && cliPort <= 65535) {
      return cliPort;
    }
  }
  const eqArg = process.argv.find((arg) => arg.startsWith('--port='));
  if (eqArg) {
    const cliPort = Number(eqArg.slice('--port='.length));
    if (Number.isInteger(cliPort) && cliPort > 0 && cliPort <= 65535) {
      return cliPort;
    }
  }
  return Number(process.env.PORT) || 3000;
}

const PORT = resolveServerPort();
const DATA_DIR = resolveWritableDataDir();
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const ARTICLES_FILE = path.join(DATA_DIR, 'news-store.json');
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const BUS_CACHE_FILE = path.join(DATA_DIR, 'bus-timings-cache.json');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const VALID_IMAGE_KEYS: ImageKey[] = [
  'none',
  'koppa-landscape',
  'coffee-estate',
  'tunga-bridge',
  'malnad-culture',
];

function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifySecret(secret: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(secret, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (fs.existsSync(SESSION_SECRET_FILE)) {
    const existing = fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SESSION_SECRET_FILE, generated, 'utf8');
  return generated;
}

const SESSION_SECRET = getSessionSecret();

function ensureAuthRecord(): AdminAuthRecord {
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const raw = fs.readFileSync(AUTH_FILE, 'utf8');
      const parsed = JSON.parse(raw) as AdminAuthRecord;
      if (parsed.email && parsed.passwordHash && parsed.recoveryKeyHash) {
        return parsed;
      }
    } catch {
      // Re-seed if corrupted
    }
  }
  const initialEmail = (process.env.ADMIN_EMAIL || 'dheerajcp77@gmail.com').trim().toLowerCase();
  const initialPassword = process.env.ADMIN_PASSWORD || 'hacrr@53*';
  const initialRecoveryKey = process.env.ADMIN_RECOVERY_KEY || 'KOPPA-577126';

  const record: AdminAuthRecord = {
    email: initialEmail,
    passwordHash: hashSecret(initialPassword),
    recoveryKeyHash: hashSecret(initialRecoveryKey),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(record, null, 2), 'utf8');
  return record;
}

function saveAuthRecord(record: AdminAuthRecord): void {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(record, null, 2), 'utf8');
}

function loadArticles(): NewsArticle[] {
  if (fs.existsSync(ARTICLES_FILE)) {
    try {
      const raw = fs.readFileSync(ARTICLES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = (parsed as NewsArticle[]).filter(
          (article) => article && !REMOVED_LEGACY_ARTICLE_IDS.has(article.id)
        );
        if (cleaned.length !== parsed.length) {
          const next = cleaned.length > 0 ? cleaned : [...SEED_ARTICLES];
          fs.writeFileSync(ARTICLES_FILE, JSON.stringify(next, null, 2), 'utf8');
          return next;
        }
        return cleaned;
      }
    } catch {
      // Fallback to seed below
    }
  }
  fs.writeFileSync(ARTICLES_FILE, JSON.stringify(SEED_ARTICLES, null, 2), 'utf8');
  return [...SEED_ARTICLES];
}

function saveArticles(articles: NewsArticle[]): void {
  fs.writeFileSync(ARTICLES_FILE, JSON.stringify(articles, null, 2), 'utf8');
}

function signToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      email,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token: string): { email: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
      exp?: number;
    };
    if (!decoded.email || !decoded.exp || decoded.exp < Date.now()) {
      return null;
    }
    const auth = ensureAuthRecord();
    if (decoded.email.toLowerCase() !== auth.email.toLowerCase()) {
      return null;
    }
    return { email: decoded.email };
  } catch {
    return null;
  }
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in to /admin.' });
    return;
  }
  const verified = verifyToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Invalid or expired admin session. Please sign in again.' });
    return;
  }
  req.adminEmail = verified.email;
  next();
}

let pendingOtp: PendingOtp | null = null;

function sanitizeCategory(value: unknown): NewsCategory {
  if (typeof value === 'string' && NEWS_CATEGORIES.includes(value as NewsCategory)) {
    return value as NewsCategory;
  }
  return 'Local';
}

function sanitizeImageKey(value: unknown): ImageKey {
  if (typeof value === 'string' && VALID_IMAGE_KEYS.includes(value as ImageKey)) {
    return value as ImageKey;
  }
  return 'none';
}

function normalizeParagraphs(body: unknown): string[] {
  if (Array.isArray(body)) {
    return body
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof body === 'string') {
    return body
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

interface RawHudkooRoute {
  route_id: number;
  route_name: string;
  description: string;
  is_active?: boolean;
}

interface RawHudkooPlace {
  title_id: number;
  title_kn: string;
  title_en: string;
  place_id: number;
  is_active?: boolean;
  routes?: RawHudkooRoute[];
}

interface RawHudkooTiming {
  timing_id: number;
  departure_time: string;
  bus_name: string;
  remarks?: string | null;
  is_active?: boolean;
  from_place_name_en?: string | null;
  from_place_name_kn?: string | null;
}

interface BusCacheStore {
  cacheVersion?: number;
  fetchedAt: number;
  places: BusPlaceSummary[];
  routesByPlace: Record<string, BusRouteSchedule[]>;
}

const BUS_CACHE_VERSION = 2;
const BUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let busMemoryCache: BusCacheStore | null = null;
let allBusWarmupPromise: Promise<BusCacheStore> | null = null;

function formatDepartureTime(timeStr: string): string {
  const parts = timeStr.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] || '0');
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

function getTime24HourBucket(time24: string | undefined, formatted: string): Exclude<BusAgentTimePreference, 'all'> {
  let hour24 = 0;
  if (time24 && /^\d{1,2}:\d{2}/.test(time24)) {
    hour24 = Number(time24.split(':')[0]);
  } else {
    const isPm = formatted.endsWith('PM');
    const hourPart = Number(formatted.split(':')[0]);
    hour24 = isPm ? (hourPart === 12 ? 12 : hourPart + 12) : hourPart === 12 ? 0 : hourPart;
  }
  if (hour24 >= 4 && hour24 < 12) return 'morning';
  if (hour24 >= 12 && hour24 < 17) return 'afternoon';
  return 'evening';
}

function readDiskBusCache(): BusCacheStore | null {
  if (!fs.existsSync(BUS_CACHE_FILE)) return null;
  try {
    const raw = fs.readFileSync(BUS_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as BusCacheStore;
    if (
      parsed &&
      parsed.cacheVersion === BUS_CACHE_VERSION &&
      Array.isArray(parsed.places) &&
      parsed.routesByPlace
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function writeDiskBusCache(cache: BusCacheStore): void {
  try {
    fs.writeFileSync(
      BUS_CACHE_FILE,
      JSON.stringify({
        cacheVersion: BUS_CACHE_VERSION,
        fetchedAt: cache.fetchedAt,
        places: cache.places,
        routesByPlace: cache.routesByPlace,
      }),
      'utf8'
    );
  } catch {
    // Ignore disk cache write errors
  }
}

async function fetchMainPlacesFromHudkoo(): Promise<RawHudkooPlace[] | null> {
  try {
    const resp = await fetch('https://hudkoo.com/api/bus/main-places', {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as RawHudkooPlace[];
    if (Array.isArray(json) && json.length > 0) {
      return json.filter((p) => p.is_active !== false);
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchPlaceRoutesFromHudkoo(
  rawForPlace: RawHudkooPlace
): Promise<BusRouteSchedule[]> {
  const activeRoutes = (rawForPlace.routes || []).filter((r) => r.is_active !== false);
  return Promise.all(
    activeRoutes.map(async (route): Promise<BusRouteSchedule> => {
      try {
        const detailResp = await fetch(
          `https://hudkoo.com/api/bus/routes/${route.route_id}/details`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!detailResp.ok) {
          return {
            routeId: route.route_id,
            routeName: route.route_name.trim(),
            description: route.description.trim(),
            timings: [],
          };
        }
        const detailJson = (await detailResp.json()) as { timings?: RawHudkooTiming[] };
        const timings = (detailJson.timings || [])
          .filter((t) => t.is_active !== false)
          .sort((a, b) => a.departure_time.localeCompare(b.departure_time))
          .map((t) => ({
            timingId: t.timing_id,
            departureTime: formatDepartureTime(t.departure_time),
            departureTime24: t.departure_time.slice(0, 5),
            busName: (t.bus_name || '').trim(),
            remarks: (t.remarks || '').trim(),
            fromPlaceEn: (t.from_place_name_en || '').trim() || rawForPlace.title_en.trim(),
            fromPlaceKn: (t.from_place_name_kn || '').trim() || rawForPlace.title_kn.trim(),
          }));
        return {
          routeId: route.route_id,
          routeName: route.route_name.trim(),
          description: route.description.trim(),
          timings,
        };
      } catch {
        return {
          routeId: route.route_id,
          routeName: route.route_name.trim(),
          description: route.description.trim(),
          timings: [],
        };
      }
    })
  );
}

async function ensureFreshBusPlaces(): Promise<{
  cache: BusCacheStore;
  rawPlaces: RawHudkooPlace[] | null;
}> {
  if (!busMemoryCache) {
    busMemoryCache = readDiskBusCache();
  }

  const now = Date.now();
  const cacheFresh =
    busMemoryCache !== null &&
    busMemoryCache.cacheVersion === BUS_CACHE_VERSION &&
    now - busMemoryCache.fetchedAt < BUS_CACHE_TTL_MS &&
    busMemoryCache.places.length > 0;

  let rawPlaces: RawHudkooPlace[] | null =
    (busMemoryCache as (BusCacheStore & { _rawPlaces?: RawHudkooPlace[] }) | null)?._rawPlaces ||
    null;

  if (!cacheFresh) {
    const fetched = await fetchMainPlacesFromHudkoo();
    if (fetched) {
      rawPlaces = fetched;
      const places: BusPlaceSummary[] = fetched.map((p) => ({
        titleId: p.title_id,
        placeId: p.place_id,
        nameEn: p.title_en.trim(),
        nameKn: p.title_kn.trim(),
        routeCount: (p.routes || []).filter((r) => r.is_active !== false).length,
      }));
      busMemoryCache = {
        cacheVersion: BUS_CACHE_VERSION,
        fetchedAt: now,
        places,
        routesByPlace: {},
      };
      (busMemoryCache as BusCacheStore & { _rawPlaces?: RawHudkooPlace[] })._rawPlaces = fetched;
    }
  }

  if (!busMemoryCache || busMemoryCache.places.length === 0) {
    throw new Error('Bus timings directory is temporarily unavailable.');
  }

  return { cache: busMemoryCache, rawPlaces };
}

async function getHudkooBusSchedule(requestedTitleId: number): Promise<BusPlaceScheduleResponse> {
  const { cache, rawPlaces: initialRaw } = await ensureFreshBusPlaces();

  const activePlace =
    cache.places.find((p) => p.titleId === requestedTitleId) || cache.places[0];
  const cacheKey = String(activePlace.titleId);

  if (!cache.routesByPlace[cacheKey] || cache.routesByPlace[cacheKey].length === 0) {
    let rawPlaces = initialRaw;
    let rawForPlace = rawPlaces?.find((p) => p.title_id === activePlace.titleId);
    if (!rawForPlace) {
      rawPlaces = await fetchMainPlacesFromHudkoo();
      if (rawPlaces) {
        (cache as BusCacheStore & { _rawPlaces?: RawHudkooPlace[] })._rawPlaces = rawPlaces;
        rawForPlace = rawPlaces.find((p) => p.title_id === activePlace.titleId);
      }
    }
    if (rawForPlace) {
      cache.routesByPlace[cacheKey] = await fetchPlaceRoutesFromHudkoo(rawForPlace);
      writeDiskBusCache(cache);
    }
  }

  return {
    places: cache.places,
    activePlace,
    routes: cache.routesByPlace[cacheKey] || [],
  };
}

async function getAllHudkooBusSchedules(): Promise<BusCacheStore> {
  const { cache, rawPlaces: initialRaw } = await ensureFreshBusPlaces();
  const missingPlaces = cache.places.filter(
    (p) => !cache.routesByPlace[String(p.titleId)] || cache.routesByPlace[String(p.titleId)].length === 0
  );

  if (missingPlaces.length === 0) {
    return cache;
  }

  if (allBusWarmupPromise) {
    return allBusWarmupPromise;
  }

  allBusWarmupPromise = (async () => {
    try {
      let rawPlaces = initialRaw;
      if (!rawPlaces) {
        rawPlaces = await fetchMainPlacesFromHudkoo();
        if (rawPlaces) {
          (cache as BusCacheStore & { _rawPlaces?: RawHudkooPlace[] })._rawPlaces = rawPlaces;
        }
      }

      if (rawPlaces) {
        // Warm missing places in batches of 4 to stay fast and gentle on upstream
        for (let i = 0; i < missingPlaces.length; i += 4) {
          const batch = missingPlaces.slice(i, i + 4);
          await Promise.all(
            batch.map(async (place) => {
              const rawForPlace = rawPlaces?.find((rp) => rp.title_id === place.titleId);
              if (rawForPlace) {
                cache.routesByPlace[String(place.titleId)] =
                  await fetchPlaceRoutesFromHudkoo(rawForPlace);
              }
            })
          );
        }
        writeDiskBusCache(cache);
      }
      return cache;
    } finally {
      allBusWarmupPromise = null;
    }
  })();

  return allBusWarmupPromise;
}

interface PlaceAliasEntry {
  key: string;
  labelEn: string;
  labelKn: string;
  aliases: string[];
}

const PLACE_ALIAS_MAP: PlaceAliasEntry[] = [
  { key: 'koppa', labelEn: 'Koppa', labelKn: 'ಕೊಪ್ಪ', aliases: ['koppa', 'ಕೊಪ್ಪ'] },
  {
    key: 'shivamogga',
    labelEn: 'Shivamogga',
    labelKn: 'ಶಿವಮೊಗ್ಗ',
    aliases: ['shivamogga', 'shimoga', 'shivamoga', 'ಶಿವಮೊಗ್ಗ'],
  },
  {
    key: 'bengaluru',
    labelEn: 'Bengaluru',
    labelKn: 'ಬೆಂಗಳೂರು',
    aliases: ['bengaluru', 'bangalore', 'blr', 'ಬೆಂಗಳೂರು'],
  },
  {
    key: 'mangaluru',
    labelEn: 'Mangaluru',
    labelKn: 'ಮಂಗಳೂರು',
    aliases: ['mangaluru', 'mangalore', 'mlr', 'ಮಂಗಳೂರು'],
  },
  {
    key: 'chikkamagaluru',
    labelEn: 'Chikkamagaluru',
    labelKn: 'ಚಿಕ್ಕಮಗಳೂರು',
    aliases: ['chikkamagaluru', 'chikmagalur', 'chikamagaluru', 'ಚಿಕ್ಕಮಗಳೂರು', 'ಚಿಕ್ಕಮಗಳೂರಿ'],
  },
  {
    key: 'sringeri',
    labelEn: 'Sringeri',
    labelKn: 'ಶೃಂಗೇರಿ',
    aliases: ['sringeri', 'shringeri', 'ಶೃಂಗೇರಿ'],
  },
  {
    key: 'thirthahalli',
    labelEn: 'Thirthahalli',
    labelKn: 'ತೀರ್ಥಹಳ್ಳಿ',
    aliases: ['thirthahalli', 'therthahalli', 'tirthahalli', 'ತೀರ್ಥಹಳ್ಳಿ'],
  },
  {
    key: 'balehonnur',
    labelEn: 'Balehonnur',
    labelKn: 'ಬಾಳೆಹೊನ್ನೂರು',
    aliases: ['balehonnuru', 'balehonnur', 'ಬಾಳೆಹೊನ್ನೂರು', 'ಬಾಳೆಹೊನ್ನೂರಿ'],
  },
  {
    key: 'nrpura',
    labelEn: 'N.R. Pura',
    labelKn: 'ಎನ್.ಆರ್ ಪುರ',
    aliases: [
      'n.r. pura',
      'n.r pura',
      'nr pura',
      'nrpura',
      'n r pura',
      'narasimharajapura',
      'ಎನ್.ಆರ್ ಪುರ',
      'ಎನ್. ಆರ್ ಪುರ',
      'ಎನ್ ಆರ್ ಪುರ',
      'ಎನ್.ಆರ್.ಪುರ',
      'ನರಸಿಂಹರಾಜಪುರ',
    ],
  },
  { key: 'jayapura', labelEn: 'Jayapura', labelKn: 'ಜಯಪುರ', aliases: ['jayapura', 'ಜಯಪುರ'] },
  {
    key: 'horanadu',
    labelEn: 'Horanadu',
    labelKn: 'ಹೊರನಾಡು',
    aliases: ['horanadu', 'ಹೊರನಾಡು', 'ಹೊರನಾಡಿ'],
  },
  { key: 'kalasa', labelEn: 'Kalasa', labelKn: 'ಕಳಸ', aliases: ['kalasa', 'ಕಳಸ'] },
  { key: 'agumbe', labelEn: 'Agumbe', labelKn: 'ಆಗುಂಬೆ', aliases: ['agumbe', 'ಆಗುಂಬೆ'] },
  { key: 'udupi', labelEn: 'Udupi', labelKn: 'ಉಡುಪಿ', aliases: ['udupi', 'ಉಡುಪಿ'] },
  {
    key: 'bhkaimara',
    labelEn: 'B.H. Kaimara',
    labelKn: 'ಬಿ.ಹೆಚ್ ಕೈಮರ',
    aliases: ['b.h kaimara', 'b.h. kaimara', 'bh kaimara', 'kaimara', 'ಬಿ.ಹೆಚ್ ಕೈಮರ', 'ಕೈಮರ'],
  },
  {
    key: 'hariharapura',
    labelEn: 'Hariharapura',
    labelKn: 'ಹರಿಹರಪುರ',
    aliases: ['hariharapura', 'ಹರಿಹರಪುರ'],
  },
  { key: 'narve', labelEn: 'Narve', labelKn: 'ನಾರ್ವೆ', aliases: ['narve', 'ನಾರ್ವೆ'] },
  {
    key: 'bgkatte',
    labelEn: 'B.G. Katte',
    labelKn: 'ಬಿ.ಜಿ. ಕಟ್ಟೆ',
    aliases: ['bg katte', 'b.g. katte', 'b g katte', 'ಬಿ. ಜಿ. ಕಟ್ಟೆ', 'ಬಿ.ಜಿ ಕಟ್ಟೆ'],
  },
  { key: 'karkala', labelEn: 'Karkala', labelKn: 'ಕಾರ್ಕಳ', aliases: ['karkala', 'ಕಾರ್ಕಳ'] },
  { key: 'tarikere', labelEn: 'Tarikere', labelKn: 'ತರೀಕೆರೆ', aliases: ['tarikere', 'ತರೀಕೆರೆ'] },
  { key: 'birur', labelEn: 'Birur', labelKn: 'ಬೀರೂರು', aliases: ['birur', 'ಬೀರೂರು'] },
  {
    key: 'bhadravathi',
    labelEn: 'Bhadravathi',
    labelKn: 'ಭದ್ರಾವತಿ',
    aliases: ['bhadravathi', 'bhadravati', 'ಭದ್ರಾವತಿ'],
  },
  {
    key: 'kottigehara',
    labelEn: 'Kottigehara',
    labelKn: 'ಕೊಟ್ಟಿಗೆಹಾರ',
    aliases: ['kottigehara', 'ಕೊಟ್ಟಿಗೆಹಾರ'],
  },
  {
    key: 'kammaradi',
    labelEn: 'Kammaradi',
    labelKn: 'ಕಮ್ಮರಡಿ',
    aliases: ['kammaradi', 'ಕಮ್ಮರಡಿ'],
  },
  {
    key: 'sagara',
    labelEn: 'Sagara',
    labelKn: 'ಸಾಗರ',
    aliases: ['sagara', 'sagar', 'ಸಾಗರ'],
  },
  { key: 'mysuru', labelEn: 'Mysuru', labelKn: 'ಮೈಸೂರು', aliases: ['mysuru', 'mysore', 'ಮೈಸೂರು'] },
  {
    key: 'dharmasthala',
    labelEn: 'Dharmasthala',
    labelKn: 'ಧರ್ಮಸ್ಥಳ',
    aliases: ['dharmasthala', 'ಧರ್ಮಸ್ಥಳ'],
  },
  {
    key: 'basarikatte',
    labelEn: 'Basarikatte',
    labelKn: 'ಬಸರಿಕಟ್ಟೆ',
    aliases: ['basarikatte', 'basrikatte', 'ಬಸರಿಕಟ್ಟೆ', 'ಬಸ್ರೀಕಟ್ಟೆ', 'ಬಸ್ರಿಕಟ್ಟೆ'],
  },
  { key: 'aldur', labelEn: 'Aldur', labelKn: 'ಆಲ್ದೂರು', aliases: ['aldur', 'ಆಲ್ದೂರು'] },
  { key: 'balehole', labelEn: 'Balehole', labelKn: 'ಬಾಳೆಹೊಳೆ', aliases: ['balehole', 'ಬಾಳೆಹೊಳೆ'] },
  { key: 'hebri', labelEn: 'Hebri', labelKn: 'ಹೆಬ್ರಿ', aliases: ['hebri', 'ಹೆಬ್ರಿ'] },
  { key: 'meguru', labelEn: 'Meguru', labelKn: 'ಮೇಗೂರು', aliases: ['meguru', 'ಮೇಗೂರು'] },
  { key: 'kigga', labelEn: 'Kigga', labelKn: 'ಕಿಗ್ಗ', aliases: ['kigga', 'ಕಿಗ್ಗ'] },
  {
    key: 'moodubidri',
    labelEn: 'Moodubidri',
    labelKn: 'ಮೂಡುಬಿದ್ರೆ',
    aliases: ['moodubidri', 'moodabidri', 'ಮೂಡುಬಿದ್ರೆ', 'ಮೂಡಬಿದ್ರೆ'],
  },
  {
    key: 'kundapura',
    labelEn: 'Kundapura',
    labelKn: 'ಕುಂದಾಪುರ',
    aliases: ['kundapura', 'kundapur', 'ಕುಂದಾಪುರ'],
  },
  { key: 'kolluru', labelEn: 'Kolluru', labelKn: 'ಕೊಲ್ಲೂರು', aliases: ['kolluru', 'kollur', 'ಕೊಲ್ಲೂರು'] },
  { key: 'bomlapura', labelEn: 'Bomlapura', labelKn: 'ಬೊಮ್ಲಾಪುರ', aliases: ['bomlapura', 'ಬೊಮ್ಲಾಪುರ'] },
  {
    key: 'hosanagara',
    labelEn: 'Hosanagara',
    labelKn: 'ಹೊಸನಗರ',
    aliases: ['hosanagara', 'hosanagar', 'ಹೊಸನಗರ'],
  },
  {
    key: 'rambhapuri',
    labelEn: 'Rambhapuri Peetha',
    labelKn: 'ರಂಭಾಪುರಿ ಪೀಠ',
    aliases: ['rambhapuri', 'ರಂಭಾಪುರಿ'],
  },
  {
    key: 'kudremukh',
    labelEn: 'Kudremukh',
    labelKn: 'ಕುದುರೆಮುಖ',
    aliases: ['kudremukh', 'kudremukha', 'ಕುದುರೆಮುಖ'],
  },
  {
    key: 'mallanduru',
    labelEn: 'Mallanduru',
    labelKn: 'ಮಲ್ಲಂದೂರು',
    aliases: ['mallanduru', 'mallandur', 'ಮಲ್ಲಂದೂರು'],
  },
  {
    key: 'mandagadde',
    labelEn: 'Mandagadde',
    labelKn: 'ಮಂಡಗದ್ದೆ',
    aliases: ['mandagadde', 'ಮಂಡಗದ್ದೆ'],
  },
  { key: 'melpal', labelEn: 'Melpal', labelKn: 'ಮೇಲ್ಪಾಲ್', aliases: ['melpal', 'ಮೇಲ್ಪಾಲ್'] },
  { key: 'soraba', labelEn: 'Soraba', labelKn: 'ಸೊರಬ', aliases: ['soraba', 'sorab', 'ಸೊರಬ'] },
  {
    key: 'uttameshwara',
    labelEn: 'Uttameshwara',
    labelKn: 'ಉತ್ತಮೇಶ್ವರ',
    aliases: ['uttameshwara', 'ಉತ್ತಮೇಶ್ವರ'],
  },
  { key: 'halanduru', labelEn: 'Halanduru', labelKn: 'ಹಾಲಂದೂರು', aliases: ['halanduru', 'ಹಾಲಂದೂರು'] },
  { key: 'hantavani', labelEn: 'Hantavani', labelKn: 'ಹಂತವಾನಿ', aliases: ['hantavani', 'ಹಂತವಾನಿ'] },
  { key: 'mrigavadhe', labelEn: 'Mrigavadhe', labelKn: 'ಮೃಗವಧೆ', aliases: ['mrigavadhe', 'ಮೃಗವಧೆ'] },
  {
    key: 'siddharamatha',
    labelEn: 'Siddharamatha',
    labelKn: 'ಸಿದ್ಧರ ಮಠ',
    aliases: ['siddharamatha', 'siddhara matha', 'ಸಿದ್ಧರ ಮಠ'],
  },
  {
    key: 'ajjampura',
    labelEn: 'Ajjampura',
    labelKn: 'ಅಜ್ಜಂಪುರ',
    aliases: ['ajjampura', 'ಅಜ್ಜಂಪುರ'],
  },
  {
    key: 'kondadakan',
    labelEn: 'Kondadakan',
    labelKn: 'ಕೊಂಡದಕಾನ್',
    aliases: ['kondadakan', 'kondadakaan', 'ಕೊಂಡದಕಾನ್'],
  },
  {
    key: 'kattinamane',
    labelEn: 'Kattinamane',
    labelKn: 'ಕಟ್ಟಿನಮನೆ',
    aliases: ['kattinamane', 'ಕಟ್ಟಿನಮನೆ'],
  },
  { key: 'magundi', labelEn: 'Magundi', labelKn: 'ಮಾಗುಂಡಿ', aliases: ['magundi', 'ಮಾಗುಂಡಿ'] },
  { key: 'shiravase', labelEn: 'Shiravase', labelKn: 'ಶಿರವಾಸೆ', aliases: ['shiravase', 'ಶಿರವಾಸೆ'] },
  {
    key: 'subrahmanya',
    labelEn: 'Subrahmanya',
    labelKn: 'ಸುಬ್ರಹ್ಮಣ್ಯ',
    aliases: ['subrahmanya', 'ಸುಬ್ರಹ್ಮಣ್ಯ'],
  },
  { key: 'kateel', labelEn: 'Kateel', labelKn: 'ಕಟೀಲು', aliases: ['kateel', 'ಕಟೀಲು'] },
  { key: 'bandigadi', labelEn: 'Bandigadi', labelKn: 'ಬಂಡಿಗಡಿ', aliases: ['bandigadi', 'ಬಂಡಿಗಡಿ'] },
  { key: 'basavani', labelEn: 'Basavani', labelKn: 'ಬಸವಾನಿ', aliases: ['basavani', 'ಬಸವಾನಿ'] },
  {
    key: 'kavadekatte',
    labelEn: 'Kavadekatte',
    labelKn: 'ಕವಡೆಕಟ್ಟೆ',
    aliases: ['kavadekatte', 'ಕವಡೆಕಟ್ಟೆ'],
  },
  {
    key: 'agalgandi',
    labelEn: 'Agalgandi',
    labelKn: 'ಅಗಳಗಂಡಿ',
    aliases: ['agalgandi', 'ಅಗಳಗಂಡಿ'],
  },
  {
    key: 'kudregundi',
    labelEn: 'Kudregundi',
    labelKn: 'ಕುದುರೆಗುಂಡಿ',
    aliases: ['kudregundi', 'ಕುದುರೆಗುಂಡಿ'],
  },
  {
    key: 'murdeshwara',
    labelEn: 'Murdeshwara',
    labelKn: 'ಮುರ್ಡೇಶ್ವರ',
    aliases: ['murdeshwara', 'murudeshwar', 'ಮುರ್ಡೇಶ್ವರ'],
  },
  { key: 'joga', labelEn: 'Jog', labelKn: 'ಜೋಗ', aliases: ['joga', 'jog', 'ಜೋಗ'] },
  {
    key: 'davanagere',
    labelEn: 'Davanagere',
    labelKn: 'ದಾವಣಗೆರೆ',
    aliases: ['davanagere', 'davangere', 'ದಾವಣಗೆರೆ'],
  },
  { key: 'kadur', labelEn: 'Kadur', labelKn: 'ಕಡೂರು', aliases: ['kadur', 'ಕಡೂರು'] },
  { key: 'padubidri', labelEn: 'Padubidri', labelKn: 'ಪಡುಬಿದ್ರೆ', aliases: ['padubidri', 'ಪಡುಬಿದ್ರೆ'] },
  {
    key: 'brp',
    labelEn: 'BRP',
    labelKn: 'ಬಿ ಆರ್ ಪಿ',
    aliases: ['brp', 'b.r.p', 'b r p', 'ಬಿ ಆರ್ ಪಿ', 'ಬಿ.ಆರ್.ಪಿ'],
  },
  {
    key: 'umblebailu',
    labelEn: 'Umblebailu',
    labelKn: 'ಉಂಬಳೆಬೈಲು',
    aliases: ['umblebailu', 'umblebail', 'ಉಂಬಳೆಬೈಲು', 'ಉಂಬಳೆಬೈಲ್'],
  },
];

function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function compactToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u0c80-\u0cff]/g, '');
}

function phoneticSkeleton(value: string): string {
  return compactToken(value)
    .replace(/sh/g, 's')
    .replace(/th/g, 't')
    .replace(/bh/g, 'b')
    .replace(/dh/g, 'd')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/ph/g, 'p')
    .replace(/oo/g, 'u')
    .replace(/ee/g, 'i')
    .replace(/([a-z])\1+/g, '$1');
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

interface ResolvedPlaceQuery {
  key: string | null;
  label: string;
  labelEn: string;
  labelKn: string;
  terms: string[];
  autoCorrected: boolean;
}

function resolvePlaceQuery(rawEn: string, rawKn = ''): ResolvedPlaceQuery {
  const combined = `${rawEn} ${rawKn}`.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const entry of PLACE_ALIAS_MAP) {
    for (const alias of entry.aliases) {
      if (combined.includes(alias.toLowerCase())) {
        return {
          key: entry.key,
          label: `${entry.labelEn} (${entry.labelKn})`,
          labelEn: entry.labelEn,
          labelKn: entry.labelKn,
          terms: entry.aliases.map((a) => normalizeSearchToken(a)),
          autoCorrected: false,
        };
      }
    }
  }

  // Exact compact match without spaces/dots (e.g., "nrpura", "bhkaimara")
  const primaryRaw = rawEn.trim() || rawKn.trim();
  const primaryCompact = compactToken(primaryRaw);
  if (primaryCompact.length >= 3) {
    for (const entry of PLACE_ALIAS_MAP) {
      for (const alias of entry.aliases) {
        if (compactToken(alias) === primaryCompact) {
          return {
            key: entry.key,
            label: `${entry.labelEn} (${entry.labelKn})`,
            labelEn: entry.labelEn,
            labelKn: entry.labelKn,
            terms: entry.aliases.map((a) => normalizeSearchToken(a)),
            autoCorrected: false,
          };
        }
      }
    }

    // Fuzzy typo & phonetic auto-correction (e.g., "kopps" -> "Koppa", "shivmogga" -> "Shivamogga")
    const candidates = [primaryRaw, ...primaryRaw.split(/\s+/)]
      .map((c) => compactToken(c))
      .filter((c) => c.length >= 3);

    let bestEntry: PlaceAliasEntry | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const cand of candidates) {
      const candSkel = phoneticSkeleton(cand);
      for (const entry of PLACE_ALIAS_MAP) {
        for (const alias of entry.aliases) {
          const aliasCompact = compactToken(alias);
          if (aliasCompact.length < 3) continue;
          const aliasSkel = phoneticSkeleton(alias);

          const rawDist = levenshteinDistance(cand, aliasCompact);
          const skelDist = levenshteinDistance(candSkel, aliasSkel);
          const minDist = Math.min(rawDist, skelDist);
          const refLen = Math.max(cand.length, aliasCompact.length);
          const maxAllowed =
            refLen <= 5 ? 1 : refLen <= 8 ? 2 : Math.max(2, Math.floor(refLen * 0.32));

          if (minDist > maxAllowed) continue;
          if (refLen <= 5 && cand[0] !== aliasCompact[0] && rawDist > 1) continue;

          // Slightly prefer matching first letter and closer length
          const weightedScore =
            minDist * 10 +
            (cand[0] === aliasCompact[0] ? 0 : 3) +
            Math.abs(cand.length - aliasCompact.length);

          if (weightedScore < bestScore) {
            bestScore = weightedScore;
            bestEntry = entry;
          }
        }
      }
    }

    if (bestEntry) {
      return {
        key: bestEntry.key,
        label: `${bestEntry.labelEn} (${bestEntry.labelKn})`,
        labelEn: bestEntry.labelEn,
        labelKn: bestEntry.labelKn,
        terms: bestEntry.aliases.map((a) => normalizeSearchToken(a)),
        autoCorrected: true,
      };
    }
  }

  const fallbackTerms = [rawEn, rawKn]
    .map((v) => normalizeSearchToken(v))
    .filter((v) => v.length >= 2);
  return {
    key: null,
    label: primaryRaw,
    labelEn: rawEn.trim() || rawKn.trim(),
    labelKn: rawKn.trim() || rawEn.trim(),
    terms: fallbackTerms,
    autoCorrected: false,
  };
}

function textMatchesPlace(haystack: string, place: ResolvedPlaceQuery): boolean {
  const norm = normalizeSearchToken(haystack);
  if (!norm) return false;
  return place.terms.some((term) => norm.includes(term));
}

function getOrderedRouteStages(place: BusPlaceSummary, route: BusRouteSchedule): {
  fromPlaceEn: string;
  fromPlaceKn: string;
  stages: string[];
  extraConnectionText: string;
  primaryTitle: string;
  secondarySubtitle: string;
} {
  const hasMeaningfulDesc =
    route.description.trim().length > 0 && !/^route\s*\d+$/i.test(route.description.trim());
  const isGenericRouteName = /^route\s*\d+$/i.test(route.routeName.trim());

  const primaryTitle = hasMeaningfulDesc && isGenericRouteName
    ? route.description.trim()
    : route.routeName.trim() || route.description.trim();
  const secondarySubtitle =
    hasMeaningfulDesc && !isGenericRouteName ? route.description.trim() : '';

  const firstTimingOriginEn = route.timings[0]?.fromPlaceEn?.trim();
  const firstTimingOriginKn = route.timings[0]?.fromPlaceKn?.trim();
  const fromPlaceEn = firstTimingOriginEn || place.nameEn;
  const fromPlaceKn = firstTimingOriginKn || place.nameKn;

  const stopLine = isGenericRouteName ? route.description.trim() : route.routeName.trim();
  const normalizedStopLine = stopLine.replace(/(?:ದಿಂದ|ಯಿಂದ|ನಿಂದ)\s+/g, ' - ');
  const rawStages = normalizedStopLine
    .split(/[–—-]/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Ensure true origin is stage 0 if not already the first stop
  const originQueryForRoute = resolvePlaceQuery(fromPlaceEn, fromPlaceKn);
  const firstStageMatchesOrigin =
    rawStages.length > 0 && textMatchesPlace(rawStages[0], originQueryForRoute);

  const baseStages = firstStageMatchesOrigin
    ? rawStages
    : [`${fromPlaceEn} ${fromPlaceKn}`, ...rawStages];

  // If secondarySubtitle lists intermediate stops (no "ಕನೆಕ್ಷನ್" keyword) on a 2-stop route like "Sringeri - Shivamogga",
  // insert those stops between start and end so reverse-direction queries never falsely match.
  const isConnectionNote = secondarySubtitle.includes('ಕನೆಕ್ಷನ್');
  let stages = baseStages;
  if (secondarySubtitle && !isConnectionNote && baseStages.length >= 2) {
    stages = [...baseStages.slice(0, -1), secondarySubtitle, baseStages[baseStages.length - 1]];
  }

  const extraConnectionText = [
    isConnectionNote ? secondarySubtitle : '',
    ...route.timings.map((t) => `${t.busName} ${t.remarks}`),
  ]
    .join(' ')
    .trim();

  return {
    fromPlaceEn,
    fromPlaceKn,
    stages,
    extraConnectionText,
    primaryTitle,
    secondarySubtitle,
  };
}

// Maps a bus remark terminal/destination key -> intermediate stops that the bus passes through on its way there
const REMARK_PASS_THROUGH_STOPS: Record<string, string[]> = {
  davanagere: ['nrpura', 'shivamogga'],
  mallanduru: ['nrpura', 'shivamogga'],
  mandagadde: ['nrpura', 'shivamogga'],
  shivamogga: ['nrpura', 'hariharapura', 'koppa', 'jayapura', 'balehonnur', 'thirthahalli'],
  bengaluru: ['jayapura', 'balehonnur', 'aldur', 'chikkamagaluru', 'kadur', 'nrpura', 'bhadravathi', 'tarikere'],
  mysuru: ['jayapura', 'balehonnur', 'aldur', 'chikkamagaluru'],
  kadur: ['jayapura', 'balehonnur', 'aldur', 'chikkamagaluru'],
  birur: ['nrpura', 'bhadravathi', 'umblebailu', 'brp', 'tarikere', 'ajjampura', 'jayapura', 'balehonnur', 'aldur', 'chikkamagaluru'],
  ajjampura: ['nrpura', 'bhadravathi', 'umblebailu', 'brp', 'tarikere'],
  tarikere: ['nrpura', 'bhadravathi', 'umblebailu', 'brp'],
  brp: ['nrpura', 'bhadravathi', 'umblebailu'],
  bhadravathi: ['nrpura', 'umblebailu'],
  umblebailu: ['nrpura'],
  chikkamagaluru: ['jayapura', 'balehonnur', 'aldur'],
  aldur: ['jayapura', 'balehonnur'],
  mangaluru: ['meguru', 'sringeri', 'karkala', 'moodubidri', 'padubidri', 'udupi'],
  moodubidri: ['meguru', 'sringeri', 'karkala'],
  padubidri: ['meguru', 'sringeri', 'karkala'],
  karkala: ['meguru', 'sringeri'],
  udupi: ['hariharapura', 'agumbe', 'hebri', 'balehonnur', 'sringeri'],
  hebri: ['hariharapura', 'agumbe'],
  agumbe: ['hariharapura'],
  horanadu: ['jayapura', 'basarikatte', 'balehole', 'kalasa'],
  kalasa: ['jayapura', 'basarikatte', 'balehole'],
  kudremukh: ['kalasa'],
  balehonnur: ['jayapura', 'melpal'],
  basarikatte: ['jayapura'],
  soraba: ['thirthahalli', 'sagara'],
  sagara: ['thirthahalli'],
};

function extractRemarkPlaceKeys(remarks: string): string[] {
  const norm = normalizeSearchToken(remarks);
  if (!norm) return [];
  const matched = new Set<string>();
  for (const entry of PLACE_ALIAS_MAP) {
    if (entry.aliases.some((alias) => norm.includes(normalizeSearchToken(alias)))) {
      matched.add(entry.key);
    }
  }
  return Array.from(matched);
}

function timingMatchesDestination(
  remarks: string,
  destQuery: ResolvedPlaceQuery,
  destInStages: boolean
): boolean {
  const normRemarks = normalizeSearchToken(remarks);
  const remarkKeys = extractRemarkPlaceKeys(remarks);

  // If the bus has no location-specific remarks (e.g., blank or "Midnight service"),
  // it runs the primary route corridor and reaches stops explicitly listed in the route stages.
  if (remarkKeys.length === 0) {
    return destInStages;
  }

  // If remarks explicitly mention the user's destination (canonical key or raw text), match it!
  if (destQuery.key && remarkKeys.includes(destQuery.key)) {
    return true;
  }
  if (destQuery.terms.some((term) => normRemarks.includes(term))) {
    return true;
  }

  // Otherwise check if any place named in remarks continues beyond the user's destination along the same corridor.
  if (destQuery.key) {
    for (const rKey of remarkKeys) {
      const passedStops = REMARK_PASS_THROUGH_STOPS[rKey];
      if (passedStops && passedStops.includes(destQuery.key)) {
        return true;
      }
    }
  }

  return false;
}

function findMatchingBusRoutes(
  cache: BusCacheStore,
  originEn: string,
  originKn: string,
  destEn: string,
  destKn: string,
  timePreference: BusAgentTimePreference
): {
  matchedRoutes: BusAgentMatchedRoute[];
  suggestedHubs: string[];
  originLabel: string;
  destLabel: string;
  originAutoCorrected: boolean;
  destAutoCorrected: boolean;
} {
  const originQuery = resolvePlaceQuery(originEn, originKn);
  const destQuery = resolvePlaceQuery(destEn, destKn);

  if (originQuery.terms.length === 0 || destQuery.terms.length === 0) {
    return {
      matchedRoutes: [],
      suggestedHubs: [],
      originLabel: originQuery.label,
      destLabel: destQuery.label,
      originAutoCorrected: originQuery.autoCorrected,
      destAutoCorrected: destQuery.autoCorrected,
    };
  }

  // Avoid matching identical origin & destination
  if (originQuery.key && destQuery.key && originQuery.key === destQuery.key) {
    return {
      matchedRoutes: [],
      suggestedHubs: [],
      originLabel: originQuery.label,
      destLabel: destQuery.label,
      originAutoCorrected: originQuery.autoCorrected,
      destAutoCorrected: destQuery.autoCorrected,
    };
  }

  const directMatches: BusAgentMatchedRoute[] = [];
  const seenRouteIds = new Set<number>();

  for (const place of cache.places) {
    const placeRoutes = cache.routesByPlace[String(place.titleId)] || [];
    for (const route of placeRoutes) {
      if (seenRouteIds.has(route.routeId) || route.timings.length === 0) continue;

      const parsed = getOrderedRouteStages(place, route);

      // Strictly require route origin to match the user's entered departure place (no buses starting from other towns)
      const timingOriginStr = `${parsed.fromPlaceEn} ${parsed.fromPlaceKn}`;
      if (!textMatchesPlace(timingOriginStr, originQuery)) {
        continue;
      }

      // Find ordered stage indices for origin & destination
      let origIdx = -1;
      let destIdx = -1;

      for (let i = 0; i < parsed.stages.length; i += 1) {
        if (origIdx === -1 && textMatchesPlace(parsed.stages[i], originQuery)) {
          origIdx = i;
        }
        if (textMatchesPlace(parsed.stages[i], destQuery)) {
          if (destIdx === -1 || (origIdx !== -1 && i > origIdx)) {
            destIdx = i;
          }
        }
      }

      if (origIdx === -1) continue;

      const destInStages = destIdx > origIdx;
      const destInExtra = origIdx === 0 && textMatchesPlace(parsed.extraConnectionText, destQuery);

      if (!destInStages && !destInExtra) continue;
      if (destIdx !== -1 && destIdx <= origIdx) continue;

      // Filter individual buses strictly to those actually going to destQuery and matching timePreference
      const filteredTimings = route.timings.filter((t) => {
        if (timePreference !== 'all') {
          const period = getTime24HourBucket(t.departureTime24, t.departureTime);
          if (period !== timePreference) return false;
        }
        const tOrigin = `${t.fromPlaceEn || parsed.fromPlaceEn} ${t.fromPlaceKn || parsed.fromPlaceKn}`;
        if (!textMatchesPlace(tOrigin, originQuery)) {
          return false;
        }
        return timingMatchesDestination(t.remarks || '', destQuery, destInStages);
      });

      if (filteredTimings.length === 0) continue;

      seenRouteIds.add(route.routeId);

      directMatches.push({
        placeNameEn: place.nameEn,
        placeNameKn: place.nameKn,
        routeId: route.routeId,
        routeTitle: parsed.primaryTitle,
        routeSubtitle: parsed.secondarySubtitle || undefined,
        fromPlaceLabel: `Departs from ${parsed.fromPlaceEn} → ${destQuery.labelEn}`,
        matchType: 'direct',
        timings: filteredTimings,
      });
    }
  }

  // Suggest connecting Malnad hubs if no direct buses exist
  const suggestedHubs: string[] = [];
  if (directMatches.length === 0) {
    const candidateHubs = ['Koppa', 'Jayapura', 'Balehonnur', 'Sringeri', 'N.R. Pura', 'Thirthahalli'];
    for (const hubName of candidateHubs) {
      const hubQuery = resolvePlaceQuery(hubName);
      if (
        (originQuery.key && hubQuery.key === originQuery.key) ||
        (destQuery.key && hubQuery.key === destQuery.key)
      ) {
        continue;
      }
      let canReachHub = false;
      let hubReachesDest = false;
      for (const place of cache.places) {
        for (const route of cache.routesByPlace[String(place.titleId)] || []) {
          if (route.timings.length === 0) continue;
          const parsed = getOrderedRouteStages(place, route);
          const allText = `${parsed.stages.join(' ')} ${parsed.extraConnectionText}`;
          if (textMatchesPlace(`${parsed.fromPlaceEn} ${parsed.fromPlaceKn}`, originQuery) && textMatchesPlace(allText, hubQuery)) {
            canReachHub = true;
          }
          if (textMatchesPlace(`${parsed.fromPlaceEn} ${parsed.fromPlaceKn}`, hubQuery) && textMatchesPlace(allText, destQuery)) {
            hubReachesDest = true;
          }
        }
      }
      if (canReachHub && hubReachesDest) {
        suggestedHubs.push(hubName);
      }
    }
  }

  return {
    matchedRoutes: directMatches,
    suggestedHubs,
    originLabel: originQuery.label,
    destLabel: destQuery.label,
    originAutoCorrected: originQuery.autoCorrected,
    destAutoCorrected: destQuery.autoCorrected,
  };
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}


async function startServer() {
  ensureAuthRecord();
  loadArticles();

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Mount free Google Sheets + Drive + Apps Script storage proxy, cache & view aggregator
  const sheetsStorage = new SheetsStorageManager(DATA_DIR);
  const admin2Backend = new Admin2Backend(DATA_DIR, sheetsStorage);

  // Record real public page traffic (anonymized daily hashes, never blocks response)
  app.use((req, _res, next) => {
    admin2Backend.recordPublicPageTraffic(req);
    next();
  });

  sheetsStorage.mountRoutes(app);
  admin2Backend.mountRoutes(app);

  // Public Bus Timings endpoint sourced from hudkoo.com with 6-hour cache
  app.get('/api/bus-timings', async (req, res) => {
    const requestedTitleId = Number(req.query.titleId) || 1;
    try {
      const data = await getHudkooBusSchedule(requestedTitleId);
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to load bus timings right now.',
      });
    }
  });

  interface ExtractedRouteSlots {
    status: 'needs_both' | 'needs_origin' | 'needs_destination' | 'ready';
    originEn: string;
    originKn: string;
    destinationEn: string;
    destinationKn: string;
    timePreference: BusAgentTimePreference;
    followUpQuestion: string;
  }

  function detectTimePreference(text: string): BusAgentTimePreference {
    const lower = text.toLowerCase();
    if (/(morning|am\b|ಬೆಳಿಗ್ಗೆ|ಬೆಳಗ್ಗೆ|ಮುಂಜಾನೆ)/i.test(lower)) return 'morning';
    if (/(afternoon|noon|ಮಧ್ಯಾಹ್ನ)/i.test(lower)) return 'afternoon';
    if (/(evening|night|pm\b|ಸಂಜೆ|ರಾತ್ರಿ)/i.test(lower)) return 'evening';
    return 'all';
  }

  function extractOrderedPlaceMatches(text: string): PlaceAliasEntry[] {
    const lower = text.toLowerCase();
    const hits: { index: number; len: number; entry: PlaceAliasEntry }[] = [];
    for (const entry of PLACE_ALIAS_MAP) {
      let bestIdx = Number.POSITIVE_INFINITY;
      let bestLen = 0;
      for (const alias of entry.aliases) {
        const needle = alias.toLowerCase();
        const idx = lower.indexOf(needle);
        if (idx !== -1 && (idx < bestIdx || (idx === bestIdx && needle.length > bestLen))) {
          bestIdx = idx;
          bestLen = needle.length;
        }
      }
      if (bestIdx !== Number.POSITIVE_INFINITY) {
        hits.push({ index: bestIdx, len: bestLen, entry });
      }
    }
    hits.sort((a, b) => a.index - b.index || b.len - a.len);
    const deduped: PlaceAliasEntry[] = [];
    for (const hit of hits) {
      if (!deduped.some((e) => e.key === hit.entry.key)) {
        deduped.push(hit.entry);
      }
    }
    return deduped;
  }

  function extractBusSlotsLocally(turns: BusAgentChatTurn[]): ExtractedRouteSlots {
    const combinedUserText = turns
      .filter((t) => t.role === 'user')
      .map((t) => t.text)
      .join(' ');
    const timePreference = detectTimePreference(combinedUserText);

    let origin: PlaceAliasEntry | null = null;
    let destination: PlaceAliasEntry | null = null;
    let pendingSlot: 'origin' | 'destination' | null = null;

    for (const turn of turns) {
      const txt = turn.text.trim();
      if (!txt) continue;

      if (turn.role === 'assistant') {
        if (/1\.\s*from where|೧\.\s*ಎಲ್ಲಿಂದ/i.test(txt)) {
          pendingSlot = 'origin';
        } else if (/2\.\s*to where|೨\.\s*ಎಲ್ಲಿಗೆ/i.test(txt)) {
          pendingSlot = 'destination';
        }
        continue;
      }

      // User turn: check explicit "X to Y" / "X -> Y" / "X ದಿಂದ Y" separators first
      const sepMatch = txt.match(/(.+?)(?:\s+to\s+|\s*->\s*|\s*→\s*|ದಿಂದ\s*|ಯಿಂದ\s*|ನಿಂದ\s+)(.+)/i);
      if (sepMatch) {
        const left = resolvePlaceQuery(sepMatch[1].replace(/\bfrom\b/gi, '').trim());
        const right = resolvePlaceQuery(sepMatch[2].replace(/\b(buses?|timings?|morning|afternoon|evening|night|ಗೆ|ಕ್ಕೆ)\b/gi, '').trim());
        const leftEntry = left.key ? PLACE_ALIAS_MAP.find((e) => e.key === left.key) || null : null;
        const rightEntry = right.key ? PLACE_ALIAS_MAP.find((e) => e.key === right.key) || null : null;
        if (leftEntry && rightEntry && leftEntry.key !== rightEntry.key) {
          origin = leftEntry;
          destination = rightEntry;
          pendingSlot = null;
          continue;
        }
      }

      const matches = extractOrderedPlaceMatches(txt);
      if (matches.length >= 2) {
        origin = matches[0];
        destination = matches[1];
        pendingSlot = null;
      } else if (matches.length === 1) {
        const single = matches[0];
        if (pendingSlot === 'origin') {
          origin = single;
          pendingSlot = null;
        } else if (pendingSlot === 'destination') {
          destination = single;
          pendingSlot = null;
        } else if (/(?:^|\s)to\s+|ಗೆ\b|ಕ್ಕೆ\b/i.test(txt) && !/\bfrom\b|ದಿಂದ|ಯಿಂದ|ನಿಂದ/i.test(txt)) {
          destination = single;
        } else if (!origin) {
          origin = single;
        } else if (!destination && single.key !== origin.key) {
          destination = single;
        }
      } else {
        // Try single-token fuzzy correction (e.g. "kopps" or "shivmogga")
        const fuzzy = resolvePlaceQuery(txt);
        const fuzzyEntry = fuzzy.key ? PLACE_ALIAS_MAP.find((e) => e.key === fuzzy.key) || null : null;
        if (fuzzyEntry) {
          if (pendingSlot === 'origin') {
            origin = fuzzyEntry;
          } else if (pendingSlot === 'destination') {
            destination = fuzzyEntry;
          } else if (!origin) {
            origin = fuzzyEntry;
          } else if (!destination && fuzzyEntry.key !== origin.key) {
            destination = fuzzyEntry;
          }
          pendingSlot = null;
        }
      }
    }

    if (origin && destination && origin.key !== destination.key) {
      return {
        status: 'ready',
        originEn: origin.labelEn,
        originKn: origin.labelKn,
        destinationEn: destination.labelEn,
        destinationKn: destination.labelKn,
        timePreference,
        followUpQuestion: '',
      };
    }

    if (origin && !destination) {
      return {
        status: 'needs_destination',
        originEn: origin.labelEn,
        originKn: origin.labelKn,
        destinationEn: '',
        destinationKn: '',
        timePreference,
        followUpQuestion: `2. To Where? Where would you like to go from ${origin.labelEn} (${origin.labelKn})?\n೨. ಎಲ್ಲಿಗೆ? ನೀವು ${origin.labelKn} ನಿಂದ ಎಲ್ಲಿಗೆ ಪ್ರಯಾಣಿಸಲು ಬಯಸುತ್ತೀರಿ?`,
      };
    }

    if (!origin && destination) {
      return {
        status: 'needs_origin',
        originEn: '',
        originKn: '',
        destinationEn: destination.labelEn,
        destinationKn: destination.labelKn,
        timePreference,
        followUpQuestion: `1. From Where? Where are you departing from to reach ${destination.labelEn} (${destination.labelKn})?\n೧. ಎಲ್ಲಿಂದ? ನೀವು ${destination.labelKn} ತಲುಪಲು ಎಲ್ಲಿಂದ ಹೊರಡುತ್ತಿದ್ದೀರಿ?`,
      };
    }

    return {
      status: 'needs_both',
      originEn: '',
      originKn: '',
      destinationEn: '',
      destinationKn: '',
      timePreference,
      followUpQuestion:
        'Please enter 1. From Where and 2. To Where (e.g., Koppa to Shivamogga).\nದಯವಿಟ್ಟು ೧. ಎಲ್ಲಿಂದ ಮತ್ತು ೨. ಎಲ್ಲಿಗೆ ಹೋಗಬೇಕೆಂದು ನಮೂದಿಸಿ (ಉದಾ: ಕೊಪ್ಪದಿಂದ ಶಿವಮೊಗ್ಗ).',
    };
  }

  // Grounded AI Bus Timings Agent endpoint (supports structured From/To fields & conversational chat)
  app.post('/api/bus-agent', async (req, res) => {
    const directOrigin =
      typeof req.body?.origin === 'string' ? req.body.origin.trim() : '';
    const directDestination =
      typeof req.body?.destination === 'string' ? req.body.destination.trim() : '';
    const directPref: BusAgentTimePreference =
      req.body?.timePreference === 'morning' ||
      req.body?.timePreference === 'afternoon' ||
      req.body?.timePreference === 'evening'
        ? req.body.timePreference
        : 'all';

    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const turns: BusAgentChatTurn[] = rawMessages
      .filter(
        (m: unknown): m is BusAgentChatTurn =>
          Boolean(m) &&
          typeof m === 'object' &&
          ((m as BusAgentChatTurn).role === 'user' || (m as BusAgentChatTurn).role === 'assistant') &&
          typeof (m as BusAgentChatTurn).text === 'string'
      )
      .slice(-12);

    let extracted: ExtractedRouteSlots | null = null;

    if (directOrigin && directDestination) {
      extracted = {
        status: 'ready',
        originEn: directOrigin,
        originKn: directOrigin,
        destinationEn: directDestination,
        destinationKn: directDestination,
        timePreference: directPref,
        followUpQuestion: '',
      };
    } else if (directOrigin && !directDestination && turns.length === 0) {
      const resolvedOrig = resolvePlaceQuery(directOrigin);
      const origDisplay = resolvedOrig.key ? resolvedOrig.label : directOrigin;
      const correctionPrefix = resolvedOrig.autoCorrected
        ? `Auto-corrected "${directOrigin}" → ${resolvedOrig.label}\n`
        : '';
      extracted = {
        status: 'needs_destination',
        originEn: resolvedOrig.labelEn,
        originKn: resolvedOrig.labelKn,
        destinationEn: '',
        destinationKn: '',
        timePreference: directPref,
        followUpQuestion: `${correctionPrefix}2. To Where? Where would you like to go from ${origDisplay}? (e.g., Shivamogga, Mangaluru, Chikkamagaluru, Bengaluru)\n೨. ಎಲ್ಲಿಗೆ? ನೀವು ${resolvedOrig.labelKn} ನಿಂದ ಎಲ್ಲಿಗೆ ಪ್ರಯಾಣಿಸಲು ಬಯಸುತ್ತೀರಿ? (ಉದಾ: ಶಿವಮೊಗ್ಗ, ಮಂಗಳೂರು, ಚಿಕ್ಕಮಗಳೂರು, ಬೆಂಗಳೂರು)`,
      };
    } else if (!directOrigin && directDestination && turns.length === 0) {
      const resolvedDest = resolvePlaceQuery(directDestination);
      const destDisplay = resolvedDest.key ? resolvedDest.label : directDestination;
      const correctionPrefix = resolvedDest.autoCorrected
        ? `Auto-corrected "${directDestination}" → ${resolvedDest.label}\n`
        : '';
      extracted = {
        status: 'needs_origin',
        originEn: '',
        originKn: '',
        destinationEn: resolvedDest.labelEn,
        destinationKn: resolvedDest.labelKn,
        timePreference: directPref,
        followUpQuestion: `${correctionPrefix}1. From Where? Where are you departing from to reach ${destDisplay}? (e.g., Koppa, Jayapura, Balehonnur, Sringeri)\n೧. ಎಲ್ಲಿಂದ? ನೀವು ${resolvedDest.labelKn} ತಲುಪಲು ಎಲ್ಲಿಂದ ಹೊರಡುತ್ತಿದ್ದೀರಿ? (ಉದಾ: ಕೊಪ್ಪ, ಜಯಪುರ, ಬಾಳೆಹೊನ್ನೂರು, ಶೃಂಗೇರಿ)`,
      };
    } else {
      if (turns.length === 0) {
        res.status(400).json({
          error:
            'Please fill in 1. From Where and 2. To Where.\nದಯವಿಟ್ಟು ೧. ಎಲ್ಲಿಂದ ಮತ್ತು ೨. ಎಲ್ಲಿಗೆ ಎಂದು ನಮೂದಿಸಿ.',
        });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        extracted = extractBusSlotsLocally(turns);
      } else {
        const conversationTranscript = turns
          .map((t) => `${t.role === 'user' ? 'Traveler' : 'Agent'}: ${t.text.trim()}`)
          .join('\n');

        const systemInstruction = `You are the Coffeenadu News Bus Timings Assistant for Koppa Taluk and Malnad (Chikkamagaluru, Shivamogga, Sringeri, Jayapura, Balehonnur, N.R. Pura, Kalasa, Horanadu, Agumbe, Udupi, Mangaluru, Bengaluru, Thirthahalli, B.H. Kaimara, Hariharapura, Kammaradi, Tarikere, Bhadravathi, Kottigehara, Karkala, Dharmasthala, Mysuru).
Your ONLY job in this step is to look at the conversation and figure out:
1. Where the traveler is departing FROM (originEn + originKn).
2. Where the traveler is going TO (destinationEn + destinationKn).
3. Optional time-of-day preference ("all", "morning", "afternoon", "evening").

Rules:
- Read ALL turns in the conversation to carry over previously stated origin or destination when the traveler answers a follow-up question.
- Accept input in English, Kannada, or mixed English-Kannada.
- AUTOMATICALLY CORRECT SPELLING MISTAKES AND TYPOS in town names! Examples: "kopps" or "kopa" -> Koppa / ಕೊಪ್ಪ, "shimog" or "shivmogga" -> Shivamogga / ಶಿವಮೊಗ್ಗ, "shringri" -> Sringeri / ಶೃಂಗೇರಿ, "chikmangalur" -> Chikkamagaluru / ಚಿಕ್ಕಮಗಳೂರು, "banglor" -> Bengaluru / ಬೆಂಗಳೂರು, "manglur" -> Mangaluru / ಮಂಗಳೂರು, "jaypur" -> Jayapura / ಜಯಪುರ, "balehonur" -> Balehonnur / ಬಾಳೆಹೊನ್ನೂರು, "tirtahali" -> Thirthahalli / ತೀರ್ಥಹಳ್ಳಿ.
- If the traveler says a new full route (e.g. "Sringeri to Mangaluru" or "ಕೊಪ್ಪದಿಂದ ಶಿವಮೊಗ್ಗ"), update origin/destination to the latest trip.
- If ONLY destination is given, set status = "needs_origin" and write followUpQuestion in BOTH correct English AND correct Kannada (separated by a newline) asking "1. From Where?" / "೧. ಎಲ್ಲಿಂದ?" with examples (Koppa, Jayapura, Balehonnur, Sringeri).
- If ONLY origin is given, set status = "needs_destination" and write followUpQuestion in BOTH correct English AND correct Kannada (separated by a newline) asking "2. To Where?" / "೨. ಎಲ್ಲಿಗೆ?" with examples (Shivamogga, Mangaluru, Chikkamagaluru, Bengaluru).
- If NEITHER origin nor destination is clear, set status = "needs_both" and ask for both "1. From Where" and "2. To Where" in English and Kannada.
- If BOTH origin and destination are known and different, set status = "ready", fill originEn, originKn (accurate Kannada spelling), destinationEn, destinationKn, and leave followUpQuestion empty.
- Never invent bus timings or cite external website names.`;

        try {
          const abortSignal = AbortSignal.timeout(6000);
          const requestParams = {
            model: 'gemini-4-hydrogen',
            contents: `Conversation history:\n${conversationTranscript}`,
            config: {
              abortSignal,
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  status: {
                    type: Type.STRING,
                    description: 'One of: needs_both, needs_origin, needs_destination, ready',
                  },
                  originEn: {
                    type: Type.STRING,
                    description: 'English name of departure town, or empty string if unknown',
                  },
                  originKn: {
                    type: Type.STRING,
                    description: 'Kannada name of departure town, or empty string if unknown',
                  },
                  destinationEn: {
                    type: Type.STRING,
                    description: 'English name of destination town, or empty string if unknown',
                  },
                  destinationKn: {
                    type: Type.STRING,
                    description: 'Kannada name of destination town, or empty string if unknown',
                  },
                  timePreference: {
                    type: Type.STRING,
                    description: 'One of: all, morning, afternoon, evening',
                  },
                  followUpQuestion: {
                    type: Type.STRING,
                    description: 'Short bilingual English and Kannada question asking for missing origin and/or destination',
                  },
                },
                required: [
                  'status',
                  'originEn',
                  'originKn',
                  'destinationEn',
                  'destinationKn',
                  'timePreference',
                  'followUpQuestion',
                ],
              },
            },
          };

          const geminiResp = await Promise.race([
            ai.models.generateContent(requestParams),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), 6500)
            ),
          ]);

          const parsedJson = JSON.parse((geminiResp.text || '{}').trim()) as Partial<ExtractedRouteSlots>;
          const validStatus =
            parsedJson.status === 'needs_both' ||
            parsedJson.status === 'needs_origin' ||
            parsedJson.status === 'needs_destination' ||
            parsedJson.status === 'ready'
              ? parsedJson.status
              : 'needs_both';
          const validPref: BusAgentTimePreference =
            parsedJson.timePreference === 'morning' ||
            parsedJson.timePreference === 'afternoon' ||
            parsedJson.timePreference === 'evening'
              ? parsedJson.timePreference
              : 'all';

          extracted = {
            status: validStatus,
            originEn: (parsedJson.originEn || '').trim(),
            originKn: (parsedJson.originKn || '').trim(),
            destinationEn: (parsedJson.destinationEn || '').trim(),
            destinationKn: (parsedJson.destinationKn || '').trim(),
            timePreference: validPref,
            followUpQuestion: (parsedJson.followUpQuestion || '').trim(),
          };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Gemini request failed.';
          if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('403')) {
            res.status(403).json({
              error: 'Gemini API key error. Please check your API key in the Settings > Secrets panel.',
            });
            return;
          }
          // Fall back to deterministic local Koppa/Malnad slot parser on timeouts or transient errors
          extracted = extractBusSlotsLocally(turns);
        }
      }
    }

    if (
      extracted.status !== 'ready' ||
      (!extracted.originEn && !extracted.originKn) ||
      (!extracted.destinationEn && !extracted.destinationKn)
    ) {
      const defaultPrompt =
        extracted.status === 'needs_origin'
          ? `1. From Where? Where are you departing from to reach ${extracted.destinationEn || extracted.destinationKn}?\n೧. ಎಲ್ಲಿಂದ? ನೀವು ${extracted.destinationKn || extracted.destinationEn} ತಲುಪಲು ಎಲ್ಲಿಂದ ಹೊರಡುತ್ತಿದ್ದೀರಿ?`
          : extracted.status === 'needs_destination'
            ? `2. To Where? Where would you like to travel to from ${extracted.originEn || extracted.originKn}?\n೨. ಎಲ್ಲಿಗೆ? ನೀವು ${extracted.originKn || extracted.originEn} ನಿಂದ ಎಲ್ಲಿಗೆ ಪ್ರಯಾಣಿಸಲು ಬಯಸುತ್ತೀರಿ?`
            : 'Please enter 1. From Where and 2. To Where (e.g., Koppa to Shivamogga).\nದಯವಿಟ್ಟು ೧. ಎಲ್ಲಿಂದ ಮತ್ತು ೨. ಎಲ್ಲಿಗೆ ಹೋಗಬೇಕೆಂದು ನಮೂದಿಸಿ (ಉದಾ: ಕೊಪ್ಪದಿಂದ ಶಿವಮೊಗ್ಗ).';

      const payload: BusAgentResponse = {
        status:
          extracted.status === 'ready'
            ? extracted.originEn || extracted.originKn
              ? 'needs_destination'
              : 'needs_origin'
            : extracted.status,
        reply: extracted.followUpQuestion || defaultPrompt,
        origin: extracted.originEn || extracted.originKn || undefined,
        destination: extracted.destinationEn || extracted.destinationKn || undefined,
        timePreference: extracted.timePreference,
        matchedRoutes: [],
      };
      res.json(payload);
      return;
    }

    // Grounded lookup against cached bus schedules across all 12 hubs
    try {
      const cache = await getAllHudkooBusSchedules();
      const {
        matchedRoutes,
        suggestedHubs,
        originLabel,
        destLabel,
        originAutoCorrected,
        destAutoCorrected,
      } = findMatchingBusRoutes(
        cache,
        extracted.originEn,
        extracted.originKn,
        extracted.destinationEn,
        extracted.destinationKn,
        extracted.timePreference
      );

      const totalBuses = matchedRoutes.reduce((sum, r) => sum + r.timings.length, 0);

      const corrections: string[] = [];
      if (originAutoCorrected && directOrigin) {
        corrections.push(`"${directOrigin}" → ${originLabel}`);
      }
      if (destAutoCorrected && directDestination) {
        corrections.push(`"${directDestination}" → ${destLabel}`);
      }
      const correctionLine =
        corrections.length > 0 ? `Auto-corrected spelling: ${corrections.join(', ')}\n` : '';

      let replyText = '';
      if (totalBuses > 0) {
        const periodEn =
          extracted.timePreference !== 'all' ? ` (${extracted.timePreference})` : '';
        const periodKnMap: Record<BusAgentTimePreference, string> = {
          all: '',
          morning: ' (ಬೆಳಿಗ್ಗೆ)',
          afternoon: ' (ಮಧ್ಯಾಹ್ನ)',
          evening: ' (ಸಂಜೆ / ರಾತ್ರಿ)',
        };
        const periodKn = periodKnMap[extracted.timePreference];

        replyText =
          correctionLine +
          `Found ${totalBuses} direct bus${totalBuses === 1 ? '' : 'es'} from ${originLabel} to ${destLabel}${periodEn} across ${matchedRoutes.length} route${matchedRoutes.length === 1 ? '' : 's'}.\n` +
          `${originLabel} ನಿಂದ ${destLabel} ಗೆ${periodKn} ${totalBuses} ನೇರ ಬಸ್‌ಗಳು (ಒಟ್ಟು ${matchedRoutes.length} ಮಾರ್ಗಗಳು) ಲಭ್ಯವಿವೆ.`;
      } else if (extracted.timePreference !== 'all') {
        replyText =
          correctionLine +
          `No ${extracted.timePreference} buses were found from ${originLabel} to ${destLabel}. Try selecting "All Day" to see all departures.\n` +
          `${originLabel} ನಿಂದ ${destLabel} ಗೆ ಈ ಸಮಯದಲ್ಲಿ ಬಸ್ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು "ಇಡೀ ದಿನ" ಆಯ್ಕೆಮಾಡಿ ಪರಿಶೀಲಿಸಿ.`;
      } else if (suggestedHubs.length > 0) {
        replyText =
          correctionLine +
          `No direct bus from ${originLabel} to ${destLabel} was found. You can transfer via: ${suggestedHubs.join(', ')}.\n` +
          `${originLabel} ನಿಂದ ${destLabel} ಗೆ ನೇರ ಬಸ್ ಲಭ್ಯವಿಲ್ಲ. ${suggestedHubs.join(', ')} ಮೂಲಕ ಸಂಪರ್ಕ ಬಸ್‌ಗಳನ್ನು ಪರಿಶೀಲಿಸಬಹುದು.`;
      } else {
        replyText =
          correctionLine +
          `No direct bus route from ${originLabel} to ${destLabel} was found in the current bus schedule.\n` +
          `${originLabel} ನಿಂದ ${destLabel} ಗೆ ಪ್ರಸ್ತುತ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ನೇರ ಬಸ್ ಮಾರ್ಗ ಕಂಡುಬಂದಿಲ್ಲ.`;
      }

      const payload: BusAgentResponse = {
        status: 'ready',
        reply: replyText,
        origin: originLabel,
        destination: destLabel,
        timePreference: extracted.timePreference,
        matchedRoutes,
        suggestedHubs,
      };
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to load bus schedules right now.',
      });
    }
  });

  // Public news feed endpoint
  app.get('/api/articles', (_req, res) => {
    const viewsById = admin2Backend.getArticleViewsMap();
    const articles = loadArticles().map((article) => {
      const serverViews = viewsById[article.id];
      if (typeof serverViews === 'number') {
        return {
          ...article,
          viewCount: Math.max(Number((article as { viewCount?: number }).viewCount) || 0, serverViews),
        };
      }
      return article;
    });
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.json({ articles });
  });

  // Admin login
  app.post('/api/admin/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const auth = ensureAuthRecord();
    const emailMatches = email === auth.email.toLowerCase();
    const passwordMatches = verifySecret(password, auth.passwordHash);

    if (!emailMatches || !passwordMatches) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signToken(auth.email);
    res.json({ token, email: auth.email });
  });

  // Verify active admin session
  app.get('/api/admin/session', requireAdmin, (req: AuthenticatedRequest, res) => {
    res.json({ authenticated: true, email: req.adminEmail });
  });

  // Forgot password - request 6-digit OTP
  app.post('/api/admin/forgot-password', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const auth = ensureAuthRecord();

    if (!email || email !== auth.email.toLowerCase()) {
      res.status(404).json({ error: 'No admin account found for that email address.' });
      return;
    }

    const otp = String(crypto.randomInt(100000, 999999));
    pendingOtp = {
      codeHash: hashSecret(otp),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    console.log(
      `\n[Coffeenadu Admin] Password reset OTP for ${auth.email}: ${otp} (valid for 10 minutes)\n`
    );

    res.json({
      ok: true,
      message:
        'A 6-digit verification code has been issued to the server log. Enter that code or your Admin Recovery Key to set a new password.',
    });
  });

  // Forgot password - verify OTP or Recovery Key and update password
  app.post('/api/admin/reset-password', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const codeOrRecoveryKey =
      typeof req.body?.codeOrRecoveryKey === 'string' ? req.body.codeOrRecoveryKey.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    const auth = ensureAuthRecord();
    if (!email || email !== auth.email.toLowerCase()) {
      res.status(404).json({ error: 'No admin account found for that email address.' });
      return;
    }

    if (!codeOrRecoveryKey) {
      res.status(400).json({ error: 'Verification code or recovery key is required.' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const otpValid =
      pendingOtp !== null &&
      pendingOtp.expiresAt > Date.now() &&
      verifySecret(codeOrRecoveryKey, pendingOtp.codeHash);
    const recoveryValid = verifySecret(codeOrRecoveryKey, auth.recoveryKeyHash);

    if (!otpValid && !recoveryValid) {
      res.status(401).json({ error: 'Invalid or expired verification code / recovery key.' });
      return;
    }

    const updated: AdminAuthRecord = {
      ...auth,
      passwordHash: hashSecret(newPassword),
      updatedAt: new Date().toISOString(),
    };
    saveAuthRecord(updated);
    pendingOtp = null;

    res.json({ ok: true, message: 'Password updated successfully. You can now sign in.' });
  });

  // Change password while signed in
  app.post('/api/admin/change-password', requireAdmin, (req, res) => {
    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    const auth = ensureAuthRecord();
    if (!verifySecret(currentPassword, auth.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    saveAuthRecord({
      ...auth,
      passwordHash: hashSecret(newPassword),
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true, message: 'Admin password updated successfully.' });
  });

  // Admin: Upload image from system/device
  app.post('/api/admin/upload', requireAdmin, (req, res) => {
    const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType.trim() : '';
    const base64Data =
      typeof req.body?.base64Data === 'string' ? req.body.base64Data.trim() : '';

    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };

    const ext = extMap[mimeType.toLowerCase()];
    if (!ext || !base64Data) {
      res.status(400).json({ error: 'Please upload a valid JPG, PNG, WebP, or GIF image.' });
      return;
    }

    const cleanedBase64 = base64Data.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const buffer = Buffer.from(cleanedBase64, 'base64');

    if (buffer.length === 0 || buffer.length > 6 * 1024 * 1024) {
      res.status(400).json({ error: 'Image file size must be under 6 MB.' });
      return;
    }

    const filename = `news-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    res.status(201).json({ url: `/uploads/${filename}` });
  });

  // Admin: Add new article
  app.post('/api/admin/articles', requireAdmin, (req, res) => {
    const titleKannada =
      typeof req.body?.titleKannada === 'string' ? req.body.titleKannada.trim() : '';
    const summaryKannada =
      typeof req.body?.summaryKannada === 'string' ? req.body.summaryKannada.trim() : '';
    const bodyKannada = normalizeParagraphs(req.body?.bodyKannada);
    const category = sanitizeCategory(req.body?.category);
    const location =
      typeof req.body?.location === 'string' && req.body.location.trim()
        ? req.body.location.trim()
        : KOPPA_LOCATIONS[0];
    const reporter =
      typeof req.body?.reporter === 'string' && req.body.reporter.trim()
        ? req.body.reporter.trim()
        : 'Coffeenadu Desk';
    const imageKey = sanitizeImageKey(req.body?.imageKey);
    const imageUrl =
      typeof req.body?.imageUrl === 'string' && req.body.imageUrl.trim()
        ? req.body.imageUrl.trim()
        : undefined;
    const imageCaption =
      typeof req.body?.imageCaption === 'string' && req.body.imageCaption.trim()
        ? req.body.imageCaption.trim()
        : undefined;
    const isFeatured = Boolean(req.body?.isFeatured);

    if (!titleKannada || !summaryKannada || bodyKannada.length === 0) {
      res.status(400).json({
        error: 'Kannada headline, summary, and full report are required.',
      });
      return;
    }

    const now = new Date();
    const publishedDate = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const publishedTime = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const wordScore = bodyKannada.join(' ').length;

    const newArticle: NewsArticle = {
      id: `news-${Date.now()}`,
      titleKannada,
      summaryKannada,
      bodyKannada,
      category,
      location,
      publishedDate,
      publishedTime,
      readTimeMinutes: Math.max(1, Math.ceil(wordScore / 450)),
      reporter,
      imageKey,
      imageUrl,
      imageCaption,
      isFeatured,
    };

    let articles = loadArticles();
    if (isFeatured) {
      articles = articles.map((item) => ({ ...item, isFeatured: false }));
      articles.unshift(newArticle);
    } else {
      articles.unshift(newArticle);
    }
    saveArticles(articles);

    res.status(201).json({ article: newArticle, articles });
  });

  // Admin: Edit existing article
  app.put('/api/admin/articles/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    let articles = loadArticles();
    const index = articles.findIndex((item) => item.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Article not found.' });
      return;
    }

    const existing = articles[index];
    const titleKannada =
      typeof req.body?.titleKannada === 'string' ? req.body.titleKannada.trim() : existing.titleKannada;
    const summaryKannada =
      typeof req.body?.summaryKannada === 'string'
        ? req.body.summaryKannada.trim()
        : existing.summaryKannada;
    const bodyKannada =
      req.body?.bodyKannada !== undefined
        ? normalizeParagraphs(req.body.bodyKannada)
        : existing.bodyKannada;

    if (!titleKannada || !summaryKannada || bodyKannada.length === 0) {
      res.status(400).json({
        error: 'Kannada headline, summary, and full report cannot be empty.',
      });
      return;
    }

    const isFeatured =
      req.body?.isFeatured !== undefined ? Boolean(req.body.isFeatured) : existing.isFeatured;

    const updated: NewsArticle = {
      ...existing,
      titleKannada,
      summaryKannada,
      bodyKannada,
      category:
        req.body?.category !== undefined ? sanitizeCategory(req.body.category) : existing.category,
      location:
        typeof req.body?.location === 'string' && req.body.location.trim()
          ? req.body.location.trim()
          : existing.location,
      reporter:
        typeof req.body?.reporter === 'string' && req.body.reporter.trim()
          ? req.body.reporter.trim()
          : existing.reporter,
      imageKey:
        req.body?.imageKey !== undefined ? sanitizeImageKey(req.body.imageKey) : existing.imageKey,
      imageUrl:
        typeof req.body?.imageUrl === 'string'
          ? req.body.imageUrl.trim() || undefined
          : existing.imageUrl,
      imageCaption:
        typeof req.body?.imageCaption === 'string'
          ? req.body.imageCaption.trim() || undefined
          : existing.imageCaption,
      isFeatured,
      readTimeMinutes: Math.max(1, Math.ceil(bodyKannada.join(' ').length / 450)),
    };

    if (isFeatured) {
      articles = articles.map((item) =>
        item.id === id ? updated : { ...item, isFeatured: false }
      );
      articles = [updated, ...articles.filter((item) => item.id !== id)];
    } else {
      articles[index] = updated;
    }

    saveArticles(articles);
    res.json({ article: updated, articles });
  });

  // Admin: Delete article
  app.delete('/api/admin/articles/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    const articles = loadArticles();
    const next = articles.filter((item) => item.id !== id);
    if (next.length === articles.length) {
      res.status(404).json({ error: 'Article not found.' });
      return;
    }
    saveArticles(next);
    res.json({ ok: true, articles: next });
  });

  // Dynamic image endpoint for WhatsApp & social OpenGraph previews
  interface FirebaseRuntimeConfig {
    projectId: string;
    firestoreDatabaseId: string;
    apiKey: string;
  }

  let cachedFirebaseConfig: FirebaseRuntimeConfig | null = null;
  function getFirebaseRuntimeConfig(): FirebaseRuntimeConfig | null {
    if (cachedFirebaseConfig) return cachedFirebaseConfig;
    try {
      const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<FirebaseRuntimeConfig>;
      if (parsed.projectId && parsed.firestoreDatabaseId) {
        cachedFirebaseConfig = {
          projectId: parsed.projectId,
          firestoreDatabaseId: parsed.firestoreDatabaseId,
          apiKey: parsed.apiKey || '',
        };
        return cachedFirebaseConfig;
      }
    } catch {
      // Config not present
    }
    return null;
  }

  const PRESET_IMAGE_FILES: Record<string, string> = {
    'koppa-landscape': 'koppa_town_landscape_1794709366123.jpg',
    'malnad-hills': 'malnad_hills_road_1794833446049.jpg',
    'coffee-estate': 'coffee_arecanut_estate_1794709367051.jpg',
    'health-medical': 'health_hospital_care_1794833609245.jpg',
    'entertainment-stage': 'entertainment_cinema_stage_1794833457980.jpg',
    'crime-alert': 'crime_police_patrol_1794833449002.jpg',
    'general-news': 'general_news_morning_1794833645570.jpg',
    'politics-assembly': 'politics_assembly_podium_1794833641337.jpg',
    'sports-stadium': 'sports_stadium_match_1794833642170.jpg',
    'special-feature': 'special_feature_ghats_1794833452939.jpg',
    'state-civic': 'state_civic_architecture_1794833643485.jpg',
    'nation-parliament': 'nation_parliament_flag_1794833641928.jpg',
    'tunga-bridge': 'tunga_river_bridge_1794709366458.jpg',
    'education-library': 'education_library_study_1794833645509.jpg',
    'malnad-culture': 'malnad_cultural_heritage_1794709367996.jpg',
  };

  const CATEGORY_DEFAULT_IMAGE_KEY_MAP: Record<string, string> = {
    Local: 'koppa-landscape',
    Malnad: 'malnad-hills',
    Agriculture: 'coffee-estate',
    Health: 'health-medical',
    Entertainment: 'entertainment-stage',
    Crime: 'crime-alert',
    General: 'general-news',
    Politics: 'politics-assembly',
    Sports: 'sports-stadium',
    Special: 'special-feature',
    State: 'state-civic',
    Nation: 'nation-parliament',
    'Civic & Roads': 'tunga-bridge',
    Education: 'education-library',
    Culture: 'malnad-culture',
  };

  interface FirestoreShareMetadata {
    id: string;
    titleKannada: string;
    summaryKannada: string;
    category: string;
    location: string;
    imageKey: string;
    imageUrl: string;
    watermarkApplied: boolean;
  }

  function readFirestoreStringField(
    fields: Record<string, { stringValue?: string; booleanValue?: boolean }> | undefined,
    key: string
  ): string {
    const val = fields?.[key]?.stringValue;
    return typeof val === 'string' ? val : '';
  }

  function readFirestoreBooleanField(
    fields: Record<string, { stringValue?: string; booleanValue?: boolean }> | undefined,
    key: string
  ): boolean {
    return fields?.[key]?.booleanValue === true;
  }

  const watermarkedPresetCache = new Map<string, Buffer>();

  function getCircleLogoAssetPath(): string | null {
    const primary = path.resolve(process.cwd(), 'src/assets/images/coffeenadu_logo_circle.png');
    if (fs.existsSync(primary)) return primary;
    const secondary = path.resolve(process.cwd(), 'public/assets/coffeenadu_logo_circle.png');
    if (fs.existsSync(secondary)) return secondary;
    return null;
  }

  async function compositeCircularWatermarkOnBuffer(inputBuffer: Buffer): Promise<Buffer> {
    const logoPath = getCircleLogoAssetPath();
    if (!logoPath || !inputBuffer || inputBuffer.length === 0) return inputBuffer;

    try {
      const baseImage = sharp(inputBuffer, { failOn: 'none' }).rotate();
      const metadata = await baseImage.metadata();
      const w = metadata.width || 800;
      const h = metadata.height || 450;
      const minDim = Math.max(1, Math.min(w, h));
      const size =
        minDim <= 140
          ? Math.max(20, Math.min(36, Math.round(minDim * 0.26)))
          : Math.max(36, Math.min(128, Math.round(minDim * 0.145)));
      const pad =
        minDim <= 140
          ? Math.max(5, Math.round(minDim * 0.06))
          : Math.max(10, Math.round(minDim * 0.032));

      const resizedLogo = await sharp(logoPath)
        .resize(size, size, { fit: 'contain' })
        .png()
        .toBuffer();

      return await baseImage
        .composite([{ input: resizedLogo, top: pad, left: pad }])
        .jpeg({ quality: 86, progressive: true, mozjpeg: true })
        .toBuffer();
    } catch {
      return inputBuffer;
    }
  }

  const SHARE_METADATA_TTL_MS = 10 * 60 * 1000;
  const shareMetadataCache = new Map<
    string,
    { data: FirestoreShareMetadata; expiresAt: number }
  >();
  const shareMetadataInFlight = new Map<string, Promise<FirestoreShareMetadata | null>>();
  let serverFirestoreQuotaCooldownUntil = 0;

  async function fetchShareDocMetadata(
    collectionName: 'articles' | 'events',
    docId: string
  ): Promise<FirestoreShareMetadata | null> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(docId)) return null;
    if (collectionName === 'articles' && REMOVED_LEGACY_ARTICLE_IDS.has(docId)) {
      return null;
    }

    const cacheKey = `${collectionName}:${docId}`;
    const cached = shareMetadataCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    if (Date.now() < serverFirestoreQuotaCooldownUntil && cached) {
      return cached.data;
    }

    const existingPromise = shareMetadataInFlight.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const task = (async (): Promise<FirestoreShareMetadata | null> => {
      // 1. Prefer Google Sheets + Apps Script cached storage when configured
      if (sheetsStorage.isConfigured()) {
        const sheetsMeta = await sheetsStorage.lookupShareMetadata(collectionName, docId);
        if (sheetsMeta) {
          shareMetadataCache.set(cacheKey, {
            data: sheetsMeta,
            expiresAt: Date.now() + SHARE_METADATA_TTL_MS,
          });
          return sheetsMeta;
        }
      }

      // 2. Fallback to Firebase Firestore REST (kept intact as rollback/pre-migration source)
      const cfg = getFirebaseRuntimeConfig();
      if (cfg && Date.now() >= serverFirestoreQuotaCooldownUntil) {
        try {
          const apiUrl = new URL(
            `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
              cfg.projectId
            )}/databases/${encodeURIComponent(
              cfg.firestoreDatabaseId
            )}/documents/${collectionName}/${encodeURIComponent(docId)}`
          );
          if (cfg.apiKey) {
            apiUrl.searchParams.set('key', cfg.apiKey);
          }
          const response = await fetch(apiUrl.toString(), {
            signal: AbortSignal.timeout(3500),
          });
          if (response.status === 429) {
            serverFirestoreQuotaCooldownUntil = Date.now() + 60 * 1000;
            if (cached) return cached.data;
          } else if (response.ok) {
            const json = (await response.json()) as {
              fields?: Record<string, { stringValue?: string; booleanValue?: boolean }>;
            };
            if (json.fields) {
              const meta: FirestoreShareMetadata = {
                id: docId,
                titleKannada: readFirestoreStringField(json.fields, 'titleKannada'),
                summaryKannada:
                  readFirestoreStringField(json.fields, 'summaryKannada') ||
                  readFirestoreStringField(json.fields, 'descriptionKannada'),
                category: readFirestoreStringField(json.fields, 'category') || 'Local',
                location: readFirestoreStringField(json.fields, 'location') || 'ಕೊಪ್ಪ',
                imageKey: readFirestoreStringField(json.fields, 'imageKey') || 'none',
                imageUrl: readFirestoreStringField(json.fields, 'imageUrl'),
                watermarkApplied: readFirestoreBooleanField(json.fields, 'watermarkApplied'),
              };
              if (shareMetadataCache.size > 250) {
                const oldestKey = shareMetadataCache.keys().next().value;
                if (oldestKey) shareMetadataCache.delete(oldestKey);
              }
              shareMetadataCache.set(cacheKey, {
                data: meta,
                expiresAt: Date.now() + SHARE_METADATA_TTL_MS,
              });
              return meta;
            }
          }
        } catch {
          if (cached) return cached.data;
        }
      }

      if (cached) {
        return cached.data;
      }

      if (collectionName === 'articles') {
        const seed = PORTAL_SEED_ARTICLES.find((a) => a.id === docId);
        if (seed) {
          return {
            id: seed.id,
            titleKannada: seed.titleKannada,
            summaryKannada: seed.summaryKannada,
            category: seed.category,
            location: seed.location,
            imageKey: seed.imageKey || 'none',
            imageUrl: seed.imageUrl || '',
            watermarkApplied: Boolean(seed.watermarkApplied && seed.imageUrl),
          };
        }
      }

      return null;
    })().finally(() => {
      shareMetadataInFlight.delete(cacheKey);
    });

    shareMetadataInFlight.set(cacheKey, task);
    return task;
  }

  function resolvePresetImageFilePath(imageKey: string, category: string): string {
    const resolvedKey =
      imageKey && imageKey !== 'none' && PRESET_IMAGE_FILES[imageKey]
        ? imageKey
        : CATEGORY_DEFAULT_IMAGE_KEY_MAP[category] || 'koppa-landscape';
    const fileName = PRESET_IMAGE_FILES[resolvedKey] || 'koppa_town_landscape_1794709366123.jpg';
    return path.resolve(process.cwd(), 'src/assets/images', fileName);
  }

  const ogOptimizedImageCache = new Map<string, { buffer: Buffer; expiresAt: number }>();
  const OG_IMAGE_CACHE_TTL_MS = 30 * 60 * 1000;

  async function optimizeImageForWhatsAppOg(inputBuffer: Buffer): Promise<Buffer> {
    if (!inputBuffer || inputBuffer.length === 0) return inputBuffer;

    const MAX_WHATSAPP_BYTES = 240 * 1024;
    try {
      let quality = 78;
      let width = 1200;
      let height = 630;
      let output = await sharp(inputBuffer, { failOn: 'none' })
        .rotate()
        .resize({ width, height, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, progressive: true, mozjpeg: true })
        .toBuffer();

      // Iteratively lower quality / dimensions until guaranteed under 240 KB for WhatsApp crawlers
      for (const step of [
        { q: 68, w: 1200, h: 630 },
        { q: 58, w: 1000, h: 525 },
        { q: 50, w: 800, h: 420 },
      ]) {
        if (output.length <= MAX_WHATSAPP_BYTES) break;
        quality = step.q;
        width = step.w;
        height = step.h;
        output = await sharp(inputBuffer, { failOn: 'none' })
          .rotate()
          .resize({ width, height, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality, progressive: true, mozjpeg: true })
          .toBuffer();
      }

      return output.length > 0 ? output : inputBuffer;
    } catch {
      return inputBuffer;
    }
  }

  async function sendResolvedImageResponse(
    res: Response,
    cacheId: string,
    imageUrl: string,
    watermarkApplied: boolean,
    fallbackFilePath: string
  ): Promise<void> {
    const cacheKey = `${cacheId}|${watermarkApplied ? 'wm' : 'raw'}|${imageUrl.slice(0, 120)}`;
    const cachedHit = ogOptimizedImageCache.get(cacheKey);
    if (cachedHit && Date.now() < cachedHit.expiresAt) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(cachedHit.buffer);
      return;
    }

    const storeAndSend = (buf: Buffer) => {
      if (ogOptimizedImageCache.size > 120) {
        const oldestKey = ogOptimizedImageCache.keys().next().value;
        if (oldestKey) ogOptimizedImageCache.delete(oldestKey);
      }
      ogOptimizedImageCache.set(cacheKey, {
        buffer: buf,
        expiresAt: Date.now() + OG_IMAGE_CACHE_TTL_MS,
      });
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    };

    if (imageUrl) {
      const dataMatch = imageUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s);
      if (dataMatch) {
        const rawBuffer = Buffer.from(dataMatch[2], 'base64');
        const branded = watermarkApplied
          ? rawBuffer
          : await compositeCircularWatermarkOnBuffer(rawBuffer);
        const optimized = await optimizeImageForWhatsAppOg(branded);
        storeAndSend(optimized);
        return;
      }
      if (imageUrl.startsWith('/api/media/drive/')) {
        const driveId = imageUrl.replace('/api/media/drive/', '').split('?')[0].trim();
        if (/^[a-zA-Z0-9_-]{10,120}$/.test(driveId)) {
          const driveCacheFile = path.join(DATA_DIR, 'drive-image-cache', driveId);
          try {
            let rawBuf: Buffer | null = null;
            if (fs.existsSync(driveCacheFile)) {
              rawBuf = fs.readFileSync(driveCacheFile);
            } else {
              const resp = await fetch(`https://lh3.googleusercontent.com/d/${encodeURIComponent(driveId)}=w1200`, {
                redirect: 'follow',
                signal: AbortSignal.timeout(5000),
              });
              if (resp.ok) {
                rawBuf = Buffer.from(await resp.arrayBuffer());
              }
            }
            if (rawBuf && rawBuf.length > 0) {
              const branded = watermarkApplied
                ? rawBuf
                : await compositeCircularWatermarkOnBuffer(rawBuf);
              const optimized = await optimizeImageForWhatsAppOg(branded);
              storeAndSend(optimized);
              return;
            }
          } catch {
            // Fall through to preset fallback
          }
        }
      }
      if (/^https?:\/\//i.test(imageUrl)) {
        try {
          const imgResp = await fetch(imageUrl, {
            redirect: 'follow',
            signal: AbortSignal.timeout(5000),
          });
          if (imgResp.ok) {
            const arr = Buffer.from(await imgResp.arrayBuffer());
            const branded = watermarkApplied
              ? arr
              : await compositeCircularWatermarkOnBuffer(arr);
            const optimized = await optimizeImageForWhatsAppOg(branded);
            storeAndSend(optimized);
            return;
          }
        } catch {
          // Fall through to redirect if upstream fetch fails
        }
        res.redirect(302, imageUrl);
        return;
      }
    }

    if (fs.existsSync(fallbackFilePath)) {
      let cached = watermarkedPresetCache.get(fallbackFilePath);
      if (!cached) {
        const rawPreset = fs.readFileSync(fallbackFilePath);
        const brandedPreset = await compositeCircularWatermarkOnBuffer(rawPreset);
        cached = await optimizeImageForWhatsAppOg(brandedPreset);
        watermarkedPresetCache.set(fallbackFilePath, cached);
      }
      storeAndSend(cached);
      return;
    }

    res.status(404).end();
  }

  app.get('/api/og-default-image', async (_req, res) => {
    const fallbackFile = resolvePresetImageFilePath('koppa-landscape', 'Local');
    await sendResolvedImageResponse(res, 'og-default', '', false, fallbackFile);
  });

  app.get('/api/article-image/:id', async (req, res) => {
    const articleId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const meta = await fetchShareDocMetadata('articles', articleId);
    const fallbackFile = resolvePresetImageFilePath(
      meta?.imageKey || 'none',
      meta?.category || 'Local'
    );
    await sendResolvedImageResponse(
      res,
      `article:${articleId}`,
      meta?.imageUrl || '',
      Boolean(meta?.watermarkApplied && meta?.imageUrl),
      fallbackFile
    );
  });

  app.get('/api/event-image/:id', async (req, res) => {
    const eventId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const meta = await fetchShareDocMetadata('events', eventId);
    const fallbackFile = resolvePresetImageFilePath('entertainment-stage', 'Entertainment');
    await sendResolvedImageResponse(
      res,
      `event:${eventId}`,
      meta?.imageUrl || '',
      Boolean(meta?.watermarkApplied && meta?.imageUrl),
      fallbackFile
    );
  });

  // Public OG image for Local Advertisements (serves exact unmodified advertiser image — zero watermark)
  app.get('/api/ad-image/:id', async (req, res) => {
    const adLookup = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const previewToken = typeof req.query.preview === 'string' ? req.query.preview.trim() : undefined;
    const meta = admin2Backend.getAdShareMetadata(adLookup, previewToken);
    if (!meta || !meta.mainImageUrl) {
      const fallbackFile = resolvePresetImageFilePath('koppa-landscape', 'Local');
      await sendResolvedImageResponse(res, `ad-fallback:${adLookup}`, '', true, fallbackFile);
      return;
    }

    const imgUrl = meta.mainImageUrl;
    if (imgUrl.startsWith('/api/ads/media/')) {
      const fileName = path.basename(imgUrl.split('?')[0]);
      const candidates = [
        path.join(DATA_DIR, 'ads-media', fileName),
        path.join(os.tmpdir(), 'coffeenadu-admin2-data', 'ads-media', fileName),
      ];
      for (const candidate of candidates) {
        if (/^[a-zA-Z0-9_-]{8,100}\.(jpg|jpeg|png|webp)$/i.test(fileName) && fs.existsSync(candidate)) {
          const rawBuf = fs.readFileSync(candidate);
          const optimized = await optimizeImageForWhatsAppOg(rawBuf);
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', previewToken ? 'no-store' : 'public, max-age=3600');
          res.send(optimized);
          return;
        }
      }
    }

    const fallbackFile = resolvePresetImageFilePath('koppa-landscape', 'Local');
    await sendResolvedImageResponse(
      res,
      `ad:${meta.id}`,
      imgUrl,
      true, // CRITICAL: Never apply CoffeeNadu watermark to advertisement images
      fallbackFile
    );
  });

  const PUBLIC_SHARE_DOMAIN = (process.env.PUBLIC_SITE_URL || 'https://coffeenadu.in').replace(/\/+$/, '');
  const CUSTOM_DOMAIN_PROBE_TTL_MS = 5 * 60 * 1000;
  let customDomainDeepLinkCache: { supported: boolean; checkedAt: number } | null = null;
  let customDomainProbeInFlight: Promise<boolean> | null = null;

  /**
   * Probes whether `PUBLIC_SHARE_DOMAIN` (https://coffeenadu.in) preserves `/?article=...`
   * query strings on redirect (e.g. Cloudflare Redirect Rule) or serves the app directly.
   * Default GoDaddy forwarding strips `?article=...` and redirects to the bare homepage,
   * which breaks both WhatsApp previews and direct article opening.
   */
  async function doesCustomDomainPreserveDeepLinks(): Promise<boolean> {
    if (process.env.FORCE_CUSTOM_SHARE_DOMAIN === 'true') return true;
    if (
      customDomainDeepLinkCache &&
      Date.now() - customDomainDeepLinkCache.checkedAt < CUSTOM_DOMAIN_PROBE_TTL_MS
    ) {
      return customDomainDeepLinkCache.supported;
    }
    if (customDomainProbeInFlight) return customDomainProbeInFlight;

    customDomainProbeInFlight = (async (): Promise<boolean> => {
      try {
        const probeToken = '__cn_probe__';
        const resp = await fetch(`${PUBLIC_SHARE_DOMAIN}/?article=${probeToken}`, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'User-Agent': 'WhatsApp/2.23.20.0' },
          signal: AbortSignal.timeout(2500),
        });
        let supported = false;
        if (resp.status >= 300 && resp.status < 400) {
          const location = resp.headers.get('location') || '';
          supported = location.includes(`article=${probeToken}`);
        } else if (resp.status === 200) {
          const text = await resp.text();
          supported = text.includes('Coffeenadu News');
        }
        customDomainDeepLinkCache = { supported, checkedAt: Date.now() };
        return supported;
      } catch {
        customDomainDeepLinkCache = { supported: false, checkedAt: Date.now() };
        return false;
      } finally {
        customDomainProbeInFlight = null;
      }
    })();

    return customDomainProbeInFlight;
  }

  async function resolveWorkingShareOrigin(req: Request): Promise<{
    deepLinkOrigin: string;
    customDomainSupportsDeepLinks: boolean;
  }> {
    const requestOrigin = getRequestOrigin(req);
    const host = (req.headers['x-forwarded-host'] || req.get('host') || '').toString().toLowerCase();
    // If the request already arrived directly on coffeenadu.in, it definitely supports deep links
    if (host.includes('coffeenadu.in')) {
      return { deepLinkOrigin: PUBLIC_SHARE_DOMAIN, customDomainSupportsDeepLinks: true };
    }
    const supported = await doesCustomDomainPreserveDeepLinks();
    return {
      deepLinkOrigin: supported ? PUBLIC_SHARE_DOMAIN : requestOrigin,
      customDomainSupportsDeepLinks: supported,
    };
  }

  app.get('/api/share-config', async (req, res) => {
    const resolved = await resolveWorkingShareOrigin(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      customDomain: PUBLIC_SHARE_DOMAIN,
      deepLinkOrigin: resolved.deepLinkOrigin,
      customDomainSupportsDeepLinks: resolved.customDomainSupportsDeepLinks,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  function escapeHtmlAttr(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getRequestOrigin(req: Request): string {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto =
      typeof forwardedProto === 'string' && forwardedProto
        ? forwardedProto.split(',')[0].trim()
        : req.protocol || 'https';
    const forwardedHost = req.headers['x-forwarded-host'];
    const host =
      typeof forwardedHost === 'string' && forwardedHost
        ? forwardedHost.split(',')[0].trim()
        : req.get('host') || 'localhost:3000';
    return `${proto}://${host}`;
  }

  function injectOpenGraphTags(
    html: string,
    opts: {
      title: string;
      description: string;
      imageUrl: string;
      pageUrl: string;
      ogType: 'article' | 'website';
      shareOrigin?: string;
    }
  ): string {
    const safeTitle = escapeHtmlAttr(opts.title);
    const safeDesc = escapeHtmlAttr(opts.description);
    const safeImg = escapeHtmlAttr(opts.imageUrl);
    const safeUrl = escapeHtmlAttr(opts.pageUrl);

    // Replace core tags and strip static canonical/og:url/og:image/twitter tags to avoid duplicates
    let result = html
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
      .replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
        `<meta name="description" content="${safeDesc}" />`
      )
      .replace(
        /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:title" content="${safeTitle}" />`
      )
      .replace(
        /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:description" content="${safeDesc}" />`
      )
      .replace(
        /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:type" content="${opts.ogType}" />`
      )
      .replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>\s*/gi, '')
      .replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>\s*/gi, '')
      .replace(/<meta\s+property="og:image(?::[a-z_]+)?"\s+content="[^"]*"\s*\/?>\s*/gi, '')
      .replace(/<meta\s+name="twitter:(?:title|description|image)"\s+content="[^"]*"\s*\/?>\s*/gi, '');

    const jsonLd =
      opts.ogType === 'article'
        ? `<script type="application/ld+json">${JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: opts.title,
            description: opts.description,
            image: [opts.imageUrl],
            mainEntityOfPage: opts.pageUrl,
            publisher: {
              '@type': 'NewsMediaOrganization',
              name: 'Coffeenadu News',
              url: `${PUBLIC_SHARE_DOMAIN}/`,
            },
          }).replace(/</g, '\\u003c')}</script>`
        : '';

    const shareOriginScript = opts.shareOrigin
      ? `<script>window.__COFFEENADU_SHARE_ORIGIN__=${JSON.stringify(opts.shareOrigin)};</script>`
      : '';

    const extraMetaTags = [
      `<link rel="canonical" href="${safeUrl}" />`,
      `<meta property="og:url" content="${safeUrl}" />`,
      `<meta property="og:image" content="${safeImg}" />`,
      `<meta property="og:image:secure_url" content="${safeImg}" />`,
      `<meta property="og:image:type" content="image/jpeg" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:title" content="${safeTitle}" />`,
      `<meta name="twitter:description" content="${safeDesc}" />`,
      `<meta name="twitter:image" content="${safeImg}" />`,
      jsonLd,
      shareOriginScript,
    ]
      .filter(Boolean)
      .join('\n    ');

    return result.replace('</head>', `    ${extraMetaTags}\n  </head>`);
  }

  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const rootIndex = path.resolve(process.cwd(), 'index.html');
  const isDevMode =
    process.env.COFFEENADU_DEV === '1' ||
    (process.env.NODE_ENV !== 'production' && !fs.existsSync(distIndex));

  const vite = isDevMode
    ? await (
        await import('vite')
      ).createServer({
        server: {
          middlewareMode: true,
          hmr: false,
          watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
        },
        appType: 'spa',
      })
    : null;

  // Support clean /news/:id and /article/:id paths without 404 errors
  app.get(['/news/:id', '/article/:id'], (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id) {
      res.redirect(301, '/');
      return;
    }
    res.redirect(301, `/?article=${encodeURIComponent(id)}`);
  });

  app.get(['/', '/events', '/ads'], async (req, res, next) => {
    const articleId =
      req.path === '/' && typeof req.query.article === 'string'
        ? req.query.article.trim()
        : '';
    const eventId =
      req.path === '/events' && typeof req.query.event === 'string'
        ? req.query.event.trim()
        : '';
    const adId =
      req.path === '/ads' && typeof req.query.ad === 'string'
        ? req.query.ad.trim()
        : '';
    const adPreviewToken =
      req.path === '/ads' && typeof req.query.preview === 'string'
        ? req.query.preview.trim()
        : undefined;

    try {
      // Keep og:image directly on the live HTTPS Express origin so WhatsApp always fetches HTTP 200 without redirect issues
      const origin = getRequestOrigin(req);
      const { deepLinkOrigin } = await resolveWorkingShareOrigin(req);
      let ogTitle = 'Coffeenadu News — Koppa Taluk Local Kannada News';
      let ogDescription =
        'Local Koppa Taluk news publishing portal featuring Kannada updates, bus timings, and programs.';
      let ogImageUrl = `${origin}/api/og-default-image`;
      let ogUrl =
        req.path === '/events'
          ? `${deepLinkOrigin}/events`
          : req.path === '/ads'
          ? `${deepLinkOrigin}/ads`
          : `${deepLinkOrigin}/`;

      const stripMarkupForMeta = (raw: string): string =>
        String(raw || '')
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .replace(/\s+/g, ' ')
          .trim();

      if (articleId) {
        ogUrl = `${deepLinkOrigin}/?article=${encodeURIComponent(articleId)}`;
        const meta = await fetchShareDocMetadata('articles', articleId);
        if (meta) {
          const cleanMetaTitle = stripMarkupForMeta(meta.titleKannada);
          const cleanMetaSummary = stripMarkupForMeta(meta.summaryKannada);
          ogTitle = cleanMetaTitle
            ? `${cleanMetaTitle} — Coffeenadu News`
            : ogTitle;
          ogDescription = cleanMetaSummary || ogDescription;
          ogImageUrl = `${origin}/api/article-image/${encodeURIComponent(articleId)}`;
        }
      } else if (eventId) {
        ogUrl = `${deepLinkOrigin}/events?event=${encodeURIComponent(eventId)}`;
        const meta = await fetchShareDocMetadata('events', eventId);
        if (meta) {
          const cleanMetaTitle = stripMarkupForMeta(meta.titleKannada);
          const cleanMetaSummary = stripMarkupForMeta(meta.summaryKannada);
          ogTitle = cleanMetaTitle
            ? `${cleanMetaTitle} — Coffeenadu Programs`
            : ogTitle;
          ogDescription = cleanMetaSummary || ogDescription;
          ogImageUrl = `${origin}/api/event-image/${encodeURIComponent(eventId)}`;
        }
      } else if (adId) {
        ogUrl = `${deepLinkOrigin}/ads?ad=${encodeURIComponent(adId)}`;
        const adMeta = admin2Backend.getAdShareMetadata(adId, adPreviewToken);
        if (adMeta) {
          const cleanAdTitle = stripMarkupForMeta(adMeta.title);
          const cleanAdDesc = stripMarkupForMeta(adMeta.description);
          ogTitle = cleanAdTitle
            ? `${cleanAdTitle} — Coffeenadu Local Ads`
            : 'Local Advertisement — Coffeenadu News';
          ogDescription =
            cleanAdDesc ||
            `${adMeta.category} advertisement on Coffeenadu News (${adMeta.adNumber})`;
          ogImageUrl = `${origin}/api/ad-image/${encodeURIComponent(adMeta.id)}${
            adPreviewToken ? `?preview=${encodeURIComponent(adPreviewToken)}` : ''
          }`;
        }
      } else if (req.path === '/ads') {
        ogTitle = 'Local Advertisements — Coffeenadu News';
        ogDescription =
          'Browse Koppa Taluk local business advertisements, services, education, real estate, and offers on Coffeenadu News.';
      }

      const rawTemplate = fs.readFileSync(vite ? rootIndex : distIndex, 'utf8');
      const transformed = vite
        ? await vite.transformIndexHtml(req.originalUrl, rawTemplate)
        : rawTemplate;

      const htmlWithOg = injectOpenGraphTags(transformed, {
        title: ogTitle,
        description: ogDescription.slice(0, 300),
        imageUrl: ogImageUrl,
        pageUrl: ogUrl,
        ogType: articleId ? 'article' : 'website',
        shareOrigin: deepLinkOrigin,
      });

      res
        .status(200)
        .set({
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        })
        .end(htmlWithOg);
    } catch {
      next();
    }
  });

  // Android Trusted Web Activity (TWA) Digital Asset Links endpoint
  // Configure ANDROID_TWA_SHA256_FINGERPRINT (comma-separated SHA-256 cert fingerprints) in environment variables.
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const rawFingerprints = (process.env.ANDROID_TWA_SHA256_FINGERPRINT || '').trim();
    const fingerprints = rawFingerprints
      .split(',')
      .map((fp) => fp.trim().toUpperCase())
      .filter((fp) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fp));

    const statements = [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.coffeenadu.admin',
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ];

    res
      .status(200)
      .set({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      })
      .send(JSON.stringify(statements, null, 2));
  });

  // Serve PWA manifest and Service Worker with explicit MIME types and safe cache headers
  const publicDir = path.resolve(process.cwd(), 'public');
  app.get('/manifest.webmanifest', (_req, res, next) => {
    const candidate = fs.existsSync(path.join(distDir, 'manifest.webmanifest'))
      ? path.join(distDir, 'manifest.webmanifest')
      : path.join(publicDir, 'manifest.webmanifest');
    if (!fs.existsSync(candidate)) {
      next();
      return;
    }
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(candidate);
  });

  app.get('/sw.js', (_req, res, next) => {
    const candidate = fs.existsSync(path.join(distDir, 'sw.js'))
      ? path.join(distDir, 'sw.js')
      : path.join(publicDir, 'sw.js');
    if (!fs.existsSync(candidate)) {
      next();
      return;
    }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(candidate);
  });

  if (vite) {
    app.use((req, res, next) => {
      if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          } else if (filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Service-Worker-Allowed', '/');
          } else if (filePath.endsWith('.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          }
        },
      })
    );
    app.get('*', async (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      try {
        const { deepLinkOrigin } = await resolveWorkingShareOrigin(req);
        const raw = fs.readFileSync(distIndex, 'utf8');
        const injected = raw.replace(
          '</head>',
          `    <script>window.__COFFEENADU_SHARE_ORIGIN__=${JSON.stringify(deepLinkOrigin)};</script>\n  </head>`
        );
        res.status(200).set('Content-Type', 'text/html').end(injected);
      } catch {
        res.sendFile(distIndex);
      }
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Coffeenadu News server running on http://0.0.0.0:${PORT}`);
  });

  let isShuttingDown = false;
  const gracefulShutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    const forceExitTimer = setTimeout(() => {
      process.exit(0);
    }, 1500);
    forceExitTimer.unref?.();

    Promise.allSettled([
      new Promise<void>((resolve) => httpServer.close(() => resolve())),
      vite ? vite.close() : Promise.resolve(),
      sheetsStorage.flushPendingViews(),
    ]).finally(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

startServer().catch((err) => {
  console.error('Failed to start Coffeenadu News server:', err);
  process.exit(1);
});
