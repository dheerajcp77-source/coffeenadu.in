import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, MapPin, Plus, Save, Trash2 } from 'lucide-react';
import {
  addAdminLocality,
  deleteAdminLocality,
  fetchAdminPlatformOverview,
  saveAdminHomepageSections,
} from '../../services/platformClient';
import type { HomepageSectionConfig, LocalityOption } from '../../types/platform';

export const Admin2HomepageBuilderSection: React.FC = () => {
  const [sections, setSections] = useState<HomepageSectionConfig[]>([]);
  const [localities, setLocalities] = useState<LocalityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [newLoc, setNewLoc] = useState({ nameEn: '', nameKn: '', taluk: 'Koppa' });

  useEffect(() => {
    fetchAdminPlatformOverview()
      .then((res) => {
        setSections(res.homepageSections || []);
        setLocalities(res.localities || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const moveSection = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= sections.length) return;
    const copy = [...sections];
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, moved);
    setSections(copy.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const handleSaveSections = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await saveAdminHomepageSections(sections);
      setSections(res.sections);
      setMessage('Homepage layout, visibility, and titles saved live.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save homepage layout.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLocality = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await addAdminLocality(newLoc);
      setLocalities(res.localities);
      setNewLoc({ nameEn: '', nameKn: '', taluk: 'Koppa' });
      setMessage('New Malnad locality added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add locality.');
    }
  };

  if (loading) {
    return <div className="h-40 rounded-xl bg-slate-100 dark:bg-slate-900 animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Homepage Layout & Malnad Localities Builder
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enable/disable homepage ecosystem modules, reorder sections, edit Kannada & English headings, control item counts, and manage supported villages.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveSections()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#176B4A] hover:bg-[#12553A] px-4 py-2 text-xs font-bold text-white cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving...' : 'Save Homepage Layout'}
        </button>
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Homepage Sections Editor */}
      <div className="space-y-2.5">
        {sections.map((sec, idx) => (
          <div
            key={sec.id}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center text-xs"
          >
            <div className="lg:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={sec.enabled}
                onChange={(e) => {
                  const copy = [...sections];
                  copy[idx] = { ...sec, enabled: e.target.checked };
                  setSections(copy);
                }}
                aria-label={`Enable ${sec.titleEn}`}
              />
              <span className="font-bold uppercase text-[11px] text-[#176B4A] dark:text-emerald-400">
                #{idx + 1} {sec.module}
              </span>
            </div>

            <div className="lg:col-span-4">
              <input
                value={sec.titleKn}
                onChange={(e) => {
                  const copy = [...sections];
                  copy[idx] = { ...sec, titleKn: e.target.value };
                  setSections(copy);
                }}
                placeholder="Kannada Title"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 font-kannada"
              />
            </div>

            <div className="lg:col-span-3">
              <input
                value={sec.titleEn}
                onChange={(e) => {
                  const copy = [...sections];
                  copy[idx] = { ...sec, titleEn: e.target.value };
                  setSections(copy);
                }}
                placeholder="English Title"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5"
              />
            </div>

            <div className="lg:col-span-1">
              <input
                type="number"
                min={1}
                max={12}
                value={sec.maxItems}
                onChange={(e) => {
                  const copy = [...sections];
                  copy[idx] = { ...sec, maxItems: Number(e.target.value) || 4 };
                  setSections(copy);
                }}
                title="Max items shown"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-center"
              />
            </div>

            <div className="lg:col-span-2 flex justify-end gap-1">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => moveSection(idx, -1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                title="Move Up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={idx === sections.length - 1}
                onClick={() => moveSection(idx, 1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                title="Move Down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Malnad Villages / Localities Manager */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#176B4A]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Malnad Towns & Villages Selector ({localities.length})
          </h3>
        </div>

        <form onSubmit={handleAddLocality} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
          <input
            required
            value={newLoc.nameEn}
            onChange={(e) => setNewLoc({ ...newLoc, nameEn: e.target.value })}
            placeholder="Village Name (English)"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
          />
          <input
            value={newLoc.nameKn}
            onChange={(e) => setNewLoc({ ...newLoc, nameKn: e.target.value })}
            placeholder="ಊರಿನ ಹೆಸರು (ಕನ್ನಡ)"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-kannada"
          />
          <input
            value={newLoc.taluk}
            onChange={(e) => setNewLoc({ ...newLoc, taluk: e.target.value })}
            placeholder="Taluk (e.g., Koppa)"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#10243D] text-white font-bold px-3 py-2 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Village
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {localities.map((loc) => (
            <div
              key={loc.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            >
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {loc.nameEn} ({loc.nameKn})
              </span>
              <span className="text-[10px] text-slate-400">{loc.taluk}</span>
              <button
                type="button"
                onClick={async () => {
                  const res = await deleteAdminLocality(loc.id);
                  setLocalities(res.localities);
                }}
                className="text-rose-500 hover:text-rose-700 cursor-pointer"
                title="Remove locality"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
