import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTelUrl,
  buildWhatsappContactUrl,
  getContextualPlatformRecommendations,
  getOrderedEnabledHomepageSections,
  matchesLocality,
  normalizeIndianPhone,
  pickLangText,
  sanitizePlatformUrl,
  scoreQuizAttempt,
  searchPlatformEverything,
  sortLeaderboard,
} from './platformHelpers.ts';
import {
  DEFAULT_HOMEPAGE_SECTIONS,
  STARTER_PLATFORM_QUIZZES,
  STARTER_VERIFIED_PUBLIC_LISTINGS,
} from '../constants/platformCatalog.ts';
import type { NewsArticle } from '../types/news.ts';
import type { PlatformListing } from '../types/platform.ts';

test('pickLangText selects Kannada primary or English accurately', () => {
  assert.equal(pickLangText('ಕೊಪ್ಪ ಸುದ್ದಿ', 'Koppa News', 'kn'), 'ಕೊಪ್ಪ ಸುದ್ದಿ');
  assert.equal(pickLangText('ಕೊಪ್ಪ ಸುದ್ದಿ', 'Koppa News', 'en'), 'Koppa News');
});

test('sanitizePlatformUrl rejects javascript/data URLs and preserves https', () => {
  assert.equal(sanitizePlatformUrl('javascript:alert(1)'), '');
  assert.equal(sanitizePlatformUrl('data:text/html,<h1>x</h1>'), '');
  assert.equal(
    sanitizePlatformUrl('https://sevasindhu.karnataka.gov.in'),
    'https://sevasindhu.karnataka.gov.in/'
  );
});

test('phone normalization handles 10-digit Indian numbers and short emergency helplines', () => {
  assert.equal(normalizeIndianPhone('98765 43210'), '919876543210');
  assert.equal(normalizeIndianPhone('112'), '112');
  assert.equal(buildTelUrl('108'), 'tel:108');
  assert.equal(buildTelUrl('9876543210'), 'tel:+919876543210');
  assert.equal(buildWhatsappContactUrl('112', 'Help'), '');
  assert.ok(buildWhatsappContactUrl('9876543210', 'Hello').startsWith('https://wa.me/919876543210?text='));
});

test('matchesLocality matches English and Kannada Malnad village names', () => {
  assert.equal(matchesLocality('ಕೊಪ್ಪ', 'Koppa'), true);
  assert.equal(matchesLocality('Jayapura, Koppa Taluk', 'ಜಯಪುರ'), true);
  assert.equal(matchesLocality('Sringeri', 'Koppa'), false);
  assert.equal(matchesLocality('Sringeri', 'all'), true);
});

test('searchPlatformEverything searches across news, platform listings, bus routes, and events', () => {
  const sampleArticles: NewsArticle[] = [
    {
      id: 'art-1',
      titleKannada: 'ಕೊಪ್ಪದಲ್ಲಿ ಕಾಫಿ ಬೆಳೆಗಾರರ ಸಮಾವೇಶ',
      category: 'Agriculture',
      location: 'ಕೊಪ್ಪ',
      publishedDate: '2026-05-01',
      publishedTime: '10:00 AM',
      readTimeMinutes: 3,
      reporter: 'Coffeenadu Desk',
      summaryKannada: 'ಕೊಪ್ಪ ತಾಲ್ಲೂಕಿನ ಕಾಫಿ ಮತ್ತು ಅಡಿಕೆ ಬೆಳೆಗಾರರ ಸಭೆ.',
      bodyKannada: ['ವಿವರವಾದ ಸುದ್ದಿ'],
      imageUrl: '/koppa.jpg',
    },
  ];

  const results = searchPlatformEverything({
    query: 'Coffee',
    articles: sampleArticles,
    listings: STARTER_VERIFIED_PUBLIC_LISTINGS,
    busRoutes: [{ id: 'b1', title: 'Koppa - Shivamogga Express', routeSummary: 'Daily 7:30 AM', location: 'Koppa' }],
    events: [{ id: 'e1', title: 'Coffee Festival Koppa', location: 'Koppa', description: 'Annual coffee growers event' }],
  });

  assert.ok(results.length >= 2);
  assert.ok(results.some((r) => r.module === 'agriculture'));
  assert.ok(results.some((r) => r.module === 'events'));
});

test('getContextualPlatformRecommendations prioritizes listings in the same Malnad locality', () => {
  const listings: PlatformListing[] = [
    {
      id: 'biz-sringeri',
      module: 'businesses',
      title: 'Sringeri Agro Mart',
      category: 'hardware',
      summary: 'Supplies',
      description: 'Supplies',
      location: 'Sringeri',
      verified: true,
      featured: false,
      status: 'approved',
      views: 0,
      callClicks: 0,
      whatsappClicks: 0,
      applyClicks: 0,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'biz-koppa',
      module: 'businesses',
      title: 'Koppa Coffee Traders',
      category: 'hardware',
      summary: 'Local traders',
      description: 'Local traders',
      location: 'Koppa',
      verified: false,
      featured: false,
      status: 'approved',
      views: 0,
      callClicks: 0,
      whatsappClicks: 0,
      applyClicks: 0,
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    },
  ];

  const rec = getContextualPlatformRecommendations('ಕೊಪ್ಪ', 'ಕೃಷಿ', listings);
  assert.equal(rec.businesses[0]?.id, 'biz-koppa');
});

test('scoreQuizAttempt and sortLeaderboard rank players accurately', () => {
  const quiz = STARTER_PLATFORM_QUIZZES[0];
  const perfect = scoreQuizAttempt(
    quiz,
    quiz.questions.map((q) => q.correctIndex)
  );
  assert.equal(perfect.score, quiz.questions.length);
  assert.equal(perfect.percentage, 100);

  const sorted = sortLeaderboard([
    { id: '1', quizId: quiz.id, playerName: 'A', location: 'Koppa', score: 4, total: 5, durationSec: 30, createdAt: '' },
    { id: '2', quizId: quiz.id, playerName: 'B', location: 'Sringeri', score: 5, total: 5, durationSec: 40, createdAt: '' },
    { id: '3', quizId: quiz.id, playerName: 'C', location: 'Jayapura', score: 5, total: 5, durationSec: 22, createdAt: '' },
  ]);
  assert.equal(sorted[0].playerName, 'C');
  assert.equal(sorted[1].playerName, 'B');
});

test('getOrderedEnabledHomepageSections filters disabled items and sorts by order', () => {
  const custom = DEFAULT_HOMEPAGE_SECTIONS.slice(0, 3).map((s, idx) => ({
    ...s,
    order: 10 - idx,
    enabled: idx !== 1,
  }));
  const ordered = getOrderedEnabledHomepageSections(custom);
  assert.equal(ordered.length, 2);
  assert.ok(ordered[0].order < ordered[1].order);
});
