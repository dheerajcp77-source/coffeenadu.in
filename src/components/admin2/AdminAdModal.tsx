import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  Globe,
  ImagePlus,
  Loader2,
  MapPin,
  Megaphone,
  MessageCircle,
  PencilLine,
  Phone,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AD_CATEGORIES,
  type AdExtraImage,
  type AdStatus,
  type Advertisement,
  type AdvertisementPayload,
} from '../../types/ads';
import { processAndUploadAdImage } from '../../services/adsClient';
import {
  addDaysToYmd,
  buildTelHref,
  buildWhatsAppAdHref,
  formatReadableAdDate,
  getTodayIstYmd,
  sanitizeExternalWebsiteUrl,
} from '../../utils/adHelpers';
import { sanitizeRichTextHtml } from '../../utils/richText';
import { AdImage } from '../AdImage';
import { RichTextEditor } from '../RichTextEditor';

interface AdminAdModalProps {
  isOpen: boolean;
  editingAd: Advertisement | null;
  nextAdNumber: string;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: AdvertisementPayload) => Promise<void>;
  onDelete?: (ad: Advertisement) => Promise<void>;
}

const MAX_ADDITIONAL_IMAGES = 10;

export function AdminAdModal({
  isOpen,
  editingAd,
  nextAdNumber,
  isSaving,
  onClose,
  onSubmit,
  onDelete,
}: AdminAdModalProps) {
  const mainFileInputRef = useRef<HTMLInputElement | null>(null);
  const extraFileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mainImageUrl, setMainImageUrl] = useState('');
  const [mainImageThumbUrl, setMainImageThumbUrl] = useState('');
  const [mainImageDriveId, setMainImageDriveId] = useState('');
  const [additionalImages, setAdditionalImages] = useState<AdExtraImage[]>([]);
  const [contactNumber, setContactNumber] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [category, setCategory] = useState<string>(AD_CATEGORIES[0]);
  const [status, setStatus] = useState<AdStatus>('active');
  const [publishDate, setPublishDate] = useState<string>(() => getTodayIstYmd());
  const [expiryDate, setExpiryDate] = useState<string>(() => addDaysToYmd(getTodayIstYmd(), 30));

  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode('edit');
    setFormError('');
    setUploadNotice('');
    setConfirmDelete(false);
    setIsDeleting(false);

    if (editingAd) {
      setTitle(editingAd.title || '');
      setDescription(editingAd.description || '');
      setMainImageUrl(editingAd.mainImageUrl || '');
      setMainImageThumbUrl(editingAd.mainImageThumbUrl || '');
      setMainImageDriveId(editingAd.mainImageDriveId || '');
      setAdditionalImages(Array.isArray(editingAd.additionalImages) ? editingAd.additionalImages : []);
      setContactNumber(editingAd.contactNumber || '');
      setWhatsappNumber(editingAd.whatsappNumber || '');
      setBusinessAddress(editingAd.businessAddress || '');
      setWebsiteUrl(editingAd.websiteUrl || '');
      setCategory(editingAd.category || AD_CATEGORIES[0]);
      setStatus(editingAd.status || 'active');
      setPublishDate(editingAd.publishDate || getTodayIstYmd());
      setExpiryDate(editingAd.expiryDate || addDaysToYmd(getTodayIstYmd(), 30));
    } else {
      const today = getTodayIstYmd();
      setTitle('');
      setDescription('');
      setMainImageUrl('');
      setMainImageThumbUrl('');
      setMainImageDriveId('');
      setAdditionalImages([]);
      setContactNumber('');
      setWhatsappNumber('');
      setBusinessAddress('');
      setWebsiteUrl('');
      setCategory(AD_CATEGORIES[0]);
      setStatus('active');
      setPublishDate(today);
      setExpiryDate(addDaysToYmd(today, 30));
    }
  }, [isOpen, editingAd]);

  if (!isOpen) return null;

  const displayAdNumber = editingAd?.adNumber || nextAdNumber || 'AD001';

  const handleMainImageSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFormError('');
    setUploadNotice('');
    setUploadingMain(true);
    try {
      const uploaded = await processAndUploadAdImage(file);
      setMainImageUrl(uploaded.imageUrl);
      setMainImageThumbUrl(uploaded.imageThumbUrl || '');
      setMainImageDriveId(uploaded.imageDriveId || '');
      setUploadNotice(
        uploaded.uploadedToDrive
          ? 'Original advertisement image uploaded to Google Drive without any logo or overlay.'
          : 'Original advertisement image uploaded cleanly without any logo or overlay.'
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to upload main advertisement image.');
    } finally {
      setUploadingMain(false);
    }
  };

  const handleAdditionalImagesSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const remaining = MAX_ADDITIONAL_IMAGES - additionalImages.length;
    if (remaining <= 0) {
      setFormError(`Maximum of ${MAX_ADDITIONAL_IMAGES} additional images allowed per advertisement.`);
      return;
    }

    const toUpload = files.slice(0, remaining);
    setFormError('');
    setUploadNotice('');
    setUploadingExtra(true);

    try {
      const newlyUploaded: AdExtraImage[] = [];
      for (const file of toUpload) {
        const res = await processAndUploadAdImage(file);
        newlyUploaded.push({
          imageUrl: res.imageUrl,
          imageThumbUrl: res.imageThumbUrl,
          imageDriveId: res.imageDriveId,
          caption: '',
        });
      }
      setAdditionalImages((prev) => [...prev, ...newlyUploaded]);
      setUploadNotice(
        `${newlyUploaded.length} additional image${newlyUploaded.length === 1 ? '' : 's'} added cleanly (original unmodified creative).`
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to upload additional image.');
    } finally {
      setUploadingExtra(false);
    }
  };

  const moveExtraImage = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= additionalImages.length) return;
    setAdditionalImages((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  };

  const updateExtraCaption = (idx: number, caption: string) => {
    setAdditionalImages((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, caption } : item))
    );
  };

  const removeExtraImage = (idx: number) => {
    setAdditionalImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitWithStatus = async (desiredStatus: AdStatus) => {
    setFormError('');

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError('Please enter an advertisement title.');
      setMode('edit');
      return;
    }
    if (!mainImageUrl.trim()) {
      setFormError('Please upload the main advertisement image before saving.');
      setMode('edit');
      return;
    }
    if (!publishDate || !expiryDate) {
      setFormError('Please choose both Publish Date and Expiry Date.');
      setMode('edit');
      return;
    }
    if (expiryDate < publishDate) {
      setFormError('Expiry Date must be on or after the Publish Date.');
      setMode('edit');
      return;
    }

    let safeWebsite = '';
    if (websiteUrl.trim()) {
      safeWebsite = sanitizeExternalWebsiteUrl(websiteUrl);
      if (!safeWebsite) {
        setFormError('Website Link must be a valid http:// or https:// URL.');
        setMode('edit');
        return;
      }
    }

    const payload: AdvertisementPayload = {
      title: cleanTitle,
      description: sanitizeRichTextHtml(description),
      mainImageUrl: mainImageUrl.trim(),
      mainImageThumbUrl: mainImageThumbUrl.trim() || undefined,
      mainImageDriveId: mainImageDriveId.trim() || undefined,
      additionalImages,
      contactNumber: contactNumber.trim() || undefined,
      whatsappNumber: whatsappNumber.trim() || undefined,
      businessAddress: businessAddress.trim() || undefined,
      websiteUrl: safeWebsite || undefined,
      category,
      status: desiredStatus,
      publishDate,
      expiryDate,
    };

    try {
      await onSubmit(payload);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save advertisement.');
    }
  };

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const effectiveStatus: AdStatus = editingAd ? status : status === 'draft' ? 'active' : status;
    await submitWithStatus(effectiveStatus);
  };

  const handleDeleteConfirm = async () => {
    if (!editingAd || !onDelete) return;
    setIsDeleting(true);
    setFormError('');
    try {
      await onDelete(editingAd);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to delete advertisement.');
      setIsDeleting(false);
    }
  };

  const previewTelHref = contactNumber.trim() ? buildTelHref(contactNumber) : '';
  const previewWaHref = whatsappNumber.trim()
    ? buildWhatsAppAdHref(whatsappNumber, {
        adNumber: displayAdNumber,
        title: title.trim() || 'Local Advertisement',
      })
    : '';
  const previewWebsite = sanitizeExternalWebsiteUrl(websiteUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-ad-modal-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0F172A]">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#0B192C] px-4 py-3.5 text-white sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30">
              <Megaphone className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="admin-ad-modal-title" className="truncate text-sm sm:text-base font-bold">
                {editingAd ? 'Edit Local Advertisement' : 'Add Local Advertisement'}
              </h2>
              <p className="text-[11px] text-slate-300 tabular-nums">
                Advertisement ID: <span className="font-mono font-bold text-amber-300">{displayAdNumber}</span>
                {' · '}Original image preserved (zero logo or overlay)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Edit / Preview Segmented Toggle */}
            <div className="inline-flex rounded-lg bg-white/10 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('edit')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'edit'
                    ? 'bg-white text-[#0B192C]'
                    : 'text-slate-200 hover:text-white'
                }`}
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Editor</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('preview')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'preview'
                    ? 'bg-amber-400 text-[#0B192C]'
                    : 'text-slate-200 hover:text-white'
                }`}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Preview Ad</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isDeleting}
              aria-label="Close advertisement modal"
              className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <form
          id="admin-ad-form"
          onSubmit={(e) => void handleFormSubmit(e)}
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 space-y-6"
        >
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" aria-hidden="true" />
              <span className="font-medium leading-relaxed">{formError}</span>
            </div>
          )}

          {uploadNotice && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
              <span className="font-medium">{uploadNotice}</span>
            </div>
          )}

          {mode === 'preview' ? (
            /* Live Public Preview Mode */
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-[#0F274A] dark:text-amber-300">
                      {displayAdNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{category}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Valid {formatReadableAdDate(publishDate)} – {formatReadableAdDate(expiryDate)}
                    </span>
                  </div>
                  <span className="font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Public Preview
                  </span>
                </div>

                <h3 className="font-kannada text-xl sm:text-2xl font-extrabold text-slate-950 dark:text-white leading-snug mb-4">
                  {title.trim() || 'Untitled Local Advertisement'}
                </h3>

                {/* Large Unmodified Main Image Preview */}
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                  <AdImage
                    src={mainImageUrl}
                    alt={title.trim() || 'Advertisement main preview'}
                    fit="contain"
                    lazy={false}
                    className="w-full max-h-[440px] flex items-center justify-center bg-white dark:bg-slate-950"
                    imgClassName="max-h-[440px] w-auto mx-auto"
                  />
                </div>

                {/* Rich Text Description */}
                {description.trim() && (
                  <div
                    className="article-rich-content font-kannada mt-5 text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed space-y-3"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(description) }}
                  />
                )}

                {/* Business Contact & Address Block */}
                {(businessAddress.trim() || previewTelHref || previewWaHref || previewWebsite) && (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
                    {businessAddress.trim() && (
                      <div className="flex items-start gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                        <MapPin className="h-4 w-4 shrink-0 text-[#0F274A] dark:text-amber-300 mt-0.5" />
                        <span className="font-kannada">{businessAddress.trim()}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {previewTelHref && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F274A] px-3.5 py-2 text-xs font-semibold text-white">
                          <Phone className="h-3.5 w-3.5" />
                          <span>Call {contactNumber.trim()}</span>
                        </span>
                      )}
                      {previewWaHref && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white">
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span>WhatsApp</span>
                        </span>
                      )}
                      {previewWebsite && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                          <Globe className="h-3.5 w-3.5" />
                          <span>Visit Website</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Additional Images Gallery Preview */}
                {additionalImages.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Additional Gallery Images ({additionalImages.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {additionalImages.map((img, idx) => (
                        <figure
                          key={`${img.imageUrl.slice(0, 24)}-${idx}`}
                          className="rounded-lg border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900"
                        >
                          <AdImage
                            src={img.imageUrl}
                            alt={img.caption || `Gallery image ${idx + 1}`}
                            fit="contain"
                            className="h-52 w-full bg-white dark:bg-slate-950"
                          />
                          {img.caption && (
                            <figcaption className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 font-kannada border-t border-slate-100 dark:border-slate-800">
                              {img.caption}
                            </figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Edit Form Mode */
            <div className="space-y-6">
              {/* Row 1: Ad Number (Auto) + Title */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Ad Number
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={displayAdNumber}
                    aria-label="Advertisement Number"
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-sm font-bold text-[#0F274A] tabular-nums dark:border-slate-700 dark:bg-slate-800/80 dark:text-amber-300 cursor-default"
                  />
                </div>
                <div className="sm:col-span-9">
                  <label
                    htmlFor="ad-title-input"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Advertisement Title <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="ad-title-input"
                    type="text"
                    required
                    maxLength={180}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter business or advertisement title (English or Kannada)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-kannada text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Row 2: Category, Status, Publish Date, Expiry Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label
                    htmlFor="ad-category-select"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Category
                  </label>
                  <select
                    id="ad-category-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {AD_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ad-status-select"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Status
                  </label>
                  <select
                    id="ad-status-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AdStatus)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="active">Active (Live on Website)</option>
                    <option value="inactive">Inactive (Paused)</option>
                    <option value="draft">Draft (Not Published)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ad-publish-date"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Publish Date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="ad-publish-date"
                    type="date"
                    required
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm tabular-nums text-slate-900 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ad-expiry-date"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Expiry Date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="ad-expiry-date"
                    type="date"
                    required
                    min={publishDate}
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm tabular-nums text-slate-900 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Row 3: Main Advertisement Image (Large Unmodified Preview) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-3 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Main Advertisement Image <span className="text-rose-600">*</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Displayed exactly as uploaded — no CoffeeNadu logo, no &ldquo;2X&rdquo; text, and no watermarks are ever added.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={mainFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleMainImageSelect(e)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingMain}
                      onClick={() => mainFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#142c4c] dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      {uploadingMain ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : mainImageUrl ? (
                        <RefreshCw className="h-3.5 w-3.5" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {uploadingMain
                          ? 'Uploading...'
                          : mainImageUrl
                          ? 'Replace Main Image'
                          : 'Upload Main Image'}
                      </span>
                    </button>

                    {mainImageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setMainImageUrl('');
                          setMainImageThumbUrl('');
                          setMainImageDriveId('');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>

                {mainImageUrl ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950">
                    <AdImage
                      src={mainImageUrl}
                      alt={title.trim() || 'Uploaded advertisement preview'}
                      fit="contain"
                      lazy={false}
                      className="w-full max-h-[380px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-950"
                      imgClassName="max-h-[360px] w-auto mx-auto"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={uploadingMain}
                    onClick={() => mainFileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-10 text-center transition-colors hover:border-[#0F274A] dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-amber-400 cursor-pointer"
                  >
                    <ImagePlus className="h-8 w-8 text-slate-400 mb-2" aria-hidden="true" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Click to upload the main advertisement poster or banner
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      JPG, PNG, or WebP · Shown full and unmodified in large preview
                    </p>
                  </button>
                )}
              </div>

              {/* Row 4: Additional Images Manager */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-3 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Additional Images ({additionalImages.length}/{MAX_ADDITIONAL_IMAGES})
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Optional gallery photos displayed on the full advertisement details page.
                    </p>
                  </div>
                  <div>
                    <input
                      ref={extraFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => void handleAdditionalImagesSelect(e)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingExtra || additionalImages.length >= MAX_ADDITIONAL_IMAGES}
                      onClick={() => extraFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      {uploadingExtra ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                      <span>{uploadingExtra ? 'Uploading...' : 'Add More Images'}</span>
                    </button>
                  </div>
                </div>

                {additionalImages.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {additionalImages.map((img, idx) => (
                      <div
                        key={`${img.imageUrl.slice(0, 24)}-${idx}`}
                        className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="relative h-36 w-full rounded-md overflow-hidden bg-slate-50 dark:bg-slate-950">
                          <AdImage
                            src={img.imageThumbUrl || img.imageUrl}
                            alt={img.caption || `Additional image ${idx + 1}`}
                            fit="contain"
                            className="h-full w-full"
                          />
                        </div>
                        <input
                          type="text"
                          maxLength={160}
                          value={img.caption || ''}
                          onChange={(e) => updateExtraCaption(idx, e.target.value)}
                          placeholder="Optional image caption..."
                          className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-kannada text-xs text-slate-800 focus:border-[#0F274A] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <span className="font-mono text-slate-400 tabular-nums">
                            Image #{idx + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveExtraImage(idx, -1)}
                              aria-label="Move image up"
                              className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === additionalImages.length - 1}
                              onClick={() => moveExtraImage(idx, 1)}
                              aria-label="Move image down"
                              className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeExtraImage(idx)}
                              aria-label="Remove image"
                              className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Row 5: Advertisement Description (Rich Text Editor) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Advertisement Description
                </label>
                <RichTextEditor
                  id="ad-description-editor"
                  value={description}
                  onChange={setDescription}
                  placeholder="Describe products, offers, timings, or service details (English or Kannada)..."
                  minHeightClass="min-h-[170px]"
                />
              </div>

              {/* Row 6: Optional Business Contact Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="ad-contact-number"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Contact Number (Optional)
                  </label>
                  <input
                    id="ad-contact-number"
                    type="tel"
                    maxLength={25}
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="e.g. +91 98450 12345"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ad-whatsapp-number"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    WhatsApp Number (Optional)
                  </label>
                  <input
                    id="ad-whatsapp-number"
                    type="tel"
                    maxLength={25}
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="e.g. 9845012345"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ad-business-address"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Business Address (Optional)
                  </label>
                  <input
                    id="ad-business-address"
                    type="text"
                    maxLength={240}
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    placeholder="e.g. Main Road, Near Bus Stand, Koppa"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-kannada text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ad-website-url"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Website Link (Optional)
                  </label>
                  <input
                    id="ad-website-url"
                    type="url"
                    maxLength={300}
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
          <div className="flex items-center gap-2">
            {editingAd && onDelete && (
              confirmDelete ? (
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs dark:border-rose-800 dark:bg-rose-950/50">
                  <span className="font-semibold text-rose-800 dark:text-rose-200">
                    Delete {displayAdNumber}?
                  </span>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleDeleteConfirm()}
                    className="rounded bg-rose-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-rose-700 cursor-pointer"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setConfirmDelete(false)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Advertisement</span>
                </button>
              )
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode((prev) => (prev === 'edit' ? 'preview' : 'edit'))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{mode === 'edit' ? 'Preview Advertisement' : 'Back to Editor'}</span>
            </button>

            <button
              type="button"
              disabled={isSaving || uploadingMain || uploadingExtra}
              onClick={() => void submitWithStatus('draft')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save as Draft</span>
            </button>

            <button
              type="submit"
              form="admin-ad-form"
              disabled={isSaving || uploadingMain || uploadingExtra}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-bold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Megaphone className="h-3.5 w-3.5" />
              )}
              <span>
                {isSaving
                  ? 'Saving...'
                  : editingAd
                  ? 'Update Advertisement'
                  : 'Publish Advertisement'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
