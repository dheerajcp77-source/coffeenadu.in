import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Check,
  Copy,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { processAndUploadNewsPhoto } from '../AdminArticleModal';
import {
  createAdmin2MediaFolder,
  fetchAdmin2Media,
  moveAdmin2MediaToFolder,
  registerAdmin2MediaAsset,
} from '../../services/admin2Client';
import type { Admin2MediaAsset } from '../../types/admin2';

async function computeFileSha256(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return '';
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function Admin2MediaSection() {
  const [assets, setAssets] = useState<Admin2MediaAsset[]>([]);
  const [folders, setFolders] = useState<string[]>(['General News', 'Lead Stories', 'Extra Photos', 'Programs & Events']);
  const [duplicateHashes, setDuplicateHashes] = useState<string[]>([]);
  const [driveCache, setDriveCache] = useState<{ fileCount: number; totalBytes: number }>({ fileCount: 0, totalBytes: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('All');
  const [uploadFolder, setUploadFolder] = useState<string>('General News');
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Admin2MediaAsset | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchAdmin2Media();
      setAssets(res.assets || []);
      if (res.folders?.length) setFolders(res.folders);
      setDuplicateHashes(res.duplicateHashes || []);
      setDriveCache(res.driveCache || { fileCount: 0, totalBytes: 0 });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load Google Drive media archive.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleUploadChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const sha256 = await computeFileSha256(file);
      // Preserves 100% of CoffeeNadu branding: circular logo watermark + 2x middle "COFFEENADU NEWS" overlay + Drive upload!
      const processed = await processAndUploadNewsPhoto(file, {
        includeMiddleBrand: true,
      });

      const reg = await registerAdmin2MediaAsset({
        imageUrl: processed.imageUrl,
        thumbUrl: processed.imageThumbUrl,
        driveFileId: processed.imageDriveId,
        fileName: file.name,
        folder: uploadFolder,
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        sha256,
        watermarkApplied: true,
        middleOverlayApplied: true,
        processingHistory: [
          'Applied CoffeeNadu circular logo watermark (preserved positioning)',
          'Applied 2x middle "COFFEENADU NEWS" text overlay',
          'Compressed & generated thumbnail without altering original local file',
          processed.imageDriveId
            ? `Stored in Google Drive (ID: ${processed.imageDriveId})`
            : 'Stored in portal media',
        ],
      });

      setFeedback(
        reg.duplicateOf
          ? `Uploaded "${file.name}" to Google Drive. Note: Duplicate content detected (matches "${reg.duplicateOf}").`
          : `Uploaded "${file.name}" with CoffeeNadu branding to Google Drive (${uploadFolder}).`
      );
      await load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await createAdmin2MediaFolder(name);
      setFolders(res.folders);
      setUploadFolder(name);
      setNewFolderName('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not create folder.');
    }
  };

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assets.filter((a) => {
      if (selectedFolder !== 'All' && a.folder !== selectedFolder) return false;
      if (!q) return true;
      const usageText = a.usageArticles.map((u) => u.title).join(' ');
      return `${a.fileName} ${a.folder} ${a.driveFileId || ''} ${usageText}`.toLowerCase().includes(q);
    });
  }, [assets, searchQuery, selectedFolder]);

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      // Non-fatal
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Google Drive Media Centre
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Browse, organize, and upload news photographs with automatic CoffeeNadu circular logo + 2x middle overlay branding.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={uploadFolder}
            onChange={(e) => setUploadFolder(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="Target upload folder"
          >
            {folders.map((f) => (
              <option key={f} value={f}>
                Folder: {f}
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => void handleUploadChange(e)}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#13294B] disabled:opacity-60 dark:bg-blue-600"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? 'Branding & Uploading…' : 'Upload Branded Photo'}
          </button>
        </div>
      </div>

      {/* Branding Preservation Strip & Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-slate-500 dark:text-slate-400">Indexed Drive Photos</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
            {assets.length}
          </p>
          <p className="text-[11px] text-slate-400">
            {duplicateHashes.length} duplicate SHA-256 group(s)
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-slate-500 dark:text-slate-400">Local Drive Proxy Cache</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
            {driveCache.fileCount} files
          </p>
          <p className="text-[11px] tabular-nums text-slate-400">
            {formatBytes(driveCache.totalBytes)} cached for fast delivery
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> CoffeeNadu Branding Active
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Circular top-left logo + 2x middle &ldquo;COFFEENADU NEWS&rdquo; overlay preserved. Originals are never overwritten.
          </p>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Search & Folder Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111C2E]">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedFolder('All')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
              selectedFolder === 'All'
                ? 'bg-[#0B192C] text-white dark:bg-blue-600'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            All ({assets.length})
          </button>
          {folders.map((folder) => (
            <button
              key={folder}
              type="button"
              onClick={() => setSelectedFolder(folder)}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${
                selectedFolder === folder
                  ? 'bg-[#0B192C] text-white dark:bg-blue-600'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Folder className="h-3 w-3" />
              {folder}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search filename or article…"
              className="rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder…"
              className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => void handleCreateFolder()}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              title="Create Folder"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Gallery Grid */}
      {loading && assets.length === 0 ? (
        <div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Drive gallery…
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-[#111C2E]">
          <ImageIcon className="mx-auto mb-2 h-6 w-6 text-slate-400" />
          No images found in this folder.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAssets.map((asset) => {
            const isDup = Boolean(asset.sha256 && duplicateHashes.includes(asset.sha256));
            return (
              <div
                key={asset.id + asset.imageUrl}
                className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-[#111C2E]"
              >
                <button
                  type="button"
                  onClick={() => setSelectedAsset(asset)}
                  className="relative block h-44 w-full bg-slate-100 dark:bg-slate-900"
                >
                  <img
                    src={asset.thumbUrl || asset.imageUrl}
                    alt={asset.fileName}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                  {isDup && (
                    <span className="absolute right-2 top-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Duplicate
                    </span>
                  )}
                </button>
                <div className="p-3 text-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-slate-900 dark:text-white" title={asset.fileName}>
                      {asset.fileName}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl(asset.imageUrl)}
                      className="shrink-0 text-[#1D4ED8] hover:underline dark:text-blue-400"
                      title="Copy Image URL"
                    >
                      {copiedUrl === asset.imageUrl ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{asset.folder}</span>
                    <span className="tabular-nums">
                      Used in {asset.usageArticles.length} item(s)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={asset.folder}
                      onChange={async (e) => {
                        await moveAdmin2MediaToFolder(asset.imageUrl, e.target.value);
                        await load();
                      }}
                      className="flex-1 rounded border border-slate-200 bg-transparent px-2 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      {folders.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setSelectedAsset(asset)}
                      className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Asset Inspector Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#111C2E]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{selectedAsset.fileName}</h3>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={selectedAsset.imageUrl}
              alt={selectedAsset.fileName}
              className="max-h-72 w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-900"
            />
            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60">
                <div>
                  <span className="text-slate-400">Drive File ID:</span>
                  <p className="truncate font-mono text-slate-800 dark:text-slate-200">
                    {selectedAsset.driveFileId || 'Embedded / Static'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Branding:</span>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {selectedAsset.watermarkApplied ? 'Logo + Watermark Applied' : 'Unbranded'}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                  <Layers className="h-3.5 w-3.5" /> Article Usage ({selectedAsset.usageArticles.length})
                </h4>
                {selectedAsset.usageArticles.length === 0 ? (
                  <p className="text-slate-400">Not attached to any article yet. Copy the URL to use it.</p>
                ) : (
                  <ul className="space-y-1">
                    {selectedAsset.usageArticles.map((u, i) => (
                      <li key={i} className="text-slate-600 dark:text-slate-300">
                        • <span className="uppercase text-[10px] font-semibold text-slate-400">[{u.role}]</span> {u.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="mb-1.5 font-semibold text-slate-700 dark:text-slate-200">Processing History</h4>
                <ul className="space-y-1 text-slate-500 dark:text-slate-400">
                  {selectedAsset.processingHistory.map((step, i) => (
                    <li key={i}>• {step}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
