import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { KOPPA_LOCATIONS, getKannadaLocationLabel } from '../constants/newsData';
import type { EventMutationInput } from '../services/eventsStore';
import type { ProgramEvent } from '../types/news';
import { applyWatermarkToImageSrc } from '../utils/watermark';
import { isLikelyImageFile, processAndUploadNewsPhoto } from './AdminArticleModal';
import { NewsImage } from './NewsImage';

interface AdminEventModalProps {
  isOpen: boolean;
  editingEvent: ProgramEvent | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: EventMutationInput) => Promise<void>;
}

function getTodayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function AdminEventModal({
  isOpen,
  editingEvent,
  isSaving,
  onClose,
  onSubmit,
}: AdminEventModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [titleKannada, setTitleKannada] = useState('');
  const [descriptionKannada, setDescriptionKannada] = useState('');
  const [eventDate, setEventDate] = useState(getTodayYmd());
  const [eventTime, setEventTime] = useState('10:00 AM');
  const [location, setLocation] = useState<string>(KOPPA_LOCATIONS[0]);
  const [organizer, setOrganizer] = useState('Koppa Taluk Committee');
  const [imageUrl, setImageUrl] = useState('');
  const [imageThumbUrl, setImageThumbUrl] = useState('');
  const [imageDriveId, setImageDriveId] = useState('');
  const [watermarkApplied, setWatermarkApplied] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editingEvent) {
      setTitleKannada(editingEvent.titleKannada);
      setDescriptionKannada(editingEvent.descriptionKannada);
      setEventDate(editingEvent.eventDate || getTodayYmd());
      setEventTime(editingEvent.eventTime || '10:00 AM');
      const mappedLoc = getKannadaLocationLabel(editingEvent.location);
      setLocation(KOPPA_LOCATIONS.includes(mappedLoc) ? mappedLoc : KOPPA_LOCATIONS[0]);
      setOrganizer(editingEvent.organizer || 'Koppa Taluk Committee');
      setImageUrl(editingEvent.imageUrl || '');
      setImageThumbUrl(editingEvent.imageThumbUrl || '');
      setImageDriveId(editingEvent.imageDriveId || '');
      setWatermarkApplied(Boolean(editingEvent.watermarkApplied && editingEvent.imageUrl));
    } else {
      setTitleKannada('');
      setDescriptionKannada('');
      setEventDate(getTodayYmd());
      setEventTime('10:00 AM');
      setLocation(KOPPA_LOCATIONS[0]);
      setOrganizer('Koppa Taluk Committee');
      setImageUrl('');
      setImageThumbUrl('');
      setImageDriveId('');
      setWatermarkApplied(false);
    }
    setIsSubmitting(false);
    setErrorMessage('');
  }, [isOpen, editingEvent]);

  if (!isOpen) return null;

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
      const processed = await processAndUploadNewsPhoto(file, { includeMiddleBrand: false });
      setImageUrl(processed.imageUrl);
      setImageThumbUrl(processed.imageThumbUrl || '');
      setImageDriveId(processed.imageDriveId || '');
      setWatermarkApplied(true);
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isSaving || isProcessingImage) return;

    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      setErrorMessage('Please choose a scheduled calendar date.');
      return;
    }
    if (!titleKannada.trim() || !descriptionKannada.trim()) {
      setErrorMessage('Please enter both Program Title and Details in Kannada.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);
    try {
      let finalImageUrl = imageUrl.trim();
      let finalWatermarkApplied = Boolean(finalImageUrl && watermarkApplied);
      if (finalImageUrl && !finalWatermarkApplied) {
        try {
          finalImageUrl = await applyWatermarkToImageSrc(finalImageUrl);
          finalWatermarkApplied = true;
        } catch {
          // Fallback to canvas watermark overlay
        }
      }

      await onSubmit({
        titleKannada: titleKannada.trim(),
        descriptionKannada: descriptionKannada.trim(),
        eventDate,
        eventTime: eventTime.trim() || '10:00 AM',
        location,
        organizer: organizer.trim() || 'Koppa Taluk Committee',
        imageUrl: finalImageUrl || undefined,
        imageThumbUrl: finalImageUrl ? imageThumbUrl || undefined : undefined,
        imageDriveId: finalImageUrl ? imageDriveId || undefined : undefined,
        watermarkApplied: finalWatermarkApplied,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to save program.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-event-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-lg overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="admin-event-modal-title" className="text-lg font-bold text-slate-950">
              {editingEvent ? 'Edit Program / Event' : 'Schedule Program / Event'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Scheduled dates automatically turn green on the public Programs &amp; Events calendar
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {errorMessage && (
            <div
              role="alert"
              className="px-3.5 py-2.5 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md"
            >
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="event-date" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Scheduled Date
              </label>
              <input
                id="event-date"
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-700 min-h-[40px]"
              />
            </div>

            <div>
              <label htmlFor="event-time" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Event Time
              </label>
              <input
                id="event-time"
                type="text"
                maxLength={40}
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                placeholder="10:00 AM"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-700 min-h-[40px]"
              />
            </div>

            <div>
              <label htmlFor="event-place" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Place (Kannada)
              </label>
              <select
                id="event-place"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="font-kannada w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-700 min-h-[40px]"
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
            <label htmlFor="event-title" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Program / Event Title (Kannada)
            </label>
            <input
              id="event-title"
              type="text"
              required
              maxLength={300}
              value={titleKannada}
              onChange={(e) => setTitleKannada(e.target.value)}
              placeholder="ಕಾರ್ಯಕ್ರಮದ ಶೀರ್ಷಿಕೆ ಕನ್ನಡದಲ್ಲಿ ಬರೆಯಿರಿ..."
              className="w-full px-3 py-2 text-sm font-kannada bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-700 min-h-[40px]"
            />
          </div>

          <div>
            <label htmlFor="event-details" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Program Details &amp; Venue (Kannada)
            </label>
            <textarea
              id="event-details"
              rows={4}
              required
              maxLength={2000}
              value={descriptionKannada}
              onChange={(e) => setDescriptionKannada(e.target.value)}
              placeholder="ಕಾರ್ಯಕ್ರಮದ ಸ್ಥಳ, ಮುಖ್ಯ ಅತಿಥಿಗಳು ಮತ್ತು ಸಂಪೂರ್ಣ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ..."
              className="w-full px-3 py-2 text-sm font-kannada bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-700"
            />
          </div>

          <div>
            <label htmlFor="event-organizer" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Organizer / Association
            </label>
            <input
              id="event-organizer"
              type="text"
              maxLength={100}
              value={organizer}
              onChange={(e) => setOrganizer(e.target.value)}
              placeholder="ಆಯೋಜಕರು / Organizer name"
              className="w-full px-3 py-2 text-sm font-kannada bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-700 min-h-[40px]"
            />
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                Event Invitation / Banner Photo (Optional)
              </span>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl('');
                    setWatermarkApplied(false);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Remove Photo</span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              id="event-file-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
            />
            <label
              htmlFor="event-file-upload"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-[#0F274A] bg-white border border-slate-300 hover:border-[#0F274A] rounded-md cursor-pointer transition-colors min-h-[42px]"
            >
              <ImagePlus className="w-4 h-4" aria-hidden="true" />
              <span>{isProcessingImage ? 'Applying logo & optimizing...' : 'Upload Program Banner (Mobile / PC)'}</span>
            </label>

            {imageUrl && (
              <NewsImage
                src={imageUrl}
                alt="Event banner preview"
                fitMode="natural"
                maxHeightClass="max-h-64"
                watermarkApplied={watermarkApplied}
                className="rounded-md border border-slate-200"
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || isSaving || isProcessingImage}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer min-h-[40px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isSaving || isProcessingImage}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 rounded-md transition-colors cursor-pointer min-h-[40px]"
            >
              {(isSubmitting || isSaving) && (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              )}
              <span>
                {isSubmitting || isSaving
                  ? 'Saving...'
                  : editingEvent
                  ? 'Save Program'
                  : 'Publish Program'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
