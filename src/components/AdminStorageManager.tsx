import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Database,
  Download,
  Eye,
  FileCode2,
  FileSpreadsheet,
  HardDrive,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { NEWS_CATEGORIES } from '../constants/newsData';
import { FIRESTORE_QUOTA_UPGRADE_URL } from '../services/firestoreOptimizer';
import {
  buildDetailedAuditRecords,
  buildMigrationReportCsv,
  buildMigrationReportJson,
  clearMigrationCheckpoint,
  computeMigrationProgress,
  createEmptyCheckpoint,
  loadMigrationCheckpoint,
  runMigrationVerification,
  runPaginatedFirebaseExport,
  runSheetsAndDriveMigration,
  saveMigrationCheckpoint,
  type MigrationCheckpoint,
} from '../services/firebaseMigrationService';
import {
  exportAllFromSheetsViaServer,
  fetchAppsScriptSourceCode,
  fetchAvailableBackupsViaServer,
  fetchStorageAdminHealth,
  flushPendingViewsViaServer,
  getSavedAppsScriptCredentials,
  previewBackupViaServer,
  restoreBackupViaServer,
  saveAppsScriptConfigViaServer,
  triggerBackupNowViaServer,
  type AdminStorageHealthResponse,
  type BackupListItem,
  type BackupPreviewResponse,
} from '../services/sheetsStorageClient';
import type { NewsArticle, ProgramEvent } from '../types/news';

interface AdminStorageManagerProps {
  currentArticles: NewsArticle[];
  currentEvents: ProgramEvent[];
  onDataChanged: () => Promise<void>;
  autoOpenBackups?: boolean;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimestamp(iso?: string | null): string {
  if (!iso) return 'Not yet recorded';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminStorageManager({
  currentArticles,
  currentEvents,
  onDataChanged,
  autoOpenBackups = false,
}: AdminStorageManagerProps) {
  const [health, setHealth] = useState<AdminStorageHealthResponse | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [flushingViews, setFlushingViews] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Restore drawer state
  const [restorePanelOpen, setRestorePanelOpen] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backups, setBackups] = useState<BackupListItem[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [backupPreview, setBackupPreview] = useState<BackupPreviewResponse | null>(null);
  const [selectedRestoreIds, setSelectedRestoreIds] = useState<Set<string>>(new Set());
  const [restoreMode, setRestoreMode] = useState<'deleted_only' | 'selected' | 'all'>('deleted_only');
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Resumable Historical Migration state (persisted in IndexedDB across reloads & quota resets)
  const [checkpoint, setCheckpoint] = useState<MigrationCheckpoint | null>(null);
  const [loadingCheckpoint, setLoadingCheckpoint] = useState(true);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [reportFilter, setReportFilter] = useState<'all' | 'failed' | 'verified' | 'pending'>('all');
  const [showDetailedReport, setShowDetailedReport] = useState(false);
  const [confirmResetCheckpoint, setConfirmResetCheckpoint] = useState(false);
  const pauseRequestedRef = useRef(false);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  // Apps Script code copy & runtime connection helper
  const [copiedCode, setCopiedCode] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState(
    () => getSavedAppsScriptCredentials().webAppUrl
  );
  const [appsScriptSecretInput, setAppsScriptSecretInput] = useState(
    () => getSavedAppsScriptCredentials().apiSecret
  );
  const [savingConfig, setSavingConfig] = useState(false);

  const handleCheckConnection = async (): Promise<AdminStorageHealthResponse | null> => {
    setCheckingConnection(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await fetchStorageAdminHealth();
      setHealth(res);
      if (res.configured && res.ok) {
        setFeedback('Google Sheets, Drive & Apps Script connection verified.');
      } else if (!res.configured) {
        setFeedback(
          res.message ||
            'Apps Script Web App secrets are not configured yet — paste your Apps Script URL and Secret below to connect.'
        );
      } else if (res.error) {
        setErrorMsg(res.error);
      }
      return res;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to check storage connection.');
      return null;
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleSaveAppsScriptConfig = async () => {
    const cleanUrl = appsScriptUrlInput.trim();
    const cleanSecret = appsScriptSecretInput.trim();
    if (!cleanUrl || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/i.test(cleanUrl)) {
      setErrorMsg(
        'Please enter a valid Google Apps Script Web App URL (https://script.google.com/macros/s/.../exec).'
      );
      return;
    }
    if (cleanSecret.length < 12) {
      setErrorMsg('Please enter your Apps Script API Secret (at least 12 characters).');
      return;
    }
    setSavingConfig(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await saveAppsScriptConfigViaServer({
        webAppUrl: cleanUrl,
        apiSecret: cleanSecret,
      });
      setHealth(res);
      if (res.configured && res.ok) {
        setShowConfigForm(false);
        setFeedback('Google Apps Script connected and verified! Google Sheets & Drive backups are now active.');
        if (autoOpenBackups) {
          await handleOpenRestorePanel(res);
        }
      } else {
        setErrorMsg(res.error || res.message || 'Could not verify Apps Script connection.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to connect Google Apps Script.');
    } finally {
      setSavingConfig(false);
    }
  };

  useEffect(() => {
    void handleCheckConnection().then((res) => {
      if (autoOpenBackups && res?.configured) {
        void handleOpenRestorePanel(res);
      }
    });
    void loadMigrationCheckpoint()
      .then((saved) => {
        if (saved) setCheckpoint(saved);
      })
      .finally(() => setLoadingCheckpoint(false));
  }, [autoOpenBackups]);

  const handleCreateBackupNow = async () => {
    let currentHealth = health;
    if (!currentHealth) {
      currentHealth = await handleCheckConnection();
    }
    if (!currentHealth?.configured) {
      setShowConfigForm(true);
      setErrorMsg('Connect Google Apps Script below before creating Drive backups.');
      return;
    }
    setCreatingBackup(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await triggerBackupNowViaServer();
      setFeedback(
        `Backup created successfully: ${res.jsonFileName || 'JSON'} & ${res.csvFileName || 'CSV'} (${res.articleCount ?? 0} articles, ${res.eventCount ?? 0} events).`
      );
      const refreshed = await handleCheckConnection();
      if (restorePanelOpen) {
        await handleOpenRestorePanel(refreshed);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create backup.');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleExportNews = async (format: 'json' | 'csv') => {
    setExporting(true);
    setErrorMsg('');
    setFeedback('');
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      if (health?.configured) {
        const exported = await exportAllFromSheetsViaServer();
        if (format === 'json') {
          downloadTextFile(
            `coffeenadu_news_export_${stamp}.json`,
            JSON.stringify(exported.data, null, 2),
            'application/json;charset=utf-8'
          );
        } else {
          downloadTextFile(
            `coffeenadu_news_export_${stamp}.csv`,
            exported.csv,
            'text/csv;charset=utf-8'
          );
        }
        setFeedback(`Exported ${format.toUpperCase()} snapshot from Google Sheets.`);
      } else {
        // Export local/Firebase cached snapshot even before Apps Script is connected
        const payload = {
          exportedAt: new Date().toISOString(),
          source: 'CoffeeNadu_Current_Portal_Backup',
          articles: currentArticles,
          events: currentEvents,
          categories: NEWS_CATEGORIES,
        };
        if (format === 'json') {
          downloadTextFile(
            `coffeenadu_firebase_backup_${stamp}.json`,
            JSON.stringify(payload, null, 2),
            'application/json;charset=utf-8'
          );
        } else {
          const cols = ['id', 'titleKannada', 'summaryKannada', 'category', 'location', 'reporter', 'publishedDate', 'publishedTime', 'viewCount', 'isFeatured'];
          const lines = [cols.join(',')];
          for (const a of currentArticles) {
            const rec = a as unknown as Record<string, unknown>;
            lines.push(
              cols
                .map((c) => `"${String(rec[c] ?? '').replace(/"/g, '""')}"`)
                .join(',')
            );
          }
          downloadTextFile(
            `coffeenadu_firebase_backup_${stamp}.csv`,
            lines.join('\n'),
            'text/csv;charset=utf-8'
          );
        }
        setFeedback(
          `Downloaded ${format.toUpperCase()} backup of ${currentArticles.length} loaded news articles and ${currentEvents.length} events.`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to export news.');
    } finally {
      setExporting(false);
    }
  };

  const handleFlushViews = async () => {
    setFlushingViews(true);
    setErrorMsg('');
    try {
      const res = await flushPendingViewsViaServer();
      setFeedback(
        res.flushed
          ? `Flushed aggregated views for ${res.count} items to Google Sheets in a single batch write.`
          : 'No pending view counts waiting to flush.'
      );
      await handleCheckConnection();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to flush views.');
    } finally {
      setFlushingViews(false);
    }
  };

  const handleOpenRestorePanel = async (knownHealth?: AdminStorageHealthResponse | null) => {
    let currentHealth = knownHealth ?? health;
    if (!currentHealth) {
      currentHealth = await handleCheckConnection();
    }
    if (!currentHealth?.configured) {
      setShowConfigForm(true);
      setErrorMsg('Paste your Google Apps Script Web App URL & API Secret below to connect and browse Drive backups.');
      return;
    }
    setRestorePanelOpen(true);
    setLoadingBackups(true);
    setErrorMsg('');
    try {
      const list = await fetchAvailableBackupsViaServer();
      setBackups(list);
      if (list.length > 0 && !selectedBackupId) {
        await handlePreviewBackup(list[0].fileId);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load available backups.');
    } finally {
      setLoadingBackups(false);
    }
  };

  const handlePreviewBackup = async (fileId: string) => {
    setSelectedBackupId(fileId);
    setLoadingPreview(true);
    setBackupPreview(null);
    setSelectedRestoreIds(new Set());
    setConfirmRestoreOpen(false);
    setErrorMsg('');
    try {
      const preview = await previewBackupViaServer(fileId);
      setBackupPreview(preview);
      // Pre-select deleted/missing articles so accidental deletion recovery is 1 click
      const missingOrDeleted = preview.previewNews
        .filter((n) => !n.existsInCurrent || n.isDeletedInCurrent)
        .map((n) => n.newsId);
      setSelectedRestoreIds(new Set(missingOrDeleted));
      if (missingOrDeleted.length > 0) {
        setRestoreMode('deleted_only');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to preview backup contents.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleRestoreArticleId = (newsId: string) => {
    setSelectedRestoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(newsId)) next.delete(newsId);
      else next.add(newsId);
      return next;
    });
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackupId) return;
    if (restoreMode === 'selected' && selectedRestoreIds.size === 0) {
      setErrorMsg('Select at least one article to restore, or choose Recover Deleted / Restore All.');
      return;
    }
    setRestoring(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const result = await restoreBackupViaServer({
        fileId: selectedBackupId,
        mode: restoreMode,
        selectedIds: Array.from(selectedRestoreIds),
      });
      setConfirmRestoreOpen(false);
      setFeedback(
        `Restore complete: ${result.restoredCount} articles restored (${result.skippedCount} untouched). Safety backup created first: ${result.safetyBackupFileName}`
      );
      await onDataChanged();
      await handleCheckConnection();
      await handlePreviewBackup(selectedBackupId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setRestoring(false);
    }
  };

  const handleStartOrResumeFullMigration = async (exportOnly = false) => {
    if (!exportOnly && !health?.configured) {
      setErrorMsg('Connect Google Apps Script first, or use "Paginated Firebase Export (Read-Only)" to stage all historical records right now.');
      return;
    }

    pauseRequestedRef.current = false;
    setMigrationBusy(true);
    setErrorMsg('');
    setFeedback('');
    setConfirmResetCheckpoint(false);

    try {
      let activeCp = checkpoint ?? createEmptyCheckpoint('firebase_paginated');

      // Phase 1: Paginated read-only export of ALL historical Firebase articles & events
      if (activeCp.source === 'firebase_paginated' && (!activeCp.articlesExportComplete || !activeCp.eventsExportComplete)) {
        activeCp = await runPaginatedFirebaseExport(activeCp, {
          onProgress: (next) => setCheckpoint(next),
          shouldPause: () => pauseRequestedRef.current,
        });

        if (activeCp.status === 'paused_quota' || activeCp.status === 'paused_user') {
          if (activeCp.lastError) setErrorMsg(activeCp.lastError);
          else setFeedback(activeCp.statusMessage);
          return;
        }
      }

      if (exportOnly) {
        setFeedback(
          `Read-only Firebase export complete: ${activeCp.articles.length} historical articles, ${activeCp.events.length} events, ${activeCp.categories.length} categories saved in checkpoint.`
        );
        return;
      }

      if (activeCp.articles.length === 0 && activeCp.events.length === 0) {
        setErrorMsg('No historical Firebase articles or events were found to migrate.');
        return;
      }

      // Phase 2: Batched idempotent upload to Google Sheets + Base64 -> Google Drive photos
      activeCp = await runSheetsAndDriveMigration(activeCp, {
        onProgress: (next) => setCheckpoint(next),
        shouldPause: () => pauseRequestedRef.current,
      });

      if (activeCp.status === 'paused_user') {
        if (activeCp.lastError) setErrorMsg(activeCp.lastError);
        else setFeedback(activeCp.statusMessage);
        return;
      }

      // Phase 3: Mandatory end-to-end verification against live Google Sheets rows
      activeCp = await runMigrationVerification(activeCp, (next) => setCheckpoint(next));
      setShowDetailedReport(true);

      if (activeCp.status === 'verified_complete') {
        setFeedback(activeCp.statusMessage);
      } else if (activeCp.lastError) {
        setErrorMsg(activeCp.lastError);
      } else {
        setFeedback(activeCp.statusMessage);
      }

      await onDataChanged();
      await handleCheckConnection();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Migration interrupted. Progress has been saved safely.');
    } finally {
      setMigrationBusy(false);
    }
  };

  const handleMigrateStagedRecordsOnly = async (retryFailedOnly = false) => {
    if (!health?.configured) {
      setErrorMsg('Connect Google Apps Script first before uploading staged records to Google Sheets & Drive.');
      return;
    }
    if (!checkpoint || (checkpoint.articles.length === 0 && checkpoint.events.length === 0)) {
      setErrorMsg('No staged historical records in checkpoint yet.');
      return;
    }

    pauseRequestedRef.current = false;
    setMigrationBusy(true);
    setErrorMsg('');
    setFeedback('');

    try {
      let activeCp = await runSheetsAndDriveMigration(checkpoint, {
        onProgress: (next) => setCheckpoint(next),
        shouldPause: () => pauseRequestedRef.current,
        retryFailedOnly,
      });

      if (activeCp.status === 'paused_user') {
        if (activeCp.lastError) setErrorMsg(activeCp.lastError);
        else setFeedback(activeCp.statusMessage);
        return;
      }

      activeCp = await runMigrationVerification(activeCp, (next) => setCheckpoint(next));
      setShowDetailedReport(true);
      setFeedback(activeCp.statusMessage);
      await onDataChanged();
      await handleCheckConnection();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to migrate staged records.');
    } finally {
      setMigrationBusy(false);
    }
  };

  const handleVerifyNow = async () => {
    if (!health?.configured) {
      setErrorMsg('Connect Google Apps Script first to verify records in Google Sheets.');
      return;
    }
    if (!checkpoint || (checkpoint.articles.length === 0 && checkpoint.events.length === 0)) {
      setErrorMsg('No staged historical records to verify yet.');
      return;
    }

    setMigrationBusy(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const verifiedCp = await runMigrationVerification(checkpoint, (next) => setCheckpoint(next));
      setShowDetailedReport(true);
      if (verifiedCp.status === 'verified_complete') {
        setFeedback(verifiedCp.statusMessage);
      } else {
        setErrorMsg(verifiedCp.lastError || verifiedCp.statusMessage);
      }
      await handleCheckConnection();
    } finally {
      setMigrationBusy(false);
    }
  };

  const handlePauseMigration = () => {
    pauseRequestedRef.current = true;
    setFeedback('Pausing safely after the current page/batch completes. All progress is preserved.');
  };

  const handleResetCheckpoint = async () => {
    await clearMigrationCheckpoint();
    setCheckpoint(null);
    setConfirmResetCheckpoint(false);
    setShowDetailedReport(false);
    setFeedback('Cleared local migration checkpoint. No Firebase or Google Sheets data was touched.');
  };

  const handleImportJsonForMigration = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setFeedback('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        articles?: NewsArticle[];
        news?: NewsArticle[];
        events?: ProgramEvent[];
        categories?: string[];
      };
      const importedArticles = Array.isArray(parsed.articles)
        ? parsed.articles
        : Array.isArray(parsed.news)
        ? parsed.news
        : [];
      const importedEvents = Array.isArray(parsed.events) ? parsed.events : [];
      if (importedArticles.length === 0 && importedEvents.length === 0) {
        setErrorMsg('No articles or events found inside that JSON file.');
        return;
      }

      const catSet = new Set<string>([...NEWS_CATEGORIES, ...(Array.isArray(parsed.categories) ? parsed.categories : [])]);
      for (const art of importedArticles) {
        if (art.category) catSet.add(art.category);
      }

      const nextCp: MigrationCheckpoint = {
        ...createEmptyCheckpoint('json_import'),
        status: 'export_complete_ready_to_migrate',
        statusMessage: `Loaded ${importedArticles.length} articles and ${importedEvents.length} events from JSON backup. Ready to migrate and verify.`,
        totalArticlesInFirebase: importedArticles.length,
        totalEventsInFirebase: importedEvents.length,
        articlesExportComplete: true,
        eventsExportComplete: true,
        articles: importedArticles,
        events: importedEvents,
        categories: Array.from(catSet),
      };
      await saveMigrationCheckpoint(nextCp);
      setCheckpoint(nextCp);
      setFeedback(
        `Staged ${importedArticles.length} articles and ${importedEvents.length} events from JSON backup. Click "Migrate & Verify Staged Records" to upload and verify.`
      );
    } catch {
      setErrorMsg('Invalid JSON backup file. Please choose a CoffeeNadu JSON export file.');
    } finally {
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
    }
  };

  const handleDownloadStagedFirebaseBackup = () => {
    if (!checkpoint) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = {
      exportedAt: new Date().toISOString(),
      source: 'CoffeeNadu_Firebase_Paginated_Export',
      exportComplete: checkpoint.articlesExportComplete && checkpoint.eventsExportComplete,
      articlesCount: checkpoint.articles.length,
      eventsCount: checkpoint.events.length,
      articles: checkpoint.articles,
      events: checkpoint.events,
      categories: checkpoint.categories,
    };
    downloadTextFile(
      `coffeenadu_firebase_historical_export_${stamp}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
    setFeedback(
      `Downloaded JSON backup of ${checkpoint.articles.length} exported historical articles and ${checkpoint.events.length} events.`
    );
  };

  const handleDownloadMigrationReport = (format: 'json' | 'csv') => {
    if (!checkpoint) return;
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      downloadTextFile(
        `coffeenadu_migration_report_${stamp}.json`,
        buildMigrationReportJson(checkpoint),
        'application/json;charset=utf-8'
      );
    } else {
      downloadTextFile(
        `coffeenadu_migration_report_${stamp}.csv`,
        buildMigrationReportCsv(checkpoint),
        'text/csv;charset=utf-8'
      );
    }
    setFeedback(`Downloaded detailed ${format.toUpperCase()} migration verification report.`);
  };

  const handleCopyAppsScriptCode = async () => {
    setLoadingCode(true);
    setErrorMsg('');
    try {
      const code = await fetchAppsScriptSourceCode();
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setFeedback('Copied complete apps-script/Code.gs to clipboard. Paste it into script.google.com.');
      window.setTimeout(() => setCopiedCode(false), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to copy Apps Script code.');
    } finally {
      setLoadingCode(false);
    }
  };

  const deletedOrMissingCount = useMemo(() => {
    if (!backupPreview) return 0;
    return backupPreview.previewNews.filter((n) => !n.existsInCurrent || n.isDeletedInCurrent).length;
  }, [backupPreview]);

  const migrationProgress = useMemo(() => {
    if (!checkpoint) return null;
    return computeMigrationProgress(checkpoint);
  }, [checkpoint]);

  const detailedAuditRecords = useMemo(() => {
    if (!checkpoint) return [];
    return buildDetailedAuditRecords(checkpoint);
  }, [checkpoint]);

  const filteredAuditRecords = useMemo(() => {
    if (reportFilter === 'all') return detailedAuditRecords;
    if (reportFilter === 'failed') return detailedAuditRecords.filter((r) => r.state === 'failed');
    if (reportFilter === 'verified') {
      return detailedAuditRecords.filter(
        (r) => r.state === 'verified' || r.state === 'migrated' || r.state === 'duplicate'
      );
    }
    return detailedAuditRecords.filter((r) => r.state === 'exported');
  }, [detailedAuditRecords, reportFilter]);

  const isConnected = Boolean(health?.configured && health?.ok);
  const hasSavedCheckpoint = Boolean(
    checkpoint &&
      (checkpoint.articles.length > 0 ||
        checkpoint.events.length > 0 ||
        checkpoint.articlesLastDocId ||
        checkpoint.eventsLastDocId ||
        checkpoint.status === 'paused_quota')
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-950 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-emerald-900" aria-hidden="true" />
            <span>Free Storage, Backups &amp; Restore</span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
            Google Sheets database, Google Drive image archive, automated daily backups &amp; 7-minute traffic cache (₹0/month).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCheckConnection}
            disabled={checkingConnection}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 rounded-md cursor-pointer min-h-[40px]"
          >
            {checkingConnection ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            )}
            <span>Check Storage Connection</span>
          </button>

          <button
            type="button"
            onClick={handleCreateBackupNow}
            disabled={creatingBackup || !isConnected}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 rounded-md cursor-pointer min-h-[40px]"
          >
            {creatingBackup ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            )}
            <span>Create Backup Now</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenRestorePanel()}
            disabled={!isConnected}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F274A] hover:bg-[#173a6e] disabled:opacity-50 rounded-md cursor-pointer min-h-[40px]"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Restore Backup</span>
          </button>

          <button
            type="button"
            onClick={() => setShowConfigForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-md cursor-pointer min-h-[40px]"
          >
            <FileCode2 className="w-4 h-4 text-amber-800" aria-hidden="true" />
            <span>{isConnected ? 'Apps Script Settings' : 'Connect Google Apps Script'}</span>
          </button>
        </div>
      </div>

      {(!isConnected || showConfigForm) && (
        <div className="bg-amber-50/70 border border-amber-300 rounded-lg p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-stone-950">
                Connect Google Apps Script (Google Sheets &amp; Drive Backups)
              </h2>
              <p className="text-xs text-stone-600 mt-0.5">
                Enter your deployed Google Apps Script Web App URL and API Secret below to connect immediately on Cloudflare Pages or any server.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyAppsScriptCode}
              disabled={loadingCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 rounded-md cursor-pointer shrink-0"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied Code.gs' : 'Copy Code.gs'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-7">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-700 mb-1">
                Apps Script Web App URL (APPS_SCRIPT_WEBAPP_URL)
              </label>
              <input
                type="url"
                value={appsScriptUrlInput}
                onChange={(e) => setAppsScriptUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900"
              />
            </div>
            <div className="md:col-span-5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-700 mb-1">
                Apps Script API Secret (APPS_SCRIPT_API_SECRET)
              </label>
              <input
                type="password"
                value={appsScriptSecretInput}
                onChange={(e) => setAppsScriptSecretInput(e.target.value)}
                placeholder="Enter your 12+ character secret key"
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {showConfigForm && (
              <button
                type="button"
                onClick={() => setShowConfigForm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 cursor-pointer"
              >
                Close
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSaveAppsScriptConfig()}
              disabled={savingConfig}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 rounded-md cursor-pointer"
            >
              {savingConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>{savingConfig ? 'Verifying & Connecting...' : 'Save & Connect Google Apps Script'}</span>
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className="px-4 py-3 text-xs sm:text-sm font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md flex items-start gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="px-4 py-3 text-xs sm:text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-md flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Storage Status Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Storage Backend
          </p>
          <p className={`text-sm font-bold mt-1 ${isConnected ? 'text-emerald-800' : 'text-amber-800'}`}>
            {isConnected ? 'Connected · Google Sheets + Drive' : 'Setup Pending · Firebase Fallback'}
          </p>
          <p className="text-[11px] text-stone-500 mt-1">
            {isConnected
              ? `Sheet: ${health?.spreadsheetName || 'CoffeeNadu_News_Database'}`
              : 'Deploy Apps Script to switch to ₹0/month storage'}
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Total News &amp; Categories
          </p>
          <p className="text-xl font-bold text-stone-950 mt-1 tabular-nums">
            {isConnected ? health?.totalNews ?? 0 : currentArticles.length}{' '}
            <span className="text-xs font-medium text-stone-500">
              news · {isConnected ? health?.totalCategories ?? NEWS_CATEGORIES.length : NEWS_CATEGORIES.length} categories
            </span>
          </p>
          <p className="text-[11px] text-stone-500 mt-1">
            Events: {isConnected ? health?.totalEvents ?? 0 : currentEvents.length}
            {isConnected && (health?.deletedNews ?? 0) > 0 ? ` · Recoverable deleted: ${health?.deletedNews}` : ''}
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Last Successful Backup
          </p>
          <p className="text-sm font-bold text-stone-950 mt-1">
            {isConnected ? formatTimestamp(health?.lastBackupAt) : 'Awaiting Apps Script'}
          </p>
          <p className="text-[11px] text-stone-600 mt-1 truncate" title={health?.backupStatus || ''}>
            Status: {isConnected ? health?.backupStatus || 'Ready' : 'Not connected'} · Available: {health?.availableBackups ?? 0}
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Image Storage &amp; Migration
          </p>
          <p className="text-sm font-bold text-stone-950 mt-1 truncate">
            {isConnected ? health?.imageStorageStatus || 'Google Drive Ready' : 'Local / Base64 Active'}
          </p>
          <p className="text-[11px] text-stone-600 mt-1 truncate">
            Migration: {isConnected ? health?.migrationStatus || 'Pending' : 'Ready when connected'}
          </p>
        </div>
      </div>

      {/* Traffic & Free Quota Monitor */}
      {health?.quota && (
        <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-stone-950 flex items-center gap-2">
                <Database className="w-4 h-4 text-[#0F274A]" aria-hidden="true" />
                <span>High-Traffic Cache &amp; Google Free Quota Monitor</span>
              </h2>
              <p className="text-xs text-stone-500">
                Designed for 3,600+ daily views: 7-minute server cache + disk-cached Drive image proxy + 5-minute batched view writes.
              </p>
            </div>
            <button
              type="button"
              onClick={handleFlushViews}
              disabled={flushingViews || !isConnected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 rounded-md cursor-pointer"
            >
              {flushingViews ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              <span>Flush Pending Views ({health.quota.pendingViewsCount})</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-stone-50 border border-stone-200 rounded-md p-3">
              <span className="text-stone-500 block">Apps Script Calls Today</span>
              <strong className="text-stone-950 text-base tabular-nums">
                {health.quota.appsScriptCallsToday} / {health.quota.dailyFreeLimitCalls.toLocaleString()}
              </strong>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-md p-3">
              <span className="text-stone-500 block">Server Cache Hit Rate</span>
              <strong className="text-emerald-800 text-base tabular-nums">
                {health.quota.cacheHitRatePct}%
              </strong>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-md p-3">
              <span className="text-stone-500 block">Aggregated Views Today</span>
              <strong className="text-stone-950 text-base tabular-nums">
                {health.quota.totalViewsAggregatedToday} ({health.quota.batchedViewFlushesToday} batches)
              </strong>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-md p-3">
              <span className="text-stone-500 block">Cached Drive Photos</span>
              <strong className="text-stone-950 text-base tabular-nums">
                {health.quota.cachedDriveImagesCount} files ({health.quota.driveProxyCacheHitsToday} hits)
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Complete Resumable Historical Migration Center */}
      <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-stone-200 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
                <CloudUpload className="w-4 h-4 text-emerald-900" aria-hidden="true" />
                <span>Full Historical Firebase → Google Sheets &amp; Drive Migration</span>
              </h2>
              {checkpoint && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                    checkpoint.status === 'verified_complete'
                      ? 'bg-emerald-100 text-emerald-900'
                      : checkpoint.status === 'paused_quota'
                      ? 'bg-amber-100 text-amber-950'
                      : checkpoint.status === 'completed_with_failures'
                      ? 'bg-red-100 text-red-900'
                      : 'bg-stone-100 text-stone-800'
                  }`}
                >
                  {checkpoint.status === 'verified_complete'
                    ? 'Verified Complete'
                    : checkpoint.status === 'paused_quota'
                    ? 'Paused — Firebase Quota Limit (Progress Saved)'
                    : checkpoint.status === 'paused_user'
                    ? 'Paused (Progress Saved)'
                    : checkpoint.status === 'exporting_firebase'
                    ? 'Exporting Historical Firebase Records...'
                    : checkpoint.status === 'migrating_to_sheets'
                    ? 'Uploading to Sheets & Drive...'
                    : checkpoint.status === 'verifying'
                    ? 'Verifying Every Record...'
                    : checkpoint.status === 'completed_with_failures'
                    ? 'Incomplete — Verification Issues Found'
                    : checkpoint.status === 'export_complete_ready_to_migrate'
                    ? 'Export Complete — Ready to Migrate'
                    : 'Ready'}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Paginates through <strong>every historical article, event, category, and Base64 photograph</strong> in Firebase Firestore (not just the {currentArticles.length} articles currently shown in the dashboard), preserves original Firebase document IDs and publishing dates, uploads Base64 images to Google Drive (<code className="text-stone-800">CoffeeNadu_News_Images</code>), verifies every migrated record, and <strong>never deletes or modifies Firebase data</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {migrationBusy ? (
              <button
                type="button"
                onClick={handlePauseMigration}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md cursor-pointer min-h-[40px]"
              >
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pause Safely</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleStartOrResumeFullMigration(false)}
                disabled={!isConnected || loadingCheckpoint}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 rounded-md cursor-pointer min-h-[40px]"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {hasSavedCheckpoint && !migrationProgress?.isFullyVerifiedComplete
                    ? 'Resume Full Migration'
                    : 'Start Full Historical Migration'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleStartOrResumeFullMigration(true)}
              disabled={migrationBusy || loadingCheckpoint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 disabled:opacity-50 rounded-md cursor-pointer min-h-[40px]"
            >
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {hasSavedCheckpoint && !migrationProgress?.exportComplete
                  ? 'Resume Firebase Export'
                  : 'Paginated Firebase Export (Read-Only)'}
              </span>
            </button>

            <input
              ref={jsonFileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportJsonForMigration}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => jsonFileInputRef.current?.click()}
              disabled={migrationBusy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 rounded-md cursor-pointer min-h-[40px]"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Import JSON Backup</span>
            </button>
          </div>
        </div>

        {/* Firebase Quota Exhaustion Pause Notice */}
        {checkpoint?.status === 'paused_quota' && (
          <div className="bg-amber-50 border border-amber-300 rounded-md p-3.5 text-xs text-amber-950 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                <span>Firebase Daily Free Read Quota Reached — Progress Safely Preserved</span>
              </p>
              <a
                href={FIRESTORE_QUOTA_UPGRADE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-2.5 py-1 text-[11px] font-semibold text-amber-950 bg-white border border-amber-400 hover:bg-amber-100 rounded whitespace-nowrap"
              >
                Open Firebase Quota Console
              </a>
            </div>
            <p className="leading-relaxed">
              Your exact Firestore cursor (articles cursor: <code>{checkpoint.articlesLastDocId || 'start'}</code>, events cursor: <code>{checkpoint.eventsLastDocId || 'start'}</code>) and all <strong>{checkpoint.articles.length} exported articles</strong> &amp; <strong>{checkpoint.events.length} events</strong> are saved in browser IndexedDB storage. Migration is <strong>NOT marked complete</strong>. When Firebase&apos;s daily free quota resets tomorrow, simply click <strong>Resume Full Migration</strong> to continue from the exact next document without re-reading earlier records.
            </p>
            {isConnected && (checkpoint.articles.length > 0 || checkpoint.events.length > 0) && (migrationProgress?.remainingToMigrate ?? 0) > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => void handleMigrateStagedRecordsOnly(false)}
                  disabled={migrationBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded cursor-pointer"
                >
                  <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    Migrate {migrationProgress?.remainingToMigrate} Already-Exported Records to Sheets &amp; Drive Now
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Live Progress Indicator & Exact Counters */}
        {checkpoint && migrationProgress && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-stone-900 flex items-center gap-1.5">
                  {migrationBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-800" aria-hidden="true" />}
                  <span>{checkpoint.statusMessage}</span>
                </span>
                <span className="font-bold tabular-nums text-stone-800">
                  {migrationProgress.overallProgressPct}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    migrationProgress.isFullyVerifiedComplete
                      ? 'bg-emerald-700'
                      : checkpoint.status === 'paused_quota'
                      ? 'bg-amber-500'
                      : checkpoint.status === 'completed_with_failures'
                      ? 'bg-red-600'
                      : 'bg-[#0F274A]'
                  }`}
                  style={{ width: `${migrationProgress.overallProgressPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              <div className="bg-stone-50 border border-stone-200 rounded-md p-2.5">
                <span className="text-[11px] text-stone-500 block">Total Records</span>
                <strong className="text-sm text-stone-950 tabular-nums">
                  {migrationProgress.totalKnownRecords}
                </strong>
                <span className="text-[10px] text-stone-500 block">
                  {checkpoint.totalArticlesInFirebase ?? checkpoint.articles.length} news · {checkpoint.totalEventsInFirebase ?? checkpoint.events.length} events
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-md p-2.5">
                <span className="text-[11px] text-stone-500 block">Exported (Firebase)</span>
                <strong className="text-sm text-stone-950 tabular-nums">
                  {migrationProgress.exportedRecords}
                </strong>
                <span className="text-[10px] text-stone-500 block">
                  {migrationProgress.exportComplete
                    ? 'All history exported'
                    : migrationProgress.remainingToExport !== null
                    ? `${migrationProgress.remainingToExport} remaining`
                    : 'Export incomplete'}
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-md p-2.5">
                <span className="text-[11px] text-stone-500 block">Completed (Sheets)</span>
                <strong className="text-sm text-emerald-900 tabular-nums">
                  {migrationProgress.completedMigrationRecords}
                </strong>
                <span className="text-[10px] text-stone-500 block">
                  {migrationProgress.duplicateRecords} duplicates skipped
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-md p-2.5">
                <span className="text-[11px] text-stone-500 block">Remaining to Migrate</span>
                <strong className="text-sm text-stone-950 tabular-nums">
                  {migrationProgress.remainingToMigrate + (migrationProgress.remainingToExport ?? 0)}
                </strong>
                <span className="text-[10px] text-stone-500 block">
                  {migrationProgress.remainingToMigrate} staged pending
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-md p-2.5">
                <span className="text-[11px] text-stone-500 block">Drive Photos Uploaded</span>
                <strong className="text-sm text-[#0F274A] tabular-nums">
                  {checkpoint.migratedDriveImagesCount}
                </strong>
                <span className="text-[10px] text-stone-500 block">
                  {checkpoint.categories.length} categories synced
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-md p-2.5">
                <span className="text-[11px] text-stone-500 block">Verified / Failed</span>
                <strong className="text-sm tabular-nums">
                  <span className="text-emerald-800">{migrationProgress.verifiedRecords}</span>
                  {' / '}
                  <span className={migrationProgress.failedRecords > 0 ? 'text-red-700' : 'text-stone-600'}>
                    {migrationProgress.failedRecords}
                  </span>
                </strong>
                <span className="text-[10px] text-stone-500 block">
                  {migrationProgress.isFullyVerifiedComplete ? '100% verified' : 'Verification required'}
                </span>
              </div>
            </div>

            {/* Secondary Migration Controls & Reports */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {isConnected && migrationProgress.remainingToMigrate > 0 && (
                <button
                  type="button"
                  onClick={() => void handleMigrateStagedRecordsOnly(false)}
                  disabled={migrationBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 rounded cursor-pointer"
                >
                  <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Migrate &amp; Verify Staged ({migrationProgress.remainingToMigrate})</span>
                </button>
              )}

              {isConnected && (checkpoint.failedArticles.length > 0 || checkpoint.failedEvents.length > 0) && (
                <button
                  type="button"
                  onClick={() => void handleMigrateStagedRecordsOnly(true)}
                  disabled={migrationBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Retry Failed ({checkpoint.failedArticles.length + checkpoint.failedEvents.length})</span>
                </button>
              )}

              {isConnected && migrationProgress.exportedRecords > 0 && (
                <button
                  type="button"
                  onClick={() => void handleVerifyNow()}
                  disabled={migrationBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0F274A] hover:bg-[#173a6e] disabled:opacity-50 rounded cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Verify All Records</span>
                </button>
              )}

              {migrationProgress.exportedRecords > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadStagedFirebaseBackup}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Download Exported Firebase JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadMigrationReport('json')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Report (JSON)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadMigrationReport('csv')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Report (CSV)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDetailedReport((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0F274A] bg-stone-50 border border-stone-300 hover:bg-stone-100 rounded cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{showDetailedReport ? 'Hide Detailed Report' : `View Record Report (${detailedAuditRecords.length})`}</span>
                  </button>
                </>
              )}

              {!confirmResetCheckpoint ? (
                <button
                  type="button"
                  onClick={() => setConfirmResetCheckpoint(true)}
                  disabled={migrationBusy}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reset Checkpoint</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 ml-auto text-xs">
                  <span className="text-stone-700">Clear saved local progress?</span>
                  <button
                    type="button"
                    onClick={() => void handleResetCheckpoint()}
                    className="px-2.5 py-1 font-semibold text-white bg-red-700 hover:bg-red-800 rounded cursor-pointer"
                  >
                    Yes, Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetCheckpoint(false)}
                    className="px-2.5 py-1 font-medium text-stone-700 bg-stone-100 rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Itemized Migration Verification Report Table */}
            {showDetailedReport && detailedAuditRecords.length > 0 && (
              <div className="border border-stone-200 rounded-md overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-900">
                    Itemized Migration &amp; Verification Report
                  </span>
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    {(['all', 'failed', 'verified', 'pending'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setReportFilter(tab)}
                        className={`px-2 py-1 rounded font-semibold cursor-pointer ${
                          reportFilter === tab
                            ? 'bg-[#0F274A] text-white'
                            : 'bg-white text-stone-700 border border-stone-200'
                        }`}
                      >
                        {tab === 'all'
                          ? `All (${detailedAuditRecords.length})`
                          : tab === 'failed'
                          ? `Failed (${detailedAuditRecords.filter((r) => r.state === 'failed').length})`
                          : tab === 'verified'
                          ? `Successful (${detailedAuditRecords.filter((r) => r.state === 'verified' || r.state === 'migrated' || r.state === 'duplicate').length})`
                          : `Pending (${detailedAuditRecords.filter((r) => r.state === 'exported').length})`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="max-h-[260px] overflow-y-auto divide-y divide-stone-100 text-xs">
                  {filteredAuditRecords.length === 0 ? (
                    <p className="p-4 text-center text-stone-500">No records match this filter.</p>
                  ) : (
                    filteredAuditRecords.map((rec) => (
                      <div key={`${rec.entityType}:${rec.id}`} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div className="min-w-0">
                          <p className="font-semibold text-stone-900 font-kannada truncate">
                            {rec.title}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            ID: <code>{rec.id}</code> · {rec.entityType === 'article' ? rec.category : 'Event'} · {rec.publishedDate || 'No date'}
                            {rec.hadBase64Image ? ' · Base64→Drive photo' : ''}
                          </p>
                          {rec.error && (
                            <p className="text-[11px] font-medium text-red-700 mt-0.5">{rec.error}</p>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0 self-start sm:self-center ${
                            rec.state === 'verified'
                              ? 'bg-emerald-100 text-emerald-900'
                              : rec.state === 'migrated'
                              ? 'bg-sky-100 text-sky-900'
                              : rec.state === 'duplicate'
                              ? 'bg-stone-200 text-stone-800'
                              : rec.state === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {rec.state === 'verified'
                            ? 'Verified'
                            : rec.state === 'migrated'
                            ? 'Migrated (Unverified)'
                            : rec.state === 'duplicate'
                            ? 'Duplicate Skipped'
                            : rec.state === 'failed'
                            ? 'Failed'
                            : 'Exported (Pending)'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Export News & Data Backup Card */}
      <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-bold text-stone-950 flex items-center gap-2">
          <Download className="w-4 h-4 text-emerald-900" aria-hidden="true" />
          <span>Export Live Storage Data (JSON &amp; CSV)</span>
        </h2>
        <p className="text-xs text-stone-600 leading-relaxed">
          {isConnected
            ? 'Download a complete snapshot of all published news, metadata, and categories directly from Google Sheets in JSON or CSV format.'
            : `Download a quick snapshot of the ${currentArticles.length} currently loaded news articles (or use "Paginated Firebase Export" above to export every historical Firebase record).`}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleExportNews('json')}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F274A] hover:bg-[#173a6e] disabled:opacity-50 rounded-md cursor-pointer min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export News (JSON)</span>
          </button>
          <button
            type="button"
            onClick={() => handleExportNews('csv')}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 rounded-md cursor-pointer min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export News (CSV)</span>
          </button>
        </div>
      </div>

      {/* Restore Backup Panel */}
      {restorePanelOpen && (
        <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-stone-950 flex items-center gap-2">
                <History className="w-4 h-4 text-[#0F274A]" aria-hidden="true" />
                <span>Backup Browser &amp; Safe Restore</span>
              </h2>
              <p className="text-xs text-stone-600">
                A fresh safety backup of your current live sheet is automatically created before any restore runs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRestorePanelOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-md cursor-pointer"
            >
              Close
            </button>
          </div>

          {loadingBackups ? (
            <div className="py-8 text-center text-xs text-stone-500">Loading Drive backups...</div>
          ) : backups.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-500">
              No backups found yet. Click <strong>Create Backup Now</strong> above to create your first snapshot.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Backup list */}
              <div className="lg:col-span-4 border border-stone-200 rounded-md divide-y divide-stone-200 max-h-[360px] overflow-y-auto">
                {backups.map((b) => {
                  const active = selectedBackupId === b.fileId;
                  return (
                    <button
                      key={b.fileId}
                      type="button"
                      onClick={() => void handlePreviewBackup(b.fileId)}
                      className={`w-full text-left p-3 cursor-pointer transition-colors ${
                        active ? 'bg-emerald-50 border-l-4 border-l-emerald-800' : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-stone-900 truncate">{b.fileName}</span>
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            b.tier === 'monthly'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {b.tier}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 mt-1">
                        {formatTimestamp(b.createdAt)} · {formatBytes(b.sizeBytes)}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Backup Preview & Selective Restore */}
              <div className="lg:col-span-8 border border-stone-200 rounded-md p-4 space-y-3">
                {loadingPreview ? (
                  <div className="py-10 text-center text-xs text-stone-500">
                    Reading backup contents...
                  </div>
                ) : backupPreview ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3">
                      <div>
                        <p className="text-sm font-bold text-stone-950">{backupPreview.fileName}</p>
                        <p className="text-xs text-stone-600">
                          {backupPreview.newsCount} news · {backupPreview.eventsCount} events · {deletedOrMissingCount} missing or deleted in live site
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRestoreMode('deleted_only')}
                          className={`px-2.5 py-1.5 text-xs font-semibold rounded cursor-pointer ${
                            restoreMode === 'deleted_only'
                              ? 'bg-[#0F274A] text-white'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          Recover Deleted ({deletedOrMissingCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRestoreMode('selected')}
                          className={`px-2.5 py-1.5 text-xs font-semibold rounded cursor-pointer ${
                            restoreMode === 'selected'
                              ? 'bg-[#0F274A] text-white'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          Selected ({selectedRestoreIds.size})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRestoreMode('all')}
                          className={`px-2.5 py-1.5 text-xs font-semibold rounded cursor-pointer ${
                            restoreMode === 'all'
                              ? 'bg-[#0F274A] text-white'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          Restore All ({backupPreview.newsCount})
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[220px] overflow-y-auto divide-y divide-stone-100 border border-stone-100 rounded">
                      {backupPreview.previewNews.map((item) => {
                        const checked = selectedRestoreIds.has(item.newsId);
                        return (
                          <label
                            key={item.newsId}
                            className="flex items-start gap-2.5 p-2.5 hover:bg-stone-50 cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setRestoreMode('selected');
                                toggleRestoreArticleId(item.newsId);
                              }}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-stone-900 font-kannada truncate">
                                {item.title}
                              </p>
                              <p className="text-[11px] text-stone-500">
                                {item.category} · {item.publishedDate} · {item.views} views
                                {!item.existsInCurrent && (
                                  <span className="ml-2 font-semibold text-amber-800">
                                    ({item.isDeletedInCurrent ? 'Deleted in Live' : 'Missing in Live'})
                                  </span>
                                )}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {confirmRestoreOpen ? (
                      <div className="bg-amber-50 border border-amber-300 rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-xs text-amber-950">
                          Confirm restore (<strong>{restoreMode.replace('_', ' ')}</strong>)? A fresh pre-restore safety backup will be saved first, and no other existing articles will be deleted.
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={handleExecuteRestore}
                            disabled={restoring}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded cursor-pointer"
                          >
                            {restoring ? 'Restoring...' : 'Yes, Backup & Restore'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRestoreOpen(false)}
                            disabled={restoring}
                            className="px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setConfirmRestoreOpen(true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-md cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Restore From This Backup</span>
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-stone-500 py-8 text-center">
                    Select a backup file on the left to preview its news articles.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* One-Time Apps Script Deployment Helper */}
      <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-stone-950 flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-[#0F274A]" aria-hidden="true" />
              <span>Google Apps Script Deployment Helper</span>
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Copy the ready-to-deploy Apps Script backend (<code className="text-stone-800">Code.gs</code>) and paste it into <code className="text-stone-800">script.google.com</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyAppsScriptCode}
            disabled={loadingCode}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-md cursor-pointer min-h-[40px]"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                <span>Copied Code.gs</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{loadingCode ? 'Loading...' : 'Copy Apps Script Code'}</span>
              </>
            )}
          </button>
        </div>
        <ol className="text-xs text-stone-700 list-decimal pl-5 space-y-1 leading-relaxed">
          <li>Open <strong>script.google.com</strong> → New Project → paste copied <code>Code.gs</code> and Save.</li>
          <li>Select <code>setupCoffeeNaduStorage</code> in the top toolbar and click <strong>Run</strong> (creates Sheets, Drive folders, secret key &amp; daily 02:30 AM backup trigger).</li>
          <li>Click <strong>Deploy → New deployment → Web app</strong> (Execute as: <em>Me</em>, Who has access: <em>Anyone</em>).</li>
          <li>Add <code>APPS_SCRIPT_WEBAPP_URL</code> and <code>APPS_SCRIPT_API_SECRET</code> in AI Studio Secrets / Cloudflare Pages Environment Variables, then click <strong>Check Storage Connection</strong>.</li>
        </ol>
      </div>
    </div>
  );
}
