import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Save, ShieldCheck } from 'lucide-react';
import { fetchAdmin2Settings, saveAdmin2Settings } from '../../services/admin2Client';
import type { Admin2WebsiteSettings } from '../../types/admin2';

export function Admin2SettingsSection() {
  const [settings, setSettings] = useState<Admin2WebsiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    void fetchAdmin2Settings()
      .then((res) => setSettings(res.settings))
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Unable to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setFeedback('');
    setErrorMsg('');
    try {
      const res = await saveAdmin2Settings(settings);
      setSettings(res.settings);
      setFeedback('Website settings saved cleanly.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading website settings…
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Website Settings
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure CoffeeNadu News identity, WhatsApp helpline, SEO defaults, watermark branding, and optional analytics integrations.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#13294B] disabled:opacity-60 dark:bg-blue-600"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Settings
        </button>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 text-xs">
        {/* Portal Branding */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Portal Identity &amp; Language</h3>
          <div>
            <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Website Name</label>
            <input
              type="text"
              value={settings.siteName}
              onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Tagline</label>
            <input
              type="text"
              value={settings.siteTagline}
              onChange={(e) => setSettings({ ...settings, siteTagline: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Canonical Base URL</label>
              <input
                type="url"
                value={settings.canonicalBaseUrl}
                onChange={(e) => setSettings({ ...settings, canonicalBaseUrl: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Default Editorial Language</label>
              <select
                value={settings.defaultLanguage}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultLanguage: e.target.value as Admin2WebsiteSettings['defaultLanguage'],
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="Kannada">Kannada</option>
                <option value="English">English</option>
                <option value="Bilingual">Bilingual</option>
              </select>
            </div>
          </div>
        </section>

        {/* Image Branding Preservation */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">CoffeeNadu Image Branding</h3>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Preserved
            </span>
          </div>
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">Circular Top-Left CoffeeNadu Logo</p>
              <p className="text-[11px] text-slate-500">Auto-applied on newly uploaded news &amp; event photos.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.watermarkLogoEnabled}
              onChange={(e) => setSettings({ ...settings, watermarkLogoEnabled: e.target.checked })}
              className="h-4 w-4 accent-[#0B192C]"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">2x Middle Text Overlay</p>
              <p className="text-[11px] text-slate-500">Repeated twice across the center of new news photos.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.watermarkMiddleTextEnabled}
              onChange={(e) => setSettings({ ...settings, watermarkMiddleTextEnabled: e.target.checked })}
              className="h-4 w-4 accent-[#0B192C]"
            />
          </label>
          <div>
            <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Overlay Text Label</label>
            <input
              type="text"
              value={settings.watermarkMiddleText}
              onChange={(e) => setSettings({ ...settings, watermarkMiddleText: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </section>

        {/* Messaging & WhatsApp */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">WhatsApp &amp; Reader Messaging</h3>
          <div>
            <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
              Official WhatsApp Helpline Number
            </label>
            <input
              type="text"
              value={settings.whatsappNumber}
              onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })}
              placeholder="9481033743"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 tabular-nums dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
              WhatsApp Community / Group Invite URL (Optional)
            </label>
            <input
              type="url"
              value={settings.whatsappGroupUrl}
              onChange={(e) => setSettings({ ...settings, whatsappGroupUrl: e.target.value })}
              placeholder="https://chat.whatsapp.com/..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </section>

        {/* SEO & Optional Analytics */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Default SEO &amp; Optional Google Integrations
          </h3>
          <div>
            <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Default SEO Title</label>
            <input
              type="text"
              value={settings.defaultSeoTitle}
              onChange={(e) => setSettings({ ...settings, defaultSeoTitle: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Default Meta Description</label>
            <textarea
              rows={2}
              value={settings.defaultMetaDescription}
              onChange={(e) => setSettings({ ...settings, defaultMetaDescription: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                GA4 Measurement ID (Optional)
              </label>
              <input
                type="text"
                value={settings.ga4MeasurementId}
                onChange={(e) => setSettings({ ...settings, ga4MeasurementId: e.target.value })}
                placeholder="G-XXXXXXXXXX"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                Search Console Property URL
              </label>
              <input
                type="url"
                value={settings.searchConsoleSiteUrl}
                onChange={(e) => setSettings({ ...settings, searchConsoleSiteUrl: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
        </section>
      </div>

      <p className="text-[11px] text-slate-400">
        Last updated {new Date(settings.updatedAt).toLocaleString('en-IN')} by {settings.updatedBy}
      </p>
    </form>
  );
}
