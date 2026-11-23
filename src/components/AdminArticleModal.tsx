import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Clock, ImagePlus, Images, Link2, Loader2, Trash2, X } from 'lucide-react';
import {
  IMAGE_PRESETS,
  KOPPA_LOCATIONS,
  NEWS_CATEGORIES,
  getKannadaLocationLabel,
  resolveArticleImage,
} from '../data/newsData';
import type { ExtraNewsPhoto, ImageKey, NewsArticle, NewsCategory } from '../types/news';
import { MAX_EXTRA_NEWS_PHOTOS } from '../utils/extraPhotos';
import {
  formatLeadExpiryDateTime,
  formatRemainingLeadTime,
  isArticleActivelyFeatured,
} from '../utils/featuredLead';
import {
  buildArticlePublicUrl,
  formatCustomEnglishSlug,
  validateCustomEnglishSlugInput,
} from '../utils/slug';
import {
  editorHtmlToParagraphs,
  fieldValueToEditorHtml,
  paragraphsToEditorHtml,
  sanitizeInlineRichTextHtml,
  stripRichTextToPlainText,
} from '../utils/richText';
import {
  applyWatermarkToImageSrc,
  drawCircularLogoWatermark,
  drawNewsUploadWatermark,
  loadCircleLogoImage,
} from '../utils/watermark';
import {
  isSheetsStorageActive,
  uploadImageToDriveViaServer,
} from '../services/sheetsStorageClient';
import { NewsImage } from './NewsImage';
import { RichTextField, RichTextToolbar, useRichTextController } from './RichTextEditor';

export interface AdminArticlePayload {
  customSlug?: string;
  titleKannada: string;
  summaryKannada: string;
  bodyKannada: string[];
  category: NewsCategory;
  location: string;
  reporter: string;
  imageKey: ImageKey;
  imageUrl?: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  imageCaption?: string;
  extraImages?: ExtraNewsPhoto[];
  isFeatured: boolean;
  featuredUntil?: number;
  watermarkApplied?: boolean;
  alsoAddToProgram?: boolean;
  programDate?: string;
  programTime?: string;
  programOrganizer?: string;
}

const LEAD_TIMER_PRESETS: { label: string; value: number; unit: 'hours' | 'days' }[] = [
  { label: '6 Hours', value: 6, unit: 'hours' },
  { label: '12 Hours', value: 12, unit: 'hours' },
  { label: '1 Day', value: 1, unit: 'days' },
  { label: '2 Days', value: 2, unit: 'days' },
  { label: '3 Days', value: 3, unit: 'days' },
  { label: '7 Days', value: 7, unit: 'days' },
];

function getTodayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface AdminArticleModalProps {
  isOpen: boolean;
  editingArticle: NewsArticle | null;
  existingArticleIds?: string[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: AdminArticlePayload) => Promise<void>;
}

const MAX_FIRESTORE_IMAGE_CHARS = 320000;

export function isLikelyImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name || '');
}

async function loadImageSource(file: File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback to HTMLImageElement + ObjectURL below
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This image format could not be decoded by the browser.'));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

export async function compressImageForFirestore(
  file: File,
  options?: { includeMiddleBrand?: boolean }
): Promise<string> {
  const includeMiddleBrand = options?.includeMiddleBrand !== false;
  const [source, logoImg] = await Promise.all([
    loadImageSource(file),
    loadCircleLogoImage(),
  ]);
  try {
    const attempts: { maxDim: number; quality: number }[] = [
      { maxDim: 960, quality: 0.78 },
      { maxDim: 800, quality: 0.68 },
      { maxDim: 640, quality: 0.58 },
      { maxDim: 520, quality: 0.48 },
    ];

    for (const attempt of attempts) {
      const longest = Math.max(source.width, source.height, 1);
      const scale = longest > attempt.maxDim ? attempt.maxDim / longest : 1;
      const targetWidth = Math.max(1, Math.round(source.width * scale));
      const targetHeight = Math.max(1, Math.round(source.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not initialize image compressor in this browser.');
      }

      // Fill white background so transparent PNGs convert cleanly to JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      source.draw(ctx, targetWidth, targetHeight);

      // Bake CoffeeNadu watermark once per newly uploaded photo (never alters existing photos)
      if (includeMiddleBrand) {
        drawNewsUploadWatermark(ctx, targetWidth, targetHeight, logoImg);
      } else if (logoImg) {
        drawCircularLogoWatermark(ctx, targetWidth, targetHeight, logoImg);
      }

      const jpegUrl = canvas.toDataURL('image/jpeg', attempt.quality);
      if (jpegUrl.length <= MAX_FIRESTORE_IMAGE_CHARS) {
        return jpegUrl;
      }
    }

    throw new Error(
      'Photo is still too large after compression. Please pick a smaller image or crop it first.'
    );
  } finally {
    source.cleanup();
  }
}

export async function processAndUploadNewsPhoto(
  file: File,
  options?: { includeMiddleBrand?: boolean }
): Promise<{
  imageUrl: string;
  imageThumbUrl?: string;
  imageDriveId?: string;
  uploadedToDrive: boolean;
  deduplicated?: boolean;
}> {
  const includeMiddleBrand = options?.includeMiddleBrand !== false;
  const [source, logoImg] = await Promise.all([
    loadImageSource(file),
    loadCircleLogoImage(),
  ]);

  let fullDataUrl = '';
  let thumbDataUrl = '';

  try {
    const renderVariant = (maxDim: number, quality: number) => {
      const longest = Math.max(source.width, source.height, 1);
      const scale = longest > maxDim ? maxDim / longest : 1;
      const targetWidth = Math.max(1, Math.round(source.width * scale));
      const targetHeight = Math.max(1, Math.round(source.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not initialize image compressor in this browser.');
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      source.draw(ctx, targetWidth, targetHeight);
      if (includeMiddleBrand) {
        drawNewsUploadWatermark(ctx, targetWidth, targetHeight, logoImg);
      } else if (logoImg) {
        drawCircularLogoWatermark(ctx, targetWidth, targetHeight, logoImg);
      }
      return canvas.toDataURL('image/jpeg', quality);
    };

    const sheetsActive = await isSheetsStorageActive();
    if (sheetsActive) {
      // High-quality compressed image + lightweight thumbnail for Google Drive + server cache
      fullDataUrl = renderVariant(1200, 0.8);
      thumbDataUrl = renderVariant(420, 0.72);
      const uploaded = await uploadImageToDriveViaServer({
        base64Data: fullDataUrl,
        thumbBase64: thumbDataUrl,
        mimeType: 'image/jpeg',
        fileName: `coffeenadu-${Date.now()}.jpg`,
      });
      return {
        imageUrl: uploaded.imageUrl,
        imageThumbUrl: uploaded.imageThumbUrl,
        imageDriveId: uploaded.fileId,
        uploadedToDrive: true,
        deduplicated: uploaded.deduplicated,
      };
    }

    // Fallback: compress under Firestore document size limit
    const attempts: { maxDim: number; quality: number }[] = [
      { maxDim: 960, quality: 0.78 },
      { maxDim: 800, quality: 0.68 },
      { maxDim: 640, quality: 0.58 },
      { maxDim: 520, quality: 0.48 },
    ];
    for (const attempt of attempts) {
      const candidate = renderVariant(attempt.maxDim, attempt.quality);
      if (candidate.length <= MAX_FIRESTORE_IMAGE_CHARS) {
        return {
          imageUrl: candidate,
          uploadedToDrive: false,
        };
      }
    }
    throw new Error(
      'Photo is still too large after compression. Please pick a smaller image or crop it first.'
    );
  } finally {
    source.cleanup();
  }
}

export function AdminArticleModal({
  isOpen,
  editingArticle,
  existingArticleIds = [],
  isSaving,
  onClose,
  onSubmit,
}: AdminArticleModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const extraFileInputRef = useRef<HTMLInputElement | null>(null);
  const richController = useRichTextController('headline');
  const [customSlugInput, setCustomSlugInput] = useState('');
  const [titleKannada, setTitleKannada] = useState('');
  const [summaryKannada, setSummaryKannada] = useState('');
  const [bodyKannada, setBodyKannada] = useState('');
  const [category, setCategory] = useState<NewsCategory>('Local');
  const [location, setLocation] = useState<string>(KOPPA_LOCATIONS[0]);
  const [reporter, setReporter] = useState('Coffeenadu Desk');
  const [imageKey, setImageKey] = useState<ImageKey>('none');
  const [imageUrl, setImageUrl] = useState('');
  const [imageThumbUrl, setImageThumbUrl] = useState('');
  const [imageDriveId, setImageDriveId] = useState('');
  const [watermarkApplied, setWatermarkApplied] = useState(false);
  const [imageCaption, setImageCaption] = useState('');
  const [extraImages, setExtraImages] = useState<ExtraNewsPhoto[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);
  const [leadTimerMode, setLeadTimerMode] = useState<'none' | 'keep' | 'duration'>('none');
  const [leadDurationValue, setLeadDurationValue] = useState('2');
  const [leadDurationUnit, setLeadDurationUnit] = useState<'hours' | 'days'>('days');
  const [existingFeaturedUntil, setExistingFeaturedUntil] = useState<number | undefined>(undefined);
  const [alsoAddToProgram, setAlsoAddToProgram] = useState(false);
  const [programDate, setProgramDate] = useState(getTodayYmd());
  const [programTime, setProgramTime] = useState('10:00 AM');
  const [programOrganizer, setProgramOrganizer] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isProcessingExtraImages, setIsProcessingExtraImages] = useState(false);
  const [extraUploadProgress, setExtraUploadProgress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editingArticle) {
      const nowMs = Date.now();
      const activelyFeatured = isArticleActivelyFeatured(editingArticle, nowMs);
      const activeTimer =
        activelyFeatured &&
        editingArticle.featuredUntil &&
        editingArticle.featuredUntil > nowMs
          ? editingArticle.featuredUntil
          : undefined;
      setTitleKannada(fieldValueToEditorHtml(editingArticle.titleKannada));
      setSummaryKannada(fieldValueToEditorHtml(editingArticle.summaryKannada));
      setBodyKannada(paragraphsToEditorHtml(editingArticle.bodyKannada));
      setCategory(editingArticle.category);
      const mappedLoc = getKannadaLocationLabel(editingArticle.location);
      setLocation(KOPPA_LOCATIONS.includes(mappedLoc) ? mappedLoc : KOPPA_LOCATIONS[0]);
      setReporter(editingArticle.reporter);
      setImageKey(editingArticle.imageKey || 'none');
      setImageUrl(editingArticle.imageUrl || '');
      setImageThumbUrl(editingArticle.imageThumbUrl || '');
      setImageDriveId(editingArticle.imageDriveId || '');
      setWatermarkApplied(Boolean(editingArticle.watermarkApplied && editingArticle.imageUrl));
      setImageCaption(fieldValueToEditorHtml(editingArticle.imageCaption || ''));
      setExtraImages(
        Array.isArray(editingArticle.extraImages)
          ? editingArticle.extraImages.map((item) => ({ ...item }))
          : []
      );
      setIsFeatured(activelyFeatured);
      setExistingFeaturedUntil(activeTimer);
      setLeadTimerMode(activeTimer ? 'keep' : 'none');
      setLeadDurationValue('2');
      setLeadDurationUnit('days');
    } else {
      setTitleKannada('');
      setSummaryKannada('');
      setBodyKannada('');
      setCategory('Local');
      setLocation(KOPPA_LOCATIONS[0]);
      setReporter('Coffeenadu Desk');
      setImageKey('none');
      setImageUrl('');
      setImageThumbUrl('');
      setImageDriveId('');
      setWatermarkApplied(false);
      setImageCaption('');
      setExtraImages([]);
      setIsFeatured(false);
      setExistingFeaturedUntil(undefined);
      setLeadTimerMode('none');
      setLeadDurationValue('2');
      setLeadDurationUnit('days');
    }
    setCustomSlugInput('');
    setAlsoAddToProgram(false);
    setProgramDate(getTodayYmd());
    setProgramTime('10:00 AM');
    setProgramOrganizer('');
    setIsProcessingExtraImages(false);
    setExtraUploadProgress('');
    setIsSubmitting(false);
    setErrorMessage('');
  }, [isOpen, editingArticle]);

  const existingIdsSet = useMemo(
    () => new Set(existingArticleIds.map((id) => id.trim().toLowerCase())),
    [existingArticleIds]
  );

  const formattedCustomSlug = useMemo(
    () => formatCustomEnglishSlug(customSlugInput),
    [customSlugInput]
  );

  const customSlugValidation = useMemo(
    () => validateCustomEnglishSlugInput(customSlugInput),
    [customSlugInput]
  );

  const isDuplicateCustomSlug = Boolean(
    !editingArticle &&
      formattedCustomSlug &&
      existingIdsSet.has(formattedCustomSlug.toLowerCase())
  );

  if (!isOpen) return null;

  const previewUrl =
    imageUrl ||
    resolveArticleImage({
      id: 'preview',
      titleKannada: '',
      summaryKannada: '',
      bodyKannada: [],
      category,
      location,
      publishedDate: '',
      publishedTime: '',
      readTimeMinutes: 1,
      reporter,
      imageKey,
      imageUrl: imageUrl || undefined,
    });

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isLikelyImageFile(file)) {
      setErrorMessage('Please choose an image file (JPG, PNG, WebP, or GIF).');
      return;
    }

    setErrorMessage('');
    setIsProcessingImage(true);
    try {
      const processed = await processAndUploadNewsPhoto(file, { includeMiddleBrand: true });
      setImageUrl(processed.imageUrl);
      setImageThumbUrl(processed.imageThumbUrl || '');
      setImageDriveId(processed.imageDriveId || '');
      setWatermarkApplied(true);
      setImageKey('none');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to process the selected photo.'
      );
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExtraFilesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const remainingSlots = MAX_EXTRA_NEWS_PHOTOS - extraImages.length;
    if (remainingSlots <= 0) {
      setErrorMessage(`You can attach up to ${MAX_EXTRA_NEWS_PHOTOS} extra photos per news article.`);
      if (extraFileInputRef.current) extraFileInputRef.current.value = '';
      return;
    }

    const validFiles = selectedFiles.filter(isLikelyImageFile).slice(0, remainingSlots);
    if (validFiles.length === 0) {
      setErrorMessage('Please choose valid image files (JPG, PNG, WebP, or GIF).');
      if (extraFileInputRef.current) extraFileInputRef.current.value = '';
      return;
    }

    setErrorMessage('');
    setIsProcessingExtraImages(true);
    const newlyAdded: ExtraNewsPhoto[] = [];
    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setExtraUploadProgress(`Uploading photo ${i + 1} of ${validFiles.length}...`);
        const processed = await processAndUploadNewsPhoto(file, { includeMiddleBrand: true });
        newlyAdded.push({
          imageUrl: processed.imageUrl,
          imageThumbUrl: processed.imageThumbUrl || undefined,
          imageDriveId: processed.imageDriveId || undefined,
          caption: '',
          watermarkApplied: true,
        });
      }
      if (newlyAdded.length > 0) {
        setExtraImages((prev) => [...prev, ...newlyAdded].slice(0, MAX_EXTRA_NEWS_PHOTOS));
      }
      if (selectedFiles.length > remainingSlots) {
        setErrorMessage(
          `Added ${newlyAdded.length} photo(s). Maximum ${MAX_EXTRA_NEWS_PHOTOS} extra photos are allowed per article.`
        );
      }
    } catch (err) {
      if (newlyAdded.length > 0) {
        setExtraImages((prev) => [...prev, ...newlyAdded].slice(0, MAX_EXTRA_NEWS_PHOTOS));
      }
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to upload one or more extra photos.'
      );
    } finally {
      setIsProcessingExtraImages(false);
      setExtraUploadProgress('');
      if (extraFileInputRef.current) {
        extraFileInputRef.current.value = '';
      }
    }
  };

  const handleUpdateExtraCaption = (index: number, captionValue: string) => {
    setExtraImages((prev) =>
      prev.map((item, i) => (i === index ? { ...item, caption: captionValue } : item))
    );
  };

  const handleMoveExtraPhoto = (index: number, direction: -1 | 1) => {
    setExtraImages((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleRemoveExtraPhoto = (index: number) => {
    setExtraImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isSaving || isProcessingImage || isProcessingExtraImages) return;

    const cleanTitle = sanitizeInlineRichTextHtml(titleKannada, false);
    const plainTitle = stripRichTextToPlainText(cleanTitle);
    const paragraphs = editorHtmlToParagraphs(bodyKannada);
    const plainFirstParagraph = stripRichTextToPlainText(paragraphs[0] || '');
    const cleanSummaryRaw = sanitizeInlineRichTextHtml(summaryKannada, true);
    const cleanSummary = (
      stripRichTextToPlainText(cleanSummaryRaw) ? cleanSummaryRaw : plainFirstParagraph
    ).slice(0, 2500);
    const cleanCaption = sanitizeInlineRichTextHtml(imageCaption, false);

    if (!plainTitle || paragraphs.length === 0) {
      setErrorMessage('Please enter both the Kannada Headline and Full Report before publishing.');
      return;
    }

    if (!editingArticle && customSlugInput.trim()) {
      if (customSlugValidation.error) {
        setErrorMessage(customSlugValidation.error);
        return;
      }
      if (isDuplicateCustomSlug) {
        setErrorMessage(
          `The custom English URL "${formattedCustomSlug}" is already used by another article. Please choose a different English URL.`
        );
        return;
      }
    }

    if (alsoAddToProgram && (!programDate || !/^\d{4}-\d{2}-\d{2}$/.test(programDate))) {
      setErrorMessage('Please select a valid scheduled date for the Program & Events calendar.');
      return;
    }

    let computedFeaturedUntil: number | undefined;
    if (isFeatured) {
      if (leadTimerMode === 'keep' && existingFeaturedUntil && existingFeaturedUntil > Date.now()) {
        computedFeaturedUntil = existingFeaturedUntil;
      } else if (leadTimerMode === 'duration') {
        const parsedAmount = Number(leadDurationValue);
        const maxAllowed = leadDurationUnit === 'days' ? 365 : 8760;
        if (!Number.isFinite(parsedAmount) || parsedAmount < 1 || parsedAmount > maxAllowed) {
          setErrorMessage(
            leadDurationUnit === 'days'
              ? 'Please enter a Lead Story timer between 1 and 365 days.'
              : 'Please enter a Lead Story timer between 1 and 8760 hours.'
          );
          return;
        }
        const unitMs = leadDurationUnit === 'days' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
        computedFeaturedUntil = Date.now() + Math.round(parsedAmount * unitMs);
      }
    }

    setErrorMessage('');
    setIsSubmitting(true);
    try {
      let finalImageUrl = imageUrl.trim();
      let finalWatermarkApplied = Boolean(finalImageUrl && watermarkApplied);
      const isAlreadyDriveUrl =
        finalImageUrl.startsWith('/api/media/drive/') ||
        finalImageUrl.includes('drive.google.com');
      if (finalImageUrl && !finalWatermarkApplied && !isAlreadyDriveUrl) {
        try {
          finalImageUrl = await applyWatermarkToImageSrc(finalImageUrl);
          finalWatermarkApplied = true;
        } catch {
          // Keep original URL if external CORS blocks re-encoding; canvas component handles rendering
        }
      }

      const cleanedExtraImages: ExtraNewsPhoto[] = extraImages
        .filter((item) => item && typeof item.imageUrl === 'string' && item.imageUrl.trim().length > 0)
        .slice(0, MAX_EXTRA_NEWS_PHOTOS)
        .map((item) => {
          const cleanCap = (item.caption || '').trim().slice(0, 240);
          return {
            imageUrl: item.imageUrl.trim(),
            imageThumbUrl: item.imageThumbUrl?.trim() || undefined,
            imageDriveId: item.imageDriveId?.trim() || undefined,
            caption: cleanCap || undefined,
            watermarkApplied: item.watermarkApplied !== false,
          };
        });

      await onSubmit({
        customSlug: !editingArticle && formattedCustomSlug ? formattedCustomSlug : undefined,
        titleKannada: cleanTitle,
        summaryKannada: cleanSummary,
        bodyKannada: paragraphs,
        category,
        location,
        reporter: reporter.trim() || 'Coffeenadu Desk',
        imageKey,
        imageUrl: finalImageUrl,
        imageThumbUrl: finalImageUrl ? imageThumbUrl || undefined : undefined,
        imageDriveId: finalImageUrl ? imageDriveId || undefined : undefined,
        imageCaption: stripRichTextToPlainText(cleanCaption) ? cleanCaption.slice(0, 1000) : undefined,
        extraImages: cleanedExtraImages,
        isFeatured,
        featuredUntil: isFeatured ? computedFeaturedUntil : undefined,
        watermarkApplied: finalWatermarkApplied,
        alsoAddToProgram,
        programDate: alsoAddToProgram ? programDate : undefined,
        programTime: alsoAddToProgram ? programTime.trim() || '10:00 AM' : undefined,
        programOrganizer: alsoAddToProgram
          ? programOrganizer.trim() || reporter.trim() || 'Koppa Taluk Committee'
          : undefined,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to save article.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-article-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl shadow-lg overflow-hidden my-auto flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 shrink-0">
          <div>
            <h2 id="admin-article-modal-title" className="text-lg font-bold text-slate-950">
              {editingArticle ? 'Edit News Article' : 'Add News Article'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              One formatting toolbar below works for Headline, Summary, Full Report &amp; Photo Caption
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Single Unified Sticky MS Word-Style Formatting Toolbar for ALL text fields */}
        <RichTextToolbar controller={richController} className="shrink-0 z-20" />

        <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 overflow-y-auto">
          {errorMessage && (
            <div
              role="alert"
              className="px-3.5 py-2.5 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md"
            >
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="admin-category" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Category
              </label>
              <select
                id="admin-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as NewsCategory)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[#0F274A] min-h-[40px]"
              >
                {NEWS_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="admin-location" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Town / Hobli
              </label>
              <select
                id="admin-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[#0F274A] min-h-[40px]"
              >
                {KOPPA_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="admin-title" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Headline (Kannada — Select text &amp; use top Bold / Font / Size bar)
            </label>
            <RichTextField
              id="admin-title"
              fieldId="headline"
              fieldLabel="Headline"
              controller={richController}
              value={titleKannada}
              onChange={setTitleKannada}
              singleLine
              minHeightClass="min-h-[44px]"
              maxHeightClass="max-h-[120px]"
              contentClassName="text-base font-semibold leading-snug"
              placeholder="ಕನ್ನಡದಲ್ಲಿ ಸುದ್ದಿಯ ಶೀರ್ಷಿಕೆ ಬರೆಯಿರಿ..."
            />
          </div>

          {!editingArticle ? (
            <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 space-y-1.5">
              <label
                htmlFor="admin-custom-english-url"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
              >
                <Link2 className="w-3.5 h-3.5 text-[#0F274A]" aria-hidden="true" />
                <span>Custom English URL (Optional)</span>
              </label>
              <input
                id="admin-custom-english-url"
                type="text"
                maxLength={100}
                value={customSlugInput}
                onChange={(e) => setCustomSlugInput(e.target.value)}
                placeholder="e.g. article 1 or koppa-coffee-price"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0F274A] min-h-[40px]"
              />
              {customSlugInput.trim() ? (
                customSlugValidation.error ? (
                  <p className="text-[11px] font-medium text-red-700">
                    {customSlugValidation.error}
                  </p>
                ) : isDuplicateCustomSlug ? (
                  <p className="text-[11px] font-medium text-red-700">
                    &ldquo;{formattedCustomSlug}&rdquo; is already used by another article. Please choose a different English URL.
                  </p>
                ) : (
                  <p className="text-[11px] text-emerald-900 break-all">
                    Will publish automatically at:{' '}
                    <span className="font-semibold">
                      {buildArticlePublicUrl(formattedCustomSlug)}
                    </span>
                  </p>
                )
              ) : (
                <p className="text-[11px] text-slate-500">
                  Enter English words/numbers (spaces become hyphens, e.g. &ldquo;article 1&rdquo; →{' '}
                  <span className="font-medium text-slate-700">/?article=article-1</span>). Leave blank to auto-generate.
                </p>
              )}
            </div>
          ) : (
            <div className="px-3 py-2 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-1.5 break-all">
              <Link2 className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
              <span>
                Article URL (locked for existing news):{' '}
                <strong className="text-slate-800 font-medium">
                  {buildArticlePublicUrl(editingArticle.id)}
                </strong>
              </span>
            </div>
          )}

          <div>
            <label htmlFor="admin-summary" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Short Summary / Description (Kannada — Optional, auto-filled if blank)
            </label>
            <RichTextField
              id="admin-summary"
              fieldId="summary"
              fieldLabel="Short Summary"
              controller={richController}
              value={summaryKannada}
              onChange={setSummaryKannada}
              minHeightClass="min-h-[68px]"
              maxHeightClass="max-h-[160px]"
              contentClassName="text-sm leading-relaxed"
              placeholder="ಸುದ್ದಿಯ ಸಾರಾಂಶವನ್ನು 1-2 ವಾಕ್ಯಗಳಲ್ಲಿ ಬರೆಯಿರಿ..."
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label htmlFor="admin-body" className="block text-xs font-semibold text-slate-700">
                Full Report (Kannada)
              </label>
              <span className="text-[11px] text-slate-500">
                Formatted via the single top toolbar
              </span>
            </div>
            <RichTextField
              id="admin-body"
              fieldId="body"
              fieldLabel="Full Report"
              controller={richController}
              value={bodyKannada}
              onChange={setBodyKannada}
              minHeightClass="min-h-[210px]"
              maxHeightClass="max-h-[380px]"
              contentClassName="text-[15px] leading-[1.8]"
              showStats
              placeholder="ಸಂಪೂರ್ಣ ವರದಿಯನ್ನು ಕನ್ನಡದಲ್ಲಿ ನಮೂದಿಸಿ (Select any word & use top Bold / Font / Size bar)..."
            />
          </div>

          {/* Photo Upload Section */}
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                News Photo (Device Upload or Preset)
              </span>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl('');
                    setImageThumbUrl('');
                    setImageDriveId('');
                    setWatermarkApplied(false);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Remove Uploaded Photo</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <div>
                <input
                  ref={fileInputRef}
                  id="admin-file-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <label
                  htmlFor="admin-file-upload"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-[#0F274A] bg-white border border-slate-300 hover:border-[#0F274A] rounded-md cursor-pointer transition-colors min-h-[42px]"
                >
                  <ImagePlus className="w-4 h-4" aria-hidden="true" />
                  <span>{isProcessingImage ? 'Applying logo & optimizing...' : 'Upload Photo (Mobile / PC)'}</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Automatically applies the larger circular CoffeeNadu logo + 2x COFFEENADU NEWS middle watermark and fits any photo size without cropping
                </p>
              </div>

              <div>
                <label htmlFor="admin-image-preset" className="sr-only">
                  Or choose preset Koppa photo
                </label>
                <select
                  id="admin-image-preset"
                  value={imageUrl ? 'none' : imageKey}
                  onChange={(e) => {
                    setImageKey(e.target.value as ImageKey);
                    setImageUrl('');
                    setImageThumbUrl('');
                    setImageDriveId('');
                    setWatermarkApplied(false);
                  }}
                  className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-[#0F274A] min-h-[42px]"
                >
                  {IMAGE_PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.key === 'none'
                        ? `Auto: Use ${category} Section Preset`
                        : `Preset: ${preset.label}`}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Automatically uses the {category} section preset if no photo is uploaded
                </p>
              </div>
            </div>

            {previewUrl && (
              <div className="pt-1">
                <NewsImage
                  src={previewUrl}
                  alt="Selected article preview"
                  fitMode="natural"
                  maxHeightClass="max-h-72"
                  watermarkApplied={Boolean(imageUrl && watermarkApplied)}
                  className="rounded-md border border-slate-200"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="admin-image-caption" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Photo Caption (Kannada, Optional)
              </label>
              <RichTextField
                id="admin-image-caption"
                fieldId="caption"
                fieldLabel="Photo Caption"
                controller={richController}
                value={imageCaption}
                onChange={setImageCaption}
                singleLine
                minHeightClass="min-h-[40px]"
                maxHeightClass="max-h-[100px]"
                contentClassName="text-sm leading-snug"
                placeholder="ಚಿತ್ರದ ವಿವರಣೆ..."
              />
            </div>

            <div>
              <label htmlFor="admin-reporter" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Reporter Name
              </label>
              <input
                id="admin-reporter"
                type="text"
                maxLength={100}
                value={reporter}
                onChange={(e) => setReporter(e.target.value)}
                placeholder="Coffeenadu Desk"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0F274A] min-h-[40px]"
              />
            </div>
          </div>

          {/* Optional Extra Photos (Shown ONLY after the end of the full news report) */}
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Images className="w-4 h-4 text-[#0F274A]" aria-hidden="true" />
                <span className="text-xs font-semibold text-slate-800">
                  Extra Photos After End of News (Optional · {extraImages.length}/{MAX_EXTRA_NEWS_PHOTOS})
                </span>
              </div>
              {extraImages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExtraImages([])}
                  disabled={isProcessingExtraImages}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear All Extra Photos</span>
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              Optional: Add 2, 3, or up to {MAX_EXTRA_NEWS_PHOTOS} additional photos. These appear{' '}
              <strong className="font-semibold text-slate-800">only after the end of the news report</strong>{' '}
              (not on the front page or top of the story). Each newly uploaded photo automatically includes the larger CoffeeNadu logo + 2x COFFEENADU NEWS middle watermark and displays uncut.
            </p>

            <div>
              <input
                ref={extraFileInputRef}
                id="admin-extra-files-upload"
                type="file"
                accept="image/*"
                multiple
                disabled={isProcessingExtraImages || extraImages.length >= MAX_EXTRA_NEWS_PHOTOS}
                onChange={handleExtraFilesChange}
                className="sr-only"
              />
              <label
                htmlFor="admin-extra-files-upload"
                className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 text-xs font-semibold rounded-md border transition-colors min-h-[42px] ${
                  isProcessingExtraImages || extraImages.length >= MAX_EXTRA_NEWS_PHOTOS
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'text-[#0F274A] bg-white border-slate-300 hover:border-[#0F274A] cursor-pointer'
                }`}
              >
                {isProcessingExtraImages ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>{extraUploadProgress || 'Watermarking & uploading extra photos...'}</span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {extraImages.length >= MAX_EXTRA_NEWS_PHOTOS
                        ? `Maximum ${MAX_EXTRA_NEWS_PHOTOS} Extra Photos Added`
                        : 'Add Extra Photos (Select 1, 2, 3 or more)'}
                    </span>
                  </>
                )}
              </label>
            </div>

            {extraImages.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {extraImages.map((photo, idx) => (
                  <div
                    key={`${photo.imageDriveId || photo.imageUrl.slice(0, 32)}-${idx}`}
                    className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#0F274A]">
                        Extra Photo #{idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveExtraPhoto(idx, -1)}
                          disabled={idx === 0}
                          aria-label={`Move extra photo ${idx + 1} up`}
                          className="p-1 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveExtraPhoto(idx, 1)}
                          disabled={idx === extraImages.length - 1}
                          aria-label={`Move extra photo ${idx + 1} down`}
                          className="p-1 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveExtraPhoto(idx)}
                          aria-label={`Remove extra photo ${idx + 1}`}
                          className="p-1 text-red-700 hover:bg-red-50 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <NewsImage
                      src={photo.imageUrl}
                      alt={`Extra photo ${idx + 1} preview`}
                      fitMode="natural"
                      maxHeightClass="max-h-48"
                      watermarkApplied={photo.watermarkApplied !== false}
                      className="rounded border border-slate-200"
                    />

                    <input
                      type="text"
                      maxLength={240}
                      value={photo.caption || ''}
                      onChange={(e) => handleUpdateExtraCaption(idx, e.target.value)}
                      placeholder="ಚಿತ್ರದ ವಿವರಣೆ (Optional caption)..."
                      className="w-full px-2.5 py-1.5 text-xs font-kannada bg-white border border-slate-300 rounded text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0F274A]"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-amber-200/90 bg-amber-50/40 rounded-lg p-4 space-y-3">
            <label className="flex items-start gap-2.5 text-sm text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsFeatured(checked);
                  if (!checked) {
                    setLeadTimerMode('none');
                  } else if (existingFeaturedUntil && existingFeaturedUntil > Date.now()) {
                    setLeadTimerMode('keep');
                  }
                }}
                className="w-4 h-4 mt-0.5 accent-[#0F274A] rounded shrink-0"
              />
              <div>
                <span className="font-semibold block">
                  Pin as Featured Lead Story
                </span>
                <span className="text-xs text-slate-600">
                  Multiple lead stories slide automatically on the front page. Untick &amp; click Save Changes to remove from Lead Story anytime.
                </span>
              </div>
            </label>

            {isFeatured && (
              <div className="pt-3 border-t border-amber-200/80 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
                  <Clock className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                  <span>Lead Story Auto-Remove Timer (Optional)</span>
                </div>

                {existingFeaturedUntil && existingFeaturedUntil > Date.now() && (
                  <div className="px-3 py-2 rounded-md bg-white border border-amber-200 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Active timer:{' '}
                      <strong>{formatLeadExpiryDateTime(existingFeaturedUntil)}</strong>{' '}
                      ({formatRemainingLeadTime(existingFeaturedUntil)})
                    </span>
                    {leadTimerMode !== 'keep' && (
                      <button
                        type="button"
                        onClick={() => setLeadTimerMode('keep')}
                        className="text-[11px] font-semibold text-[#0F274A] hover:underline cursor-pointer"
                      >
                        Keep existing timer
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLeadTimerMode('none')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                      leadTimerMode === 'none'
                        ? 'bg-[#0F274A] text-white border-[#0F274A]'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    No Timer (Stay Until Removed)
                  </button>

                  {LEAD_TIMER_PRESETS.map((preset) => {
                    const isSelectedPreset =
                      leadTimerMode === 'duration' &&
                      leadDurationUnit === preset.unit &&
                      Number(leadDurationValue) === preset.value;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setLeadTimerMode('duration');
                          setLeadDurationValue(String(preset.value));
                          setLeadDurationUnit(preset.unit);
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                          isSelectedPreset
                            ? 'bg-amber-700 text-white border-amber-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-amber-500'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-medium text-slate-700">Custom duration:</span>
                  <input
                    id="lead-timer-value"
                    type="number"
                    min={1}
                    max={leadDurationUnit === 'days' ? 365 : 8760}
                    step={1}
                    value={leadDurationValue}
                    onFocus={() => setLeadTimerMode('duration')}
                    onChange={(e) => {
                      setLeadTimerMode('duration');
                      setLeadDurationValue(e.target.value);
                    }}
                    className="w-24 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[#0F274A] min-h-[38px]"
                  />
                  <select
                    aria-label="Lead story timer unit"
                    value={leadDurationUnit}
                    onChange={(e) => {
                      setLeadTimerMode('duration');
                      setLeadDurationUnit(e.target.value as 'hours' | 'days');
                    }}
                    className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-[#0F274A] min-h-[38px]"
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>

                {leadTimerMode === 'duration' &&
                  Number(leadDurationValue) >= 1 &&
                  Number.isFinite(Number(leadDurationValue)) && (
                    <p className="text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                      Will automatically leave Lead Story on{' '}
                      <strong>
                        {formatLeadExpiryDateTime(
                          Date.now() +
                            Math.round(
                              Number(leadDurationValue) *
                                (leadDurationUnit === 'days'
                                  ? 24 * 60 * 60 * 1000
                                  : 60 * 60 * 1000)
                            )
                        )}
                      </strong>{' '}
                      (article stays published in regular news feed).
                    </p>
                  )}

                {leadTimerMode === 'none' && (
                  <p className="text-[11px] text-slate-600">
                    No auto-remove timer set — this story stays in Lead Story until you untick it.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Optional Cross-Publish to Programs & Events Calendar */}
          <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-4 space-y-3">
            <label className="flex items-start gap-2.5 text-sm text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={alsoAddToProgram}
                onChange={(e) => setAlsoAddToProgram(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-emerald-800 rounded shrink-0"
              />
              <div>
                <span className="font-semibold block">
                  Also add to Programs &amp; Events calendar
                </span>
                <span className="text-xs text-slate-600">
                  Displays this story in both the News section and the Programs &amp; Events calendar (green-marked date)
                </span>
              </div>
            </label>

            {alsoAddToProgram && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-emerald-200/80">
                <div>
                  <label htmlFor="news-program-date" className="block text-xs font-semibold text-slate-700 mb-1">
                    Program Date
                  </label>
                  <input
                    id="news-program-date"
                    type="date"
                    required={alsoAddToProgram}
                    value={programDate}
                    onChange={(e) => setProgramDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-700 min-h-[40px]"
                  />
                </div>

                <div>
                  <label htmlFor="news-program-time" className="block text-xs font-semibold text-slate-700 mb-1">
                    Program Time
                  </label>
                  <input
                    id="news-program-time"
                    type="text"
                    maxLength={40}
                    value={programTime}
                    onChange={(e) => setProgramTime(e.target.value)}
                    placeholder="10:00 AM"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-700 min-h-[40px]"
                  />
                </div>

                <div>
                  <label htmlFor="news-program-organizer" className="block text-xs font-semibold text-slate-700 mb-1">
                    Organizer (Optional)
                  </label>
                  <input
                    id="news-program-organizer"
                    type="text"
                    maxLength={100}
                    value={programOrganizer}
                    onChange={(e) => setProgramOrganizer(e.target.value)}
                    placeholder={reporter || 'Koppa Taluk Committee'}
                    className="w-full px-3 py-2 text-sm font-kannada bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-700 min-h-[40px]"
                  />
                </div>
              </div>
            )}
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="px-3.5 py-2.5 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || isSaving || isProcessingImage || isProcessingExtraImages}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer min-h-[40px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isSaving || isProcessingImage || isProcessingExtraImages}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-[#0F274A] hover:bg-[#173a6e] disabled:opacity-60 rounded-md transition-colors cursor-pointer min-h-[40px]"
            >
              {(isSubmitting || isSaving) && (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              )}
              <span>
                {isSubmitting || isSaving
                  ? 'Publishing...'
                  : editingArticle
                  ? 'Save Changes'
                  : 'Publish Story'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
