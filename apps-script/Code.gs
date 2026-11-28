/**
 * ============================================================================
 * COFFEENADU NEWS — GOOGLE SHEETS + GOOGLE DRIVE + APPS SCRIPT BACKEND
 * ============================================================================
 * Zero-cost (₹0/month) storage, image archive, daily backup & restore backend.
 *
 * ONE-TIME SETUP (Run inside script.google.com):
 * 1. Create a new Google Apps Script project named "CoffeeNadu_News_API".
 * 2. Paste this entire file into Code.gs and save.
 * 3. Select `setupCoffeeNaduStorage` from the top function dropdown and click Run.
 * 4. Approve Google Sheets, Google Drive, and Gmail/Mail permissions when prompted.
 * 5. Open Execution Log (bottom panel) to copy your generated `API_SECRET`,
 *    Spreadsheet URL, and Drive folder URLs.
 * 6. Click Deploy -> New deployment -> Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. Copy the deployed Web App URL (`https://script.google.com/macros/s/.../exec`)
 *    and paste `APPS_SCRIPT_WEBAPP_URL` + `APPS_SCRIPT_API_SECRET` into your
 *    CoffeeNadu News server Secrets / Environment Variables.
 * ============================================================================
 */

var CONFIG = {
  SPREADSHEET_NAME: 'CoffeeNadu_News_Database',
  IMAGES_FOLDER_NAME: 'CoffeeNadu_News_Images',
  BACKUPS_FOLDER_NAME: 'CoffeeNadu_News_Backups',
  MONTHLY_ARCHIVE_FOLDER_NAME: 'Monthly_Archives',
  MAX_DAILY_BACKUPS: 30,
  SCRIPT_CACHE_TTL_SECONDS: 300, // 5 minutes
  DEFAULT_OWNER_EMAILS: [
    'shwethashwethak85@gmail.com',
    'dheerajcp77@gmail.com'
  ]
};

var NEWS_HEADERS = [
  'newsId',
  'title',
  'description',
  'fullContent',
  'category',
  'location',
  'language',
  'imageUrl',
  'imageThumbUrl',
  'imageDriveId',
  'imageCaption',
  'imageKey',
  'watermarkApplied',
  'author',
  'authorUid',
  'publishedDate',
  'publishedTime',
  'publishedTimestamp',
  'updatedDate',
  'readTimeMinutes',
  'status',
  'views',
  'featured',
  'tags',
  'contentHash'
];

var EVENTS_HEADERS = [
  'eventId',
  'titleKannada',
  'descriptionKannada',
  'eventDate',
  'eventTime',
  'location',
  'organizer',
  'imageUrl',
  'imageThumbUrl',
  'imageDriveId',
  'watermarkApplied',
  'authorUid',
  'views',
  'status',
  'createdAt',
  'updatedAt'
];

var CATEGORIES_HEADERS = [
  'categoryId',
  'nameEn',
  'nameKn',
  'defaultImageKey',
  'sortOrder',
  'active'
];

var SETTINGS_HEADERS = [
  'key',
  'value',
  'updatedAt',
  'updatedBy'
];

var ADMIN_LOGS_HEADERS = [
  'logId',
  'timestamp',
  'action',
  'entityType',
  'entityId',
  'adminEmail',
  'details'
];

var COMMUNITY_USERS_HEADERS = [
  'id',
  'fullName',
  'mobileNumber',
  'registeredAt',
  'lastActiveAt',
  'status',
  'suspendedReason'
];

var COMMUNITY_SESSIONS_HEADERS = [
  'tokenHash',
  'userId',
  'createdAtMs',
  'expiresAtMs'
];

var COMMUNITY_POSTS_HEADERS = [
  'id',
  'slug',
  'authorUserId',
  'authorName',
  'title',
  'category',
  'description',
  'location',
  'photosJson',
  'price',
  'optionalPublicContact',
  'status',
  'hiddenReason',
  'createdAt',
  'updatedAt',
  'viewsCount',
  'sharesCount'
];

var COMMUNITY_REPORTS_HEADERS = [
  'id',
  'postId',
  'postTitle',
  'reason',
  'details',
  'createdAt',
  'status',
  'resolvedAt',
  'resolvedBy'
];

var CONTEST_MONTHS_HEADERS = [
  'monthKey',
  'competitionName',
  'displayLabelEn',
  'displayLabelKn',
  'startsAtIso',
  'endsAtIso',
  'status',
  'prizesJson',
  'winnersJson',
  'winnersPublished',
  'allowCarryOver',
  'finalizedAt',
  'finalizedBy',
  'createdAt',
  'updatedAt'
];

var CONTEST_ENTRIES_HEADERS = [
  'id',
  'postId',
  'slug',
  'competitionMonth',
  'contributorUserId',
  'contributorName',
  'title',
  'summary',
  'location',
  'thumbnailUrl',
  'publishedAt',
  'eligibility',
  'disqualificationReason',
  'disqualifiedBy',
  'disqualifiedAt',
  'totalPageViews',
  'eligibleViews',
  'suspiciousBlockedViews',
  'suspiciousFlagged',
  'lastViewedAt',
  'createdAt',
  'updatedAt'
];

var CONTEST_ALERTS_HEADERS = [
  'id',
  'entryId',
  'articleSlug',
  'articleTitle',
  'competitionMonth',
  'severity',
  'reason',
  'blockedCount',
  'detectedAt',
  'status',
  'adminNote',
  'reviewedBy',
  'reviewedAt'
];

var CONTEST_AUDIT_HEADERS = [
  'id',
  'timestamp',
  'actorEmail',
  'action',
  'competitionMonth',
  'targetId',
  'details'
];

var CONTEST_VIEW_BUCKETS_HEADERS = [
  'entryId',
  'visitorHash',
  'lastEligibleAtMs',
  'hitCount'
];

var DEFAULT_CATEGORIES = [
  ['local', 'Local', 'ಸ್ಥಳೀಯ', 'koppa-landscape', 1, 'TRUE'],
  ['malnad', 'Malnad', 'ಮಲೆನಾಡು', 'malnad-hills', 2, 'TRUE'],
  ['agriculture', 'Agriculture', 'ಕೃಷಿ', 'coffee-estate', 3, 'TRUE'],
  ['health', 'Health', 'ಆರೋಗ್ಯ', 'health-medical', 4, 'TRUE'],
  ['entertainment', 'Entertainment', 'ಮನರಂಜನೆ', 'entertainment-stage', 5, 'TRUE'],
  ['crime', 'Crime', 'ಅಪರಾಧ', 'crime-alert', 6, 'TRUE'],
  ['general', 'General', 'ಸಾಮಾನ್ಯ', 'general-news', 7, 'TRUE'],
  ['politics', 'Politics', 'ರಾಜಕೀಯ', 'politics-assembly', 8, 'TRUE'],
  ['sports', 'Sports', 'ಕ್ರೀಡೆ', 'sports-stadium', 9, 'TRUE'],
  ['special', 'Special', 'ವಿಶೇಷ', 'special-feature', 10, 'TRUE'],
  ['state', 'State', 'ರಾಜ್ಯ', 'state-civic', 11, 'TRUE'],
  ['nation', 'Nation', 'ರಾಷ್ಟ್ರ', 'nation-parliament', 12, 'TRUE'],
  ['civic-roads', 'Civic & Roads', 'ನಾಗರಿಕ & ರಸ್ತೆ', 'tunga-bridge', 13, 'TRUE'],
  ['education', 'Education', 'ಶಿಕ್ಷಣ', 'education-library', 14, 'TRUE'],
  ['culture', 'Culture', 'ಸಂಸ್ಕೃತಿ', 'malnad-culture', 15, 'TRUE']
];

/**
 * ONE-CLICK INITIAL SETUP FUNCTION
 * Run this once from the Apps Script editor to initialize Sheets, Drive folders,
 * secret key, and daily backup trigger.
 */
function setupCoffeeNaduStorage() {
  var props = PropertiesService.getScriptProperties();

  // 1. Create or retrieve API secret (stored securely in ScriptProperties, NOT in any Sheet)
  var apiSecret = props.getProperty('API_SECRET');
  if (!apiSecret) {
    apiSecret = 'cn_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('API_SECRET', apiSecret);
  }

  // 2. Create or retrieve Spreadsheet
  var ss = getOrCreateSpreadsheet_();
  ensureAllSheets_(ss);

  // 3. Create or retrieve Drive folders
  var imagesFolder = getOrCreateFolder_(CONFIG.IMAGES_FOLDER_NAME, 'IMAGES_FOLDER_ID');
  var backupsFolder = getOrCreateFolder_(CONFIG.BACKUPS_FOLDER_NAME, 'BACKUPS_FOLDER_ID');
  var monthlyFolder = getOrCreateSubfolder_(backupsFolder, CONFIG.MONTHLY_ARCHIVE_FOLDER_NAME, 'MONTHLY_ARCHIVE_FOLDER_ID');

  // 4. Configure default admin allowlist in ScriptProperties
  if (!props.getProperty('ADMIN_EMAILS')) {
    props.setProperty('ADMIN_EMAILS', CONFIG.DEFAULT_OWNER_EMAILS.join(','));
  }

  // 5. Seed initial settings
  upsertSetting_(ss, 'siteName', 'Coffeenadu News', 'system');
  upsertSetting_(ss, 'backupRetentionDays', String(CONFIG.MAX_DAILY_BACKUPS), 'system');
  upsertSetting_(ss, 'backupStatus', 'Configured (Ready)', 'system');
  upsertSetting_(ss, 'migrationStatus', 'Pending', 'system');
  upsertSetting_(ss, 'imageStorageStatus', 'Ready (Google Drive)', 'system');

  // 6. Install daily backup trigger (02:30 AM local script time)
  installDailyBackupTrigger_();

  // 7. Log setup completion
  appendAdminLog_(ss, 'SETUP', 'system', 'init', Session.getEffectiveUser().getEmail() || 'owner', 'Initialized Sheets, Drive folders, and daily backup trigger');

  Logger.log('========================================================');
  Logger.log('COFFEENADU NEWS STORAGE SETUP COMPLETE');
  Logger.log('Spreadsheet URL: ' + ss.getUrl());
  Logger.log('Images Folder URL: ' + imagesFolder.getUrl());
  Logger.log('Backups Folder URL: ' + backupsFolder.getUrl());
  Logger.log('Monthly Archives Folder URL: ' + monthlyFolder.getUrl());
  Logger.log('API_SECRET (Copy into APPS_SCRIPT_API_SECRET): ' + apiSecret);
  Logger.log('========================================================');

  return {
    ok: true,
    spreadsheetUrl: ss.getUrl(),
    imagesFolderUrl: imagesFolder.getUrl(),
    backupsFolderUrl: backupsFolder.getUrl()
  };
}

/**
 * HTTP GET ENTRYPOINT
 * Public read operations (paginated, filtered, cached).
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = String(params.action || 'getPublishedNews').trim();

    if (action === 'health') {
      return jsonResponse_(handleHealth_());
    }
    if (action === 'getPublishedNews' || action === 'getLatestNews' || action === 'getNewsByCategory' || action === 'getFeaturedNews' || action === 'searchNews') {
      return jsonResponse_(handleListNews_(action, params));
    }
    if (action === 'getNewsById') {
      return jsonResponse_(handleGetNewsById_(params.newsId || params.id || ''));
    }
    if (action === 'getEvents') {
      return jsonResponse_(handleListEvents_(params));
    }
    if (action === 'getEventById') {
      return jsonResponse_(handleGetEventById_(params.eventId || params.id || ''));
    }
    if (action === 'getCategories') {
      return jsonResponse_(handleGetCategories_());
    }
    if (action === 'getSettings') {
      return jsonResponse_(handleGetSettings_());
    }

    return jsonResponse_({ ok: false, error: 'Unknown GET action: ' + action }, 400);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

/**
 * HTTP POST ENTRYPOINT
 * Protected administrative & batched write operations.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(rawBody);
    var action = String(payload.action || '').trim();

    // Validate shared server-only API secret
    var expectedSecret = PropertiesService.getScriptProperties().getProperty('API_SECRET');
    if (!expectedSecret || !payload.apiSecret || String(payload.apiSecret) !== String(expectedSecret)) {
      return jsonResponse_({ ok: false, error: 'Unauthorized: invalid API secret.' }, 401);
    }

    // Read-only admin operations don't require write lock
    if (action === 'listBackups') {
      return jsonResponse_(handleListBackups_());
    }
    if (action === 'previewBackup') {
      return jsonResponse_(handlePreviewBackup_(payload.fileId));
    }
    if (action === 'exportAll') {
      return jsonResponse_(handleExportAll_());
    }
    if (action === 'getAdminStats') {
      return jsonResponse_(handleAdminStats_());
    }
    if (action === 'getCommunityContestSnapshot') {
      return jsonResponse_(handleGetCommunityContestSnapshot_());
    }
    if (action === 'getCommunityPostPublicForOg') {
      return jsonResponse_(handleGetCommunityPostPublicForOg_(payload.slug || ''));
    }

    var PUBLIC_SERVER_ACTIONS = {
      batchUpdateViews: true,
      uploadPublicCommunityImage: true,
      upsertCommunityContestDelta: true
    };

    // Validate admin email for admin-only mutating actions (server-secret already verified above)
    var adminEmail = String(payload.adminEmail || '').trim().toLowerCase();
    if (!PUBLIC_SERVER_ACTIONS[action] && !isAuthorizedAdminEmail_(adminEmail)) {
      return jsonResponse_({ ok: false, error: 'Forbidden: unauthorized administrator email.' }, 403);
    }

    // Acquire write lock to prevent concurrent row corruption
    var locked = lock.tryLock(20000);
    if (!locked) {
      return jsonResponse_({ ok: false, error: 'Server is busy saving another update. Please retry.' }, 503);
    }

    var result;
    if (action === 'createNews') {
      result = handleCreateNews_(payload.data || {}, adminEmail);
    } else if (action === 'updateNews') {
      result = handleUpdateNews_(payload.newsId, payload.data || {}, adminEmail);
    } else if (action === 'deleteNews') {
      result = handleDeleteNews_(payload.newsId, adminEmail, Boolean(payload.permanent));
    } else if (action === 'batchUpdateViews') {
      result = handleBatchUpdateViews_(payload.newsViews || {}, payload.eventViews || {});
    } else if (action === 'uploadImage') {
      result = handleUploadImage_(payload, adminEmail);
    } else if (action === 'uploadPublicCommunityImage') {
      result = handleUploadPublicCommunityImage_(payload);
    } else if (action === 'upsertCommunityContestDelta') {
      result = handleUpsertCommunityContestDelta_(payload);
    } else if (action === 'createEvent') {
      result = handleCreateEvent_(payload.data || {}, adminEmail);
    } else if (action === 'updateEvent') {
      result = handleUpdateEvent_(payload.eventId, payload.data || {}, adminEmail);
    } else if (action === 'deleteEvent') {
      result = handleDeleteEvent_(payload.eventId, adminEmail);
    } else if (action === 'createBackup') {
      result = runDailyBackupInternal_(adminEmail, false);
    } else if (action === 'restoreBackup') {
      result = handleRestoreBackup_(payload.fileId, payload.mode || 'all', payload.selectedIds || [], adminEmail);
    } else if (action === 'migrateBatch') {
      result = handleMigrateBatch_(payload.articles || [], payload.events || [], payload.categories || [], adminEmail);
    } else if (action === 'verifyMigration') {
      result = handleVerifyMigration_(payload, adminEmail);
    } else {
      result = { ok: false, error: 'Unknown POST action: ' + action };
    }

    invalidateScriptCaches_();
    return jsonResponse_(result);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

/* ============================================================================
 * NEWS READ & WRITE HANDLERS
 * ============================================================================ */

function handleListNews_(action, params) {
  var page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  var limit = Math.min(50, Math.max(1, parseInt(params.limit || '15', 10) || 15));
  var category = String(params.category || '').trim();
  var location = String(params.location || '').trim().toLowerCase();
  var search = String(params.q || params.search || '').trim().toLowerCase();
  var includeDeleted = String(params.includeDeleted || '') === 'true';
  var featuredOnly = action === 'getFeaturedNews' || String(params.featured || '') === 'true';

  var nowMs = Date.now();
  var allNews = getAllNewsCached_();
  var filtered = allNews.filter(function (item) {
    if (!includeDeleted && item.status !== 'published') return false;
    var activeFeatured = isNewsItemActivelyFeatured_(item, nowMs);
    if (featuredOnly && !activeFeatured) return false;
    if (category && category !== 'All' && item.category !== category) return false;
    if (location && location !== 'all' && String(item.location || '').toLowerCase().indexOf(location) === -1) {
      return false;
    }
    if (search) {
      var hay = [
        item.title,
        item.description,
        Array.isArray(item.fullContent) ? item.fullContent.join(' ') : String(item.fullContent || ''),
        item.category,
        item.location,
        item.author,
        item.tags
      ].join(' ').toLowerCase();
      if (hay.indexOf(search) === -1) return false;
    }
    return true;
  }).map(function (item) {
    var activeFeatured = isNewsItemActivelyFeatured_(item, nowMs);
    if (item.featured !== activeFeatured) {
      var clone = Object.assign({}, item);
      clone.featured = activeFeatured;
      return clone;
    }
    return item;
  });

  // Sort: actively featured first (for standard feed), then newest publishedTimestamp descending
  filtered.sort(function (a, b) {
    if (action === 'getPublishedNews') {
      var featDiff = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      if (featDiff !== 0) return featDiff;
    }
    return (Number(b.publishedTimestamp) || 0) - (Number(a.publishedTimestamp) || 0);
  });

  var total = filtered.length;
  var startIdx = (page - 1) * limit;
  var items = filtered.slice(startIdx, startIdx + limit);

  return {
    ok: true,
    items: items,
    total: total,
    page: page,
    limit: limit,
    hasMore: startIdx + items.length < total
  };
}

function handleGetNewsById_(newsId) {
  var cleanId = String(newsId || '').trim();
  if (!cleanId) return { ok: false, error: 'Missing newsId' };
  var allNews = getAllNewsCached_();
  for (var i = 0; i < allNews.length; i++) {
    if (allNews[i].newsId === cleanId && allNews[i].status !== 'deleted') {
      return { ok: true, item: allNews[i] };
    }
  }
  return { ok: false, error: 'News article not found' };
}

function handleCreateNews_(data, adminEmail) {
  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'News', NEWS_HEADERS);
  var rows = readSheetObjects_(sheet, NEWS_HEADERS);

  var title = String(data.title || data.titleKannada || '').trim().slice(0, 1500);
  var paragraphs = normalizeBodyParagraphs_(data.fullContent || data.bodyKannada);
  var description = String(data.description || data.summaryKannada || paragraphs[0] || '').trim().slice(0, 2500);
  if (!title || paragraphs.length === 0) {
    return { ok: false, error: 'Title and full content are required.' };
  }

  var now = new Date();
  var nowIso = now.toISOString();
  var publishedTimestamp = Number(data.publishedTimestamp) || now.getTime();
  var newsId = sanitizeId_(data.newsId || data.id) || ('news-' + publishedTimestamp + '-' + Math.random().toString(36).slice(2, 6));
  var contentHash = computeTextHash_(title + '|' + description + '|' + paragraphs[0]);

  // Duplicate submission prevention (same newsId OR same contentHash within 10 minutes)
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].newsId === newsId) {
      if (data.isCustomSlug) {
        return {
          ok: false,
          error: 'The custom English URL "' + newsId + '" is already used by another article. Please choose a different English URL.'
        };
      }
      return { ok: true, newsId: newsId, deduplicated: true, item: formatNewsOutput_(rows[i]) };
    }
    if (rows[i].contentHash && rows[i].contentHash === contentHash && rows[i].status === 'published') {
      var ageMs = Math.abs(publishedTimestamp - (Number(rows[i].publishedTimestamp) || 0));
      if (ageMs < 10 * 60 * 1000) {
        return { ok: true, newsId: rows[i].newsId, deduplicated: true, item: formatNewsOutput_(rows[i]) };
      }
    }
  }

  var record = {
    newsId: newsId,
    title: title,
    description: description,
    fullContent: JSON.stringify(paragraphs),
    category: String(data.category || 'Local').trim().slice(0, 40),
    location: String(data.location || 'ಕೊಪ್ಪ').trim().slice(0, 60),
    language: String(data.language || 'kn').trim().slice(0, 16),
    imageUrl: String(data.imageUrl || '').trim(),
    imageThumbUrl: String(data.imageThumbUrl || '').trim(),
    imageDriveId: String(data.imageDriveId || '').trim(),
    imageCaption: String(data.imageCaption || '').trim().slice(0, 1000),
    imageKey: String(data.imageKey || 'none').trim().slice(0, 40),
    watermarkApplied: Boolean(data.watermarkApplied && data.imageUrl) ? 'TRUE' : 'FALSE',
    author: String(data.author || data.reporter || 'Coffeenadu Desk').trim().slice(0, 100),
    authorUid: String(data.authorUid || adminEmail).trim().slice(0, 128),
    publishedDate: String(data.publishedDate || formatDisplayDate_(now)).trim().slice(0, 30),
    publishedTime: String(data.publishedTime || formatDisplayTime_(now)).trim().slice(0, 30),
    publishedTimestamp: String(publishedTimestamp),
    updatedDate: nowIso,
    readTimeMinutes: String(Number(data.readTimeMinutes) || Math.max(1, Math.ceil(paragraphs.join(' ').length / 450))),
    status: String(data.status || 'published').trim(),
    views: String(Math.max(0, Number(data.views || data.viewCount) || 0)),
    featured: parseBool_(data.featured !== undefined ? data.featured : data.isFeatured) ? 'TRUE' : 'FALSE',
    tags: String(data.tags || '').trim().slice(0, 300),
    contentHash: contentHash
  };

  sheet.appendRow(objectToRow_(record, NEWS_HEADERS));
  appendAdminLog_(ss, 'CREATE_NEWS', 'news', newsId, adminEmail, 'Published: ' + title.slice(0, 80));

  return { ok: true, newsId: newsId, item: formatNewsOutput_(record) };
}

function handleUpdateNews_(newsId, data, adminEmail) {
  var cleanId = String(newsId || '').trim();
  if (!cleanId) return { ok: false, error: 'Missing newsId' };

  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'News', NEWS_HEADERS);
  var allRows = readSheetRowsWithIndex_(sheet, NEWS_HEADERS);
  var matchingRows = [];
  for (var idx = 0; idx < allRows.length; idx++) {
    if (String(allRows[idx].record.newsId || '').trim() === cleanId) {
      matchingRows.push(allRows[idx]);
    }
  }
  if (matchingRows.length === 0) {
    return { ok: false, error: 'Article not found: ' + cleanId };
  }

  // Prefer active (non-deleted) rows; update every matching active row so duplicates can never resurface stale state
  var activeRows = matchingRows.filter(function (r) {
    return String(r.record.status || 'published').trim().toLowerCase() !== 'deleted';
  });
  var targetRows = activeRows.length > 0 ? activeRows : [matchingRows[0]];
  var existing = targetRows[0].record;

  var paragraphs = (data.fullContent !== undefined || data.bodyKannada !== undefined)
    ? normalizeBodyParagraphs_(data.fullContent !== undefined ? data.fullContent : data.bodyKannada)
    : normalizeBodyParagraphs_(existing.fullContent);

  var title = data.title !== undefined || data.titleKannada !== undefined
    ? String(data.title !== undefined ? data.title : data.titleKannada).trim().slice(0, 1500)
    : existing.title;
  var description = data.description !== undefined || data.summaryKannada !== undefined
    ? String(data.description !== undefined ? data.description : data.summaryKannada).trim().slice(0, 2500)
    : existing.description;

  var nextImageUrl = data.imageUrl !== undefined ? String(data.imageUrl || '').trim() : existing.imageUrl;
  var updated = {
    newsId: existing.newsId,
    title: title,
    description: description,
    fullContent: JSON.stringify(paragraphs),
    category: data.category !== undefined ? String(data.category).trim().slice(0, 40) : existing.category,
    location: data.location !== undefined ? String(data.location).trim().slice(0, 60) : existing.location,
    language: data.language !== undefined ? String(data.language).trim().slice(0, 16) : (existing.language || 'kn'),
    imageUrl: nextImageUrl,
    imageThumbUrl: data.imageThumbUrl !== undefined ? String(data.imageThumbUrl || '').trim() : (existing.imageThumbUrl || ''),
    imageDriveId: data.imageDriveId !== undefined ? String(data.imageDriveId || '').trim() : (existing.imageDriveId || ''),
    imageCaption: data.imageCaption !== undefined ? String(data.imageCaption || '').trim().slice(0, 1000) : (existing.imageCaption || ''),
    imageKey: data.imageKey !== undefined ? String(data.imageKey).trim().slice(0, 40) : (existing.imageKey || 'none'),
    watermarkApplied: (nextImageUrl && (data.watermarkApplied !== undefined ? Boolean(data.watermarkApplied) : parseBool_(existing.watermarkApplied))) ? 'TRUE' : 'FALSE',
    author: (data.author !== undefined || data.reporter !== undefined)
      ? String(data.author !== undefined ? data.author : data.reporter).trim().slice(0, 100)
      : existing.author,
    authorUid: existing.authorUid,
    publishedDate: existing.publishedDate,
    publishedTime: existing.publishedTime,
    publishedTimestamp: existing.publishedTimestamp,
    updatedDate: new Date().toISOString(),
    readTimeMinutes: String(Number(data.readTimeMinutes) || Math.max(1, Math.ceil(paragraphs.join(' ').length / 450))),
    status: data.status !== undefined ? String(data.status).trim() : (existing.status || 'published'),
    views: String(existing.views || '0'),
    featured: (data.featured !== undefined || data.isFeatured !== undefined)
      ? (parseBool_(data.featured !== undefined ? data.featured : data.isFeatured) ? 'TRUE' : 'FALSE')
      : (parseBool_(existing.featured) ? 'TRUE' : 'FALSE'),
    tags: data.tags !== undefined ? String(data.tags).trim().slice(0, 300) : (existing.tags || ''),
    contentHash: computeTextHash_(title + '|' + description + '|' + (paragraphs[0] || ''))
  };

  var rowValues = objectToRow_(updated, NEWS_HEADERS);
  for (var t = 0; t < targetRows.length; t++) {
    sheet.getRange(targetRows[t].rowIndex, 1, 1, NEWS_HEADERS.length).setValues([rowValues]);
  }
  SpreadsheetApp.flush();
  appendAdminLog_(ss, 'UPDATE_NEWS', 'news', cleanId, adminEmail, 'Updated: ' + title.slice(0, 80));

  return { ok: true, newsId: cleanId, item: formatNewsOutput_(updated) };
}

function handleDeleteNews_(newsId, adminEmail, permanent) {
  var cleanId = String(newsId || '').trim();
  if (!cleanId) return { ok: false, error: 'Missing newsId' };

  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'News', NEWS_HEADERS);
  var found = findRowByColumnValue_(sheet, NEWS_HEADERS, 'newsId', cleanId);
  if (!found) {
    return { ok: false, error: 'Article not found: ' + cleanId };
  }

  if (permanent) {
    sheet.deleteRow(found.rowIndex);
    appendAdminLog_(ss, 'PERMANENT_DELETE_NEWS', 'news', cleanId, adminEmail, 'Permanently deleted: ' + String(found.record.title || '').slice(0, 80));
  } else {
    // Soft-delete preserves deleted article for accidental-deletion recovery
    var statusCol = NEWS_HEADERS.indexOf('status') + 1;
    var updatedCol = NEWS_HEADERS.indexOf('updatedDate') + 1;
    sheet.getRange(found.rowIndex, statusCol).setValue('deleted');
    sheet.getRange(found.rowIndex, updatedCol).setValue(new Date().toISOString());
    appendAdminLog_(ss, 'DELETE_NEWS', 'news', cleanId, adminEmail, 'Moved to deleted (recoverable): ' + String(found.record.title || '').slice(0, 80));
  }

  return { ok: true, newsId: cleanId };
}

/**
 * BATCHED VIEW COUNTER
 * Applies all accumulated view deltas for News and Events in a single column write per sheet!
 */
function handleBatchUpdateViews_(newsViews, eventViews) {
  var ss = getOrCreateSpreadsheet_();
  var updatedNews = 0;
  var updatedEvents = 0;

  var newsKeys = Object.keys(newsViews || {});
  if (newsKeys.length > 0) {
    var newsSheet = ensureSheetWithHeaders_(ss, 'News', NEWS_HEADERS);
    var lastRow = newsSheet.getLastRow();
    if (lastRow > 1) {
      var idColIdx = NEWS_HEADERS.indexOf('newsId') + 1;
      var viewsColIdx = NEWS_HEADERS.indexOf('views') + 1;
      var ids = newsSheet.getRange(2, idColIdx, lastRow - 1, 1).getValues();
      var viewValues = newsSheet.getRange(2, viewsColIdx, lastRow - 1, 1).getValues();
      var changed = false;

      for (var i = 0; i < ids.length; i++) {
        var id = String(ids[i][0] || '').trim();
        var delta = Number(newsViews[id] || 0);
        if (delta > 0) {
          viewValues[i][0] = (Number(viewValues[i][0]) || 0) + Math.floor(delta);
          updatedNews++;
          changed = true;
        }
      }
      if (changed) {
        newsSheet.getRange(2, viewsColIdx, lastRow - 1, 1).setValues(viewValues);
      }
    }
  }

  var eventKeys = Object.keys(eventViews || {});
  if (eventKeys.length > 0) {
    var evSheet = ensureSheetWithHeaders_(ss, 'Events', EVENTS_HEADERS);
    var evLastRow = evSheet.getLastRow();
    if (evLastRow > 1) {
      var evIdColIdx = EVENTS_HEADERS.indexOf('eventId') + 1;
      var evViewsColIdx = EVENTS_HEADERS.indexOf('views') + 1;
      var evIds = evSheet.getRange(2, evIdColIdx, evLastRow - 1, 1).getValues();
      var evViewValues = evSheet.getRange(2, evViewsColIdx, evLastRow - 1, 1).getValues();
      var evChanged = false;

      for (var j = 0; j < evIds.length; j++) {
        var evId = String(evIds[j][0] || '').trim();
        var evDelta = Number(eventViews[evId] || 0);
        if (evDelta > 0) {
          evViewValues[j][0] = (Number(evViewValues[j][0]) || 0) + Math.floor(evDelta);
          updatedEvents++;
          evChanged = true;
        }
      }
      if (evChanged) {
        evSheet.getRange(2, evViewsColIdx, evLastRow - 1, 1).setValues(evViewValues);
      }
    }
  }

  return { ok: true, updatedNews: updatedNews, updatedEvents: updatedEvents };
}

/* ============================================================================
 * EVENTS HANDLERS (Preserves Programs & Events Calendar)
 * ============================================================================ */

function handleListEvents_(params) {
  var page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  var limit = Math.min(50, Math.max(1, parseInt(params.limit || '20', 10) || 20));
  var all = getAllEventsCached_().filter(function (ev) {
    return ev.status !== 'deleted';
  });
  all.sort(function (a, b) {
    var d = String(b.eventDate || '').localeCompare(String(a.eventDate || ''));
    if (d !== 0) return d;
    return String(a.eventTime || '').localeCompare(String(b.eventTime || ''));
  });

  var startIdx = (page - 1) * limit;
  var items = all.slice(startIdx, startIdx + limit);
  return {
    ok: true,
    items: items,
    total: all.length,
    page: page,
    limit: limit,
    hasMore: startIdx + items.length < all.length
  };
}

function handleGetEventById_(eventId) {
  var cleanId = String(eventId || '').trim();
  if (!cleanId) return { ok: false, error: 'Missing eventId' };
  var all = getAllEventsCached_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].eventId === cleanId && all[i].status !== 'deleted') {
      return { ok: true, item: all[i] };
    }
  }
  return { ok: false, error: 'Event not found' };
}

function handleCreateEvent_(data, adminEmail) {
  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'Events', EVENTS_HEADERS);
  var nowIso = new Date().toISOString();
  var eventId = sanitizeId_(data.eventId || data.id) || ('event-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));

  var existing = findRowByColumnValue_(sheet, EVENTS_HEADERS, 'eventId', eventId);
  if (existing) {
    return { ok: true, eventId: eventId, deduplicated: true, item: formatEventOutput_(existing.record) };
  }

  var record = {
    eventId: eventId,
    titleKannada: String(data.titleKannada || '').trim().slice(0, 300),
    descriptionKannada: String(data.descriptionKannada || '').trim().slice(0, 2000),
    eventDate: String(data.eventDate || '').trim().slice(0, 10),
    eventTime: String(data.eventTime || '10:00 AM').trim().slice(0, 40),
    location: String(data.location || 'ಕೊಪ್ಪ').trim().slice(0, 60),
    organizer: String(data.organizer || 'Koppa Taluk Committee').trim().slice(0, 100),
    imageUrl: String(data.imageUrl || '').trim(),
    imageThumbUrl: String(data.imageThumbUrl || '').trim(),
    imageDriveId: String(data.imageDriveId || '').trim(),
    watermarkApplied: Boolean(data.watermarkApplied && data.imageUrl) ? 'TRUE' : 'FALSE',
    authorUid: String(data.authorUid || adminEmail).trim().slice(0, 128),
    views: String(Math.max(0, Number(data.views || data.viewCount) || 0)),
    status: 'published',
    createdAt: String(data.createdAt || nowIso),
    updatedAt: nowIso
  };

  sheet.appendRow(objectToRow_(record, EVENTS_HEADERS));
  appendAdminLog_(ss, 'CREATE_EVENT', 'event', eventId, adminEmail, 'Scheduled: ' + record.titleKannada.slice(0, 80));
  return { ok: true, eventId: eventId, item: formatEventOutput_(record) };
}

function handleUpdateEvent_(eventId, data, adminEmail) {
  var cleanId = String(eventId || '').trim();
  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'Events', EVENTS_HEADERS);
  var found = findRowByColumnValue_(sheet, EVENTS_HEADERS, 'eventId', cleanId);
  if (!found) return { ok: false, error: 'Event not found' };

  var ex = found.record;
  var nextImg = data.imageUrl !== undefined ? String(data.imageUrl || '').trim() : ex.imageUrl;
  var updated = {
    eventId: ex.eventId,
    titleKannada: data.titleKannada !== undefined ? String(data.titleKannada).trim().slice(0, 300) : ex.titleKannada,
    descriptionKannada: data.descriptionKannada !== undefined ? String(data.descriptionKannada).trim().slice(0, 2000) : ex.descriptionKannada,
    eventDate: data.eventDate !== undefined ? String(data.eventDate).trim().slice(0, 10) : ex.eventDate,
    eventTime: data.eventTime !== undefined ? String(data.eventTime).trim().slice(0, 40) : ex.eventTime,
    location: data.location !== undefined ? String(data.location).trim().slice(0, 60) : ex.location,
    organizer: data.organizer !== undefined ? String(data.organizer).trim().slice(0, 100) : ex.organizer,
    imageUrl: nextImg,
    imageThumbUrl: data.imageThumbUrl !== undefined ? String(data.imageThumbUrl || '').trim() : (ex.imageThumbUrl || ''),
    imageDriveId: data.imageDriveId !== undefined ? String(data.imageDriveId || '').trim() : (ex.imageDriveId || ''),
    watermarkApplied: (nextImg && (data.watermarkApplied !== undefined ? Boolean(data.watermarkApplied) : String(ex.watermarkApplied) === 'TRUE')) ? 'TRUE' : 'FALSE',
    authorUid: ex.authorUid,
    views: String(ex.views || '0'),
    status: data.status !== undefined ? String(data.status) : (ex.status || 'published'),
    createdAt: ex.createdAt,
    updatedAt: new Date().toISOString()
  };

  sheet.getRange(found.rowIndex, 1, 1, EVENTS_HEADERS.length).setValues([objectToRow_(updated, EVENTS_HEADERS)]);
  appendAdminLog_(ss, 'UPDATE_EVENT', 'event', cleanId, adminEmail, 'Updated: ' + updated.titleKannada.slice(0, 80));
  return { ok: true, eventId: cleanId, item: formatEventOutput_(updated) };
}

function handleDeleteEvent_(eventId, adminEmail) {
  var cleanId = String(eventId || '').trim();
  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'Events', EVENTS_HEADERS);
  var found = findRowByColumnValue_(sheet, EVENTS_HEADERS, 'eventId', cleanId);
  if (!found) return { ok: false, error: 'Event not found' };

  var statusCol = EVENTS_HEADERS.indexOf('status') + 1;
  var updatedCol = EVENTS_HEADERS.indexOf('updatedAt') + 1;
  sheet.getRange(found.rowIndex, statusCol).setValue('deleted');
  sheet.getRange(found.rowIndex, updatedCol).setValue(new Date().toISOString());
  appendAdminLog_(ss, 'DELETE_EVENT', 'event', cleanId, adminEmail, 'Deleted event: ' + String(found.record.titleKannada || '').slice(0, 80));
  return { ok: true, eventId: cleanId };
}

/* ============================================================================
 * GOOGLE DRIVE IMAGE UPLOAD (WITH DUPLICATE PREVENTION + THUMBNAILS)
 * ============================================================================ */

function handleUploadImage_(payload, adminEmail) {
  var base64Data = String(payload.base64Data || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  var thumbBase64 = String(payload.thumbBase64 || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  var mimeType = String(payload.mimeType || 'image/jpeg').trim();
  var fileName = String(payload.fileName || ('coffeenadu-' + Date.now() + '.jpg')).replace(/[^a-zA-Z0-9._-]/g, '_');

  if (!base64Data) {
    return { ok: false, error: 'Missing image data.' };
  }

  var bytes = Utilities.base64Decode(base64Data);
  var hashDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  var shaHex = bytesToHex_(hashDigest);

  // Deduplicate identical uploads using ScriptProperties hash index
  var props = PropertiesService.getScriptProperties();
  var hashKey = 'IMG_HASH_' + shaHex.slice(0, 32);
  var existingRaw = props.getProperty(hashKey);
  if (existingRaw) {
    try {
      var existingInfo = JSON.parse(existingRaw);
      // Verify file still exists in Drive
      DriveApp.getFileById(existingInfo.fileId);
      return {
        ok: true,
        fileId: existingInfo.fileId,
        thumbFileId: existingInfo.thumbFileId || existingInfo.fileId,
        driveUrl: buildGoogleDriveImageUrl_(existingInfo.fileId, 1600),
        driveViewUrl: 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(existingInfo.fileId),
        thumbDriveUrl: buildGoogleDriveImageUrl_(existingInfo.thumbFileId || existingInfo.fileId, 480),
        proxyUrl: '/api/media/drive/' + existingInfo.fileId,
        deduplicated: true
      };
    } catch (missingErr) {
      // Previously uploaded file was removed; proceed to re-upload
    }
  }

  var imagesFolder = getOrCreateFolder_(CONFIG.IMAGES_FOLDER_NAME, 'IMAGES_FOLDER_ID');
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var file = imagesFolder.createFile(blob);
  file.setDescription('CoffeeNadu News published photo | sha256:' + shaHex + ' | by:' + adminEmail);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var thumbFileId = file.getId();
  if (thumbBase64) {
    try {
      var thumbBytes = Utilities.base64Decode(thumbBase64);
      var thumbBlob = Utilities.newBlob(thumbBytes, 'image/jpeg', 'thumb_' + fileName);
      var thumbFile = imagesFolder.createFile(thumbBlob);
      thumbFile.setDescription('CoffeeNadu News thumbnail for ' + file.getId());
      thumbFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      thumbFileId = thumbFile.getId();
    } catch (thumbErr) {
      // Non-fatal: use main file ID
    }
  }

  props.setProperty(hashKey, JSON.stringify({
    fileId: file.getId(),
    thumbFileId: thumbFileId,
    uploadedAt: new Date().toISOString()
  }));

  var ss = getOrCreateSpreadsheet_();
  upsertSetting_(ss, 'imageStorageStatus', 'Active (Google Drive — Last upload: ' + new Date().toISOString() + ')', adminEmail);
  appendAdminLog_(ss, 'UPLOAD_IMAGE', 'image', file.getId(), adminEmail, 'Uploaded ' + fileName);

  return {
    ok: true,
    fileId: file.getId(),
    thumbFileId: thumbFileId,
    driveUrl: buildGoogleDriveImageUrl_(file.getId(), 1600),
    driveViewUrl: 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(file.getId()),
    thumbDriveUrl: buildGoogleDriveImageUrl_(thumbFileId, 480),
    proxyUrl: '/api/media/drive/' + file.getId(),
    deduplicated: false
  };
}

function buildGoogleDriveImageUrl_(fileId, maxWidth) {
  var cleanId = String(fileId || '').trim();
  if (!cleanId) return '';
  var width = Number(maxWidth) || 1600;
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(cleanId) + '&sz=w' + width;
}

function extractGoogleDriveFileId_(rawUrlOrId) {
  var value = String(rawUrlOrId || '').trim();
  if (!value) return '';
  if (/^[a-zA-Z0-9_-]{18,120}$/.test(value)) return value;
  var proxyMatch = value.match(/\/api\/media\/drive\/([a-zA-Z0-9_-]{10,120})/);
  if (proxyMatch) return proxyMatch[1];
  var fileMatch = value.match(/\/file\/d\/([a-zA-Z0-9_-]{10,120})/);
  if (fileMatch) return fileMatch[1];
  var lh3Match = value.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,120})/);
  if (lh3Match) return lh3Match[1];
  var idParamMatch = value.match(/[?&]id=([a-zA-Z0-9_-]{10,120})/);
  if (idParamMatch) return idParamMatch[1];
  return '';
}

/* ============================================================================
 * AUTOMATIC DAILY BACKUP + MONTHLY ARCHIVE + EMAIL FAILURE ALERT
 * ============================================================================ */

/**
 * Triggered automatically every day by Apps Script Time-Driven Trigger.
 */
function runDailyBackup() {
  return runDailyBackupInternal_('automated-daily-trigger', true);
}

function runDailyBackupInternal_(triggeredBy, isScheduled) {
  var ss = getOrCreateSpreadsheet_();
  try {
    var backupsFolder = getOrCreateFolder_(CONFIG.BACKUPS_FOLDER_NAME, 'BACKUPS_FOLDER_ID');
    var monthlyFolder = getOrCreateSubfolder_(backupsFolder, CONFIG.MONTHLY_ARCHIVE_FOLDER_NAME, 'MONTHLY_ARCHIVE_FOLDER_ID');

    var now = new Date();
    var stamp = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd_HH-mm-ss');
    var monthStamp = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM');

    var exportPayload = buildFullExportPayload_(ss);
    var jsonContent = JSON.stringify(exportPayload, null, 2);
    var csvContent = buildNewsCsv_(exportPayload.news);

    // Timestamped filenames never overwrite previous successful backups
    var jsonName = 'coffeenadu_backup_' + stamp + '.json';
    var csvName = 'coffeenadu_news_' + stamp + '.csv';

    var jsonFile = backupsFolder.createFile(jsonName, jsonContent, MimeType.PLAIN_TEXT);
    var csvFile = backupsFolder.createFile(csvName, csvContent, MimeType.CSV);

    // Monthly permanent archive (1st backup of each calendar month is preserved permanently)
    var monthlyArchiveName = 'coffeenadu_monthly_archive_' + monthStamp + '.json';
    if (!monthlyFolder.getFilesByName(monthlyArchiveName).hasNext()) {
      monthlyFolder.createFile(monthlyArchiveName, jsonContent, MimeType.PLAIN_TEXT);
    }

    // Retain latest 30 daily JSON + 30 daily CSV backups
    pruneOldBackups_(backupsFolder, '.json', CONFIG.MAX_DAILY_BACKUPS);
    pruneOldBackups_(backupsFolder, '.csv', CONFIG.MAX_DAILY_BACKUPS);

    var backupCount = countBackupFiles_(backupsFolder, '.json');
    var nowIso = now.toISOString();

    upsertSetting_(ss, 'lastBackupAt', nowIso, triggeredBy);
    upsertSetting_(ss, 'backupStatus', 'Healthy (' + exportPayload.news.length + ' news, ' + exportPayload.events.length + ' events)', triggeredBy);
    upsertSetting_(ss, 'availableBackupsCount', String(backupCount), triggeredBy);

    appendAdminLog_(
      ss,
      isScheduled ? 'AUTO_BACKUP' : 'MANUAL_BACKUP',
      'backup',
      jsonFile.getId(),
      triggeredBy,
      'Created ' + jsonName + ' & ' + csvName + ' (' + exportPayload.news.length + ' articles)'
    );

    return {
      ok: true,
      backupId: jsonFile.getId(),
      jsonFileName: jsonName,
      csvFileName: csvName,
      csvFileId: csvFile.getId(),
      articleCount: exportPayload.news.length,
      eventCount: exportPayload.events.length,
      availableBackupsCount: backupCount,
      createdAt: nowIso
    };
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    upsertSetting_(ss, 'backupStatus', 'Failed: ' + msg.slice(0, 120), triggeredBy);
    appendAdminLog_(ss, 'BACKUP_FAILED', 'backup', 'error', triggeredBy, msg.slice(0, 200));

    // Notify administrator by email when backup fails
    try {
      var recipients = (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || CONFIG.DEFAULT_OWNER_EMAILS.join(','));
      MailApp.sendEmail(
        recipients,
        '[CoffeeNadu News] Daily Backup Failed',
        'Automatic backup for CoffeeNadu News failed at ' + new Date().toISOString() + '.\n\nError details:\n' + msg
      );
    } catch (mailErr) {
      // Ignore email quota errors
    }

    return { ok: false, error: msg };
  }
}

/* ============================================================================
 * ADMIN RESTORE SYSTEM (ALWAYS CREATES SAFETY BACKUP FIRST)
 * ============================================================================ */

function handleListBackups_() {
  var backupsFolder = getOrCreateFolder_(CONFIG.BACKUPS_FOLDER_NAME, 'BACKUPS_FOLDER_ID');
  var monthlyFolder = getOrCreateSubfolder_(backupsFolder, CONFIG.MONTHLY_ARCHIVE_FOLDER_NAME, 'MONTHLY_ARCHIVE_FOLDER_ID');
  var items = [];

  collectBackupsFromFolder_(backupsFolder, 'daily', items);
  collectBackupsFromFolder_(monthlyFolder, 'monthly', items);

  items.sort(function (a, b) {
    return (b.createdTimestamp || 0) - (a.createdTimestamp || 0);
  });

  return { ok: true, backups: items };
}

function collectBackupsFromFolder_(folder, tier, output) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    if (name.slice(-5) !== '.json') continue;
    output.push({
      fileId: f.getId(),
      fileName: name,
      tier: tier,
      sizeBytes: f.getSize(),
      createdAt: f.getDateCreated().toISOString(),
      createdTimestamp: f.getDateCreated().getTime()
    });
  }
}

function handlePreviewBackup_(fileId) {
  if (!fileId) return { ok: false, error: 'Missing backup fileId' };
  var file = DriveApp.getFileById(String(fileId));
  var parsed = JSON.parse(file.getBlob().getDataAsString());
  var news = Array.isArray(parsed.news) ? parsed.news : [];
  var events = Array.isArray(parsed.events) ? parsed.events : [];

  // Compare with current sheet to highlight deleted/missing items
  var currentAll = getAllNewsCached_();
  var activeMap = {};
  var deletedMap = {};
  for (var i = 0; i < currentAll.length; i++) {
    if (currentAll[i].status === 'deleted') {
      deletedMap[currentAll[i].newsId] = true;
    } else {
      activeMap[currentAll[i].newsId] = true;
    }
  }

  var previewNews = news.map(function (item) {
    return {
      newsId: item.newsId,
      title: item.title,
      category: item.category,
      location: item.location,
      publishedDate: item.publishedDate,
      views: Number(item.views) || 0,
      status: item.status || 'published',
      existsInCurrent: Boolean(activeMap[item.newsId]),
      isDeletedInCurrent: Boolean(deletedMap[item.newsId])
    };
  });

  return {
    ok: true,
    fileId: file.getId(),
    fileName: file.getName(),
    exportedAt: parsed.exportedAt || file.getDateCreated().toISOString(),
    newsCount: news.length,
    eventsCount: events.length,
    categoriesCount: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
    previewNews: previewNews
  };
}

/**
 * Restores backup safely:
 * 1. ALWAYS creates a fresh safety backup before modifying a single row.
 * 2. Never wipes existing records not present in the backup.
 * 3. Supports modes: 'all', 'selected', 'deleted_only'.
 */
function handleRestoreBackup_(fileId, mode, selectedIds, adminEmail) {
  if (!fileId) return { ok: false, error: 'Missing backup fileId' };

  // Step 1: Mandatory safety backup before restore
  var safetyBackup = runDailyBackupInternal_(adminEmail + ' (pre-restore-safety)', false);
  if (!safetyBackup.ok) {
    return { ok: false, error: 'Aborted restore because pre-restore safety backup failed: ' + safetyBackup.error };
  }

  var file = DriveApp.getFileById(String(fileId));
  var parsed = JSON.parse(file.getBlob().getDataAsString());
  var backupNews = Array.isArray(parsed.news) ? parsed.news : [];

  var selectedSet = {};
  if (Array.isArray(selectedIds)) {
    for (var s = 0; s < selectedIds.length; s++) {
      selectedSet[String(selectedIds[s])] = true;
    }
  }

  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'News', NEWS_HEADERS);
  var existingRows = readSheetRowsWithIndex_(sheet, NEWS_HEADERS);
  var existingById = {};
  for (var i = 0; i < existingRows.length; i++) {
    existingById[existingRows[i].record.newsId] = existingRows[i];
  }

  var restoredCount = 0;
  var skippedCount = 0;
  var toAppend = [];

  for (var j = 0; j < backupNews.length; j++) {
    var item = backupNews[j];
    var id = String(item.newsId || '').trim();
    if (!id) continue;

    var existingEntry = existingById[id];

    if (mode === 'selected' && !selectedSet[id]) {
      skippedCount++;
      continue;
    }
    if (mode === 'deleted_only') {
      // Only restore articles that are missing or marked deleted in current live sheet
      if (existingEntry && existingEntry.record.status === 'published') {
        skippedCount++;
        continue;
      }
    }

    var rowObj = normalizeBackupNewsRow_(item);
    rowObj.status = 'published';
    rowObj.updatedDate = new Date().toISOString();

    if (existingEntry) {
      sheet.getRange(existingEntry.rowIndex, 1, 1, NEWS_HEADERS.length)
        .setValues([objectToRow_(rowObj, NEWS_HEADERS)]);
    } else {
      toAppend.push(objectToRow_(rowObj, NEWS_HEADERS));
    }
    restoredCount++;
  }

  if (toAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, NEWS_HEADERS.length).setValues(toAppend);
  }

  appendAdminLog_(
    ss,
    'RESTORE_BACKUP',
    'backup',
    String(fileId),
    adminEmail,
    'Mode=' + mode + ' | Restored=' + restoredCount + ' | Skipped=' + skippedCount + ' | PreRestoreBackup=' + safetyBackup.jsonFileName
  );

  return {
    ok: true,
    restoredCount: restoredCount,
    skippedCount: skippedCount,
    safetyBackupFileName: safetyBackup.jsonFileName
  };
}

/* ============================================================================
 * MIGRATION BATCH IMPORT (IDEMPOTENT, DUPLICATE-SAFE, PER-RECORD REPORTING)
 * ============================================================================ */

function handleMigrateBatch_(articles, events, categories, adminEmail) {
  var ss = getOrCreateSpreadsheet_();
  var newsSheet = ensureSheetWithHeaders_(ss, 'News', NEWS_HEADERS);
  var eventsSheet = ensureSheetWithHeaders_(ss, 'Events', EVENTS_HEADERS);
  var categoriesSheet = ensureSheetWithHeaders_(ss, 'Categories', CATEGORIES_HEADERS);

  // Sync any historical categories without creating duplicates
  var categoriesAdded = 0;
  var existingCategories = readSheetObjects_(categoriesSheet, CATEGORIES_HEADERS);
  var existingCatNames = {};
  for (var c = 0; c < existingCategories.length; c++) {
    existingCatNames[String(existingCategories[c].nameEn || '').trim().toLowerCase()] = true;
  }
  var allIncomingCats = Array.isArray(categories) ? categories.slice() : [];
  for (var ac = 0; ac < articles.length; ac++) {
    if (articles[ac] && articles[ac].category) {
      allIncomingCats.push(String(articles[ac].category));
    }
  }
  var catRowsToAdd = [];
  for (var ci = 0; ci < allIncomingCats.length; ci++) {
    var catName = String(allIncomingCats[ci] || '').trim();
    var catKey = catName.toLowerCase();
    if (!catName || existingCatNames[catKey]) continue;
    var catId = catKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('cat-' + Date.now());
    catRowsToAdd.push([catId, catName, catName, 'general-news', existingCategories.length + catRowsToAdd.length + 1, 'TRUE']);
    existingCatNames[catKey] = true;
    categoriesAdded++;
  }
  if (catRowsToAdd.length > 0) {
    categoriesSheet.getRange(categoriesSheet.getLastRow() + 1, 1, catRowsToAdd.length, CATEGORIES_HEADERS.length).setValues(catRowsToAdd);
  }

  var existingNews = readSheetObjects_(newsSheet, NEWS_HEADERS);
  var existingNewsIds = {};
  for (var i = 0; i < existingNews.length; i++) {
    existingNewsIds[String(existingNews[i].newsId || '')] = true;
  }

  var existingEvents = readSheetObjects_(eventsSheet, EVENTS_HEADERS);
  var existingEventIds = {};
  for (var k = 0; k < existingEvents.length; k++) {
    existingEventIds[String(existingEvents[k].eventId || '')] = true;
  }

  var importedNews = 0;
  var skippedNews = 0;
  var migratedImages = 0;
  var migratedNewsIds = [];
  var duplicateNewsIds = [];
  var failedNews = [];
  var newsBatchRows = [];

  for (var a = 0; a < articles.length; a++) {
    var art = articles[a] || {};
    var rawId = String(art.newsId || art.id || '').trim();
    var newsId = sanitizeId_(rawId);
    var titlePreview = String(art.title || art.titleKannada || '').trim().slice(0, 120);

    if (!newsId) {
      failedNews.push({
        id: rawId || ('index-' + a),
        title: titlePreview || '(Untitled)',
        reason: 'Invalid or missing Firebase document ID.'
      });
      continue;
    }

    if (existingNewsIds[newsId]) {
      skippedNews++;
      duplicateNewsIds.push(newsId);
      continue;
    }

    try {
      var imageUrl = String(art.imageUrl || '').trim();
      var imageThumbUrl = String(art.imageThumbUrl || '').trim();
      var imageDriveId = String(art.imageDriveId || '').trim();

      // Upload Base64 photographs directly to Google Drive (CoffeeNadu_News_Images)
      if (imageUrl.indexOf('data:image/') === 0 && !imageDriveId) {
        var mimeMatch = imageUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (!mimeMatch) {
          failedNews.push({
            id: newsId,
            title: titlePreview || newsId,
            reason: 'Malformed Base64 image data URL.'
          });
          continue;
        }
        var uploaded = handleUploadImage_({
          mimeType: mimeMatch[1],
          base64Data: mimeMatch[2],
          thumbBase64: (imageThumbUrl.indexOf('data:image/') === 0) ? imageThumbUrl : '',
          fileName: newsId + '.jpg'
        }, adminEmail);

        if (!uploaded || !uploaded.ok || !uploaded.fileId) {
          failedNews.push({
            id: newsId,
            title: titlePreview || newsId,
            reason: 'Google Drive image upload failed: ' + (uploaded && uploaded.error ? uploaded.error : 'Unknown Drive error')
          });
          continue;
        }
        imageDriveId = uploaded.fileId;
        imageUrl = '/api/media/drive/' + uploaded.fileId;
        imageThumbUrl = '/api/media/drive/' + (uploaded.thumbFileId || uploaded.fileId);
        migratedImages++;
      }

      var paragraphs = normalizeBodyParagraphs_(art.fullContent || art.bodyKannada);
      var title = String(art.title || art.titleKannada || '').trim().slice(0, 300);
      var desc = String(art.description || art.summaryKannada || paragraphs[0] || '').trim().slice(0, 1000);
      if (!title) {
        failedNews.push({
          id: newsId,
          title: newsId,
          reason: 'Article is missing a headline/title.'
        });
        continue;
      }
      if (paragraphs.length === 0 && desc) {
        paragraphs = [desc];
      }
      if (paragraphs.length === 0) {
        failedNews.push({
          id: newsId,
          title: title,
          reason: 'Article has empty body content.'
        });
        continue;
      }

      var ts = Number(art.publishedTimestamp) || Date.now();
      var rec = {
        newsId: newsId,
        title: title,
        description: desc,
        fullContent: JSON.stringify(paragraphs),
        category: String(art.category || 'Local').trim(),
        location: String(art.location || 'ಕೊಪ್ಪ').trim(),
        language: String(art.language || 'kn').trim(),
        imageUrl: imageUrl,
        imageThumbUrl: imageThumbUrl,
        imageDriveId: imageDriveId,
        imageCaption: String(art.imageCaption || '').trim().slice(0, 300),
        imageKey: String(art.imageKey || 'none').trim(),
        watermarkApplied: Boolean(art.watermarkApplied && imageUrl) ? 'TRUE' : 'FALSE',
        author: String(art.author || art.reporter || 'Coffeenadu Desk').trim(),
        authorUid: String(art.authorUid || adminEmail).trim(),
        publishedDate: String(art.publishedDate || formatDisplayDate_(new Date(ts))).trim(),
        publishedTime: String(art.publishedTime || formatDisplayTime_(new Date(ts))).trim(),
        publishedTimestamp: String(ts),
        updatedDate: new Date().toISOString(),
        readTimeMinutes: String(Number(art.readTimeMinutes) || Math.max(1, Math.ceil(paragraphs.join(' ').length / 450))),
        status: String(art.status || 'published'),
        views: String(Math.max(0, Number(art.views || art.viewCount) || 0)),
        featured: Boolean(art.featured || art.isFeatured) ? 'TRUE' : 'FALSE',
        tags: String(art.tags || '').trim(),
        contentHash: computeTextHash_(title + '|' + desc + '|' + paragraphs[0])
      };
      newsBatchRows.push(objectToRow_(rec, NEWS_HEADERS));
      existingNewsIds[newsId] = true;
      migratedNewsIds.push(newsId);
      importedNews++;
    } catch (artErr) {
      failedNews.push({
        id: newsId,
        title: titlePreview || newsId,
        reason: String(artErr && artErr.message ? artErr.message : artErr)
      });
    }
  }

  if (newsBatchRows.length > 0) {
    newsSheet.getRange(newsSheet.getLastRow() + 1, 1, newsBatchRows.length, NEWS_HEADERS.length).setValues(newsBatchRows);
  }

  var importedEvents = 0;
  var skippedEvents = 0;
  var migratedEventIds = [];
  var duplicateEventIds = [];
  var failedEvents = [];
  var eventBatchRows = [];

  for (var e = 0; e < events.length; e++) {
    var ev = events[e] || {};
    var rawEvId = String(ev.eventId || ev.id || '').trim();
    var evId = sanitizeId_(rawEvId);
    var evTitlePreview = String(ev.titleKannada || '').trim().slice(0, 120);

    if (!evId) {
      failedEvents.push({
        id: rawEvId || ('event-index-' + e),
        title: evTitlePreview || '(Untitled Event)',
        reason: 'Invalid or missing Firebase event document ID.'
      });
      continue;
    }

    if (existingEventIds[evId]) {
      skippedEvents++;
      duplicateEventIds.push(evId);
      continue;
    }

    try {
      var evImgUrl = String(ev.imageUrl || '').trim();
      var evThumbUrl = String(ev.imageThumbUrl || '').trim();
      var evDriveId = String(ev.imageDriveId || '').trim();
      if (evImgUrl.indexOf('data:image/') === 0 && !evDriveId) {
        var evMimeMatch = evImgUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (!evMimeMatch) {
          failedEvents.push({
            id: evId,
            title: evTitlePreview || evId,
            reason: 'Malformed Base64 event image data URL.'
          });
          continue;
        }
        var evUploaded = handleUploadImage_({
          mimeType: evMimeMatch[1],
          base64Data: evMimeMatch[2],
          thumbBase64: (evThumbUrl.indexOf('data:image/') === 0) ? evThumbUrl : '',
          fileName: evId + '.jpg'
        }, adminEmail);
        if (!evUploaded || !evUploaded.ok || !evUploaded.fileId) {
          failedEvents.push({
            id: evId,
            title: evTitlePreview || evId,
            reason: 'Google Drive event image upload failed: ' + (evUploaded && evUploaded.error ? evUploaded.error : 'Unknown Drive error')
          });
          continue;
        }
        evDriveId = evUploaded.fileId;
        evImgUrl = '/api/media/drive/' + evUploaded.fileId;
        evThumbUrl = '/api/media/drive/' + (evUploaded.thumbFileId || evUploaded.fileId);
        migratedImages++;
      }

      var evTitle = String(ev.titleKannada || '').trim().slice(0, 300);
      if (!evTitle) {
        failedEvents.push({
          id: evId,
          title: evId,
          reason: 'Event is missing a title.'
        });
        continue;
      }

      var evRec = {
        eventId: evId,
        titleKannada: evTitle,
        descriptionKannada: String(ev.descriptionKannada || evTitle).trim().slice(0, 2000),
        eventDate: String(ev.eventDate || '').trim().slice(0, 10),
        eventTime: String(ev.eventTime || '10:00 AM').trim().slice(0, 40),
        location: String(ev.location || 'ಕೊಪ್ಪ').trim().slice(0, 60),
        organizer: String(ev.organizer || 'Koppa Taluk Committee').trim().slice(0, 100),
        imageUrl: evImgUrl,
        imageThumbUrl: evThumbUrl,
        imageDriveId: evDriveId,
        watermarkApplied: Boolean(ev.watermarkApplied && evImgUrl) ? 'TRUE' : 'FALSE',
        authorUid: String(ev.authorUid || adminEmail).trim(),
        views: String(Math.max(0, Number(ev.views || ev.viewCount) || 0)),
        status: 'published',
        createdAt: ev.createdTimestamp ? new Date(Number(ev.createdTimestamp)).toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      eventBatchRows.push(objectToRow_(evRec, EVENTS_HEADERS));
      existingEventIds[evId] = true;
      migratedEventIds.push(evId);
      importedEvents++;
    } catch (evErr) {
      failedEvents.push({
        id: evId,
        title: evTitlePreview || evId,
        reason: String(evErr && evErr.message ? evErr.message : evErr)
      });
    }
  }

  if (eventBatchRows.length > 0) {
    eventsSheet.getRange(eventsSheet.getLastRow() + 1, 1, eventBatchRows.length, EVENTS_HEADERS.length).setValues(eventBatchRows);
  }

  // IMPORTANT: Never mark migration "Completed" until verifyMigration confirms all historical records
  upsertSetting_(
    ss,
    'migrationStatus',
    'In Progress — Verification Pending (' + (existingNews.length + importedNews) + ' news, ' + (existingEvents.length + importedEvents) + ' events in Sheet)',
    adminEmail
  );
  appendAdminLog_(
    ss,
    'MIGRATE_BATCH',
    'migration',
    'batch',
    adminEmail,
    'News +' + importedNews + ' (dup ' + skippedNews + ', fail ' + failedNews.length + '), Events +' + importedEvents + ' (dup ' + skippedEvents + ', fail ' + failedEvents.length + '), Drive images +' + migratedImages
  );

  return {
    ok: true,
    importedNews: importedNews,
    skippedNews: skippedNews,
    importedEvents: importedEvents,
    skippedEvents: skippedEvents,
    migratedImages: migratedImages,
    categoriesAdded: categoriesAdded,
    migratedNewsIds: migratedNewsIds,
    duplicateNewsIds: duplicateNewsIds,
    failedNews: failedNews,
    migratedEventIds: migratedEventIds,
    duplicateEventIds: duplicateEventIds,
    failedEvents: failedEvents,
    totalNewsInSheet: existingNews.length + importedNews,
    totalEventsInSheet: existingEvents.length + importedEvents
  };
}

/**
 * Verifies every migrated Firebase document directly against live Google Sheets rows
 * and checks preserved publishing dates, categories, content, and Drive image references.
 */
function handleVerifyMigration_(payload, adminEmail) {
  var ss = getOrCreateSpreadsheet_();
  var newsSheet = ensureSheetWithHeaders_(ss, 'News', NEWS_HEADERS);
  var eventsSheet = ensureSheetWithHeaders_(ss, 'Events', EVENTS_HEADERS);
  var categoriesSheet = ensureSheetWithHeaders_(ss, 'Categories', CATEGORIES_HEADERS);

  var liveNewsRows = readSheetObjects_(newsSheet, NEWS_HEADERS).map(formatNewsOutput_);
  var liveEventsRows = readSheetObjects_(eventsSheet, EVENTS_HEADERS).map(formatEventOutput_);
  var liveCategories = readSheetObjects_(categoriesSheet, CATEGORIES_HEADERS);

  var newsById = {};
  for (var i = 0; i < liveNewsRows.length; i++) {
    newsById[liveNewsRows[i].newsId] = liveNewsRows[i];
  }
  var eventsById = {};
  for (var j = 0; j < liveEventsRows.length; j++) {
    eventsById[liveEventsRows[j].eventId] = liveEventsRows[j];
  }

  var expectedNews = Array.isArray(payload.expectedNews) ? payload.expectedNews : [];
  var expectedEvents = Array.isArray(payload.expectedEvents) ? payload.expectedEvents : [];
  var exportComplete = Boolean(payload.exportComplete);

  var verifiedNewsIds = [];
  var missingNewsIds = [];
  var mismatchedNews = [];

  for (var n = 0; n < expectedNews.length; n++) {
    var exp = expectedNews[n] || {};
    var id = String(exp.id || '').trim();
    if (!id) continue;
    var row = newsById[id];
    if (!row) {
      missingNewsIds.push(id);
      continue;
    }
    var issues = [];
    if (!row.title) issues.push('Missing title');
    if (!Array.isArray(row.fullContent) || row.fullContent.length === 0) issues.push('Empty body content');
    if (exp.category && String(row.category || '').trim() !== String(exp.category).trim()) {
      issues.push('Category mismatch (expected ' + exp.category + ', got ' + row.category + ')');
    }
    if (exp.publishedDate && normalizeDateKey_(row.publishedDate) && normalizeDateKey_(exp.publishedDate)) {
      if (normalizeDateKey_(row.publishedDate) !== normalizeDateKey_(exp.publishedDate)) {
        issues.push('Publishing date mismatch (expected ' + exp.publishedDate + ', got ' + row.publishedDate + ')');
      }
    }
    if (exp.hadBase64Image) {
      if (!row.imageDriveId) {
        issues.push('Base64 photo was not uploaded to Google Drive');
      } else if (String(row.imageUrl || '').indexOf('data:image/') === 0) {
        issues.push('Raw Base64 image still stored in Sheet instead of Drive reference');
      }
    } else if (exp.hadImageUrl && !row.imageUrl) {
      issues.push('Missing image reference');
    }

    if (issues.length > 0) {
      mismatchedNews.push({ id: id, title: row.title || exp.title || id, reason: issues.join('; ') });
    } else {
      verifiedNewsIds.push(id);
    }
  }

  var verifiedEventIds = [];
  var missingEventIds = [];
  var mismatchedEvents = [];

  for (var e = 0; e < expectedEvents.length; e++) {
    var expEv = expectedEvents[e] || {};
    var evId = String(expEv.id || '').trim();
    if (!evId) continue;
    var evRow = eventsById[evId];
    if (!evRow) {
      missingEventIds.push(evId);
      continue;
    }
    var evIssues = [];
    if (!evRow.titleKannada) evIssues.push('Missing event title');
    if (expEv.eventDate && normalizeDateKey_(evRow.eventDate) && normalizeDateKey_(expEv.eventDate)) {
      if (normalizeDateKey_(evRow.eventDate) !== normalizeDateKey_(expEv.eventDate)) {
        evIssues.push('Event date mismatch (expected ' + expEv.eventDate + ', got ' + evRow.eventDate + ')');
      }
    }
    if (expEv.hadBase64Image && !evRow.imageDriveId) {
      evIssues.push('Base64 event photo was not uploaded to Google Drive');
    } else if (expEv.hadImageUrl && !evRow.imageUrl) {
      evIssues.push('Missing event image reference');
    }

    if (evIssues.length > 0) {
      mismatchedEvents.push({ id: evId, title: evRow.titleKannada || expEv.title || evId, reason: evIssues.join('; ') });
    } else {
      verifiedEventIds.push(evId);
    }
  }

  var totalExpected = expectedNews.length + expectedEvents.length;
  var allRecordsMatch =
    totalExpected > 0 &&
    missingNewsIds.length === 0 &&
    mismatchedNews.length === 0 &&
    missingEventIds.length === 0 &&
    mismatchedEvents.length === 0;

  var fullyVerifiedComplete = Boolean(exportComplete && allRecordsMatch);

  if (fullyVerifiedComplete) {
    upsertSetting_(
      ss,
      'migrationStatus',
      'Verified Complete (' + verifiedNewsIds.length + ' news, ' + verifiedEventIds.length + ' events verified at ' + new Date().toISOString() + ')',
      adminEmail
    );
  } else {
    upsertSetting_(
      ss,
      'migrationStatus',
      'Incomplete (' + verifiedNewsIds.length + '/' + expectedNews.length + ' news, ' + verifiedEventIds.length + '/' + expectedEvents.length + ' events verified; exportComplete=' + String(exportComplete) + ')',
      adminEmail
    );
  }

  appendAdminLog_(
    ss,
    'VERIFY_MIGRATION',
    'migration',
    'verify',
    adminEmail,
    'Verified news ' + verifiedNewsIds.length + '/' + expectedNews.length + ', events ' + verifiedEventIds.length + '/' + expectedEvents.length + ', complete=' + String(fullyVerifiedComplete)
  );

  return {
    ok: true,
    allVerified: allRecordsMatch,
    fullyVerifiedComplete: fullyVerifiedComplete,
    exportComplete: exportComplete,
    verifiedNewsIds: verifiedNewsIds,
    missingNewsIds: missingNewsIds,
    mismatchedNews: mismatchedNews,
    verifiedEventIds: verifiedEventIds,
    missingEventIds: missingEventIds,
    mismatchedEvents: mismatchedEvents,
    totalNewsInSheet: liveNewsRows.length,
    totalEventsInSheet: liveEventsRows.length,
    totalCategoriesInSheet: liveCategories.length,
    verifiedAt: new Date().toISOString()
  };
}

/* ============================================================================
 * SETTINGS, CATEGORIES, HEALTH & EXPORT HANDLERS
 * ============================================================================ */

function handleGetCategories_() {
  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'Categories', CATEGORIES_HEADERS);
  var rows = readSheetObjects_(sheet, CATEGORIES_HEADERS);
  return { ok: true, categories: rows };
}

function handleGetSettings_() {
  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'Settings', SETTINGS_HEADERS);
  var rows = readSheetObjects_(sheet, SETTINGS_HEADERS);
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key) {
      map[rows[i].key] = rows[i].value;
    }
  }
  return { ok: true, settings: map };
}

function handleHealth_() {
  var ss = getOrCreateSpreadsheet_();
  var news = getAllNewsCached_();
  var publishedCount = news.filter(function (n) { return n.status === 'published'; }).length;
  var deletedCount = news.filter(function (n) { return n.status === 'deleted'; }).length;
  var events = getAllEventsCached_().filter(function (e) { return e.status !== 'deleted'; });
  var categories = handleGetCategories_().categories;
  var settings = handleGetSettings_().settings;
  var backupsFolder = getOrCreateFolder_(CONFIG.BACKUPS_FOLDER_NAME, 'BACKUPS_FOLDER_ID');
  var backupsCount = countBackupFiles_(backupsFolder, '.json');

  return {
    ok: true,
    status: 'connected',
    spreadsheetName: ss.getName(),
    totalNews: publishedCount,
    deletedNews: deletedCount,
    totalEvents: events.length,
    totalCategories: categories.length,
    availableBackups: backupsCount,
    lastBackupAt: settings.lastBackupAt || '',
    backupStatus: settings.backupStatus || 'Not yet run',
    imageStorageStatus: settings.imageStorageStatus || 'Ready (Google Drive)',
    migrationStatus: settings.migrationStatus || 'Pending',
    serverTime: new Date().toISOString()
  };
}

function handleAdminStats_() {
  var health = handleHealth_();
  var ss = getOrCreateSpreadsheet_();
  var logsSheet = ensureSheetWithHeaders_(ss, 'AdminLogs', ADMIN_LOGS_HEADERS);
  var logs = readSheetObjects_(logsSheet, ADMIN_LOGS_HEADERS).slice(-25).reverse();
  health.recentLogs = logs;
  return health;
}

function handleExportAll_() {
  var ss = getOrCreateSpreadsheet_();
  var payload = buildFullExportPayload_(ss);
  return {
    ok: true,
    data: payload,
    csv: buildNewsCsv_(payload.news)
  };
}

/* ============================================================================
 * INTERNAL CACHE, SHEET & DRIVE HELPERS
 * ============================================================================ */

function getAllNewsCached_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('ALL_NEWS_JSON_V1');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (ignore) {}
  }

  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'News', NEWS_HEADERS);
  var raw = readSheetObjects_(sheet, NEWS_HEADERS);
  var formatted = raw.map(formatNewsOutput_);

  try {
    var serialized = JSON.stringify(formatted);
    if (serialized.length < 95000) {
      cache.put('ALL_NEWS_JSON_V1', serialized, CONFIG.SCRIPT_CACHE_TTL_SECONDS);
    }
  } catch (ignore) {}

  return formatted;
}

function getAllEventsCached_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('ALL_EVENTS_JSON_V1');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (ignore) {}
  }

  var ss = getOrCreateSpreadsheet_();
  var sheet = ensureSheetWithHeaders_(ss, 'Events', EVENTS_HEADERS);
  var raw = readSheetObjects_(sheet, EVENTS_HEADERS);
  var formatted = raw.map(formatEventOutput_);

  try {
    var serialized = JSON.stringify(formatted);
    if (serialized.length < 95000) {
      cache.put('ALL_EVENTS_JSON_V1', serialized, CONFIG.SCRIPT_CACHE_TTL_SECONDS);
    }
  } catch (ignore) {}

  return formatted;
}

function invalidateScriptCaches_() {
  try {
    CacheService.getScriptCache().removeAll(['ALL_NEWS_JSON_V1', 'ALL_EVENTS_JSON_V1']);
  } catch (ignore) {}
}

function parseBool_(val) {
  if (val === true || val === 1) return true;
  if (val === false || val === 0 || val === null || val === undefined) return false;
  var s = String(val).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES';
}

function parseLeadMetaFromTags_(rawTags) {
  var text = String(rawTags || '').trim();
  var featuredUntil = 0;
  var leadDisabled = false;
  if (!text) return { featuredUntil: 0, leadDisabled: false };
  var parts = text.split(',');
  for (var i = 0; i < parts.length; i++) {
    var token = String(parts[i] || '').trim();
    var lower = token.toLowerCase();
    if (lower.indexOf('leaduntil:') === 0) {
      var parsed = Number(token.slice(10));
      if (isFinite(parsed) && parsed > 0) featuredUntil = Math.floor(parsed);
    } else if (lower === 'leadoff:1') {
      leadDisabled = true;
    }
  }
  return { featuredUntil: featuredUntil, leadDisabled: leadDisabled };
}

function isNewsItemActivelyFeatured_(item, nowMs) {
  var meta = parseLeadMetaFromTags_(item.tags);
  if (meta.leadDisabled || !parseBool_(item.featured)) return false;
  var until = Number(item.featuredUntil || meta.featuredUntil || 0);
  if (until > 0 && until <= nowMs) return false;
  return true;
}

function unpackExtraPhotosFromParagraphs_(paragraphs) {
  var prefix = '__COFFEENADU_EXTRA_PHOTOS__:';
  var cleanBody = [];
  var extraImages = [];
  for (var i = 0; i < paragraphs.length; i++) {
    var entry = String(paragraphs[i] || '').trim();
    if (!entry) continue;
    if (entry.indexOf(prefix) === 0) {
      try {
        var parsed = JSON.parse(entry.slice(prefix.length));
        if (Array.isArray(parsed)) {
          extraImages = parsed.slice(0, 6);
        }
      } catch (ignore) {}
      continue;
    }
    cleanBody.push(paragraphs[i]);
  }
  return { fullContent: cleanBody, extraImages: extraImages };
}

function formatNewsOutput_(row) {
  var rawParagraphs = normalizeBodyParagraphs_(row.fullContent);
  var unpacked = unpackExtraPhotosFromParagraphs_(rawParagraphs);
  var paragraphs = unpacked.fullContent;
  var rawImageUrl = String(row.imageUrl || '').trim();
  var rawThumbUrl = String(row.imageThumbUrl || '').trim();
  var driveId = String(row.imageDriveId || '').trim() || extractGoogleDriveFileId_(rawImageUrl);
  var resolvedImageUrl = driveId ? '/api/media/drive/' + driveId : rawImageUrl;
  var resolvedThumbUrl = rawThumbUrl
    ? (extractGoogleDriveFileId_(rawThumbUrl) ? '/api/media/drive/' + extractGoogleDriveFileId_(rawThumbUrl) : rawThumbUrl)
    : (driveId ? '/api/media/drive/' + driveId + '?size=thumb' : '');
  var tagsStr = String(row.tags || '');
  var leadMeta = parseLeadMetaFromTags_(tagsStr);
  var nowMs = Date.now();
  var effectiveFeatured = parseBool_(row.featured) && !leadMeta.leadDisabled && (!leadMeta.featuredUntil || leadMeta.featuredUntil > nowMs);

  return {
    newsId: String(row.newsId || ''),
    title: String(row.title || ''),
    description: String(row.description || ''),
    fullContent: paragraphs,
    extraImages: unpacked.extraImages.length > 0 ? unpacked.extraImages : undefined,
    category: String(row.category || 'Local'),
    location: String(row.location || 'ಕೊಪ್ಪ'),
    language: String(row.language || 'kn'),
    imageUrl: resolvedImageUrl,
    imageThumbUrl: resolvedThumbUrl,
    imageDriveId: driveId,
    imageCaption: String(row.imageCaption || ''),
    imageKey: String(row.imageKey || 'none'),
    watermarkApplied: parseBool_(row.watermarkApplied),
    author: String(row.author || 'Coffeenadu Desk'),
    authorUid: String(row.authorUid || ''),
    publishedDate: normalizeSheetDate_(row.publishedDate),
    publishedTime: normalizeSheetTime_(row.publishedTime),
    publishedTimestamp: Number(row.publishedTimestamp) || 0,
    updatedDate: String(row.updatedDate || ''),
    readTimeMinutes: Number(row.readTimeMinutes) || 1,
    status: String(row.status || 'published'),
    views: Number(row.views) || 0,
    featured: effectiveFeatured,
    featuredUntil: leadMeta.featuredUntil || undefined,
    tags: tagsStr
  };
}

function formatEventOutput_(row) {
  var rawImageUrl = String(row.imageUrl || '').trim();
  var rawThumbUrl = String(row.imageThumbUrl || '').trim();
  var driveId = String(row.imageDriveId || '').trim() || extractGoogleDriveFileId_(rawImageUrl);
  var resolvedImageUrl = driveId ? '/api/media/drive/' + driveId : rawImageUrl;
  var resolvedThumbUrl = rawThumbUrl
    ? (extractGoogleDriveFileId_(rawThumbUrl) ? '/api/media/drive/' + extractGoogleDriveFileId_(rawThumbUrl) : rawThumbUrl)
    : (driveId ? '/api/media/drive/' + driveId + '?size=thumb' : '');

  return {
    eventId: String(row.eventId || ''),
    titleKannada: String(row.titleKannada || ''),
    descriptionKannada: String(row.descriptionKannada || ''),
    eventDate: normalizeSheetIsoDate_(row.eventDate),
    eventTime: normalizeSheetTime_(row.eventTime),
    location: String(row.location || 'ಕೊಪ್ಪ'),
    organizer: String(row.organizer || 'Koppa Taluk Committee'),
    imageUrl: resolvedImageUrl,
    imageThumbUrl: resolvedThumbUrl,
    imageDriveId: driveId,
    watermarkApplied: String(row.watermarkApplied).toUpperCase() === 'TRUE',
    authorUid: String(row.authorUid || ''),
    views: Number(row.views) || 0,
    status: String(row.status || 'published'),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || '')
  };
}

function normalizeBackupNewsRow_(item) {
  var paragraphs = normalizeBodyParagraphs_(item.fullContent || item.bodyKannada);
  return {
    newsId: String(item.newsId || item.id || ''),
    title: String(item.title || item.titleKannada || ''),
    description: String(item.description || item.summaryKannada || ''),
    fullContent: JSON.stringify(paragraphs),
    category: String(item.category || 'Local'),
    location: String(item.location || 'ಕೊಪ್ಪ'),
    language: String(item.language || 'kn'),
    imageUrl: String(item.imageUrl || ''),
    imageThumbUrl: String(item.imageThumbUrl || ''),
    imageDriveId: String(item.imageDriveId || ''),
    imageCaption: String(item.imageCaption || ''),
    imageKey: String(item.imageKey || 'none'),
    watermarkApplied: Boolean(item.watermarkApplied) ? 'TRUE' : 'FALSE',
    author: String(item.author || item.reporter || 'Coffeenadu Desk'),
    authorUid: String(item.authorUid || ''),
    publishedDate: String(item.publishedDate || ''),
    publishedTime: String(item.publishedTime || ''),
    publishedTimestamp: String(Number(item.publishedTimestamp) || Date.now()),
    updatedDate: String(item.updatedDate || new Date().toISOString()),
    readTimeMinutes: String(Number(item.readTimeMinutes) || 1),
    status: String(item.status || 'published'),
    views: String(Number(item.views || item.viewCount) || 0),
    featured: Boolean(item.featured || item.isFeatured) ? 'TRUE' : 'FALSE',
    tags: String(item.tags || ''),
    contentHash: String(item.contentHash || computeTextHash_(String(item.title || '') + '|' + String(item.description || '')))
  };
}

function getOrCreateSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty('SPREADSHEET_ID');
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (ignore) {}
  }

  var existingFiles = DriveApp.getFilesByName(CONFIG.SPREADSHEET_NAME);
  if (existingFiles.hasNext()) {
    var existing = existingFiles.next();
    props.setProperty('SPREADSHEET_ID', existing.getId());
    return SpreadsheetApp.openById(existing.getId());
  }

  var ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function ensureAllSheets_(ss) {
  ensureSheetWithHeaders_(ss, 'News', NEWS_HEADERS);
  ensureSheetWithHeaders_(ss, 'Events', EVENTS_HEADERS);
  var catSheet = ensureSheetWithHeaders_(ss, 'Categories', CATEGORIES_HEADERS);
  if (catSheet.getLastRow() <= 1) {
    catSheet.getRange(2, 1, DEFAULT_CATEGORIES.length, CATEGORIES_HEADERS.length).setValues(DEFAULT_CATEGORIES);
  }
  ensureSheetWithHeaders_(ss, 'Settings', SETTINGS_HEADERS);
  ensureSheetWithHeaders_(ss, 'AdminLogs', ADMIN_LOGS_HEADERS);
  ensureSheetWithHeaders_(ss, 'CommunityUsers', COMMUNITY_USERS_HEADERS);
  ensureSheetWithHeaders_(ss, 'CommunitySessions', COMMUNITY_SESSIONS_HEADERS);
  ensureSheetWithHeaders_(ss, 'CommunityPosts', COMMUNITY_POSTS_HEADERS);
  ensureSheetWithHeaders_(ss, 'CommunityReports', COMMUNITY_REPORTS_HEADERS);
  ensureSheetWithHeaders_(ss, 'ContestMonths', CONTEST_MONTHS_HEADERS);
  ensureSheetWithHeaders_(ss, 'ContestEntries', CONTEST_ENTRIES_HEADERS);
  ensureSheetWithHeaders_(ss, 'ContestAlerts', CONTEST_ALERTS_HEADERS);
  ensureSheetWithHeaders_(ss, 'ContestAuditLogs', CONTEST_AUDIT_HEADERS);
  ensureSheetWithHeaders_(ss, 'ContestViewBuckets', CONTEST_VIEW_BUCKETS_HEADERS);

  // Remove default empty "Sheet1" if unused
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }
}

function ensureSheetWithHeaders_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateFolder_(folderName, propKey) {
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty(propKey);
  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (ignore) {}
  }
  var iter = DriveApp.getFoldersByName(folderName);
  if (iter.hasNext()) {
    var f = iter.next();
    props.setProperty(propKey, f.getId());
    return f;
  }
  var created = DriveApp.createFolder(folderName);
  props.setProperty(propKey, created.getId());
  return created;
}

function getOrCreateSubfolder_(parent, folderName, propKey) {
  var props = PropertiesService.getScriptProperties();
  var savedId = props.getProperty(propKey);
  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (ignore) {}
  }
  var iter = parent.getFoldersByName(folderName);
  if (iter.hasNext()) {
    var f = iter.next();
    props.setProperty(propKey, f.getId());
    return f;
  }
  var created = parent.createFolder(folderName);
  props.setProperty(propKey, created.getId());
  return created;
}

function installDailyBackupTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runDailyBackup') {
      return;
    }
  }
  ScriptApp.newTrigger('runDailyBackup')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .nearMinute(30)
    .create();
}

function isAuthorizedAdminEmail_(email) {
  if (!email) return false;
  var allowRaw = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || CONFIG.DEFAULT_OWNER_EMAILS.join(',');
  var allowed = allowRaw.split(',').map(function (s) { return s.trim().toLowerCase(); });
  return allowed.indexOf(email.toLowerCase()) !== -1;
}

function readSheetObjects_(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var obj = {};
    var hasValue = false;
    for (var c = 0; c < headers.length; c++) {
      var val = values[i][c];
      if (val !== '' && val !== null && val !== undefined) hasValue = true;
      obj[headers[c]] = val;
    }
    if (hasValue) out.push(obj);
  }
  return out;
}

function readSheetRowsWithIndex_(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[i][c];
    }
    out.push({ rowIndex: i + 2, record: obj });
  }
  return out;
}

function findRowByColumnValue_(sheet, headers, colName, targetVal) {
  var rows = readSheetRowsWithIndex_(sheet, headers);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].record[colName] || '') === String(targetVal)) {
      return rows[i];
    }
  }
  return null;
}

function objectToRow_(obj, headers) {
  return headers.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? '' : v;
  });
}

function upsertSetting_(ss, key, value, updatedBy) {
  var sheet = ensureSheetWithHeaders_(ss, 'Settings', SETTINGS_HEADERS);
  var found = findRowByColumnValue_(sheet, SETTINGS_HEADERS, 'key', key);
  var row = [key, String(value), new Date().toISOString(), String(updatedBy || 'system')];
  if (found) {
    sheet.getRange(found.rowIndex, 1, 1, SETTINGS_HEADERS.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function appendAdminLog_(ss, action, entityType, entityId, adminEmail, details) {
  try {
    var sheet = ensureSheetWithHeaders_(ss, 'AdminLogs', ADMIN_LOGS_HEADERS);
    var logId = 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    sheet.appendRow([
      logId,
      new Date().toISOString(),
      String(action),
      String(entityType),
      String(entityId),
      String(adminEmail),
      String(details || '').slice(0, 500)
    ]);
  } catch (ignore) {}
}

function buildFullExportPayload_(ss) {
  return {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    source: 'CoffeeNadu_News_GoogleSheets',
    news: readSheetObjects_(ensureSheetWithHeaders_(ss, 'News', NEWS_HEADERS), NEWS_HEADERS).map(formatNewsOutput_),
    events: readSheetObjects_(ensureSheetWithHeaders_(ss, 'Events', EVENTS_HEADERS), EVENTS_HEADERS).map(formatEventOutput_),
    categories: readSheetObjects_(ensureSheetWithHeaders_(ss, 'Categories', CATEGORIES_HEADERS), CATEGORIES_HEADERS),
    settings: handleGetSettings_().settings
  };
}

function buildNewsCsv_(newsItems) {
  var cols = ['newsId', 'title', 'description', 'category', 'location', 'language', 'imageUrl', 'imageDriveId', 'author', 'publishedDate', 'publishedTime', 'status', 'views', 'featured', 'tags'];
  var lines = [cols.join(',')];
  for (var i = 0; i < newsItems.length; i++) {
    var item = newsItems[i];
    var row = cols.map(function (c) {
      var str = String(item[c] === undefined || item[c] === null ? '' : item[c]);
      return '"' + str.replace(/"/g, '""') + '"';
    });
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

function pruneOldBackups_(folder, ext, maxKeep) {
  var files = [];
  var iter = folder.getFiles();
  while (iter.hasNext()) {
    var f = iter.next();
    if (f.getName().slice(-ext.length) === ext) {
      files.push({ file: f, ts: f.getDateCreated().getTime() });
    }
  }
  files.sort(function (a, b) { return b.ts - a.ts; });
  for (var i = maxKeep; i < files.length; i++) {
    try {
      files[i].file.setTrashed(true);
    } catch (ignore) {}
  }
}

function countBackupFiles_(folder, ext) {
  var count = 0;
  var iter = folder.getFiles();
  while (iter.hasNext()) {
    if (iter.next().getName().slice(-ext.length) === ext) count++;
  }
  return count;
}

function normalizeBodyParagraphs_(raw) {
  if (Array.isArray(raw)) {
    return raw.map(function (p) { return String(p || '').trim(); }).filter(Boolean);
  }
  var str = String(raw || '').trim();
  if (!str) return [];
  if (str.charAt(0) === '[') {
    try {
      var parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map(function (p) { return String(p || '').trim(); }).filter(Boolean);
      }
    } catch (ignore) {}
  }
  return str.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
}

function sanitizeId_(val) {
  var clean = String(val || '').trim();
  return /^[a-zA-Z0-9_-]{1,128}$/.test(clean) ? clean : '';
}

function computeTextHash_(text) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytesToHex_(digest).slice(0, 32);
}

function bytesToHex_(bytes) {
  var out = [];
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    out.push((b < 16 ? '0' : '') + b.toString(16));
  }
  return out.join('');
}

function normalizeSheetDate_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Kolkata', 'dd MMM yyyy');
  }
  return String(val).trim();
}

function normalizeSheetIsoDate_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Kolkata', 'yyyy-MM-dd');
  }
  return String(val).trim();
}

function normalizeSheetTime_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Kolkata', 'hh:mm a');
  }
  return String(val).trim();
}

function normalizeDateKey_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Kolkata', 'yyyy-MM-dd');
  }
  var s = String(val).trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Kolkata', 'yyyy-MM-dd');
  }
  return s;
}

function formatDisplayDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Asia/Kolkata', 'dd MMM yyyy');
}

function formatDisplayTime_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Asia/Kolkata', 'hh:mm a');
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================================
 * DURABLE COMMUNITY & MONTHLY CONTEST STORAGE (GOOGLE SHEETS + DRIVE)
 * ============================================================================ */

function parseJsonArraySafe_(raw) {
  if (Array.isArray(raw)) return raw;
  var s = String(raw || '').trim();
  if (!s) return [];
  try {
    var parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (ignore) {
    return [];
  }
}

function upsertRowByKey_(sheet, headers, keyCol, keyVal, recordObj) {
  var found = findRowByColumnValue_(sheet, headers, keyCol, keyVal);
  var row = objectToRow_(recordObj, headers);
  if (found) {
    sheet.getRange(found.rowIndex, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function deleteRowsByColumnValue_(sheet, headers, colName, targetVal) {
  var rows = readSheetRowsWithIndex_(sheet, headers);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].record[colName] || '') === String(targetVal)) {
      sheet.deleteRow(rows[i].rowIndex);
    }
  }
}

function handleUploadPublicCommunityImage_(payload) {
  var mimeType = String(payload.mimeType || 'image/jpeg').trim().toLowerCase();
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/jpg' && mimeType !== 'image/png' && mimeType !== 'image/webp') {
    return { ok: false, error: 'JPG, PNG or WebP images only.' };
  }
  var cleanBase64 = String(payload.base64Data || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  if (!cleanBase64 || cleanBase64.length > 4200000) {
    return { ok: false, error: 'Image too large or empty (max 3 MB).' };
  }
  return handleUploadImage_({
    base64Data: cleanBase64,
    mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
    fileName: payload.fileName || ('community_' + Date.now() + '.jpg')
  }, 'public-contributor');
}

function handleGetCommunityContestSnapshot_() {
  var ss = getOrCreateSpreadsheet_();
  var usersSheet = ensureSheetWithHeaders_(ss, 'CommunityUsers', COMMUNITY_USERS_HEADERS);
  var sessSheet = ensureSheetWithHeaders_(ss, 'CommunitySessions', COMMUNITY_SESSIONS_HEADERS);
  var postsSheet = ensureSheetWithHeaders_(ss, 'CommunityPosts', COMMUNITY_POSTS_HEADERS);
  var reportsSheet = ensureSheetWithHeaders_(ss, 'CommunityReports', COMMUNITY_REPORTS_HEADERS);
  var monthsSheet = ensureSheetWithHeaders_(ss, 'ContestMonths', CONTEST_MONTHS_HEADERS);
  var entriesSheet = ensureSheetWithHeaders_(ss, 'ContestEntries', CONTEST_ENTRIES_HEADERS);
  var alertsSheet = ensureSheetWithHeaders_(ss, 'ContestAlerts', CONTEST_ALERTS_HEADERS);
  var auditSheet = ensureSheetWithHeaders_(ss, 'ContestAuditLogs', CONTEST_AUDIT_HEADERS);
  var bucketsSheet = ensureSheetWithHeaders_(ss, 'ContestViewBuckets', CONTEST_VIEW_BUCKETS_HEADERS);

  var users = readSheetObjects_(usersSheet, COMMUNITY_USERS_HEADERS).map(function (r) {
    return {
      id: String(r.id || ''),
      fullName: String(r.fullName || ''),
      mobileNumber: String(r.mobileNumber || ''),
      registeredAt: String(r.registeredAt || ''),
      lastActiveAt: String(r.lastActiveAt || ''),
      status: String(r.status || 'active') === 'suspended' ? 'suspended' : 'active',
      suspendedReason: r.suspendedReason ? String(r.suspendedReason) : undefined
    };
  });

  var nowMs = Date.now();
  var sessions = readSheetObjects_(sessSheet, COMMUNITY_SESSIONS_HEADERS).map(function (r) {
    return {
      tokenHash: String(r.tokenHash || ''),
      userId: String(r.userId || ''),
      createdAtMs: Number(r.createdAtMs) || 0,
      expiresAtMs: Number(r.expiresAtMs) || 0
    };
  }).filter(function (s) { return s.tokenHash && s.expiresAtMs > nowMs; });

  var posts = readSheetObjects_(postsSheet, COMMUNITY_POSTS_HEADERS).map(function (r) {
    return {
      id: String(r.id || ''),
      slug: String(r.slug || ''),
      authorUserId: String(r.authorUserId || ''),
      authorName: String(r.authorName || ''),
      title: String(r.title || ''),
      category: String(r.category || 'community-info'),
      description: String(r.description || ''),
      location: String(r.location || ''),
      photos: parseJsonArraySafe_(r.photosJson),
      price: r.price ? String(r.price) : undefined,
      optionalPublicContact: r.optionalPublicContact ? String(r.optionalPublicContact) : undefined,
      status: String(r.status || 'published'),
      hiddenReason: r.hiddenReason ? String(r.hiddenReason) : undefined,
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || ''),
      viewsCount: Number(r.viewsCount) || 0,
      sharesCount: Number(r.sharesCount) || 0
    };
  });

  var reports = readSheetObjects_(reportsSheet, COMMUNITY_REPORTS_HEADERS).map(function (r) {
    return {
      id: String(r.id || ''),
      postId: String(r.postId || ''),
      postTitle: String(r.postTitle || ''),
      reason: String(r.reason || ''),
      details: r.details ? String(r.details) : undefined,
      createdAt: String(r.createdAt || ''),
      status: String(r.status || 'open'),
      resolvedAt: r.resolvedAt ? String(r.resolvedAt) : undefined,
      resolvedBy: r.resolvedBy ? String(r.resolvedBy) : undefined
    };
  });

  var months = readSheetObjects_(monthsSheet, CONTEST_MONTHS_HEADERS).map(function (r) {
    return {
      monthKey: String(r.monthKey || ''),
      competitionName: String(r.competitionName || ''),
      displayLabelEn: String(r.displayLabelEn || ''),
      displayLabelKn: String(r.displayLabelKn || ''),
      startsAtIso: String(r.startsAtIso || ''),
      endsAtIso: String(r.endsAtIso || ''),
      status: String(r.status || 'open'),
      prizes: parseJsonArraySafe_(r.prizesJson),
      winners: parseJsonArraySafe_(r.winnersJson),
      winnersPublished: parseBool_(r.winnersPublished),
      allowCarryOver: parseBool_(r.allowCarryOver),
      finalizedAt: r.finalizedAt ? String(r.finalizedAt) : undefined,
      finalizedBy: r.finalizedBy ? String(r.finalizedBy) : undefined,
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || '')
    };
  });

  var entries = readSheetObjects_(entriesSheet, CONTEST_ENTRIES_HEADERS).map(function (r) {
    return {
      id: String(r.id || ''),
      postId: String(r.postId || ''),
      slug: String(r.slug || ''),
      competitionMonth: String(r.competitionMonth || ''),
      contributorUserId: String(r.contributorUserId || ''),
      contributorName: String(r.contributorName || ''),
      title: String(r.title || ''),
      summary: String(r.summary || ''),
      location: String(r.location || ''),
      thumbnailUrl: r.thumbnailUrl ? String(r.thumbnailUrl) : undefined,
      publishedAt: String(r.publishedAt || ''),
      eligibility: String(r.eligibility || 'eligible'),
      disqualificationReason: r.disqualificationReason ? String(r.disqualificationReason) : undefined,
      disqualifiedBy: r.disqualifiedBy ? String(r.disqualifiedBy) : undefined,
      disqualifiedAt: r.disqualifiedAt ? String(r.disqualifiedAt) : undefined,
      totalPageViews: Number(r.totalPageViews) || 0,
      eligibleViews: Number(r.eligibleViews) || 0,
      suspiciousBlockedViews: Number(r.suspiciousBlockedViews) || 0,
      suspiciousFlagged: parseBool_(r.suspiciousFlagged),
      lastViewedAt: r.lastViewedAt ? String(r.lastViewedAt) : undefined,
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || '')
    };
  });

  var alerts = readSheetObjects_(alertsSheet, CONTEST_ALERTS_HEADERS).map(function (r) {
    return {
      id: String(r.id || ''),
      entryId: String(r.entryId || ''),
      articleSlug: String(r.articleSlug || ''),
      articleTitle: String(r.articleTitle || ''),
      competitionMonth: String(r.competitionMonth || ''),
      severity: String(r.severity || 'medium'),
      reason: String(r.reason || ''),
      blockedCount: Number(r.blockedCount) || 1,
      detectedAt: String(r.detectedAt || ''),
      status: String(r.status || 'open'),
      adminNote: r.adminNote ? String(r.adminNote) : undefined,
      reviewedBy: r.reviewedBy ? String(r.reviewedBy) : undefined,
      reviewedAt: r.reviewedAt ? String(r.reviewedAt) : undefined
    };
  });

  var auditLogs = readSheetObjects_(auditSheet, CONTEST_AUDIT_HEADERS).map(function (r) {
    return {
      id: String(r.id || ''),
      timestamp: String(r.timestamp || ''),
      actorEmail: String(r.actorEmail || ''),
      action: String(r.action || ''),
      competitionMonth: String(r.competitionMonth || ''),
      targetId: r.targetId ? String(r.targetId) : undefined,
      details: String(r.details || '')
    };
  });

  var viewBuckets = readSheetObjects_(bucketsSheet, CONTEST_VIEW_BUCKETS_HEADERS).map(function (r) {
    return {
      entryId: String(r.entryId || ''),
      visitorHash: String(r.visitorHash || ''),
      lastEligibleAtMs: Number(r.lastEligibleAtMs) || 0,
      hitCount: Number(r.hitCount) || 1
    };
  });

  var activeMonthKeySetting = handleGetSettings_().settings.contestActiveMonthKey || '';

  return {
    ok: true,
    community: {
      users: users,
      sessions: sessions,
      posts: posts,
      reports: reports
    },
    contest: {
      activeMonthKey: activeMonthKeySetting,
      months: months,
      entries: entries,
      alerts: alerts,
      auditLogs: auditLogs,
      viewBuckets: viewBuckets
    }
  };
}

function handleGetCommunityPostPublicForOg_(slugOrId) {
  var key = String(slugOrId || '').trim().toLowerCase();
  if (!key) return { ok: false, error: 'Missing slug' };
  var ss = getOrCreateSpreadsheet_();
  var postsSheet = ensureSheetWithHeaders_(ss, 'CommunityPosts', COMMUNITY_POSTS_HEADERS);
  var posts = readSheetObjects_(postsSheet, COMMUNITY_POSTS_HEADERS);
  for (var i = 0; i < posts.length; i++) {
    var p = posts[i];
    if (String(p.status || 'published') !== 'published') continue;
    if (String(p.slug || '').toLowerCase() === key || String(p.id || '').toLowerCase() === key) {
      return {
        ok: true,
        post: {
          id: String(p.id || ''),
          slug: String(p.slug || ''),
          authorName: String(p.authorName || ''),
          title: String(p.title || ''),
          category: String(p.category || 'community-info'),
          description: String(p.description || ''),
          location: String(p.location || ''),
          photos: parseJsonArraySafe_(p.photosJson),
          createdAt: String(p.createdAt || '')
        }
      };
    }
  }
  return { ok: false, error: 'Post not found' };
}

function handleUpsertCommunityContestDelta_(payload) {
  var ss = getOrCreateSpreadsheet_();

  if (payload.user && payload.user.id) {
    var uSheet = ensureSheetWithHeaders_(ss, 'CommunityUsers', COMMUNITY_USERS_HEADERS);
    upsertRowByKey_(uSheet, COMMUNITY_USERS_HEADERS, 'id', payload.user.id, {
      id: payload.user.id,
      fullName: payload.user.fullName || '',
      mobileNumber: payload.user.mobileNumber || '',
      registeredAt: payload.user.registeredAt || '',
      lastActiveAt: payload.user.lastActiveAt || '',
      status: payload.user.status || 'active',
      suspendedReason: payload.user.suspendedReason || ''
    });
  }

  if (payload.session && payload.session.tokenHash) {
    var sSheet = ensureSheetWithHeaders_(ss, 'CommunitySessions', COMMUNITY_SESSIONS_HEADERS);
    upsertRowByKey_(sSheet, COMMUNITY_SESSIONS_HEADERS, 'tokenHash', payload.session.tokenHash, {
      tokenHash: payload.session.tokenHash,
      userId: payload.session.userId || '',
      createdAtMs: Number(payload.session.createdAtMs) || Date.now(),
      expiresAtMs: Number(payload.session.expiresAtMs) || Date.now()
    });
  }

  if (payload.revokeSessionTokenHash) {
    var sDelSheet = ensureSheetWithHeaders_(ss, 'CommunitySessions', COMMUNITY_SESSIONS_HEADERS);
    deleteRowsByColumnValue_(sDelSheet, COMMUNITY_SESSIONS_HEADERS, 'tokenHash', payload.revokeSessionTokenHash);
  }
  if (payload.revokeSessionsForUserId) {
    var sUserDelSheet = ensureSheetWithHeaders_(ss, 'CommunitySessions', COMMUNITY_SESSIONS_HEADERS);
    deleteRowsByColumnValue_(sUserDelSheet, COMMUNITY_SESSIONS_HEADERS, 'userId', payload.revokeSessionsForUserId);
  }

  if (payload.post && payload.post.id) {
    var pSheet = ensureSheetWithHeaders_(ss, 'CommunityPosts', COMMUNITY_POSTS_HEADERS);
    upsertRowByKey_(pSheet, COMMUNITY_POSTS_HEADERS, 'id', payload.post.id, {
      id: payload.post.id,
      slug: payload.post.slug || '',
      authorUserId: payload.post.authorUserId || '',
      authorName: payload.post.authorName || '',
      title: payload.post.title || '',
      category: payload.post.category || 'community-info',
      description: payload.post.description || '',
      location: payload.post.location || '',
      photosJson: JSON.stringify(Array.isArray(payload.post.photos) ? payload.post.photos : []),
      price: payload.post.price || '',
      optionalPublicContact: payload.post.optionalPublicContact || '',
      status: payload.post.status || 'published',
      hiddenReason: payload.post.hiddenReason || '',
      createdAt: payload.post.createdAt || '',
      updatedAt: payload.post.updatedAt || '',
      viewsCount: Number(payload.post.viewsCount) || 0,
      sharesCount: Number(payload.post.sharesCount) || 0
    });
  }

  if (payload.deletePostId) {
    var pDelSheet = ensureSheetWithHeaders_(ss, 'CommunityPosts', COMMUNITY_POSTS_HEADERS);
    deleteRowsByColumnValue_(pDelSheet, COMMUNITY_POSTS_HEADERS, 'id', payload.deletePostId);
  }

  if (payload.report && payload.report.id) {
    var rSheet = ensureSheetWithHeaders_(ss, 'CommunityReports', COMMUNITY_REPORTS_HEADERS);
    upsertRowByKey_(rSheet, COMMUNITY_REPORTS_HEADERS, 'id', payload.report.id, {
      id: payload.report.id,
      postId: payload.report.postId || '',
      postTitle: payload.report.postTitle || '',
      reason: payload.report.reason || '',
      details: payload.report.details || '',
      createdAt: payload.report.createdAt || '',
      status: payload.report.status || 'open',
      resolvedAt: payload.report.resolvedAt || '',
      resolvedBy: payload.report.resolvedBy || ''
    });
  }

  if (payload.activeMonthKey) {
    upsertSetting_(ss, 'contestActiveMonthKey', String(payload.activeMonthKey), 'contest-sync');
  }

  if (payload.contestMonth && payload.contestMonth.monthKey) {
    var mSheet = ensureSheetWithHeaders_(ss, 'ContestMonths', CONTEST_MONTHS_HEADERS);
    upsertRowByKey_(mSheet, CONTEST_MONTHS_HEADERS, 'monthKey', payload.contestMonth.monthKey, {
      monthKey: payload.contestMonth.monthKey,
      competitionName: payload.contestMonth.competitionName || '',
      displayLabelEn: payload.contestMonth.displayLabelEn || '',
      displayLabelKn: payload.contestMonth.displayLabelKn || '',
      startsAtIso: payload.contestMonth.startsAtIso || '',
      endsAtIso: payload.contestMonth.endsAtIso || '',
      status: payload.contestMonth.status || 'open',
      prizesJson: JSON.stringify(payload.contestMonth.prizes || []),
      winnersJson: JSON.stringify(payload.contestMonth.winners || []),
      winnersPublished: payload.contestMonth.winnersPublished ? 'TRUE' : 'FALSE',
      allowCarryOver: payload.contestMonth.allowCarryOver ? 'TRUE' : 'FALSE',
      finalizedAt: payload.contestMonth.finalizedAt || '',
      finalizedBy: payload.contestMonth.finalizedBy || '',
      createdAt: payload.contestMonth.createdAt || '',
      updatedAt: payload.contestMonth.updatedAt || ''
    });
  }

  if (payload.contestEntry && payload.contestEntry.id) {
    var eSheet = ensureSheetWithHeaders_(ss, 'ContestEntries', CONTEST_ENTRIES_HEADERS);
    upsertRowByKey_(eSheet, CONTEST_ENTRIES_HEADERS, 'id', payload.contestEntry.id, {
      id: payload.contestEntry.id,
      postId: payload.contestEntry.postId || '',
      slug: payload.contestEntry.slug || '',
      competitionMonth: payload.contestEntry.competitionMonth || '',
      contributorUserId: payload.contestEntry.contributorUserId || '',
      contributorName: payload.contestEntry.contributorName || '',
      title: payload.contestEntry.title || '',
      summary: payload.contestEntry.summary || '',
      location: payload.contestEntry.location || '',
      thumbnailUrl: payload.contestEntry.thumbnailUrl || '',
      publishedAt: payload.contestEntry.publishedAt || '',
      eligibility: payload.contestEntry.eligibility || 'eligible',
      disqualificationReason: payload.contestEntry.disqualificationReason || '',
      disqualifiedBy: payload.contestEntry.disqualifiedBy || '',
      disqualifiedAt: payload.contestEntry.disqualifiedAt || '',
      totalPageViews: Number(payload.contestEntry.totalPageViews) || 0,
      eligibleViews: Number(payload.contestEntry.eligibleViews) || 0,
      suspiciousBlockedViews: Number(payload.contestEntry.suspiciousBlockedViews) || 0,
      suspiciousFlagged: payload.contestEntry.suspiciousFlagged ? 'TRUE' : 'FALSE',
      lastViewedAt: payload.contestEntry.lastViewedAt || '',
      createdAt: payload.contestEntry.createdAt || '',
      updatedAt: payload.contestEntry.updatedAt || ''
    });
  }

  if (payload.deleteContestEntryByPostId) {
    var eDelSheet = ensureSheetWithHeaders_(ss, 'ContestEntries', CONTEST_ENTRIES_HEADERS);
    deleteRowsByColumnValue_(eDelSheet, CONTEST_ENTRIES_HEADERS, 'postId', payload.deleteContestEntryByPostId);
  }

  if (payload.contestAlert && payload.contestAlert.id) {
    var aSheet = ensureSheetWithHeaders_(ss, 'ContestAlerts', CONTEST_ALERTS_HEADERS);
    upsertRowByKey_(aSheet, CONTEST_ALERTS_HEADERS, 'id', payload.contestAlert.id, {
      id: payload.contestAlert.id,
      entryId: payload.contestAlert.entryId || '',
      articleSlug: payload.contestAlert.articleSlug || '',
      articleTitle: payload.contestAlert.articleTitle || '',
      competitionMonth: payload.contestAlert.competitionMonth || '',
      severity: payload.contestAlert.severity || 'medium',
      reason: payload.contestAlert.reason || '',
      blockedCount: Number(payload.contestAlert.blockedCount) || 1,
      detectedAt: payload.contestAlert.detectedAt || '',
      status: payload.contestAlert.status || 'open',
      adminNote: payload.contestAlert.adminNote || '',
      reviewedBy: payload.contestAlert.reviewedBy || '',
      reviewedAt: payload.contestAlert.reviewedAt || ''
    });
  }

  if (payload.contestAuditLog && payload.contestAuditLog.id) {
    var logSheet = ensureSheetWithHeaders_(ss, 'ContestAuditLogs', CONTEST_AUDIT_HEADERS);
    logSheet.appendRow(objectToRow_(payload.contestAuditLog, CONTEST_AUDIT_HEADERS));
  }

  if (Array.isArray(payload.viewBuckets)) {
    var bSheet = ensureSheetWithHeaders_(ss, 'ContestViewBuckets', CONTEST_VIEW_BUCKETS_HEADERS);
    var existingBuckets = readSheetRowsWithIndex_(bSheet, CONTEST_VIEW_BUCKETS_HEADERS);
    for (var bi = 0; bi < payload.viewBuckets.length; bi++) {
      var nb = payload.viewBuckets[bi];
      if (!nb || !nb.entryId || !nb.visitorHash) continue;
      var matchedBucket = null;
      for (var ei = 0; ei < existingBuckets.length; ei++) {
        if (
          String(existingBuckets[ei].record.entryId || '') === String(nb.entryId) &&
          String(existingBuckets[ei].record.visitorHash || '') === String(nb.visitorHash)
        ) {
          matchedBucket = existingBuckets[ei];
          break;
        }
      }
      var bucketRow = objectToRow_({
        entryId: nb.entryId,
        visitorHash: nb.visitorHash,
        lastEligibleAtMs: Number(nb.lastEligibleAtMs) || 0,
        hitCount: Number(nb.hitCount) || 1
      }, CONTEST_VIEW_BUCKETS_HEADERS);
      if (matchedBucket) {
        bSheet.getRange(matchedBucket.rowIndex, 1, 1, CONTEST_VIEW_BUCKETS_HEADERS.length).setValues([bucketRow]);
      } else {
        bSheet.appendRow(bucketRow);
      }
    }
  }

  return { ok: true };
}
