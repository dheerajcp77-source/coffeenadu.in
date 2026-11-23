import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  X,
} from 'lucide-react';
import {
  fetchAdmin2SeoAudit,
  saveArticleSeoMeta,
  type Admin2SeoAuditItem,
  type Admin2SeoAuditResponse,
} from '../../services/admin2Client';

export function Admin2SeoSection() {
  const [audit, setAudit] = useState<Admin2SeoAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<Admin2SeoAuditItem | null>(null);
  const [seoTitle, setSeoTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [ogTitle, setOgTitle] = useState('');
  const [ogDescription, setOgDescription] = useState('');
  const [imageAltText, setImageAltText] = useState('');
  const [focusKeyword, setFocusKeyword] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAdmin2SeoAudit();
      setAudit(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openEditor = (item: Admin2SeoAuditItem) => {
    setEditingItem(item);
    setSeoTitle(item.seoTitle);
    setMetaDescription(item.metaDescription);
    setCanonicalUrl(item.canonicalUrl);
    setOgTitle(item.ogTitle);
    setOgDescription(item.ogDescription);
    setImageAltText(item.imageAltText);
    setFocusKeyword(item.focusKeyword);
  };

  const handleSaveSeo = async () => {
    if (!editingItem) return;
    setSaving(true);
    setFeedback('');
    try {
      await saveArticleSeoMeta(editingItem.articleId, {
        seoTitle,
        metaDescription,
        canonicalUrl,
        ogTitle,
        ogDescription,
        imageAltText,
        focusKeyword,
      });
      setEditingItem(null);
      setFeedback(`Saved SEO metadata for "${editingItem.articleId}".`);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            SEO &amp; Structured Data Management
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Audit titles, meta descriptions, canonical URLs, Open Graph tags, JSON-LD readiness, image alt text, and dynamic XML sitemap.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Globe className="h-3.5 w-3.5" />
            View /sitemap.xml
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Re-Audit
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          {feedback}
        </div>
      )}

      {loading && !audit ? (
        <div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Running SEO audit on live articles…
        </div>
      ) : audit ? (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="text-slate-500 dark:text-slate-400">Average SEO Score</p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {audit.summary.averageScore} / 100
              </p>
              <p className="text-[11px] text-slate-400">{audit.summary.totalChecked} live articles checked</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="text-slate-500 dark:text-slate-400">Open Graph &amp; JSON-LD</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Active &amp; Valid
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">WhatsApp &amp; social card injection preserved</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="text-slate-500 dark:text-slate-400">Missing Image Alt Text</p>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {audit.summary.missingAltCount}
              </p>
              <p className="text-[11px] text-slate-400">Articles with photos needing alt text</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
              <p className="text-slate-500 dark:text-slate-400">Dynamic XML Sitemap</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Auto-Updated
              </p>
              <p className="truncate mt-0.5 font-mono text-[10px] text-slate-400">
                {audit.siteDefaults.sitemapUrl}
              </p>
            </div>
          </div>

          {/* Article SEO Audit Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Article &amp; Canonical URL</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Diagnostics</th>
                    <th className="px-4 py-3 text-right">Edit SEO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {audit.items.map((item) => (
                    <tr key={item.articleId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 max-w-md">
                        <p className="line-clamp-1 font-semibold text-slate-900 dark:text-white">
                          {item.seoTitle}
                        </p>
                        <p className="truncate font-mono text-[10px] text-slate-400">{item.canonicalUrl}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-bold tabular-nums ${
                            item.score >= 85
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : item.score >= 65
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {item.score}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.issues.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> All checks passed
                          </span>
                        ) : (
                          <ul className="space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                            {item.issues.map((iss, idx) => (
                              <li key={idx} className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 shrink-0" /> {iss}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEditor(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {/* Per-Article SEO Editor Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#111C2E]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Edit SEO Metadata ({editingItem.articleId})
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <div className="mb-1 flex justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-200">SEO Title</label>
                  <span className="tabular-nums text-slate-400">{seoTitle.length} / 65 chars</span>
                </div>
                <input
                  type="text"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-200">Meta Description</label>
                  <span className="tabular-nums text-slate-400">{metaDescription.length} / 155 chars</span>
                </div>
                <textarea
                  rows={3}
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Canonical URL</label>
                <input
                  type="url"
                  value={canonicalUrl}
                  onChange={(e) => setCanonicalUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Image Alt Text</label>
                  <input
                    type="text"
                    value={imageAltText}
                    onChange={(e) => setImageAltText(e.target.value)}
                    placeholder="Describe photo for search & screen readers"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Focus Keyword</label>
                  <input
                    type="text"
                    value={focusKeyword}
                    onChange={(e) => setFocusKeyword(e.target.value)}
                    placeholder="e.g. Koppa Taluk News"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Open Graph Title</label>
                  <input
                    type="text"
                    value={ogTitle}
                    onChange={(e) => setOgTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Open Graph Description</label>
                  <input
                    type="text"
                    value={ogDescription}
                    onChange={(e) => setOgDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveSeo()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save SEO Metadata
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
