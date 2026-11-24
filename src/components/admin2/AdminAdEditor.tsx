import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  ImagePlus,
  Layers,
  Loader2,
  Megaphone,
  PencilLine,
  Phone,
  RefreshCw,
  RotateCw,
  Save,
  Share2,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { processAndUploadAdImage } from '../../services/adsClient';
import {
  AD_CATEGORIES,
  AD_CTA_LABELS,
  DEFAULT_KANNADA_SHARE_TEMPLATE,
  type AdApprovalStatus,
  type AdCtaType,
  type AdDeviceTarget,
  type AdDisplayFrequency,
  type AdExtraImage,
  type AdPlacementsConfig,
  type AdPlatformSettings,
  type AdPriority,
  type AdStatus,
  type Advertisement,
  type AdvertisementPayload,
} from '../../types/ads';
import {
  addDaysToYmd,
  buildAdPublicUrl,
  createDefaultAdPlacements,
  getTodayIstYmd,
  mergeAdCategories,
  sanitizeExternalWebsiteUrl,
} from '../../utils/adHelpers';
import { sanitizeRichTextHtml } from '../../utils/richText';
import { AdImage } from '../AdImage';
import { RichTextEditor } from '../RichTextEditor';
import { AdPreviewContent } from './AdPreviewModal';

interface AdminAdEditorProps {
  editingAd: Advertisement | null;
  nextAdNumber: string;
  platformSettings?: AdPlatformSettings | null;
  isSaving: boolean;
  onSubmit: (payload: AdvertisementPayload) => Promise<void>;
  onDelete?: (ad: Advertisement) => Promise<void>;
  formId?: string;
  embedded?: boolean;
}

type AccordionKey =
  | 'basic'
  | 'images'
  | 'description'
  | 'contact'
  | 'placements'
  | 'rotation'
  | 'sharing'
  | 'schedule'
  | 'advanced';

const MAX_ADDITIONAL_IMAGES = 10;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface AccordionSectionProps {
  title: string;
  subtitle: string;
  badge?: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function AccordionSection({
  title,
  subtitle,
  badge,
  icon,
  open,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900/70">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F274A]/10 text-[#0F274A] dark:bg-amber-400/15 dark:text-amber-300">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                {title}
              </h3>
              {badge && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {subtitle}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-t border-slate-200 px-4 py-4 sm:px-5 space-y-4 dark:border-slate-800">
          {children}
        </div>
      )}
    </section>
  );
}

export function AdminAdEditor({
  editingAd,
  nextAdNumber,
  platformSettings,
  isSaving,
  onSubmit,
  onDelete,
  formId = 'admin-ad-editor-form',
  embedded = false,
}: AdminAdEditorProps) {
  const mainFileInputRef = useRef<HTMLInputElement | null>(null);
  const extraFileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [openSections, setOpenSections] = useState<Record<AccordionKey, boolean>>({
    basic: true,
    images: true,
    description: false,
    contact: false,
    placements: false,
    rotation: false,
    sharing: false,
    schedule: false,
    advanced: false,
  });

  // Basic + Legacy preserved fields
  const [title, setTitle] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [advertiserName, setAdvertiserName] = useState('');
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
  const [approvalStatus, setApprovalStatus] = useState<AdApprovalStatus>('approved');

  // CTA fields
  const [ctaType, setCtaType] = useState<AdCtaType>('contact_now');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');

  // Schedule fields
  const [publishDate, setPublishDate] = useState<string>(() => getTodayIstYmd());
  const [expiryDate, setExpiryDate] = useState<string>(() => addDaysToYmd(getTodayIstYmd(), 30));
  const [startTime, setStartTime] = useState('00:00');
  const [expiryTime, setExpiryTime] = useState('23:59');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [dailyStartTime, setDailyStartTime] = useState('');
  const [dailyEndTime, setDailyEndTime] = useState('');

  // Display Placements (ALL disabled by default for new ads!)
  const [placements, setPlacements] = useState<AdPlacementsConfig>(() => createDefaultAdPlacements());

  // Rotation & Advanced fields
  const [allowAutoRotation, setAllowAutoRotation] = useState(true);
  const [rotationWeight, setRotationWeight] = useState(5);
  const [rotationIntervalSeconds, setRotationIntervalSeconds] = useState('');
  const [priority, setPriority] = useState<AdPriority>('medium');
  const [targetDevice, setTargetDevice] = useState<AdDeviceTarget>('all');
  const [displayFrequency, setDisplayFrequency] = useState<AdDisplayFrequency>('every_visit');
  const [maxImpressionsPerVisitor, setMaxImpressionsPerVisitor] = useState(0);

  // Sharing fields
  const [customSlug, setCustomSlug] = useState('');
  const [customShareMessage, setCustomShareMessage] = useState('');

  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedPreviewLink, setCopiedPreviewLink] = useState(false);

  const allCategories = useMemo(
    () => mergeAdCategories(platformSettings?.customCategories),
    [platformSettings?.customCategories]
  );

  useEffect(() => {
    setMode('edit');
    setFormError('');
    setUploadNotice('');
    setConfirmDelete(false);
    setIsDeleting(false);

    if (editingAd) {
      setTitle(editingAd.title || '');
      setCampaignName(editingAd.campaignName || '');
      setAdvertiserName(editingAd.advertiserName || '');
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
      setApprovalStatus(editingAd.approvalStatus || 'approved');
      setCtaType(editingAd.ctaType || 'contact_now');
      setCtaLabel(editingAd.ctaLabel || '');
      setCtaUrl(editingAd.ctaUrl || '');
      setPublishDate(editingAd.publishDate || getTodayIstYmd());
      setExpiryDate(editingAd.expiryDate || addDaysToYmd(getTodayIstYmd(), 30));
      setStartTime(editingAd.schedule?.startTime || '00:00');
      setExpiryTime(editingAd.schedule?.expiryTime || '23:59');
      setDaysOfWeek(Array.isArray(editingAd.schedule?.daysOfWeek) ? editingAd.schedule.daysOfWeek : []);
      setDailyStartTime(editingAd.schedule?.dailyStartTime || '');
      setDailyEndTime(editingAd.schedule?.dailyEndTime || '');
      setPlacements(editingAd.placements ? editingAd.placements : createDefaultAdPlacements());
      setAllowAutoRotation(editingAd.rotation?.allowAutoRotation ?? true);
      setRotationWeight(editingAd.rotation?.weight ?? 5);
      setRotationIntervalSeconds(
        editingAd.rotation?.customIntervalSeconds
          ? String(editingAd.rotation.customIntervalSeconds)
          : ''
      );
      setPriority(editingAd.priority || 'medium');
      setTargetDevice(editingAd.targetDevice || 'all');
      setDisplayFrequency(
        editingAd.displayFrequency || platformSettings?.defaultDisplayFrequency || 'every_visit'
      );
      setMaxImpressionsPerVisitor(editingAd.maxImpressionsPerVisitor ?? 0);
      setCustomSlug(editingAd.sharing?.customSlug || '');
      setCustomShareMessage(editingAd.sharing?.customShareMessage || '');
    } else {
      const today = getTodayIstYmd();
      setTitle('');
      setCampaignName('');
      setAdvertiserName('');
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
      setApprovalStatus(
        platformSettings?.approvalWorkflowEnabled ? 'pending_approval' : 'approved'
      );
      setCtaType('contact_now');
      setCtaLabel('');
      setCtaUrl('');
      setPublishDate(today);
      setExpiryDate(addDaysToYmd(today, 30));
      setStartTime('00:00');
      setExpiryTime('23:59');
      setDaysOfWeek([]);
      setDailyStartTime('');
      setDailyEndTime('');
      setPlacements(createDefaultAdPlacements()); // CRITICAL: every optional placement unchecked!
      setAllowAutoRotation(true);
      setRotationWeight(5);
      setRotationIntervalSeconds('');
      setPriority('medium');
      setTargetDevice('all');
      setDisplayFrequency(platformSettings?.defaultDisplayFrequency || 'every_visit');
      setMaxImpressionsPerVisitor(platformSettings?.defaultMaxImpressionsPerVisitor ?? 0);
      setCustomSlug('');
      setCustomShareMessage('');
    }
  }, [editingAd, platformSettings]);

  const displayAdNumber = editingAd?.adNumber || nextAdNumber || 'AD001';

  const toggleSection = (key: AccordionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const enabledPlacementCount = [
    placements.articlePopup.enabled,
    placements.endOfArticle.enabled,
    placements.homepagePopup.enabled,
    placements.websiteEntry.enabled,
    placements.homepageSection.enabled,
    placements.articleInline.enabled,
  ].filter(Boolean).length;

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
          ? 'Original advertisement image uploaded to Google Drive cleanly (zero logo or overlay).'
          : 'Original advertisement image uploaded cleanly (zero logo or overlay).'
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to upload main image.');
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
      setFormError(`Maximum of ${MAX_ADDITIONAL_IMAGES} additional images allowed.`);
      return;
    }

    setFormError('');
    setUploadNotice('');
    setUploadingExtra(true);
    try {
      const newlyUploaded: AdExtraImage[] = [];
      for (const file of files.slice(0, remaining)) {
        const res = await processAndUploadAdImage(file);
        newlyUploaded.push({
          imageUrl: res.imageUrl,
          imageThumbUrl: res.imageThumbUrl,
          imageDriveId: res.imageDriveId,
          caption: '',
        });
      }
      setAdditionalImages((prev) => [...prev, ...newlyUploaded]);
      setUploadNotice(`${newlyUploaded.length} additional image(s) uploaded cleanly.`);
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

  const buildDraftPayload = (desiredStatus: AdStatus): AdvertisementPayload => {
    const parsedInterval = Number(rotationIntervalSeconds);
    return {
      title: title.trim(),
      campaignName: campaignName.trim() || undefined,
      advertiserName: advertiserName.trim() || undefined,
      description: sanitizeRichTextHtml(description),
      mainImageUrl: mainImageUrl.trim(),
      mainImageThumbUrl: mainImageThumbUrl.trim() || undefined,
      mainImageDriveId: mainImageDriveId.trim() || undefined,
      additionalImages,
      contactNumber: contactNumber.trim() || undefined,
      whatsappNumber: whatsappNumber.trim() || undefined,
      businessAddress: businessAddress.trim() || undefined,
      websiteUrl: websiteUrl.trim() ? sanitizeExternalWebsiteUrl(websiteUrl) || undefined : undefined,
      category,
      status: desiredStatus,
      approvalStatus,
      publishDate,
      expiryDate,
      priority,
      targetDevice,
      displayFrequency,
      maxImpressionsPerVisitor: Math.max(0, Number(maxImpressionsPerVisitor) || 0),
      ctaType,
      ctaLabel: ctaLabel.trim() || undefined,
      ctaUrl: ctaUrl.trim() ? sanitizeExternalWebsiteUrl(ctaUrl) || undefined : undefined,
      placements,
      schedule: {
        startTime: startTime || '00:00',
        expiryTime: expiryTime || '23:59',
        daysOfWeek,
        dailyStartTime: dailyStartTime || undefined,
        dailyEndTime: dailyEndTime || undefined,
      },
      rotation: {
        allowAutoRotation,
        weight: rotationWeight,
        customIntervalSeconds:
          Number.isFinite(parsedInterval) && parsedInterval >= 2 ? parsedInterval : undefined,
      },
      sharing: {
        customSlug: customSlug.trim() || undefined,
        customShareMessage: customShareMessage.trim() || undefined,
      },
    };
  };

  const previewAdSnapshot: Advertisement = useMemo(() => {
    const draft = buildDraftPayload(status);
    return {
      id: editingAd?.id || `preview-${displayAdNumber.toLowerCase()}`,
      adNumber: displayAdNumber,
      title: draft.title || 'Untitled Local Advertisement',
      campaignName: draft.campaignName,
      advertiserName: draft.advertiserName,
      description: draft.description,
      mainImageUrl: draft.mainImageUrl,
      mainImageThumbUrl: draft.mainImageThumbUrl,
      mainImageDriveId: draft.mainImageDriveId,
      additionalImages: draft.additionalImages || [],
      contactNumber: draft.contactNumber,
      whatsappNumber: draft.whatsappNumber,
      businessAddress: draft.businessAddress,
      websiteUrl: draft.websiteUrl,
      category: draft.category,
      status: draft.status,
      approvalStatus: draft.approvalStatus,
      publishDate: draft.publishDate,
      expiryDate: draft.expiryDate,
      createdAt: editingAd?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: editingAd?.createdBy || 'admin',
      updatedBy: editingAd?.updatedBy || 'admin',
      views: editingAd?.views || 0,
      clicks: editingAd?.clicks || 0,
      priority: draft.priority,
      targetDevice: draft.targetDevice,
      displayFrequency: draft.displayFrequency,
      maxImpressionsPerVisitor: draft.maxImpressionsPerVisitor,
      ctaType: draft.ctaType,
      ctaLabel: draft.ctaLabel,
      ctaUrl: draft.ctaUrl,
      previewToken: editingAd?.previewToken,
      placements: draft.placements,
      schedule: draft.schedule,
      rotation: draft.rotation,
      sharing: draft.sharing,
      counters: editingAd?.counters,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editingAd,
    displayAdNumber,
    title,
    campaignName,
    advertiserName,
    description,
    mainImageUrl,
    mainImageThumbUrl,
    mainImageDriveId,
    additionalImages,
    contactNumber,
    whatsappNumber,
    businessAddress,
    websiteUrl,
    category,
    status,
    approvalStatus,
    publishDate,
    expiryDate,
    priority,
    targetDevice,
    displayFrequency,
    maxImpressionsPerVisitor,
    ctaType,
    ctaLabel,
    ctaUrl,
    customSlug,
    placements,
    startTime,
    expiryTime,
    daysOfWeek,
    dailyStartTime,
    dailyEndTime,
    allowAutoRotation,
    rotationWeight,
    rotationIntervalSeconds,
    customShareMessage,
  ]);

  const submitWithStatus = async (desiredStatus: AdStatus) => {
    setFormError('');

    if (!title.trim()) {
      setFormError('Please enter an advertisement title.');
      setMode('edit');
      setOpenSections((prev) => ({ ...prev, basic: true }));
      return;
    }
    if (!mainImageUrl.trim()) {
      setFormError('Please upload the main advertisement image before saving.');
      setMode('edit');
      setOpenSections((prev) => ({ ...prev, images: true }));
      return;
    }
    if (!publishDate || !expiryDate) {
      setFormError('Please choose both Publish Date and Expiry Date.');
      setMode('edit');
      setOpenSections((prev) => ({ ...prev, schedule: true }));
      return;
    }
    if (expiryDate < publishDate) {
      setFormError('Expiry Date must be on or after Publish Date.');
      setMode('edit');
      setOpenSections((prev) => ({ ...prev, schedule: true }));
      return;
    }
    if (websiteUrl.trim() && !sanitizeExternalWebsiteUrl(websiteUrl)) {
      setFormError('Website Link must be a valid http:// or https:// URL.');
      setMode('edit');
      setOpenSections((prev) => ({ ...prev, contact: true }));
      return;
    }
    if (ctaUrl.trim() && !sanitizeExternalWebsiteUrl(ctaUrl)) {
      setFormError('Custom CTA URL must be a valid http:// or https:// URL.');
      setMode('edit');
      setOpenSections((prev) => ({ ...prev, basic: true }));
      return;
    }

    try {
      await onSubmit(buildDraftPayload(desiredStatus));
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

  const handleCopyPreviewLink = async () => {
    if (!editingAd?.previewToken) return;
    const url = buildAdPublicUrl(editingAd.id, undefined, editingAd.previewToken);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedPreviewLink(true);
      window.setTimeout(() => setCopiedPreviewLink(false), 2000);
    } catch {
      // Ignore clipboard restriction
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top Editor/Preview Mode Bar (shown inline when embedded) */}
      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 mb-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              Create New Advertisement · <span className="font-mono text-[#0F274A] dark:text-amber-300">{displayAdNumber}</span>
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              All optional display placements start unchecked — expand Display Placements to enable specific slots.
            </p>
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold cursor-pointer ${
                mode === 'edit'
                  ? 'bg-[#0B192C] text-white dark:bg-amber-500 dark:text-slate-950'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <PencilLine className="h-3.5 w-3.5" />
              <span>Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold cursor-pointer ${
                mode === 'preview'
                  ? 'bg-[#0B192C] text-white dark:bg-amber-500 dark:text-slate-950'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Multi-Placement Preview</span>
            </button>
          </div>
        </div>
      )}

      {/* Non-embedded mode switcher if needed via prop or parent */}
      {!embedded && (
        <div className="flex items-center justify-between gap-2 pb-3 mb-1 border-b border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Expand sections as needed. {enabledPlacementCount} display placement{enabledPlacementCount === 1 ? '' : 's'} enabled.
          </p>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold cursor-pointer ${
                mode === 'edit'
                  ? 'bg-[#0B192C] text-white dark:bg-amber-500 dark:text-slate-950'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <PencilLine className="h-3 w-3" />
              <span>Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold cursor-pointer ${
                mode === 'preview'
                  ? 'bg-[#0B192C] text-white dark:bg-amber-500 dark:text-slate-950'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Eye className="h-3 w-3" />
              <span>Preview All Formats</span>
            </button>
          </div>
        </div>
      )}

      <form
        id={formId}
        onSubmit={(e) => void handleFormSubmit(e)}
        className="space-y-4 pb-6"
      >
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <span className="font-medium leading-relaxed">{formError}</span>
          </div>
        )}

        {uploadNotice && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <span className="font-medium">{uploadNotice}</span>
          </div>
        )}

        {mode === 'preview' ? (
          <AdPreviewContent ad={previewAdSnapshot} settings={platformSettings} />
        ) : (
          <div className="space-y-3.5">
            {/* 1. BASIC INFORMATION (OPEN BY DEFAULT) */}
            <AccordionSection
              title="Basic Information"
              subtitle="Advertisement ID, title, advertiser, category, status, and CTA button"
              badge="Required"
              icon={<Megaphone className="h-4 w-4" />}
              open={openSections.basic}
              onToggle={() => toggleSection('basic')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Ad Number
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={displayAdNumber}
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-sm font-bold text-[#0F274A] dark:border-slate-700 dark:bg-slate-800 dark:text-amber-300"
                  />
                </div>
                <div className="sm:col-span-9">
                  <label
                    htmlFor={`${formId}-title`}
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Advertisement Title <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id={`${formId}-title`}
                    type="text"
                    required
                    maxLength={180}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter business or advertisement title (English or Kannada)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-kannada text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F274A] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label
                    htmlFor={`${formId}-advertiser`}
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Advertiser / Business
                  </label>
                  <input
                    id={`${formId}-advertiser`}
                    type="text"
                    maxLength={140}
                    value={advertiserName}
                    onChange={(e) => setAdvertiserName(e.target.value)}
                    placeholder="e.g. Malnad Coffee Traders"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-campaign`}
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Campaign Name
                  </label>
                  <input
                    id={`${formId}-campaign`}
                    type="text"
                    maxLength={140}
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. Monsoon Harvest Promo"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-category`}
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Category
                  </label>
                  <select
                    id={`${formId}-category`}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`${formId}-status`}
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Status
                  </label>
                  <select
                    id={`${formId}-status`}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AdStatus)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="active">Active (Live)</option>
                    <option value="paused">Paused</option>
                    <option value="inactive">Inactive</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label
                    htmlFor={`${formId}-cta-type`}
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Call-to-Action Button
                  </label>
                  <select
                    id={`${formId}-cta-type`}
                    value={ctaType}
                    onChange={(e) => setCtaType(e.target.value as AdCtaType)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {(Object.keys(AD_CTA_LABELS) as AdCtaType[]).map((key) => (
                      <option key={key} value={key}>
                        {AD_CTA_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-cta-label`}
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Custom CTA Text (Optional)
                  </label>
                  <input
                    id={`${formId}-cta-label`}
                    type="text"
                    maxLength={40}
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    placeholder={AD_CTA_LABELS[ctaType]}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-cta-url`}
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    CTA Target URL (Optional)
                  </label>
                  <input
                    id={`${formId}-cta-url`}
                    type="url"
                    maxLength={300}
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="Maps link or landing URL"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>
            </AccordionSection>

            {/* 2. ADVERTISEMENT IMAGE (OPEN BY DEFAULT) */}
            <AccordionSection
              title="Advertisement Image"
              subtitle="Main poster/banner + optional extra gallery photos (unmodified original creative)"
              badge={mainImageUrl ? `${1 + additionalImages.length} image(s)` : 'Required'}
              icon={<ImagePlus className="h-4 w-4" />}
              open={openSections.images}
              onToggle={() => toggleSection('images')}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Main Advertisement Image <span className="text-rose-600">*</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Displayed exactly as uploaded — zero CoffeeNadu logos, &ldquo;2X&rdquo; marks, or watermarks.
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
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#142c4c] dark:bg-blue-600 disabled:opacity-60 cursor-pointer"
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
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 cursor-pointer"
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
                      alt={title.trim() || 'Main advertisement image'}
                      fit="contain"
                      lazy={false}
                      className="w-full max-h-[340px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-950"
                      imgClassName="max-h-[320px] w-auto mx-auto"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={uploadingMain}
                    onClick={() => mainFileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 px-6 py-8 text-center hover:border-[#0F274A] dark:border-slate-700 dark:bg-slate-950/60 cursor-pointer"
                  >
                    <ImagePlus className="h-8 w-8 text-slate-400 mb-2" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Click to upload the main advertisement poster or banner
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      JPG, PNG, or WebP · Unmodified original aspect ratio preserved
                    </p>
                  </button>
                )}

                {/* Additional Images */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      Additional Gallery Images ({additionalImages.length}/{MAX_ADDITIONAL_IMAGES})
                    </p>
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
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 disabled:opacity-50 cursor-pointer"
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {additionalImages.map((img, idx) => (
                        <div
                          key={`${img.imageUrl.slice(0, 20)}-${idx}`}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2 dark:border-slate-700 dark:bg-slate-950"
                        >
                          <div className="h-32 w-full rounded-md overflow-hidden bg-white dark:bg-slate-900">
                            <AdImage
                              src={img.imageThumbUrl || img.imageUrl}
                              alt={img.caption || `Extra ${idx + 1}`}
                              fit="contain"
                              className="h-full w-full"
                            />
                          </div>
                          <input
                            type="text"
                            maxLength={160}
                            value={img.caption || ''}
                            onChange={(e) =>
                              setAdditionalImages((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, caption: e.target.value } : it))
                              )
                            }
                            placeholder="Optional caption..."
                            className="w-full rounded border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono text-slate-400">#{idx + 1}</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveExtraImage(idx, -1)}
                                className="rounded border border-slate-200 p-1 disabled:opacity-40 cursor-pointer"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === additionalImages.length - 1}
                                onClick={() => moveExtraImage(idx, 1)}
                                className="rounded border border-slate-200 p-1 disabled:opacity-40 cursor-pointer"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setAdditionalImages((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="rounded border border-rose-200 p-1 text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </AccordionSection>

            {/* 3. ADVERTISEMENT DESCRIPTION (COLLAPSED BY DEFAULT) */}
            <AccordionSection
              title="Advertisement Description"
              subtitle="Rich-text offers, services, timings, or announcements (English & Kannada)"
              badge={description.trim() ? 'Added' : 'Optional'}
              icon={<FileText className="h-4 w-4" />}
              open={openSections.description}
              onToggle={() => toggleSection('description')}
            >
              <RichTextEditor
                id={`${formId}-description`}
                value={description}
                onChange={setDescription}
                placeholder="Describe products, offers, timings, or service details..."
                minHeightClass="min-h-[160px]"
              />
            </AccordionSection>

            {/* 4. BUSINESS CONTACT DETAILS (COLLAPSED BY DEFAULT) */}
            <AccordionSection
              title="Business Contact Details"
              subtitle="Phone number, WhatsApp number, business address, and website link"
              badge={contactNumber || whatsappNumber || businessAddress ? 'Configured' : 'Optional'}
              icon={<Phone className="h-4 w-4" />}
              open={openSections.contact}
              onToggle={() => toggleSection('contact')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    maxLength={25}
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="e.g. +91 98450 12345"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    WhatsApp Number
                  </label>
                  <input
                    type="tel"
                    maxLength={25}
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="e.g. 9845012345"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Business Address
                  </label>
                  <input
                    type="text"
                    maxLength={240}
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    placeholder="e.g. Main Road, Near Bus Stand, Koppa"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-kannada text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Website Link
                  </label>
                  <input
                    type="url"
                    maxLength={300}
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>
            </AccordionSection>

            {/* 5. DISPLAY PLACEMENTS — "ADVERTISEMENT DISPLAY SETTINGS" */}
            <AccordionSection
              title="Display Placements — ADVERTISEMENT DISPLAY SETTINGS"
              subtitle="Independent optional placement checkboxes (none are auto-enabled)"
              badge={`${enabledPlacementCount}/6 enabled`}
              icon={<Layers className="h-4 w-4" />}
              open={openSections.placements}
              onToggle={() => toggleSection('placements')}
            >
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Choose exactly where this advertisement may appear. Every placement has an independent checkbox and remains off unless selected. Published ads always remain accessible on the Local Ads directory &amp; share link.
              </p>

              <div className="space-y-3">
                {/* A. ARTICLE READING POPUP */}
                <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={placements.articlePopup.enabled}
                      onChange={(e) =>
                        setPlacements((prev) => ({
                          ...prev,
                          articlePopup: { ...prev.articlePopup, enabled: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-[#0F274A]"
                    />
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      A. Article Reading Popup
                    </span>
                  </label>
                  {placements.articlePopup.enabled && (
                    <div className="mt-3 pl-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Scroll Trigger
                        </label>
                        <select
                          value={placements.articlePopup.scrollTriggerPercent}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              articlePopup: {
                                ...prev.articlePopup,
                                scrollTriggerPercent: Number(e.target.value) as 25 | 50 | 75,
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value={25}>25% Scrolled</option>
                          <option value={50}>50% Scrolled</option>
                          <option value={75}>75% Scrolled</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Popup Size
                        </label>
                        <select
                          value={placements.articlePopup.size}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              articlePopup: {
                                ...prev.articlePopup,
                                size: e.target.value as 'compact' | 'medium' | 'large',
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="compact">Compact</option>
                          <option value="medium">Medium</option>
                          <option value="large">Large</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Position
                        </label>
                        <select
                          value={placements.articlePopup.position}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              articlePopup: {
                                ...prev.articlePopup,
                                position: e.target.value as
                                  | 'bottom-left'
                                  | 'bottom-right'
                                  | 'top-right'
                                  | 'bottom-center',
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="bottom-left">Bottom Left</option>
                          <option value="bottom-right">Bottom Right</option>
                          <option value="top-right">Top Right</option>
                          <option value="bottom-center">Bottom Center</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Delay (seconds)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={placements.articlePopup.delaySeconds}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              articlePopup: {
                                ...prev.articlePopup,
                                delaySeconds: Math.max(0, Number(e.target.value) || 0),
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* B. END OF ARTICLE ADVERTISEMENT */}
                <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={placements.endOfArticle.enabled}
                      onChange={(e) =>
                        setPlacements((prev) => ({
                          ...prev,
                          endOfArticle: { ...prev.endOfArticle, enabled: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-[#0F274A]"
                    />
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      B. End of Article Advertisement
                    </span>
                  </label>
                  {placements.endOfArticle.enabled && (
                    <div className="mt-3 pl-6 max-w-xs">
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Position Relative to Related Articles
                      </label>
                      <select
                        value={placements.endOfArticle.position}
                        onChange={(e) =>
                          setPlacements((prev) => ({
                            ...prev,
                            endOfArticle: {
                              ...prev.endOfArticle,
                              position: e.target.value as 'before_related' | 'after_related',
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="before_related">Before Related Articles</option>
                        <option value="after_related">After Related Articles</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* C. MAIN HOMEPAGE POPUP */}
                <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={placements.homepagePopup.enabled}
                      onChange={(e) =>
                        setPlacements((prev) => ({
                          ...prev,
                          homepagePopup: { ...prev.homepagePopup, enabled: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-[#0F274A]"
                    />
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      C. Main Homepage Popup
                    </span>
                  </label>
                  {placements.homepagePopup.enabled && (
                    <div className="mt-3 pl-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Load Delay (seconds)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          value={placements.homepagePopup.delaySeconds}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              homepagePopup: {
                                ...prev.homepagePopup,
                                delaySeconds: Math.max(0, Number(e.target.value) || 0),
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Position
                        </label>
                        <select
                          value={placements.homepagePopup.position}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              homepagePopup: {
                                ...prev.homepagePopup,
                                position: e.target.value as 'center' | 'bottom-right' | 'bottom-left',
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="center">Center Modal</option>
                          <option value="bottom-right">Bottom Right</option>
                          <option value="bottom-left">Bottom Left</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Popup Design
                        </label>
                        <select
                          value={placements.homepagePopup.design}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              homepagePopup: {
                                ...prev.homepagePopup,
                                design: e.target.value as 'card' | 'banner' | 'spotlight',
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="card">Card</option>
                          <option value="banner">Wide Banner</option>
                          <option value="spotlight">Spotlight</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Show Frequency
                        </label>
                        <select
                          value={placements.homepagePopup.frequency}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              homepagePopup: {
                                ...prev.homepagePopup,
                                frequency: e.target.value as AdDisplayFrequency,
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="once_per_session">Once per Session</option>
                          <option value="once_per_day">Once per Day</option>
                          <option value="every_visit">Every Homepage Visit</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* D. WEBSITE ENTRY ADVERTISEMENT */}
                <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={placements.websiteEntry.enabled}
                      onChange={(e) =>
                        setPlacements((prev) => ({
                          ...prev,
                          websiteEntry: { ...prev.websiteEntry, enabled: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-[#0F274A]"
                    />
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      D. Website Entry Advertisement (Welcome Overlay)
                    </span>
                  </label>
                  {placements.websiteEntry.enabled && (
                    <div className="mt-3 pl-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Display Delay (s)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={placements.websiteEntry.delaySeconds}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              websiteEntry: {
                                ...prev.websiteEntry,
                                delaySeconds: Math.max(0, Number(e.target.value) || 0),
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Minimum Viewing Duration (s)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={15}
                          value={placements.websiteEntry.minDurationSeconds}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              websiteEntry: {
                                ...prev.websiteEntry,
                                minDurationSeconds: Math.min(15, Math.max(0, Number(e.target.value) || 0)),
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Overlay Layout
                        </label>
                        <select
                          value={placements.websiteEntry.layout}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              websiteEntry: {
                                ...prev.websiteEntry,
                                layout: e.target.value as 'large' | 'fullscreen',
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="large">Large Modal</option>
                          <option value="fullscreen">Full-Screen Showcase</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* E. HOMEPAGE ADVERTISEMENT SECTION */}
                <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={placements.homepageSection.enabled}
                      onChange={(e) =>
                        setPlacements((prev) => ({
                          ...prev,
                          homepageSection: { ...prev.homepageSection, enabled: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-[#0F274A]"
                    />
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      E. Homepage Advertisement Section
                    </span>
                  </label>
                  {placements.homepageSection.enabled && (
                    <div className="mt-3 pl-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Homepage Placement
                        </label>
                        <select
                          value={placements.homepageSection.position}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              homepageSection: {
                                ...prev.homepageSection,
                                position: e.target.value as
                                  | 'below_headline'
                                  | 'between_news'
                                  | 'above_footer'
                                  | 'custom',
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="below_headline">1. Below Main Headline / Lead Section</option>
                          <option value="between_news">2. Between News Sections</option>
                          <option value="above_footer">3. Above the Footer</option>
                          <option value="custom">4. Custom Homepage Position</option>
                        </select>
                      </div>
                      {placements.homepageSection.position === 'custom' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Custom Slot
                          </label>
                          <select
                            value={placements.homepageSection.customPosition || 'right_rail'}
                            onChange={(e) =>
                              setPlacements((prev) => ({
                                ...prev,
                                homepageSection: {
                                  ...prev.homepageSection,
                                  customPosition: e.target.value as
                                    | 'right_rail'
                                    | 'top_banner'
                                    | 'after_events',
                                },
                              }))
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                          >
                            <option value="right_rail">Right Sidebar Top</option>
                            <option value="top_banner">Top Page Banner</option>
                            <option value="after_events">Programs &amp; Events Section</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* F. ADDITIONAL ARTICLE AD POSITIONS */}
                <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={placements.articleInline.enabled}
                      onChange={(e) =>
                        setPlacements((prev) => ({
                          ...prev,
                          articleInline: { ...prev.articleInline, enabled: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-[#0F274A]"
                    />
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      F. Additional Article Ad Positions
                    </span>
                  </label>
                  {placements.articleInline.enabled && (
                    <div className="mt-3 pl-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={placements.articleInline.belowHeadline}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              articleInline: { ...prev.articleInline, belowHeadline: e.target.checked },
                            }))
                          }
                        />
                        <span>Below Article Headline</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={placements.articleInline.belowSummary}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              articleInline: { ...prev.articleInline, belowSummary: e.target.checked },
                            }))
                          }
                        />
                        <span>Below Article Summary</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={placements.articleInline.betweenParagraphs}
                            onChange={(e) =>
                              setPlacements((prev) => ({
                                ...prev,
                                articleInline: {
                                  ...prev.articleInline,
                                  betweenParagraphs: e.target.checked,
                                },
                              }))
                            }
                          />
                          <span>After Paragraph #</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={15}
                          disabled={!placements.articleInline.betweenParagraphs}
                          value={placements.articleInline.paragraphIndex}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              articleInline: {
                                ...prev.articleInline,
                                paragraphIndex: Math.max(1, Math.min(15, Number(e.target.value) || 2)),
                              },
                            }))
                          }
                          className="w-16 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={placements.articleInline.aboveSharing}
                          onChange={(e) =>
                            setPlacements((prev) => ({
                              ...prev,
                              articleInline: { ...prev.articleInline, aboveSharing: e.target.checked },
                            }))
                          }
                        />
                        <span>Above Article Sharing Section</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </AccordionSection>

            {/* 6. ROTATION SETTINGS (COLLAPSED BY DEFAULT) */}
            <AccordionSection
              title="Rotation Settings"
              subtitle="Auto-rotation participation, priority weight, and interval override"
              badge={allowAutoRotation ? `Weight ${rotationWeight}/10` : 'Fixed'}
              icon={<RotateCw className="h-4 w-4" />}
              open={openSections.rotation}
              onToggle={() => toggleSection('rotation')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowAutoRotation}
                    onChange={(e) => setAllowAutoRotation(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span>Include in Automatic Rotation</span>
                </label>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Rotation Weight (1–10)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={rotationWeight}
                    onChange={(e) =>
                      setRotationWeight(Math.min(10, Math.max(1, Number(e.target.value) || 5)))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Custom Interval Override (s)
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={60}
                    value={rotationIntervalSeconds}
                    onChange={(e) => setRotationIntervalSeconds(e.target.value)}
                    placeholder={`Global (${platformSettings?.rotationSpeedSeconds ?? 5}s)`}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
            </AccordionSection>

            {/* 7. SHARING SETTINGS (COLLAPSED BY DEFAULT) */}
            <AccordionSection
              title="Sharing Settings"
              subtitle="Custom Kannada share message & clean SEO URL slug"
              badge={customSlug || customShareMessage ? 'Custom' : 'Global Default'}
              icon={<Share2 className="h-4 w-4" />}
              open={openSections.sharing}
              onToggle={() => toggleSection('sharing')}
            >
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Custom Advertisement URL Slug (Optional)
                  </label>
                  <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-950">
                    <span className="px-3 py-2 bg-slate-100 text-xs font-mono text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      /ads?ad=
                    </span>
                    <input
                      type="text"
                      maxLength={80}
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value)}
                      placeholder="e.g. koppa-coffee-festival-2026"
                      className="flex-1 px-3 py-2 text-sm text-slate-900 bg-transparent focus:outline-none dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Per-Ad Kannada Share Message (Leave empty to use Global Default)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setCustomShareMessage((prev) => `${prev}[ADVERTISEMENT TITLE]`)
                        }
                        className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        + [ADVERTISEMENT TITLE]
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomShareMessage((prev) => `${prev}[ADVERTISEMENT URL]`)
                        }
                        className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        + [ADVERTISEMENT URL]
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomShareMessage('');
                        }}
                        className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 dark:border-slate-700 dark:text-amber-300 cursor-pointer"
                      >
                        Use Global Default
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={5}
                    maxLength={800}
                    value={customShareMessage}
                    onChange={(e) => {
                      setCustomShareMessage(e.target.value);
                    }}
                    placeholder={platformSettings?.defaultShareMessage || DEFAULT_KANNADA_SHARE_TEMPLATE}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-kannada text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>
            </AccordionSection>

            {/* 8. CAMPAIGN SCHEDULE (COLLAPSED BY DEFAULT) */}
            <AccordionSection
              title="Campaign Schedule"
              subtitle="Start/expiry dates & times, recurring days of week, and daily active hours"
              badge={`${publishDate} → ${expiryDate}`}
              icon={<CalendarClock className="h-4 w-4" />}
              open={openSections.schedule}
              onToggle={() => toggleSection('schedule')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Publish Date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Start Time (IST)
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Expiry Date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={publishDate}
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                    Expiry Time (IST)
                  </label>
                  <input
                    type="time"
                    value={expiryTime}
                    onChange={(e) => setExpiryTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Recurring Active Days (leave all unchecked for every day)
                </p>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((dayLabel, dayIdx) => {
                    const active = daysOfWeek.includes(dayIdx);
                    return (
                      <button
                        key={dayLabel}
                        type="button"
                        onClick={() =>
                          setDaysOfWeek((prev) =>
                            active ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx].sort()
                          )
                        }
                        className={`rounded-lg border px-3 py-1 text-xs font-semibold cursor-pointer ${
                          active
                            ? 'bg-[#0F274A] text-white border-[#0F274A] dark:bg-amber-500 dark:text-slate-950 dark:border-amber-500'
                            : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {dayLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Daily Active Window Start (Optional)
                  </label>
                  <input
                    type="time"
                    value={dailyStartTime}
                    onChange={(e) => setDailyStartTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Daily Active Window End (Optional)
                  </label>
                  <input
                    type="time"
                    value={dailyEndTime}
                    onChange={(e) => setDailyEndTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
            </AccordionSection>

            {/* 9. ADVANCED OPTIONS (COLLAPSED BY DEFAULT) */}
            <AccordionSection
              title="Advanced Options"
              subtitle="Priority, device targeting, visitor frequency cap, approval status, & private preview link"
              badge={`${priority.toUpperCase()} · ${targetDevice}`}
              icon={<SlidersHorizontal className="h-4 w-4" />}
              open={openSections.advanced}
              onToggle={() => toggleSection('advanced')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as AdPriority)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Target Device
                  </label>
                  <select
                    value={targetDevice}
                    onChange={(e) => setTargetDevice(e.target.value as AdDeviceTarget)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="all">All Devices</option>
                    <option value="mobile">Mobile Only</option>
                    <option value="desktop">Desktop Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Display Frequency
                  </label>
                  <select
                    value={displayFrequency}
                    onChange={(e) => setDisplayFrequency(e.target.value as AdDisplayFrequency)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="every_visit">Every Visit</option>
                    <option value="once_per_session">Once per Session</option>
                    <option value="once_per_day">Once per Day</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Max Impressions / Visitor (0 = ∞)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={maxImpressionsPerVisitor}
                    onChange={(e) =>
                      setMaxImpressionsPerVisitor(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Approval Status
                  </label>
                  <select
                    value={approvalStatus}
                    onChange={(e) => setApprovalStatus(e.target.value as AdApprovalStatus)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="approved">Approved</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                {editingAd?.previewToken && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Private Draft/Approval Preview Link
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={buildAdPublicUrl(editingAd.id, undefined, editingAd.previewToken)}
                        className="flex-1 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCopyPreviewLink()}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                      >
                        {copiedPreviewLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedPreviewLink ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </AccordionSection>
          </div>
        )}
      </form>

      {/* Fixed Bottom Action Bar */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/95 backdrop-blur px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/95">
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
                  className="rounded bg-rose-600 px-2 py-1 text-[11px] font-bold text-white cursor-pointer"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmDelete(false)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            )
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMode((prev) => (prev === 'edit' ? 'preview' : 'edit'))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{mode === 'edit' ? 'Preview Advertisement' : 'Back to Editor'}</span>
          </button>

          <button
            type="button"
            disabled={isSaving || uploadingMain || uploadingExtra}
            onClick={() => void submitWithStatus('draft')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save as Draft</span>
          </button>

          <button
            type="submit"
            form={formId}
            disabled={isSaving || uploadingMain || uploadingExtra}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-bold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
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
  );
}
