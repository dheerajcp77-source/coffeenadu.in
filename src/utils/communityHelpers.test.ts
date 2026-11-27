import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommunityPostPublicUrl,
  buildCommunityShareText,
  filterCommunityPosts,
  generateCommunitySlug,
  maskMobileNumber,
  normalizeCommunityMobile,
  toPublicCommunityPost,
  validateCommunityPhotoInput,
} from './communityHelpers';
import type { CommunityPostRecord } from '../types/community';

test('normalizeCommunityMobile validates and normalizes Indian 10-digit numbers', () => {
  assert.equal(normalizeCommunityMobile('9845123456'), '9845123456');
  assert.equal(normalizeCommunityMobile('+91 98451-23456'), '9845123456');
  assert.equal(normalizeCommunityMobile('09845123456'), '9845123456');
  assert.equal(normalizeCommunityMobile('1234567890'), null); // invalid prefix
  assert.equal(normalizeCommunityMobile('98451234'), null); // too short
  assert.equal(maskMobileNumber('9845123456'), '******3456');
});

test('generateCommunitySlug produces permanent URL-safe slugs for English and Kannada titles', () => {
  const enSlug = generateCommunitySlug('Fresh Arabica Coffee Beans Koppa!', 'ab12cd34');
  assert.equal(enSlug, 'fresh-arabica-coffee-beans-koppa-ab12cd34');

  const knSlug = generateCommunitySlug('ಕೊಪ್ಪದಲ್ಲಿ ಹೊಸ ಹಾರ್ಡ್‌ವೇರ್ ಅಂಗಡಿ', 'xy99zz');
  assert.equal(knSlug, 'post-xy99zz');
  assert.match(knSlug, /^[a-z0-9-]+$/);
});

test('toPublicCommunityPost strictly strips private user ID, mobile, and hiddenReason', () => {
  const privateRecord: CommunityPostRecord & { authorMobileNumber?: string; mobileNumber?: string } = {
    id: 'cpost-1',
    slug: 'koppa-hardware-a1b2',
    authorUserId: 'cuser-secret-999',
    authorName: 'ರಮೇಶ್ ಭಟ್',
    authorMobileNumber: '9845123456',
    mobileNumber: '9845123456',
    title: 'ಕೊಪ್ಪ ಹಾರ್ಡ್‌ವೇರ್ ಅಂಗಡಿ',
    category: 'my-shop',
    description: 'ಕೃಷಿ ಉಪಕರಣಗಳು ಲಭ್ಯವಿವೆ.',
    location: 'ಕೊಪ್ಪ',
    photos: ['/api/community/media/photo1.jpg'],
    status: 'published',
    hiddenReason: 'internal note',
    createdAt: '2026-11-27T08:00:00.000Z',
    updatedAt: '2026-11-27T08:00:00.000Z',
    viewsCount: 5,
    sharesCount: 2,
  };

  const publicObj = toPublicCommunityPost(privateRecord, 'other-user');
  const serialized = JSON.stringify(publicObj);

  assert.equal(publicObj.authorName, 'ರಮೇಶ್ ಭಟ್');
  assert.equal(publicObj.isOwner, false);
  assert.equal(serialized.includes('9845123456'), false);
  assert.equal(serialized.includes('cuser-secret-999'), false);
  assert.equal(serialized.includes('hiddenReason'), false);
  assert.equal('authorUserId' in publicObj, false);

  const ownerObj = toPublicCommunityPost(privateRecord, 'cuser-secret-999');
  assert.equal(ownerObj.isOwner, true);
});

test('buildCommunityPostPublicUrl and share text use permanent /community/<slug> link', () => {
  const url = buildCommunityPostPublicUrl('koppa-shop-a1b2');
  assert.equal(url, 'https://coffeenadu.in/community/koppa-shop-a1b2');

  const text = buildCommunityShareText({
    id: 'cpost-1',
    slug: 'koppa-shop-a1b2',
    title: 'ಮಲೆನಾಡು ಜೇನುತುಪ್ಪ ಮಾರಾಟಕ್ಕಿದೆ',
    category: 'agri-products',
    location: 'ಕೊಪ್ಪ',
  });
  assert.ok(text.includes('*ಮಲೆನಾಡು ಜೇನುತುಪ್ಪ ಮಾರಾಟಕ್ಕಿದೆ*'));
  assert.ok(text.includes('https://coffeenadu.in/community/koppa-shop-a1b2'));
  assert.ok(text.includes('ಕೃಷಿ ಉತ್ಪನ್ನಗಳು'));
});

test('validateCommunityPhotoInput accepts valid images and rejects SVG/oversized payloads', () => {
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  assert.equal(validateCommunityPhotoInput(tinyPng).ok, true);
  assert.equal(validateCommunityPhotoInput('/api/community/media/img_123.webp').ok, true);

  // Reject SVG / XSS / path traversal
  assert.equal(validateCommunityPhotoInput('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=').ok, false);
  assert.equal(validateCommunityPhotoInput('/api/community/media/../../etc/passwd').ok, false);
  assert.equal(validateCommunityPhotoInput('javascript:alert(1)').ok, false);

  // Reject oversized (>2MB)
  const huge = `data:image/jpeg;base64,${'A'.repeat(3_200_000)}`;
  assert.equal(validateCommunityPhotoInput(huge).ok, false);
});

test('filterCommunityPosts filters by tab, category, location, and Kannada/English search', () => {
  const posts = [
    toPublicCommunityPost({
      id: '1',
      slug: 's1',
      authorUserId: 'u1',
      authorName: 'ಸುರೇಶ್',
      title: 'ಕೊಪ್ಪ ಮೆಡಿಕಲ್ ಸ್ಟೋರ್',
      category: 'my-shop',
      description: '24 ಗಂಟೆ ಔಷಧಿ ಲಭ್ಯ',
      location: 'ಕೊಪ್ಪ',
      photos: [],
      status: 'published',
      createdAt: '2026-11-27T08:00:00.000Z',
      updatedAt: '2026-11-27T08:00:00.000Z',
      viewsCount: 0,
      sharesCount: 0,
    }),
    toPublicCommunityPost({
      id: '2',
      slug: 's2',
      authorUserId: 'u2',
      authorName: 'ಮಹೇಶ್',
      title: 'ಕಳೆದುಹೋದ ಪರ್ಸ್ ಶೃಂಗೇರಿ ಬಸ್ ನಿಲ್ದಾಣ',
      category: 'lost-item',
      description: 'ಆಧಾರ್ ಕಾರ್ಡ್ ಇತ್ತು',
      location: 'ಶೃಂಗೇರಿ',
      photos: [],
      status: 'published',
      createdAt: '2026-11-27T09:00:00.000Z',
      updatedAt: '2026-11-27T09:00:00.000Z',
      viewsCount: 0,
      sharesCount: 0,
    }),
  ];

  assert.equal(filterCommunityPosts(posts, { tab: 'shops' }).length, 1);
  assert.equal(filterCommunityPosts(posts, { tab: 'lost-found' }).length, 1);
  assert.equal(filterCommunityPosts(posts, { location: 'Sringeri' }).length, 1);
  assert.equal(filterCommunityPosts(posts, { query: 'ಔಷಧಿ' }).length, 1);
});
