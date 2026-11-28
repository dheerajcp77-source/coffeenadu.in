import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Flag,
  ImagePlus,
  Loader2,
  Lock,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_MAP,
  COMMUNITY_LOCATIONS_KN,
} from '../../constants/communityCategories';
import type {
  CommunityCategoryId,
  CommunitySelfProfile,
  PublicCommunityPost,
} from '../../types/community';
import {
  compressCommunityImageFile,
  createCommunityPost,
  registerCommunityUser,
  reportCommunityPost,
  updateCommunityPost,
} from '../../services/communityClient';
import {
  buildCommunityPostPublicUrl,
  MAX_COMMUNITY_PHOTOS,
} from '../../utils/communityHelpers';
import { CommunityShareBar } from './CommunityShareBar';

// ============================================================================
// 1. SIMPLE REGISTRATION MODAL (Full Name + Mobile Number ONLY, NO OTP)
// ============================================================================
interface CommunityRegisterModalProps {
  open: boolean;
  onClose: () => void;
  onRegistered: (profile: CommunitySelfProfile) => void;
}

export const CommunityRegisterModal: React.FC<CommunityRegisterModalProps> = ({
  open,
  onClose,
  onRegistered,
}) => {
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { profile } = await registerCommunityUser({
        fullName: fullName.trim(),
        mobileNumber: mobileNumber.trim(),
      });
      onRegistered(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ನೋಂದಣಿ ವಿಫಲವಾಗಿದೆ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="community-register-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#101D30] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0D1828]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#176B4A] text-white flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="community-register-title"
                className="font-kannada text-base font-extrabold text-[#10243D] dark:text-white"
              >
                ಸರಳ ನೋಂದಣಿ (ಉಚಿತ)
              </h2>
              <p className="font-kannada text-xs text-[#5A677A] dark:text-slate-400">
                OTP ಅಥವಾ ಶುಲ್ಕ ಇಲ್ಲ — ತಕ್ಷಣ ಮಾಹಿತಿ ಸೇರಿಸಿ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ಮುಚ್ಚಿ"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs font-kannada font-semibold text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="comm-reg-name"
              className="block font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1.5"
            >
              ಪೂರ್ಣ ಹೆಸರು (Full Name) *
            </label>
            <input
              id="comm-reg-name"
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ಉದಾ: ರಮೇಶ್ ಭಟ್"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#10243D] dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 font-kannada focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
            />
          </div>

          <div>
            <label
              htmlFor="comm-reg-mobile"
              className="block font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1.5"
            >
              ಮೊಬೈಲ್ ಸಂಖ್ಯೆ (10 ಅಂಕಿಗಳು) *
            </label>
            <input
              id="comm-reg-mobile"
              type="tel"
              inputMode="numeric"
              required
              maxLength={15}
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="ಉದಾ: 9845123456"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#10243D] dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
            />
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60">
            <Lock className="w-4 h-4 text-[#176B4A] dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="font-kannada text-[11px] leading-relaxed text-[#14533A] dark:text-emerald-200">
              <strong>ಗೌಪ್ಯತೆಯ ಭರವಸೆ:</strong> ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಸಾರ್ವಜನಿಕವಾಗಿ ಎಲ್ಲಿಯೂ ಕಾಣಿಸುವುದಿಲ್ಲ. ಪ್ರಕಟಣೆಗಳಲ್ಲಿ ಕೇವಲ ನಿಮ್ಮ ಹೆಸರು ಮಾತ್ರ ಕಾಣಿಸುತ್ತದೆ.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#13593D] disabled:opacity-60 text-white font-kannada text-sm font-bold transition-colors cursor-pointer"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>ಮುಂದುವರಿಯಿರಿ</span>
          </button>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// 2. ADD / EDIT INFORMATION MODAL (100% Kannada, Publishes Immediately!)
// ============================================================================
interface CommunityComposerModalProps {
  open: boolean;
  editingPost?: PublicCommunityPost | null;
  defaultCategory?: CommunityCategoryId;
  defaultLocation?: string;
  authorName: string;
  onClose: () => void;
  onSaved: (post: PublicCommunityPost, isEdit: boolean) => void;
  onOpenPost?: (post: PublicCommunityPost) => void;
}

export const CommunityComposerModal: React.FC<CommunityComposerModalProps> = ({
  open,
  editingPost,
  defaultCategory,
  defaultLocation,
  authorName,
  onClose,
  onSaved,
  onOpenPost,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CommunityCategoryId>(defaultCategory || 'my-shop');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(defaultLocation || 'ಕೊಪ್ಪ');
  const [customLocation, setCustomLocation] = useState('');
  const [price, setPrice] = useState('');
  const [optionalPublicContact, setOptionalPublicContact] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [publishedPost, setPublishedPost] = useState<PublicCommunityPost | null>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setPublishedPost(null);
    if (editingPost) {
      setTitle(editingPost.title);
      setCategory(editingPost.category);
      setDescription(editingPost.description);
      const isKnownLoc = COMMUNITY_LOCATIONS_KN.some((l) => l.value === editingPost.location);
      if (isKnownLoc) {
        setLocation(editingPost.location);
        setCustomLocation('');
      } else {
        setLocation('ಇತರೆ ಮಲೆನಾಡು ಗ್ರಾಮ');
        setCustomLocation(editingPost.location);
      }
      setPrice(editingPost.price || '');
      setOptionalPublicContact(editingPost.optionalPublicContact || '');
      setPhotos(editingPost.photos || []);
    } else {
      setTitle('');
      setCategory(defaultCategory || 'my-shop');
      setDescription('');
      const knownDefault = COMMUNITY_LOCATIONS_KN.find(
        (l) => l.value === defaultLocation || l.labelEn.toLowerCase() === String(defaultLocation || '').toLowerCase()
      );
      setLocation(knownDefault ? knownDefault.value : 'ಕೊಪ್ಪ');
      setCustomLocation('');
      setPrice('');
      setOptionalPublicContact('');
      setPhotos([]);
    }
  }, [open, editingPost, defaultCategory, defaultLocation]);

  if (!open) return null;

  const activeCategoryMeta = COMMUNITY_CATEGORY_MAP[category];

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const remaining = MAX_COMMUNITY_PHOTOS - photos.length;
    if (remaining <= 0) {
      setError(`ಗರಿಷ್ಠ ${MAX_COMMUNITY_PHOTOS} ಫೋಟೋಗಳನ್ನು ಮಾತ್ರ ಸೇರಿಸಬಹುದು.`);
      return;
    }

    setError('');
    setUploadingPhoto(true);
    try {
      const next: string[] = [];
      for (const file of files.slice(0, remaining)) {
        const compressed = await compressCommunityImageFile(file);
        next.push(compressed);
      }
      setPhotos((prev) => [...prev, ...next].slice(0, MAX_COMMUNITY_PHOTOS));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ಫೋಟೋ ಸೇರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const resolvedLocation =
      location === 'ಇತರೆ ಮಲೆನಾಡು ಗ್ರಾಮ' ? customLocation.trim() || 'ಮಲೆನಾಡು' : location;

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        category,
        description: description.trim(),
        location: resolvedLocation,
        price: activeCategoryMeta?.showPriceField ? price.trim() || undefined : undefined,
        optionalPublicContact: optionalPublicContact.trim() || undefined,
        photos,
      };

      if (editingPost) {
        const updated = await updateCommunityPost(editingPost.id, payload);
        onSaved(updated, true);
        onClose();
      } else {
        const created = await createCommunityPost(payload);
        onSaved(created, false);
        setPublishedPost(created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ಮಾಹಿತಿ ಪ್ರಕಟಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="community-composer-title"
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#101D30] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0D1828] shrink-0">
          <div>
            <h2
              id="community-composer-title"
              className="font-kannada text-base sm:text-lg font-extrabold text-[#10243D] dark:text-white"
            >
              {publishedPost
                ? 'ನಿಮ್ಮ ಮಾಹಿತಿ ತಕ್ಷಣ ಪ್ರಕಟವಾಗಿದೆ!'
                : editingPost
                  ? 'ನನ್ನ ಪ್ರಕಟಣೆಯನ್ನು ಸಂಪಾದಿಸಿ'
                  : 'ನಿಮ್ಮ ಮಾಹಿತಿ ಸೇರಿಸಿ'}
            </h2>
            <p className="font-kannada text-xs text-[#5A677A] dark:text-slate-400">
              ಪ್ರಕಟಣೆದಾರರು: <strong className="text-[#10243D] dark:text-slate-200">{authorName}</strong> · ಉಚಿತ ಮತ್ತು ತಕ್ಷಣ ಪ್ರಕಟಣೆ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ಮುಚ್ಚಿ"
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {publishedPost ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#176B4A] dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <h3 className="font-kannada text-sm font-extrabold text-[#10243D] dark:text-white">
                    {publishedPost.title}
                  </h3>
                  <p className="font-kannada text-xs text-[#14533A] dark:text-emerald-200">
                    ನಿಮ್ಮ ಮಾಹಿತಿ ಈಗ COFFEENADU COMMUNITY ನಲ್ಲಿ ಲೈವ್ ಆಗಿದೆ. ಕೆಳಗಿನ ಲಿಂಕ್ ಮೂಲಕ WhatsApp ಅಥವಾ ಇತರರಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ:
                  </p>
                  <p className="text-xs font-mono text-[#176B4A] dark:text-[#D9A441] break-all pt-1">
                    {buildCommunityPostPublicUrl(publishedPost.slug)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-kannada text-xs font-bold text-[#475569] dark:text-slate-300">
                  ಈಗಲೇ ಹಂಚಿಕೊಳ್ಳಿ:
                </p>
                <CommunityShareBar post={publishedPost} />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                {onOpenPost && (
                  <button
                    type="button"
                    onClick={() => {
                      const p = publishedPost;
                      onClose();
                      onOpenPost(p);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-kannada font-bold text-[#10243D] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer min-h-[40px]"
                  >
                    ಪ್ರಕಟಣೆ ನೋಡಿ
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-[#10243D] text-white text-xs font-kannada font-bold hover:bg-[#19385F] cursor-pointer min-h-[40px]"
                >
                  ಮುಗಿಯಿತು
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs font-kannada font-semibold text-red-700 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="comm-post-title"
                  className="block font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1"
                >
                  ಮಾಹಿತಿಯ ಶೀರ್ಷಿಕೆ *
                </label>
                <input
                  id="comm-post-title"
                  type="text"
                  required
                  minLength={3}
                  maxLength={150}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ಉದಾ: ಕೊಪ್ಪದಲ್ಲಿ ತಾಜಾ ಕಾಫಿ ಪುಡಿ ಮಾರಾಟ / ಮನೆ ಬಾಡಿಗೆಗೆ ಇದೆ"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#10243D] dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 font-kannada focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="comm-post-category"
                    className="block font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1"
                  >
                    ವಿಭಾಗ ಆಯ್ಕೆಮಾಡಿ *
                  </label>
                  <select
                    id="comm-post-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CommunityCategoryId)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#10243D] dark:text-white font-kannada focus:outline-none focus:ring-2 focus:ring-[#176B4A] [&>option]:bg-white [&>option]:text-[#10243D] dark:[&>option]:bg-slate-900 dark:[&>option]:text-white"
                  >
                    {COMMUNITY_CATEGORIES.filter((cat) => !cat.contestOnly).map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.labelKn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="comm-post-location"
                    className="block font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1"
                  >
                    ಊರು / ಸ್ಥಳ *
                  </label>
                  <select
                    id="comm-post-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#10243D] dark:text-white font-kannada focus:outline-none focus:ring-2 focus:ring-[#176B4A] [&>option]:bg-white [&>option]:text-[#10243D] dark:[&>option]:bg-slate-900 dark:[&>option]:text-white"
                  >
                    {COMMUNITY_LOCATIONS_KN.map((loc) => (
                      <option key={loc.value} value={loc.value}>
                        {loc.labelKn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {location === 'ಇತರೆ ಮಲೆನಾಡು ಗ್ರಾಮ' && (
                <div>
                  <label
                    htmlFor="comm-post-custom-loc"
                    className="block font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1"
                  >
                    ನಿಮ್ಮ ಗ್ರಾಮ / ಸ್ಥಳದ ಹೆಸರು ಬರೆಯಿರಿ *
                  </label>
                  <input
                    id="comm-post-custom-loc"
                    type="text"
                    required
                    maxLength={80}
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    placeholder="ಉದಾ: ಕಮ್ಮರಡಿ, ಶಾಂತಿಗ್ರಾಮ, ಹೇರೂರು..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#10243D] dark:text-white font-kannada focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="comm-post-desc"
                  className="block font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1"
                >
                  ವಿವರಣೆ *
                </label>
                <textarea
                  id="comm-post-desc"
                  required
                  minLength={5}
                  maxLength={3000}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="ಸಂಪೂರ್ಣ ಮಾಹಿತಿ, ಸಮಯ, ವಿಳಾಸ ಅಥವಾ ಅಗತ್ಯ ವಿವರಗಳನ್ನು ಇಲ್ಲಿ ಬರೆಯಿರಿ..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#10243D] dark:text-white font-kannada focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
                />
              </div>

              {activeCategoryMeta?.showPriceField && (
                <div>
                  <label
                    htmlFor="comm-post-price"
                    className="block font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1"
                  >
                    ಬೆಲೆ / ದರ (ಐಚ್ಛಿಕ)
                  </label>
                  <input
                    id="comm-post-price"
                    type="text"
                    maxLength={80}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={activeCategoryMeta.pricePlaceholderKn || 'ಉದಾ: ₹2,500'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#10243D] dark:text-white font-kannada focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
                  />
                </div>
              )}

              {/* Optional Photos (max 3) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200">
                    ಫೋಟೋಗಳು (ಐಚ್ಛಿಕ — ಗರಿಷ್ಠ {MAX_COMMUNITY_PHOTOS})
                  </label>
                  <span className="text-[11px] text-[#64748B] dark:text-slate-400">
                    {photos.length}/{MAX_COMMUNITY_PHOTOS}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {photos.map((src, idx) => (
                    <div
                      key={`${idx}-${src.slice(0, 24)}`}
                      className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900"
                    >
                      <img src={src} alt={`ಫೋಟೋ ${idx + 1}`} className="w-full h-full object-contain" />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label={`ಫೋಟೋ ${idx + 1} ತೆಗೆದುಹಾಕಿ`}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {photos.length < MAX_COMMUNITY_PHOTOS && (
                    <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#176B4A] flex flex-col items-center justify-center gap-1 text-[#5A677A] dark:text-slate-400 hover:text-[#176B4A] cursor-pointer transition-colors">
                      {uploadingPhoto ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <ImagePlus className="w-5 h-5" />
                          <span className="font-kannada text-[10px] font-semibold">ಸೇರಿಸಿ</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="sr-only"
                        disabled={uploadingPhoto}
                        onChange={(e) => void handlePhotoChange(e)}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Optional Public Contact (Explicit Opt-In ONLY) */}
              <div>
                <label
                  htmlFor="comm-post-contact"
                  className="block font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1"
                >
                  ಸಾರ್ವಜನಿಕ ಸಂಪರ್ಕ ಮಾಹಿತಿ (ಐಚ್ಛಿಕ — ನೀವು ಬಯಸಿದರೆ ಮಾತ್ರ)
                </label>
                <input
                  id="comm-post-contact"
                  type="text"
                  maxLength={80}
                  value={optionalPublicContact}
                  onChange={(e) => setOptionalPublicContact(e.target.value)}
                  placeholder="ಉದಾ: ಅಂಗಡಿ ಫೋನ್ ಅಥವಾ ವಿಳಾಸ (ಖಾಲಿ ಬಿಟ್ಟರೆ ಯಾವ ನಂಬರ್ ಕಾಣಿಸುವುದಿಲ್ಲ)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#10243D] dark:text-white font-kannada focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
                />
                <p className="font-kannada text-[11px] text-[#64748B] dark:text-slate-400 mt-1">
                  ಗಮನಿಸಿ: ನಿಮ್ಮ ನೋಂದಾಯಿತ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಯಾವಾಗಲೂ ಗೌಪ್ಯವಾಗಿರುತ್ತದೆ.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-kannada font-bold text-[#475569] dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer min-h-[44px]"
                >
                  ರದ್ದುಮಾಡಿ
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingPhoto}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#13593D] disabled:opacity-60 text-white text-sm font-kannada font-bold transition-colors cursor-pointer min-h-[44px]"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingPost ? 'ಬದಲಾವಣೆ ಉಳಿಸಿ' : 'ತಕ್ಷಣ ಪ್ರಕಟಿಸಿ'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. REPORT INAPPROPRIATE POST MODAL
// ============================================================================
const REPORT_REASONS_KN = [
  'ಸುಳ್ಳು ಅಥವಾ ತಪ್ಪು ಮಾಹಿತಿ',
  'ಅಸಭ್ಯ ಅಥವಾ ಅನುಚಿತ ವಿಷಯ',
  'ವಂಚನೆ / ಸ್ಪ್ಯಾಮ್ ಪ್ರಕಟಣೆ',
  'ಹಳೆಯ ಅಥವಾ ಮುಗಿದ ಮಾಹಿತಿ',
  'ಇತರೆ ಕಾರಣ',
];

interface CommunityReportModalProps {
  post: PublicCommunityPost | null;
  onClose: () => void;
}

export const CommunityReportModal: React.FC<CommunityReportModalProps> = ({ post, onClose }) => {
  const [reason, setReason] = useState(REPORT_REASONS_KN[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (post) {
      setReason(REPORT_REASONS_KN[0]);
      setDetails('');
      setDone(false);
      setError('');
    }
  }, [post]);

  if (!post) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await reportCommunityPost(post.id, reason, details.trim() || undefined);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ವರದಿ ಸಲ್ಲಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="community-report-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#101D30] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-red-600" />
            <h2
              id="community-report-title"
              className="font-kannada text-sm font-extrabold text-[#10243D] dark:text-white"
            >
              ಪ್ರಕಟಣೆ ವರದಿ ಮಾಡಿ
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ಮುಚ್ಚಿ"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {done ? (
            <div className="space-y-4 text-center py-2">
              <CheckCircle2 className="w-10 h-10 text-[#176B4A] mx-auto" />
              <p className="font-kannada text-sm font-bold text-[#10243D] dark:text-white">
                ನಿಮ್ಮ ವರದಿಯನ್ನು ಸ್ವೀಕರಿಸಲಾಗಿದೆ.
              </p>
              <p className="font-kannada text-xs text-[#5A677A] dark:text-slate-400">
                ಕಾಫಿನಾಡು ಆಡ್ಮಿನ್ ತಂಡವು ಶೀಘ್ರದಲ್ಲೇ ಇದನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-[#10243D] text-white text-xs font-kannada font-bold cursor-pointer"
              >
                ಮುಚ್ಚಿ
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {error && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs font-kannada text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}
              <p className="font-kannada text-xs text-[#5A677A] dark:text-slate-300 line-clamp-2">
                ಪ್ರಕಟಣೆ: <strong className="text-[#10243D] dark:text-white">{post.title}</strong>
              </p>
              <div className="space-y-2">
                {REPORT_REASONS_KN.map((r) => (
                  <label
                    key={r}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    <input
                      type="radio"
                      name="community-report-reason"
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="accent-[#176B4A]"
                    />
                    <span className="font-kannada text-xs font-semibold text-[#10243D] dark:text-slate-200">
                      {r}
                    </span>
                  </label>
                ))}
              </div>
              <textarea
                rows={2}
                maxLength={500}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="ಹೆಚ್ಚುವರಿ ವಿವರ (ಐಚ್ಛಿಕ)"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-kannada text-[#10243D] dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-kannada font-bold text-[#475569] dark:text-slate-300 cursor-pointer"
                >
                  ರದ್ದುಮಾಡಿ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-kannada font-bold cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'ಸಲ್ಲಿಸಲಾಗುತ್ತಿದೆ...' : 'ವರದಿ ಸಲ್ಲಿಸಿ'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
