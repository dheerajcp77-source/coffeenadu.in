import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_FEED_CATEGORIES,
  DEFAULT_HOMEPAGE_ANNOUNCEMENT,
} from '../constants/platformCatalog.ts';
import type { PublicCommunityPost } from '../types/community.ts';
import type { NewsArticle, ProgramEvent } from '../types/news.ts';
import type { PlatformListing } from '../types/platform.ts';
import {
  buildUnifiedCommunityFeed,
  filterUnifiedCommunityFeed,
  getOrderedEnabledFeedCategories,
  isAnnouncementScheduledActive,
} from './unifiedFeedHelpers.ts';

const SAMPLE_ARTICLES: NewsArticle[] = [
  {
    id: 'art-1',
    titleKannada: 'ಕೊಪ್ಪದಲ್ಲಿ ಭಾರಿ ಮಳೆ: ಅಡಿಕೆ ಬೆಳೆಗಾರರಿಗೆ ಸೂಚನೆ',
    summaryKannada: 'ಕೊಪ್ಪ ಮತ್ತು ಜಯಪುರ ಭಾಗದಲ್ಲಿ ಮುಂಗಾರು ಮಳೆ ಚುರುಕಾಗಿದೆ.',
    bodyKannada: ['ವಿವರವಾದ ಸುದ್ದಿ'],
    category: 'Agriculture',
    location: 'ಕೊಪ್ಪ',
    publishedDate: '2026-11-26',
    publishedTime: '10:30 AM',
    publishedTimestamp: Date.parse('2026-11-26T05:00:00Z'),
    readTimeMinutes: 2,
    reporter: 'ಕೊಪ್ಪ ವರದಿಗಾರರು',
    viewCount: 120,
  },
  {
    id: 'art-2',
    titleKannada: 'ಶೃಂಗೇರಿ ಆಸ್ಪತ್ರೆಯಲ್ಲಿ ಉಚಿತ ಆರೋಗ್ಯ ಶಿಬಿರ',
    summaryKannada: 'ಭಾನುವಾರ ಉಚಿತ ತಪಾಸಣೆ ಲಭ್ಯ.',
    bodyKannada: ['ಆರೋಗ್ಯ ವರದಿ'],
    category: 'Health',
    location: 'ಶೃಂಗೇರಿ',
    publishedDate: '2026-11-25',
    publishedTime: '08:00 AM',
    publishedTimestamp: Date.parse('2026-11-25T02:30:00Z'),
    readTimeMinutes: 1,
    reporter: 'Coffeenadu Desk',
    viewCount: 45,
  },
  {
    id: 'art-3',
    titleKannada: 'ಮಲೆನಾಡು ಕ್ರೀಡಾಕೂಟಕ್ಕೆ ಭರ್ಜರಿ ಚಾಲನೆ',
    summaryKannada: 'ಜಿಲ್ಲಾ ಮಟ್ಟದ ವಾಲಿಬಾಲ್ ಪಂದ್ಯಾವಳಿ ಆರಂಭ.',
    bodyKannada: ['ಕ್ರೀಡಾ ವರದಿ'],
    category: 'Sports',
    location: 'ಕೊಪ್ಪ',
    publishedDate: '2026-11-24',
    publishedTime: '06:00 PM',
    publishedTimestamp: Date.parse('2026-11-24T12:30:00Z'),
    readTimeMinutes: 1,
    reporter: 'Coffeenadu Desk',
    viewCount: 30,
  },
];

const SAMPLE_COMMUNITY: PublicCommunityPost[] = [
  {
    id: 'cp-1',
    slug: 'koppa-honda-activa-for-sale',
    authorName: 'ರಮೇಶ್ ಗೌಡ',
    title: '2022 ಹೋಂಡಾ ಆಕ್ಟಿವಾ ಮಾರಾಟಕ್ಕಿದೆ',
    category: 'vehicle-sale',
    description: 'ಉತ್ತಮ ಸ್ಥಿತಿಯಲ್ಲಿರುವ ಸ್ಕೂಟರ್ ಕೊಪ್ಪದಲ್ಲಿ ಲಭ್ಯವಿದೆ.',
    location: 'ಕೊಪ್ಪ',
    photos: [],
    price: '₹48,000',
    optionalPublicContact: undefined,
    createdAt: '2026-11-27T04:00:00Z',
    updatedAt: '2026-11-27T04:00:00Z',
    viewsCount: 18,
    sharesCount: 2,
  },
  {
    id: 'cp-2',
    slug: 'jayapura-lost-keys',
    authorName: 'ಸವಿತಾ',
    title: 'ಜಯಪುರ ಬಸ್ ನಿಲ್ದಾಣದಲ್ಲಿ ಬೈಕ್ ಕೀ ಕಳೆದುಹೋಗಿದೆ',
    category: 'lost-item',
    description: 'ಸಿಕ್ಕವರು ದಯವಿಟ್ಟು ಸಂಪರ್ಕಿಸಿ.',
    location: 'ಜಯಪುರ',
    photos: [],
    optionalPublicContact: '9845000001',
    createdAt: '2026-11-26T12:00:00Z',
    updatedAt: '2026-11-26T12:00:00Z',
    viewsCount: 10,
    sharesCount: 1,
  },
];

const SAMPLE_LISTINGS: PlatformListing[] = [
  {
    id: 'list-1',
    module: 'jobs',
    title: 'ಅಕೌಂಟೆಂಟ್ ಹುದ್ದೆ - ಕೊಪ್ಪ',
    category: 'office',
    summary: 'ಕೊಪ್ಪ ಪಟ್ಟಣದ ಕಚೇರಿಗೆ ಅಕೌಂಟೆಂಟ್ ಬೇಕಾಗಿದ್ದಾರೆ.',
    description: 'ಟ್ಯಾಲಿ ತಿಳಿದಿರುವವರಿಗೆ ಆದ್ಯತೆ.',
    location: 'Koppa',
    verified: true,
    featured: false,
    status: 'approved',
    submittedByName: 'ಮಲೆನಾಡು ಟ್ರೇಡರ್ಸ್',
    submittedByContact: '9999988888', // PRIVATE submitter contact - must NOT leak!
    views: 30,
    callClicks: 0,
    whatsappClicks: 0,
    applyClicks: 0,
    createdAt: '2026-11-27T01:00:00Z',
    updatedAt: '2026-11-27T01:00:00Z',
  },
  {
    id: 'list-pending',
    module: 'marketplace',
    title: 'Pending unapproved item',
    category: 'general',
    summary: 'Should not appear in public feed',
    description: 'Pending moderation',
    location: 'Koppa',
    verified: false,
    featured: false,
    status: 'pending',
    views: 0,
    callClicks: 0,
    whatsappClicks: 0,
    applyClicks: 0,
    createdAt: '2026-11-27T03:00:00Z',
    updatedAt: '2026-11-27T03:00:00Z',
  },
];

const SAMPLE_EVENTS: ProgramEvent[] = [
  {
    id: 'ev-1',
    titleKannada: 'ಕೊಪ್ಪ ಸಾಹಿತ್ಯ ಉತ್ಸವ',
    descriptionKannada: 'ಎಲ್ಲರಿಗೂ ಆದರದ ಸ್ವಾಗತ.',
    eventDate: '2026-11-28',
    eventTime: '10:00 AM',
    location: 'ಕೊಪ್ಪ',
    organizer: 'ಕೊಪ್ಪ ಕನ್ನಡ ಸಂಘ',
    createdTimestamp: Date.parse('2026-11-26T08:00:00Z'),
    viewCount: 65,
  },
];

test('DEFAULT_FEED_CATEGORIES contains all 31 categories starting with All and DEFAULT_DISPLAY_SETTINGS hides view counts', () => {
  assert.equal(DEFAULT_FEED_CATEGORIES.length, 31);
  assert.equal(DEFAULT_FEED_CATEGORIES[0].id, 'all');
  const uniqueIds = new Set(DEFAULT_FEED_CATEGORIES.map((c) => c.id));
  assert.equal(uniqueIds.size, 31);
  for (const requiredId of [
    'politics',
    'sports',
    'culture',
    'civic-roads',
    'special',
    'state',
    'nation',
    'offers',
    'contacts',
  ]) {
    assert.equal(uniqueIds.has(requiredId as never), true, `Missing category ${requiredId}`);
  }
  assert.equal(DEFAULT_DISPLAY_SETTINGS.showViewCounts, false);
});

test('buildUnifiedCommunityFeed merges all published sources chronologically, hides phone numbers on feed cards, and preserves canonical URLs', () => {
  const feed = buildUnifiedCommunityFeed({
    articles: [...SAMPLE_ARTICLES, SAMPLE_ARTICLES[0]], // duplicate check
    communityPosts: SAMPLE_COMMUNITY,
    platformListings: SAMPLE_LISTINGS,
    events: SAMPLE_EVENTS,
  });

  // 3 news + 2 community + 1 approved listing (1 pending excluded) + 1 event = 7
  assert.equal(feed.length, 7);
  // Latest first: cp-1 (2026-11-27T04:00Z)
  assert.equal(feed[0].key, 'community:cp-1');
  assert.equal(feed[0].canonicalPath, '/community/koppa-honda-activa-for-sale');

  const newsItem = feed.find((i) => i.key === 'news:art-1');
  assert.ok(newsItem);
  assert.equal(newsItem.canonicalPath, '/?article=art-1');
  assert.equal(newsItem.isOfficialBrand, true);

  // Privacy check: NO phone numbers exposed directly on unified feed cards (neither listings nor community posts)
  for (const item of feed) {
    assert.equal(item.publicContact, undefined);
  }
});

test('filterUnifiedCommunityFeed filters in-place by category, location, search, and All restores full feed', () => {
  const feed = buildUnifiedCommunityFeed({
    articles: SAMPLE_ARTICLES,
    communityPosts: SAMPLE_COMMUNITY,
    platformListings: SAMPLE_LISTINGS,
    events: SAMPLE_EVENTS,
  });

  const newsOnly = filterUnifiedCommunityFeed(feed, {
    categoryId: 'news',
    location: 'All',
    searchQuery: '',
    sort: 'latest',
  });
  assert.equal(newsOnly.length, 3);

  const sportsOnly = filterUnifiedCommunityFeed(feed, {
    categoryId: 'sports',
    location: 'All',
    searchQuery: '',
    sort: 'latest',
  });
  assert.equal(sportsOnly.length, 1);
  assert.equal(sportsOnly[0].id, 'art-3');

  const vehiclesOnly = filterUnifiedCommunityFeed(feed, {
    categoryId: 'vehicles',
    location: 'All',
    searchQuery: '',
    sort: 'latest',
  });
  assert.equal(vehiclesOnly.length, 1);
  assert.equal(vehiclesOnly[0].id, 'cp-1');

  const lostFoundOnly = filterUnifiedCommunityFeed(feed, {
    categoryId: 'lost-found',
    location: 'All',
    searchQuery: '',
    sort: 'latest',
  });
  assert.equal(lostFoundOnly.length, 1);
  assert.equal(lostFoundOnly[0].id, 'cp-2');

  const sringeriOnly = filterUnifiedCommunityFeed(feed, {
    categoryId: 'all',
    location: 'ಶೃಂಗೇರಿ',
    searchQuery: '',
    sort: 'latest',
  });
  assert.equal(sringeriOnly.length, 1);
  assert.equal(sringeriOnly[0].id, 'art-2');

  const searchRes = filterUnifiedCommunityFeed(feed, {
    categoryId: 'all',
    location: 'All',
    searchQuery: 'ಆಕ್ಟಿವಾ',
    sort: 'latest',
  });
  assert.equal(searchRes.length, 1);
  assert.equal(searchRes[0].id, 'cp-1');

  const popularSorted = filterUnifiedCommunityFeed(feed, {
    categoryId: 'all',
    location: 'All',
    searchQuery: '',
    sort: 'popular',
  });
  assert.equal(popularSorted[0].id, 'art-1');
});

test('isAnnouncementScheduledActive enforces enabled toggle and optional start/end dates', () => {
  assert.equal(isAnnouncementScheduledActive(DEFAULT_HOMEPAGE_ANNOUNCEMENT, Date.parse('2026-11-27T12:00:00Z')), true);
  assert.equal(
    isAnnouncementScheduledActive({ ...DEFAULT_HOMEPAGE_ANNOUNCEMENT, enabled: false }, Date.parse('2026-11-27T12:00:00Z')),
    false
  );
  assert.equal(
    isAnnouncementScheduledActive(
      { ...DEFAULT_HOMEPAGE_ANNOUNCEMENT, startDate: '2026-12-01', endDate: '2026-12-10' },
      Date.parse('2026-11-27T12:00:00Z')
    ),
    false
  );
  assert.equal(
    isAnnouncementScheduledActive(
      { ...DEFAULT_HOMEPAGE_ANNOUNCEMENT, startDate: '2026-11-20', endDate: '2026-11-30' },
      Date.parse('2026-11-27T12:00:00Z')
    ),
    true
  );
});

test('getOrderedEnabledFeedCategories respects admin order and always keeps All first', () => {
  const reordered = DEFAULT_FEED_CATEGORIES.map((c) =>
    c.id === 'marketplace' ? { ...c, order: 0 } : c.id === 'crime' ? { ...c, enabled: false } : c
  );
  const result = getOrderedEnabledFeedCategories(reordered);
  assert.equal(result[0].id, 'all');
  assert.equal(result[1].id, 'marketplace');
  assert.equal(result.some((c) => c.id === 'crime'), false);
});
