import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  EyeOff,
  ImagePlus,
  LayoutGrid,
  MapPin,
  Megaphone,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_FEED_CATEGORIES,
  DEFAULT_HOMEPAGE_ANNOUNCEMENT,
} from '../../constants/platformCatalog';
import {
  addAdminLocality,
  deleteAdminLocality,
  fetchAdminPlatformOverview,
  saveAdminDisplaySettings,
  saveAdminFeedCategories,
  saveAdminHomepageAnnouncement,
  saveAdminHomepageSections,
} from '../../services/platformClient';
import type {
  AnnouncementButtonAction,
  FeedCategoryConfig,
  HomepageAnnouncementConfig,
  HomepageSectionConfig,
  LocalityOption,
  PlatformDisplaySettings,
} from '../../types/platform';
import {
  FEED_CATEGORY_ICON_OPTIONS,
  renderFeedCategoryIcon,
} from '../CategoryBar';

const BUTTON_ACTION_OPTIONS: Array<{ value: AnnouncementButtonAction; label: string }> = [
  { value: 'open-submit-modal', label: 'Open Add Your Information Form' },
  { value: 'filter:marketplace', label: 'Filter Feed: Buy & Sell' },
  { value: 'filter:all', label: 'Filter Feed: All Community Posts' },
  { value: 'filter:news', label: 'Filter Feed: News' },
  { value: 'filter:community', label: 'Filter Feed: Community Posts' },
  { value: 'filter:jobs', label: 'Filter Feed: Jobs' },
  { value: 'filter:businesses', label: 'Filter Feed: Shops & Businesses' },
  { value: 'route:/community', label: 'Open Page: Coffeenadu Community (/community)' },
  { value: 'route:/marketplace', label: 'Open Page: Buy & Sell (/marketplace)' },
  { value: 'route:/businesses', label: 'Open Page: Local Shops (/businesses)' },
  { value: 'route:/jobs', label: 'Open Page: Local Jobs (/jobs)' },
  { value: 'route:/events', label: 'Open Page: Events (/events)' },
  { value: 'route:/ads', label: 'Open Page: Local Ads (/ads)' },
  { value: 'custom-url', label: 'Custom HTTPS URL' },
];

export const Admin2HomepageBuilderSection: React.FC = () => {
  const [announcement, setAnnouncement] = useState<HomepageAnnouncementConfig>(
    DEFAULT_HOMEPAGE_ANNOUNCEMENT
  );
  const [feedCategories, setFeedCategories] = useState<FeedCategoryConfig[]>(
    DEFAULT_FEED_CATEGORIES
  );
  const [displaySettings, setDisplaySettings] = useState<PlatformDisplaySettings>(
    DEFAULT_DISPLAY_SETTINGS
  );
  const [sections, setSections] = useState<HomepageSectionConfig[]>([]);
  const [localities, setLocalities] = useState<LocalityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTarget, setSavingTarget] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [newLoc, setNewLoc] = useState({ nameEn: '', nameKn: '', taluk: 'Koppa' });

  useEffect(() => {
    fetchAdminPlatformOverview()
      .then((res) => {
        setSections(res.homepageSections || []);
        setLocalities(res.localities || []);
        if (res.homepageAnnouncement) {
          setAnnouncement(res.homepageAnnouncement);
        }
        if (Array.isArray(res.feedCategories) && res.feedCategories.length > 0) {
          setFeedCategories(res.feedCategories);
        }
        if (res.displaySettings) {
          setDisplaySettings({
            ...DEFAULT_DISPLAY_SETTINGS,
            ...res.displaySettings,
            showViewCounts: Boolean(res.displaySettings.showViewCounts),
          });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  const handleBannerImageUpload = (file: File | null) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setError('Please upload a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Banner image must be 2 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAnnouncement((prev) => ({ ...prev, imageUrl: reader.result as string }));
        setError('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAnnouncement = async () => {
    setSavingTarget('announcement');
    setError('');
    setMessage('');
    try {
      const res = await saveAdminHomepageAnnouncement(announcement);
      setAnnouncement(res.announcement);
      setMessage('Homepage Announcement Banner saved live.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save announcement banner.');
    } finally {
      setSavingTarget(null);
    }
  };

  const moveFeedCategory = (index: number, delta: -1 | 1) => {
    if (feedCategories[index]?.id === 'all') return;
    const nextIdx = index + delta;
    if (nextIdx <= 0 || nextIdx >= feedCategories.length) return;
    const copy = [...feedCategories];
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, moved);
    setFeedCategories(copy.map((c, i) => ({ ...c, order: i + 1 })));
  };

  const handleSaveFeedCategories = async () => {
    setSavingTarget('categories');
    setError('');
    setMessage('');
    try {
      const res = await saveAdminFeedCategories(feedCategories);
      setFeedCategories(res.feedCategories);
      setMessage(`All ${res.feedCategories.length} feed categories updated live.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save feed categories.');
    } finally {
      setSavingTarget(null);
    }
  };

  const handleSaveDisplaySettings = async () => {
    setSavingTarget('display');
    setError('');
    setMessage('');
    try {
      const res = await saveAdminDisplaySettings(displaySettings);
      setDisplaySettings(res.displaySettings);
      setMessage('Homepage visibility and view-count display settings saved live.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save display settings.');
    } finally {
      setSavingTarget(null);
    }
  };

  const moveSection = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= sections.length) return;
    const copy = [...sections];
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, moved);
    setSections(copy.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const handleSaveSections = async () => {
    setSavingTarget('sections');
    setError('');
    setMessage('');
    try {
      const res = await saveAdminHomepageSections(sections);
      setSections(res.sections);
      setMessage('Homepage ecosystem layout saved live.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save homepage layout.');
    } finally {
      setSavingTarget(null);
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

  const inputClass =
    'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#176B4A]';

  if (loading) {
    return <div className="h-40 rounded-xl bg-slate-100 dark:bg-slate-900 animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-2.5 text-xs font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-4 py-2.5 text-xs font-semibold text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* 0. Homepage Visibility & View Count Display Controls */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <EyeOff className="w-5 h-5 text-[#14452F] dark:text-[#D9A441] mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Homepage Visibility &amp; View Counts Setting
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Control visible homepage blocks and whether view counts appear on cards. All database view-count fields remain preserved even while hidden.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={savingTarget === 'display'}
            onClick={() => void handleSaveDisplaySettings()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#14452F] hover:bg-[#1D6B4A] dark:bg-[#D9A441] dark:text-[#0D1B18] px-4 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {savingTarget === 'display' ? 'Saving...' : 'Save Display Settings'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/30 p-3">
            <EyeOff className="mt-0.5 w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <div>
              <div className="font-bold text-slate-900 dark:text-white">
                Public View Counts: Strictly Hidden (Admin-Only)
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                View counts are never shown to public visitors. All historical and live counts for News, Ads, Community Posts, and Sales/Listings are visible only inside this Admin Panel.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={displaySettings.showBreakingTicker}
              onChange={(e) =>
                setDisplaySettings((prev) => ({ ...prev, showBreakingTicker: e.target.checked }))
              }
              className="mt-0.5 w-4 h-4 accent-[#14452F]"
            />
            <div>
              <div className="font-bold text-slate-900 dark:text-white">Breaking News Ticker</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Show breaking stories strip below the top header.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={displaySettings.showCategoryGrid}
              onChange={(e) =>
                setDisplaySettings((prev) => ({ ...prev, showCategoryGrid: e.target.checked }))
              }
              className="mt-0.5 w-4 h-4 accent-[#14452F]"
            />
            <div>
              <div className="font-bold text-slate-900 dark:text-white">31-Category Grid</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Display all enabled community categories above the unified feed.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={displaySettings.showTrendingSection}
              onChange={(e) =>
                setDisplaySettings((prev) => ({ ...prev, showTrendingSection: e.target.checked }))
              }
              className="mt-0.5 w-4 h-4 accent-[#14452F]"
            />
            <div>
              <div className="font-bold text-slate-900 dark:text-white">Top Stories Sidebar</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Show highlighted regional news stories without view counts.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={displaySettings.showCommunityFeed}
              onChange={(e) =>
                setDisplaySettings((prev) => ({ ...prev, showCommunityFeed: e.target.checked }))
              }
              className="mt-0.5 w-4 h-4 accent-[#14452F]"
            />
            <div>
              <div className="font-bold text-slate-900 dark:text-white">Unified Community Feed</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Main COFFEENADU COMMUNITY feed combining news and local posts.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* 1. Admin-Controlled Bilingual Homepage Announcement Banner */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Megaphone className="w-5 h-5 text-[#176B4A] dark:text-[#D9A441] mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Homepage Announcement &amp; Action Banner
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Edit Kannada &amp; English headings, description, buttons, banner image, visibility toggle, and optional schedule dates.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer">
              <input
                type="checkbox"
                checked={announcement.enabled}
                onChange={(e) =>
                  setAnnouncement((prev) => ({ ...prev, enabled: e.target.checked }))
                }
                className="w-4 h-4 accent-[#176B4A]"
              />
              <span>Enabled on Homepage</span>
            </label>

            <button
              type="button"
              disabled={savingTarget === 'announcement'}
              onClick={() => void handleSaveAnnouncement()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#176B4A] hover:bg-[#12553A] px-4 py-2 text-xs font-bold text-white cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {savingTarget === 'announcement' ? 'Saving...' : 'Save Banner'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              Kannada Heading (ಶೀರ್ಷಿಕೆ)
            </label>
            <input
              value={announcement.headingKn}
              onChange={(e) =>
                setAnnouncement((prev) => ({ ...prev, headingKn: e.target.value }))
              }
              className={`${inputClass} font-kannada`}
              placeholder="ನಿಮ್ಮ ಊರಿನ ಮಾಹಿತಿಯನ್ನು ಮಲೆನಾಡಿನ ಜನರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ!"
            />
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              Kannada Description (ವಿವರಣೆ)
            </label>
            <textarea
              rows={2}
              value={announcement.descriptionKn}
              onChange={(e) =>
                setAnnouncement((prev) => ({ ...prev, descriptionKn: e.target.value }))
              }
              className={`${inputClass} font-kannada`}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              English Heading
            </label>
            <input
              value={announcement.headingEn}
              onChange={(e) =>
                setAnnouncement((prev) => ({ ...prev, headingEn: e.target.value }))
              }
              className={inputClass}
              placeholder="Share Your Local Information with Malnad!"
            />
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              English Description
            </label>
            <textarea
              rows={2}
              value={announcement.descriptionEn}
              onChange={(e) =>
                setAnnouncement((prev) => ({ ...prev, descriptionEn: e.target.value }))
              }
              className={inputClass}
            />
          </div>
        </div>

        {/* Optional Banner Image + Schedule Dates */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
          <div className="lg:col-span-6 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              Optional Banner Image (Upload or HTTPS URL)
            </label>
            <div className="flex items-center gap-2">
              <input
                value={announcement.imageUrl?.startsWith('data:') ? '[Uploaded Image]' : announcement.imageUrl || ''}
                onChange={(e) =>
                  setAnnouncement((prev) => ({ ...prev, imageUrl: e.target.value }))
                }
                placeholder="https://... or upload image"
                className={inputClass}
              />
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer shrink-0 hover:bg-slate-100 dark:hover:bg-slate-700">
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Upload</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleBannerImageUpload(e.target.files?.[0] || null)}
                />
              </label>
              {announcement.imageUrl && (
                <button
                  type="button"
                  onClick={() => setAnnouncement((prev) => ({ ...prev, imageUrl: '' }))}
                  className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                  title="Remove banner image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {announcement.imageUrl && (
              <img
                src={announcement.imageUrl}
                alt="Announcement banner preview"
                className="h-24 w-48 object-contain bg-[#F4F1EA] dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 mt-1"
              />
            )}
          </div>

          <div className="lg:col-span-3 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              Schedule Start Date (Optional)
            </label>
            <input
              type="date"
              value={announcement.startDate || ''}
              onChange={(e) =>
                setAnnouncement((prev) => ({ ...prev, startDate: e.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div className="lg:col-span-3 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              Schedule End Date (Optional)
            </label>
            <input
              type="date"
              value={announcement.endDate || ''}
              onChange={(e) =>
                setAnnouncement((prev) => ({ ...prev, endDate: e.target.value }))
              }
              className={inputClass}
            />
          </div>
        </div>

        {/* Action Buttons Config */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
            Action Buttons ({announcement.buttons.length})
          </p>
          <div className="space-y-2">
            {announcement.buttons.map((btn, idx) => (
              <div
                key={btn.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-2.5"
              >
                <div className="md:col-span-3">
                  <input
                    value={btn.labelKn}
                    onChange={(e) => {
                      const next = [...announcement.buttons];
                      next[idx] = { ...btn, labelKn: e.target.value };
                      setAnnouncement((prev) => ({ ...prev, buttons: next }));
                    }}
                    placeholder="Kannada Button Label"
                    className={`${inputClass} font-kannada`}
                  />
                </div>
                <div className="md:col-span-3">
                  <input
                    value={btn.labelEn}
                    onChange={(e) => {
                      const next = [...announcement.buttons];
                      next[idx] = { ...btn, labelEn: e.target.value };
                      setAnnouncement((prev) => ({ ...prev, buttons: next }));
                    }}
                    placeholder="English Button Label"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-4">
                  <select
                    value={btn.action}
                    onChange={(e) => {
                      const next = [...announcement.buttons];
                      next[idx] = {
                        ...btn,
                        action: e.target.value as AnnouncementButtonAction,
                      };
                      setAnnouncement((prev) => ({ ...prev, buttons: next }));
                    }}
                    className={`${inputClass} [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-950 dark:[&>option]:text-slate-100`}
                  >
                    {BUTTON_ACTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <select
                    value={btn.variant}
                    onChange={(e) => {
                      const next = [...announcement.buttons];
                      next[idx] = {
                        ...btn,
                        variant: e.target.value as 'primary' | 'secondary' | 'outline',
                      };
                      setAnnouncement((prev) => ({ ...prev, buttons: next }));
                    }}
                    className={`${inputClass} [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-950 dark:[&>option]:text-slate-100`}
                  >
                    <option value="primary">Primary (Green)</option>
                    <option value="secondary">Secondary (Navy/Gold)</option>
                    <option value="outline">Outline</option>
                  </select>
                </div>
                {btn.action === 'custom-url' && (
                  <div className="md:col-span-12">
                    <input
                      value={btn.customUrl || ''}
                      onChange={(e) => {
                        const next = [...announcement.buttons];
                        next[idx] = { ...btn, customUrl: e.target.value };
                        setAnnouncement((prev) => ({ ...prev, buttons: next }));
                      }}
                      placeholder="https://coffeenadu.in/..."
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. All 31 Community Categories Manager (Rename, Icon, Enable/Disable & Reorder) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <LayoutGrid className="w-5 h-5 text-[#14452F] dark:text-[#D9A441] mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                All {feedCategories.length} Community Feed Categories
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Enable, disable, rename (Kannada &amp; English), change icon, or rearrange all {feedCategories.length} community categories. All enabled categories display together in the responsive homepage grid.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={savingTarget === 'categories'}
            onClick={() => void handleSaveFeedCategories()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#14452F] hover:bg-[#1D6B4A] dark:bg-[#D9A441] dark:text-[#0D1B18] px-4 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {savingTarget === 'categories' ? 'Saving...' : `Save ${feedCategories.length} Categories`}
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
          {feedCategories.map((cat, idx) => (
            <div
              key={cat.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-2.5 flex flex-wrap sm:flex-nowrap items-center gap-2 text-xs"
            >
              <input
                type="checkbox"
                checked={cat.id === 'all' ? true : cat.enabled}
                disabled={cat.id === 'all'}
                onChange={(e) => {
                  const copy = [...feedCategories];
                  copy[idx] = { ...cat, enabled: e.target.checked };
                  setFeedCategories(copy);
                }}
                aria-label={`Enable category ${cat.labelEn}`}
                className="w-4 h-4 accent-[#14452F] shrink-0"
              />
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 w-6 tabular-nums shrink-0">
                #{idx + 1}
              </span>
              <span className="w-7 h-7 rounded-lg bg-[#EEF5F0] dark:bg-slate-800 text-[#14452F] dark:text-[#D9A441] flex items-center justify-center shrink-0">
                {renderFeedCategoryIcon(cat.icon)}
              </span>
              <input
                value={cat.labelKn}
                onChange={(e) => {
                  const copy = [...feedCategories];
                  copy[idx] = { ...cat, labelKn: e.target.value };
                  setFeedCategories(copy);
                }}
                aria-label={`${cat.id} Kannada label`}
                className="flex-1 min-w-[110px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1 font-kannada"
              />
              <input
                value={cat.labelEn}
                onChange={(e) => {
                  const copy = [...feedCategories];
                  copy[idx] = { ...cat, labelEn: e.target.value };
                  setFeedCategories(copy);
                }}
                aria-label={`${cat.id} English label`}
                className="flex-1 min-w-[100px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1"
              />
              <select
                value={cat.icon}
                onChange={(e) => {
                  const copy = [...feedCategories];
                  copy[idx] = { ...cat, icon: e.target.value };
                  setFeedCategories(copy);
                }}
                aria-label={`${cat.id} icon`}
                className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-1.5 py-1 text-[11px] shrink-0 [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-950 dark:[&>option]:text-slate-100"
              >
                {FEED_CATEGORY_ICON_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={idx <= 1}
                  onClick={() => moveFeedCategory(idx, -1)}
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 cursor-pointer"
                  title="Move Up"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={idx === 0 || idx === feedCategories.length - 1}
                  onClick={() => moveFeedCategory(idx, 1)}
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 cursor-pointer"
                  title="Move Down"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Existing Homepage Ecosystem Sections Editor */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Ecosystem Directory Sections ({sections.length})
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Configure secondary Malnad directory highlight strips below the main feed.
            </p>
          </div>
          <button
            type="button"
            disabled={savingTarget === 'sections'}
            onClick={() => void handleSaveSections()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#176B4A] hover:bg-[#12553A] px-4 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {savingTarget === 'sections' ? 'Saving...' : 'Save Sections'}
          </button>
        </div>

        <div className="space-y-2">
          {sections.map((sec, idx) => (
            <div
              key={sec.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center text-xs"
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
                  className="w-4 h-4 accent-[#176B4A]"
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
                  className={`${inputClass} font-kannada`}
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
                  className={inputClass}
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
                  className={`${inputClass} text-center`}
                />
              </div>

              <div className="lg:col-span-2 flex justify-end gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveSection(idx, -1)}
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 cursor-pointer"
                  title="Move Up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === sections.length - 1}
                  onClick={() => moveSection(idx, 1)}
                  className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-30 cursor-pointer"
                  title="Move Down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Malnad Villages / Localities Manager */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#176B4A] dark:text-[#D9A441]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Malnad Towns &amp; Villages Selector ({localities.length})
          </h3>
        </div>

        <form onSubmit={handleAddLocality} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
          <input
            required
            value={newLoc.nameEn}
            onChange={(e) => setNewLoc({ ...newLoc, nameEn: e.target.value })}
            placeholder="Village Name (English)"
            className={inputClass}
          />
          <input
            value={newLoc.nameKn}
            onChange={(e) => setNewLoc({ ...newLoc, nameKn: e.target.value })}
            placeholder="ಊರಿನ ಹೆಸರು (ಕನ್ನಡ)"
            className={`${inputClass} font-kannada`}
          />
          <input
            value={newLoc.taluk}
            onChange={(e) => setNewLoc({ ...newLoc, taluk: e.target.value })}
            placeholder="Taluk (e.g., Koppa)"
            className={inputClass}
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#10243D] hover:bg-[#183558] dark:bg-[#D9A441] dark:text-[#10243D] text-white font-bold px-3 py-2 cursor-pointer"
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
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {loc.nameEn} ({loc.nameKn})
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">{loc.taluk}</span>
              <button
                type="button"
                onClick={async () => {
                  const res = await deleteAdminLocality(loc.id);
                  setLocalities(res.localities);
                }}
                className="text-rose-600 dark:text-rose-400 hover:text-rose-800 cursor-pointer"
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
