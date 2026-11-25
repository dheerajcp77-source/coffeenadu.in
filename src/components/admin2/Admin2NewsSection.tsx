import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarClock,
  Check,
  CheckSquare,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileEdit,
  FilePlus2,
  History,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { NEWS_CATEGORIES, getKannadaLocationLabel } from '../../constants/newsData';
import {
  archiveLiveArticle,
  createAdmin2Draft,
  deleteAdmin2Draft,
  fetchAdmin2CmsState,
  publishAdmin2Draft,
  restoreArchivedArticle,
  updateAdmin2Draft,
  updateArticleCmsMeta,
} from '../../services/admin2Client';
import type {
  Admin2ManagedDraft,
  Admin2SessionUser,
  ArticleCmsOverlay,
} from '../../types/admin2';
import type { FilterCategory, NewsArticle } from '../../types/news';
import {
  formatLeadExpiryDateTime,
  formatRemainingLeadTime,
  isArticleActivelyFeatured,
} from '../../utils/featuredLead';
import { sanitizeRichTextHtml, stripRichTextToPlainText } from '../../utils/richText';
import { buildArticlePublicUrl } from '../../utils/slug';

interface Admin2NewsSectionProps {
  articles: NewsArticle[];
  sessionUser: Admin2SessionUser;
  hasMoreArticles: boolean;
  loadingArticles: boolean;
  loadingMoreArticles: boolean;
  onRefreshArticles: () => Promise<void>;
  onLoadMoreArticles: () => Promise<void>;
  onOpenNewArticleModal: () => void;
  onEditLiveArticle: (article: NewsArticle) => void;
  onDeleteLiveArticle: (articleId: string) => Promise<void>;
  onToggleLeadStory?: (articleId: string, nextFeatured: boolean) => Promise<void>;
  onOpenDraftInComposer?: (draft: Admin2ManagedDraft) => void;
  initialView?: 'published' | 'drafts' | 'scheduled' | 'archived';
}

type CmsTab = 'published' | 'drafts' | 'scheduled' | 'archived';

export function Admin2NewsSection({
  articles,
  sessionUser,
  hasMoreArticles,
  loadingArticles,
  loadingMoreArticles,
  onRefreshArticles,
  onLoadMoreArticles,
  onOpenNewArticleModal,
  onEditLiveArticle,
  onDeleteLiveArticle,
  onToggleLeadStory,
  initialView = 'published',
}: Admin2NewsSectionProps) {
  const [activeTab, setActiveTab] = useState<CmsTab>(initialView);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>('All');
  const [languageFilter, setLanguageFilter] = useState<'All' | 'Kannada' | 'English' | 'Bilingual'>('All');

  const [drafts, setDrafts] = useState<Admin2ManagedDraft[]>([]);
  const [overlays, setOverlays] = useState<Record<string, ArticleCmsOverlay>>({});
  const [archivedSnapshots, setArchivedSnapshots] = useState<Array<Record<string, unknown> & { id: string }>>([]);
  const [loadingCms, setLoadingCms] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Quick Draft / Schedule Modal
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<Admin2ManagedDraft | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftCategory, setDraftCategory] = useState<string>('Local');
  const [draftLocation, setDraftLocation] = useState<string>('ಕೊಪ್ಪ');
  const [draftLanguage, setDraftLanguage] = useState<'Kannada' | 'English' | 'Bilingual'>('Kannada');
  const [draftSlug, setDraftSlug] = useState('');
  const [draftScheduleFor, setDraftScheduleFor] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  // Preview & Revision Drawers
  const [previewArticle, setPreviewArticle] = useState<NewsArticle | null>(null);
  const [revisionArticleId, setRevisionArticleId] = useState<string | null>(null);

  const canPublish =
    sessionUser.protectedSuperAdmin ||
    sessionUser.role === 'super_admin' ||
    sessionUser.permissions.includes('news.publish');
  const canDelete =
    sessionUser.protectedSuperAdmin ||
    sessionUser.role === 'super_admin' ||
    sessionUser.permissions.includes('news.delete');
  const canArchive =
    sessionUser.protectedSuperAdmin ||
    sessionUser.role === 'super_admin' ||
    sessionUser.permissions.includes('news.archive');

  const loadCms = async () => {
    setLoadingCms(true);
    try {
      const res = await fetchAdmin2CmsState();
      setDrafts(res.drafts || []);
      setOverlays(res.overlays || {});
      setArchivedSnapshots(res.archivedSnapshots || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load CMS draft & archive state.');
    } finally {
      setLoadingCms(false);
    }
  };

  useEffect(() => {
    void loadCms();
  }, []);

  const draftItems = useMemo(() => drafts.filter((d) => d.status === 'draft'), [drafts]);
  const scheduledItems = useMemo(() => drafts.filter((d) => d.status === 'scheduled'), [drafts]);

  const filteredPublished = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((a) => {
      if (categoryFilter !== 'All' && a.category !== categoryFilter) return false;
      const lang = overlays[a.id]?.language || 'Kannada';
      if (languageFilter !== 'All' && lang !== languageFilter) return false;
      if (!q) return true;
      const hay = `${stripRichTextToPlainText(a.titleKannada)} ${stripRichTextToPlainText(a.summaryKannada)} ${a.id} ${a.location} ${a.reporter}`.toLowerCase();
      return hay.includes(q);
    });
  }, [articles, categoryFilter, languageFilter, overlays, searchQuery]);

  const openQuickDraftModal = (existing?: Admin2ManagedDraft) => {
    if (existing) {
      setEditingDraft(existing);
      setDraftTitle(existing.titleKannada);
      setDraftSummary(existing.summaryKannada);
      setDraftBody((existing.bodyKannada || []).join('\n\n'));
      setDraftCategory(existing.category || 'Local');
      setDraftLocation(existing.location || 'ಕೊಪ್ಪ');
      setDraftLanguage(existing.language || 'Kannada');
      setDraftSlug(existing.customSlug || '');
      setDraftScheduleFor(existing.scheduledFor ? existing.scheduledFor.slice(0, 16) : '');
    } else {
      setEditingDraft(null);
      setDraftTitle('');
      setDraftSummary('');
      setDraftBody('');
      setDraftCategory('Local');
      setDraftLocation('ಕೊಪ್ಪ');
      setDraftLanguage('Kannada');
      setDraftSlug('');
      setDraftScheduleFor('');
    }
    setDraftModalOpen(true);
  };

  const handleSaveDraft = async (targetStatus: 'draft' | 'scheduled') => {
    if (!draftTitle.trim()) {
      setErrorMsg('Headline is required to save a draft.');
      return;
    }
    if (targetStatus === 'scheduled' && !draftScheduleFor) {
      setErrorMsg('Select a date and time to schedule publishing.');
      return;
    }
    setSavingDraft(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const paragraphs = draftBody
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      const payload: Partial<Admin2ManagedDraft> = {
        titleKannada: draftTitle.trim(),
        summaryKannada: draftSummary.trim() || paragraphs[0] || draftTitle.trim(),
        bodyKannada: paragraphs.length > 0 ? paragraphs : [draftSummary.trim() || draftTitle.trim()],
        category: draftCategory,
        location: draftLocation,
        language: draftLanguage,
        customSlug: draftSlug.trim() || undefined,
        status: targetStatus,
        scheduledFor: targetStatus === 'scheduled' ? new Date(draftScheduleFor).toISOString() : undefined,
      };
      if (editingDraft) {
        await updateAdmin2Draft(editingDraft.id, payload);
        setFeedback(targetStatus === 'scheduled' ? 'Article scheduled for automatic publishing.' : 'Draft updated.');
      } else {
        await createAdmin2Draft(payload);
        setFeedback(targetStatus === 'scheduled' ? 'Article scheduled for automatic publishing.' : 'Saved as draft.');
      }
      setDraftModalOpen(false);
      await loadCms();
      setActiveTab(targetStatus === 'scheduled' ? 'scheduled' : 'drafts');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handlePublishDraftNow = async (draft: Admin2ManagedDraft) => {
    setBusyId(draft.id);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await publishAdmin2Draft(draft.id);
      setFeedback(`Published "${stripRichTextToPlainText(draft.titleKannada)}" live (ID: ${res.newsId}).`);
      await Promise.all([loadCms(), onRefreshArticles()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to publish draft.');
    } finally {
      setBusyId(null);
    }
  };

  const handleArchiveLive = async (article: NewsArticle) => {
    setBusyId(article.id);
    setErrorMsg('');
    setFeedback('');
    try {
      await archiveLiveArticle(article.id, article as unknown as Record<string, unknown>);
      setFeedback(`Archived "${stripRichTextToPlainText(article.titleKannada)}" safely. You can restore it anytime.`);
      await Promise.all([loadCms(), onRefreshArticles()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to archive article.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRestoreArchived = async (articleId: string) => {
    setBusyId(articleId);
    setErrorMsg('');
    setFeedback('');
    try {
      await restoreArchivedArticle(articleId);
      setFeedback(`Restored article (${articleId}) back to live Google Sheets feed.`);
      await Promise.all([loadCms(), onRefreshArticles()]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    setErrorMsg('');
    setFeedback('');
    let count = 0;
    for (const id of Array.from(selectedIds)) {
      const target = articles.find((a) => a.id === id);
      if (target) {
        try {
          await archiveLiveArticle(id, target as unknown as Record<string, unknown>);
          count += 1;
        } catch {
          // Continue bulk operation
        }
      }
    }
    setSelectedIds(new Set());
    setFeedback(`Archived ${count} selected article(s).`);
    await Promise.all([loadCms(), onRefreshArticles()]);
  };

  const handleLanguageChange = async (articleId: string, language: 'Kannada' | 'English' | 'Bilingual') => {
    try {
      const res = await updateArticleCmsMeta(articleId, { language });
      setOverlays((prev) => ({ ...prev, [articleId]: res.overlay }));
    } catch {
      // Non-fatal
    }
  };

  const handleCopyUrl = async (articleId: string) => {
    try {
      await navigator.clipboard.writeText(buildArticlePublicUrl(articleId));
      setCopiedId(articleId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Non-fatal
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeRevisions = revisionArticleId ? overlays[revisionArticleId]?.revisions || [] : [];

  return (
    <div className="space-y-5">
      {/* Header & Primary Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            News Management CMS
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage published stories, drafts, scheduled publishing, archives, Kannada/English tags, and revision history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openQuickDraftModal()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <FileEdit className="h-3.5 w-3.5" />
            Save Draft / Schedule
          </button>
          <button
            type="button"
            onClick={onOpenNewArticleModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            Add New Article (Full Rich Editor)
          </button>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} className="p-0.5 hover:opacity-75">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="p-0.5 hover:opacity-75">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Workflow Status Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'published', label: 'Published', count: articles.length },
              { id: 'drafts', label: 'Drafts', count: draftItems.length },
              { id: 'scheduled', label: 'Scheduled', count: scheduledItems.length },
              { id: 'archived', label: 'Archived', count: archivedSnapshots.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedIds(new Set());
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#0B192C] text-white dark:bg-blue-600'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`tabular-nums text-[11px] ${
                  activeTab === tab.id ? 'text-amber-300' : 'text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void Promise.all([onRefreshArticles(), loadCms()])}
          disabled={loadingArticles || loadingCms}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingArticles || loadingCms ? 'animate-spin' : ''}`} />
          Sync Sheets
        </button>
      </div>

      {/* Filters & Bulk Actions (Published Tab) */}
      {activeTab === 'published' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-[240px]">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search headline, URL slug, reporter, or town…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#0B192C] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as FilterCategory)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="All">All Categories</option>
              {NEWS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value as typeof languageFilter)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="All">All Languages</option>
              <option value="Kannada">Kannada</option>
              <option value="English">English</option>
              <option value="Bilingual">Bilingual</option>
            </select>
          </div>

          {selectedIds.size > 0 && canArchive && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs dark:bg-amber-950/40">
              <span className="font-semibold text-amber-900 dark:text-amber-200 tabular-nums">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={() => void handleBulkArchive()}
                className="rounded-md bg-[#0B192C] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#13294B]"
              >
                Archive Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-slate-600 hover:text-slate-900 dark:text-slate-300"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* PUBLISHED TABLE */}
      {activeTab === 'published' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="w-9 px-3 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-3 py-3">Article &amp; Slug</th>
                  <th className="px-3 py-3">Category / Lang</th>
                  <th className="px-3 py-3">Published</th>
                  <th className="px-3 py-3 text-right">Views</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPublished.map((article) => {
                  const plainTitle = stripRichTextToPlainText(article.titleKannada);
                  const activeLead = isArticleActivelyFeatured(article);
                  const lang = overlays[article.id]?.language || 'Kannada';
                  const revCount = overlays[article.id]?.revisions?.length || 0;
                  const isSelected = selectedIds.has(article.id);
                  return (
                    <tr
                      key={article.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-3 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => toggleSelect(article.id)}
                          className="mt-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          aria-label="Select article"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-[#1D4ED8]" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-start gap-3">
                          {article.imageUrl ? (
                            <img
                              src={article.imageThumbUrl || article.imageUrl}
                              alt=""
                              className="h-11 w-14 shrink-0 rounded-md border border-slate-200 object-cover dark:border-slate-700"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400 dark:bg-slate-800">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                          )}
                          <div className="min-w-0 max-w-md">
                            <p className="line-clamp-2 font-semibold text-slate-900 dark:text-white">
                              {plainTitle}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="font-mono text-[10px] text-slate-500">/{article.id}</span>
                              <button
                                type="button"
                                onClick={() => void handleCopyUrl(article.id)}
                                className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline dark:text-blue-400"
                              >
                                {copiedId === article.id ? (
                                  <>
                                    <Check className="h-3 w-3" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" /> Copy Link
                                  </>
                                )}
                              </button>
                              {activeLead && (
                                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                                  <span>
                                    ★ Lead Story
                                    {article.featuredUntil
                                      ? ` (${formatRemainingLeadTime(article.featuredUntil)})`
                                      : ''}
                                  </span>
                                  {onToggleLeadStory && (
                                    <button
                                      type="button"
                                      disabled={busyId === article.id}
                                      onClick={async () => {
                                        setBusyId(article.id);
                                        setErrorMsg('');
                                        setFeedback('');
                                        try {
                                          await onToggleLeadStory(article.id, false);
                                          setFeedback('Removed from Lead Story permanently.');
                                        } catch (err) {
                                          setErrorMsg(
                                            err instanceof Error
                                              ? err.message
                                              : 'Unable to remove from Lead Story.'
                                          );
                                        } finally {
                                          setBusyId(null);
                                        }
                                      }}
                                      className="cursor-pointer rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                                      title="Remove this article from Lead Story immediately"
                                    >
                                      {busyId === article.id ? 'Removing…' : 'Remove Lead'}
                                    </button>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{article.category}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {getKannadaLocationLabel(article.location)}
                        </p>
                        <select
                          value={lang}
                          onChange={(e) =>
                            void handleLanguageChange(
                              article.id,
                              e.target.value as 'Kannada' | 'English' | 'Bilingual'
                            )
                          }
                          className="mt-1 rounded border border-slate-200 bg-transparent px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300"
                        >
                          <option value="Kannada">Kannada</option>
                          <option value="English">English</option>
                          <option value="Bilingual">Bilingual</option>
                        </select>
                      </td>
                      <td className="px-3 py-3 align-top tabular-nums text-slate-600 dark:text-slate-300">
                        <p>{article.publishedDate}</p>
                        <p className="text-[11px] text-slate-400">{article.publishedTime}</p>
                        {activeLead && article.featuredUntil && (
                          <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                            Lead ends {formatLeadExpiryDateTime(article.featuredUntil)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                        {(article.viewCount ?? 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewArticle(article)}
                            title="Preview Article"
                            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRevisionArticleId(article.id)}
                            title={`Revision History (${revCount})`}
                            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditLiveArticle(article)}
                            title="Edit Article"
                            className="rounded-md border border-slate-200 p-1.5 text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-400 dark:hover:bg-slate-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {canArchive && (
                            <button
                              type="button"
                              disabled={busyId === article.id}
                              onClick={() => void handleArchiveLive(article)}
                              title="Unpublish & Archive"
                              className="rounded-md border border-slate-200 p-1.5 text-amber-700 hover:bg-amber-50 dark:border-slate-700 dark:text-amber-400 dark:hover:bg-slate-800"
                            >
                              {busyId === article.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Archive className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          {canDelete && (
                            confirmDeleteId === article.id ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  setConfirmDeleteId(null);
                                  await onDeleteLiveArticle(article.id);
                                }}
                                className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                              >
                                Confirm
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(article.id)}
                                title="Delete Article"
                                className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-slate-800"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredPublished.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-500">
                      No matching published articles found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {hasMoreArticles && (
            <div className="border-t border-slate-100 p-3 text-center dark:border-slate-800">
              <button
                type="button"
                disabled={loadingMoreArticles}
                onClick={() => void onLoadMoreArticles()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                {loadingMoreArticles && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load More Articles
              </button>
            </div>
          )}
        </div>
      )}

      {/* DRAFTS & SCHEDULED TABS */}
      {(activeTab === 'drafts' || activeTab === 'scheduled') && (
        <div className="space-y-3">
          {(activeTab === 'drafts' ? draftItems : scheduledItems).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-[#111C2E]">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {activeTab === 'drafts' ? 'No saved drafts yet' : 'No scheduled articles queued'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {activeTab === 'drafts'
                  ? 'Drafts from AI News Studio or the quick draft composer appear here until approved by an editor.'
                  : 'Schedule editor-approved drafts to automatically publish to Google Sheets at an exact date & time.'}
              </p>
              <button
                type="button"
                onClick={() => openQuickDraftModal()}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#13294B]"
              >
                <FileEdit className="h-3.5 w-3.5" />
                Create {activeTab === 'drafts' ? 'Draft' : 'Scheduled Post'}
              </button>
            </div>
          ) : (
            (activeTab === 'drafts' ? draftItems : scheduledItems).map((draft) => (
              <div
                key={draft.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-[#111C2E]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{draft.category}</span>
                    <span>·</span>
                    <span>{draft.language}</span>
                    {draft.aiGenerated && (
                      <span className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400">
                        <Sparkles className="h-3 w-3" /> AI Draft (Editor Approval Required)
                      </span>
                    )}
                    {draft.scheduledFor && (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                        <CalendarClock className="h-3 w-3" />
                        Scheduled: {new Date(draft.scheduledFor).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {stripRichTextToPlainText(draft.titleKannada)}
                  </h3>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                    {stripRichTextToPlainText(draft.summaryKannada)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Created by {draft.createdBy} · Updated {new Date(draft.updatedAt).toLocaleString('en-IN')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openQuickDraftModal(draft)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit / Schedule
                  </button>
                  {canPublish && (
                    <button
                      type="button"
                      disabled={busyId === draft.id}
                      onClick={() => void handlePublishDraftNow(draft)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {busyId === draft.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Approve &amp; Publish Live
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteAdmin2Draft(draft.id);
                        await loadCms();
                      }}
                      className="rounded-lg border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400"
                      title="Delete Draft"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ARCHIVED TAB */}
      {activeTab === 'archived' && (
        <div className="space-y-3">
          {archivedSnapshots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-[#111C2E]">
              No archived articles. Use the Archive button on any published story to unpublish it safely with one-click restore.
            </div>
          ) : (
            archivedSnapshots.map((snap) => (
              <div
                key={snap.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-[#111C2E]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {stripRichTextToPlainText(String(snap.titleKannada || snap.id))}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    ID: <span className="font-mono">{snap.id}</span> · Archived by{' '}
                    {String(snap.archivedBy || 'admin')} on{' '}
                    {snap.archivedAt ? new Date(String(snap.archivedAt)).toLocaleString('en-IN') : ''}
                  </p>
                </div>
                {canPublish && (
                  <button
                    type="button"
                    disabled={busyId === snap.id}
                    onClick={() => void handleRestoreArchived(snap.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600"
                  >
                    {busyId === snap.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Restore to Live Site
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* QUICK DRAFT & SCHEDULE MODAL */}
      {draftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#111C2E]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingDraft ? 'Edit Draft / Schedule Publishing' : 'Create Draft or Scheduled Article'}
              </h3>
              <button
                type="button"
                onClick={() => setDraftModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  Headline (Kannada or English)
                </label>
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Enter news headline…"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Category</label>
                  <select
                    value={draftCategory}
                    onChange={(e) => setDraftCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {NEWS_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Language</label>
                  <select
                    value={draftLanguage}
                    onChange={(e) => setDraftLanguage(e.target.value as typeof draftLanguage)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="Kannada">Kannada</option>
                    <option value="English">English</option>
                    <option value="Bilingual">Bilingual</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                    Custom English URL Slug (optional)
                  </label>
                  <input
                    type="text"
                    value={draftSlug}
                    onChange={(e) => setDraftSlug(e.target.value)}
                    placeholder="koppa-road-update"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Summary</label>
                <textarea
                  rows={2}
                  value={draftSummary}
                  onChange={(e) => setDraftSummary(e.target.value)}
                  placeholder="2-line article summary…"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  Full Report (separate paragraphs with blank lines)
                </label>
                <textarea
                  rows={6}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Write full news report…"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-900/60">
                <label className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  Schedule Auto-Publishing Date &amp; Time (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={draftScheduleFor}
                  onChange={(e) => setDraftScheduleFor(e.target.value)}
                  className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDraftModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingDraft}
                  onClick={() => void handleSaveDraft('draft')}
                  className="rounded-lg border border-[#0B192C] px-3.5 py-2 text-xs font-semibold text-[#0B192C] hover:bg-slate-50 dark:border-blue-500 dark:text-blue-400"
                >
                  Save as Draft
                </button>
                {canPublish && (
                  <button
                    type="button"
                    disabled={savingDraft || !draftScheduleFor}
                    onClick={() => void handleSaveDraft('scheduled')}
                    className="rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#13294B] disabled:opacity-50 dark:bg-blue-600"
                  >
                    Approve &amp; Schedule
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ARTICLE PREVIEW MODAL */}
      {previewArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#111C2E]">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Live Article Preview · {previewArticle.category}
                </p>
                <a
                  href={`/?article=${encodeURIComponent(previewArticle.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline dark:text-blue-400"
                >
                  Open Public URL <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <button
                type="button"
                onClick={() => setPreviewArticle(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {previewArticle.imageUrl && (
              <img
                src={previewArticle.imageUrl}
                alt={stripRichTextToPlainText(previewArticle.titleKannada)}
                className="mb-4 max-h-80 w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-900"
              />
            )}

            <h3
              className="font-serif text-xl font-bold text-slate-900 dark:text-white"
              dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(previewArticle.titleKannada) }}
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {previewArticle.publishedDate} {previewArticle.publishedTime} · {previewArticle.reporter} ·{' '}
              {(previewArticle.viewCount ?? 0).toLocaleString('en-IN')} views
            </p>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {previewArticle.bodyKannada.map((para, i) => (
                <div key={i} dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(para) }} />
              ))}
            </div>
            {previewArticle.extraImages && previewArticle.extraImages.length > 0 && (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                {previewArticle.extraImages.map((img, i) => (
                  <figure key={i} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <img src={img.imageUrl} alt="" className="max-h-56 w-full object-contain bg-slate-50 dark:bg-slate-900" />
                    {img.caption && (
                      <figcaption className="px-2.5 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {stripRichTextToPlainText(img.caption)}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* REVISION HISTORY DRAWER */}
      {revisionArticleId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
          <div className="flex h-full w-full max-w-md flex-col bg-white p-5 shadow-2xl dark:bg-[#111C2E]">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Article Revision History</h3>
                <p className="font-mono text-[11px] text-slate-500">{revisionArticleId}</p>
              </div>
              <button
                type="button"
                onClick={() => setRevisionArticleId(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {activeRevisions.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  Future edits, schedules, and archive actions on this article are automatically recorded here.
                </p>
              ) : (
                activeRevisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">{rev.summary}</span>
                      <span className="text-[10px] uppercase text-slate-400">{rev.statusSnapshot}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-slate-600 dark:text-slate-300">{rev.titleSnapshot}</p>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      {rev.editorEmail} · {new Date(rev.timestamp).toLocaleString('en-IN')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
