import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FileCheck2,
  Loader2,
  Save,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { NEWS_CATEGORIES } from '../../constants/newsData';
import { createAdmin2Draft, runAiNewsStudio } from '../../services/admin2Client';
import type { AiStudioResponse, AiStudioTool } from '../../types/admin2';

interface Admin2AiStudioSectionProps {
  onDraftSaved?: () => void;
}

const AI_TOOLS: Array<{ id: AiStudioTool; label: string; desc: string; group: string }> = [
  { id: 'draft_kannada', label: 'Kannada News Draft', desc: 'Draft full Kannada report from source notes', group: 'Drafting' },
  { id: 'draft_english', label: 'English News Draft', desc: 'Draft full English report from source notes', group: 'Drafting' },
  { id: 'translate_kn_en', label: 'Kannada → English', desc: 'Faithful translation without altering facts', group: 'Translation' },
  { id: 'translate_en_kn', label: 'English → Kannada', desc: 'Natural Kannada newspaper translation', group: 'Translation' },
  { id: 'headlines', label: 'Headline Generator', desc: '5 grounded Kannada & English headlines', group: 'Editorial' },
  { id: 'summary', label: 'Article Summary', desc: '2-sentence lead & WhatsApp blurb', group: 'Editorial' },
  { id: 'grammar', label: 'Grammar Correction', desc: 'Proofread spelling & punctuation', group: 'Editorial' },
  { id: 'readability', label: 'Readability Polish', desc: 'Improve flow while keeping 100% of facts', group: 'Editorial' },
  { id: 'seo_title', label: 'SEO Title Generator', desc: 'Under-60-character search titles', group: 'SEO & Media' },
  { id: 'meta_description', label: 'Meta Description', desc: '120–155 character search snippets', group: 'SEO & Media' },
  { id: 'image_caption', label: 'Image Captions', desc: 'Kannada & English photo captions', group: 'SEO & Media' },
  { id: 'image_alt', label: 'Image Alt Text', desc: 'Accessible SEO alt descriptions', group: 'SEO & Media' },
  { id: 'verify_facts', label: 'Verification Assistant', desc: 'Audit claims & flag details to verify', group: 'Verification' },
];

export function Admin2AiStudioSection({ onDraftSaved }: Admin2AiStudioSectionProps) {
  const [selectedTool, setSelectedTool] = useState<AiStudioTool>('draft_kannada');
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [headlineHint, setHeadlineHint] = useState('');
  const [category, setCategory] = useState<string>('Local');
  const [location, setLocation] = useState('ಕೊಪ್ಪ');
  const [running, setRunning] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [result, setResult] = useState<AiStudioResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (sourceMaterial.trim().length < 10) {
      setErrorMsg('Paste verified reporter notes, press release text, or draft copy (at least 10 characters).');
      return;
    }
    setRunning(true);
    setErrorMsg('');
    setSavedNotice('');
    try {
      const res = await runAiNewsStudio({
        tool: selectedTool,
        sourceMaterial: sourceMaterial.trim(),
        headlineHint: headlineHint.trim() || undefined,
        category,
        location,
      });
      setResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate AI assist right now.');
    } finally {
      setRunning(false);
    }
  };

  const handleSaveAsDraft = async () => {
    if (!result?.ok) return;
    setSavingDraft(true);
    setErrorMsg('');
    setSavedNotice('');
    try {
      const headline =
        result.structured?.headline ||
        result.structured?.seoTitle ||
        result.structured?.options?.[0] ||
        headlineHint.trim() ||
        'AI News Studio Draft (Review Required)';
      const paragraphs =
        result.structured?.paragraphs && result.structured.paragraphs.length > 0
          ? result.structured.paragraphs
          : result.outputText
              .split(/\n{2,}/)
              .map((p) => p.trim())
              .filter(Boolean);
      const summary = result.structured?.summary || paragraphs[0] || headline;

      await createAdmin2Draft({
        titleKannada: headline,
        summaryKannada: summary,
        bodyKannada: paragraphs,
        category,
        location,
        language:
          selectedTool === 'draft_english' || selectedTool === 'translate_kn_en' ? 'English' : 'Kannada',
        status: 'draft',
        aiGenerated: true,
        seo: {
          seoTitle: result.structured?.seoTitle,
          metaDescription: result.structured?.metaDescription,
          imageAltText: result.structured?.altText,
        },
      });
      setSavedNotice('Saved cleanly to News Management → Drafts. Remains a draft until approved by an editor.');
      onDraftSaved?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleCopyOutput = async () => {
    if (!result?.outputText) return;
    try {
      await navigator.clipboard.writeText(result.outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Non-fatal
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            AI News Studio
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Server-side Gemini editorial workbench grounded strictly in your supplied reporter notes.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>Strict Journalism Guard: Zero invented facts · AI outputs remain drafts until editor approval.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Tool Selector */}
        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#111C2E] xl:col-span-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Editorial Tools (13)
          </h3>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
            {AI_TOOLS.map((tool) => {
              const active = selectedTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setSelectedTool(tool.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    active
                      ? 'border-[#0B192C] bg-[#0B192C] text-white dark:border-blue-500 dark:bg-blue-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <p className="text-xs font-semibold">{tool.label}</p>
                  <p className={`mt-0.5 text-[11px] ${active ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                    {tool.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Input + Grounded Output */}
        <div className="space-y-5 xl:col-span-8">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  Headline Hint (Optional)
                </label>
                <input
                  type="text"
                  value={headlineHint}
                  onChange={(e) => setHeadlineHint(e.target.value)}
                  placeholder="Optional working headline…"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
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
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Town / Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>

            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
              Supplied Source Material (Reporter Notes, Official Release, or Draft Text)
            </label>
            <textarea
              rows={7}
              value={sourceMaterial}
              onChange={(e) => setSourceMaterial(e.target.value)}
              placeholder="Paste verified notes, quotes, dates, places, or Kannada/English draft here. The assistant will use ONLY facts supplied here…"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs leading-relaxed text-slate-900 focus:border-[#0B192C] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />

            {errorMsg && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Active Tool:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {AI_TOOLS.find((t) => t.id === selectedTool)?.label}
                </strong>
              </p>
              <button
                type="button"
                disabled={running}
                onClick={() => void handleGenerate()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#13294B] disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {running ? 'Generating Grounded Output…' : 'Generate Editorial Assist'}
              </button>
            </div>
          </section>

          {/* Output Panel */}
          {result && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Generated Editorial Draft
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{result.disclaimer}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyOutput()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    disabled={savingDraft}
                    onClick={() => void handleSaveAsDraft()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save as Draft (Needs Editor Approval)
                  </button>
                </div>
              </div>

              {savedNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{savedNotice}</span>
                </div>
              )}

              {result.structured?.verificationFindings && result.structured.verificationFindings.length > 0 ? (
                <div className="space-y-2.5">
                  {result.structured.summary && (
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {result.structured.summary}
                    </p>
                  )}
                  {result.structured.verificationFindings.map((f, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">{f.claim}</span>
                        <span
                          className={`text-[10px] font-bold uppercase ${
                            f.status === 'supported'
                              ? 'text-emerald-600'
                              : f.status === 'unverified'
                              ? 'text-rose-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {f.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-500 dark:text-slate-400">{f.note}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
                  {result.outputText}
                </div>
              )}

              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>Model: {result.model} · Automatic publishing is disabled for AI drafts.</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
