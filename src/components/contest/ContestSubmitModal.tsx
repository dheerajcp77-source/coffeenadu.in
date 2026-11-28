import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  Lock,
  Share2,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { COMMUNITY_LOCATIONS_KN } from '../../constants/communityCategories';
import {
  compressCommunityImageFile,
  fetchCommunitySession,
} from '../../services/communityClient';
import {
  submitContestNewsEntry,
  type SubmitContestNewsResult,
} from '../../services/contestClient';
import type { CommunitySelfProfile } from '../../types/community';
import { buildContestArticleShareText } from '../../utils/contestHelpers';

interface ContestSubmitModalProps {
  isOpen: boolean;
  monthLabel: string;
  isMonthOpen: boolean;
  onClose: () => void;
  onSubmitted: (result: SubmitContestNewsResult) => void;
  onOpenArticle: (slug: string) => void;
}

const MAX_PHOTOS = 3;

export const ContestSubmitModal: React.FC<ContestSubmitModalProps> = ({
  isOpen,
  monthLabel,
  isMonthOpen,
  onClose,
  onSubmitted,
  onOpenArticle,
}) => {
  const [profile, setProfile] = useState<CommunitySelfProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [switchingContributor, setSwitchingContributor] = useState(false);

  const [contributorName, setContributorName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('ಕೊಪ್ಪ');
  const [customLocation, setCustomLocation] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [confirmOriginalNews, setConfirmOriginalNews] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedResult, setSubmittedResult] = useState<SubmitContestNewsResult | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSubmittedResult(null);
    setCopiedLink(false);
    setSwitchingContributor(false);
    setLoadingProfile(true);
    fetchCommunitySession()
      .then((res) => {
        if (res.authenticated && res.profile) {
          setProfile(res.profile);
          setContributorName(res.profile.fullName);
        } else {
          setProfile(null);
        }
      })
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError('');
    setUploadingPhoto(true);
    const remaining = MAX_PHOTOS - photos.length;
    const toProcess = files.slice(0, remaining);
    try {
      const encoded: string[] = [];
      for (const f of toProcess) {
        encoded.push(await compressCommunityImageFile(f));
      }
      setPhotos((prev) => [...prev, ...encoded].slice(0, MAX_PHOTOS));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ವಿಫಲವಾಗಿದೆ.');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isMonthOpen) {
      setError('ಈ ತಿಂಗಳ ಸ್ಪರ್ಧೆಯ ಅವಧಿ ಮುಕ್ತಾಯಗೊಂಡಿದೆ.');
      return;
    }

    const finalLocation =
      location === 'ಇತರೆ ಮಲೆನಾಡು ಗ್ರಾಮ' ? customLocation.trim() : location;

    if (contributorName.trim().length < 2) {
      setError('ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.');
      return;
    }
    const needsMobileInput = !profile || switchingContributor;
    if (needsMobileInput && !/^[6-9]\d{9}$/.test(mobileNumber.replace(/\D/g, '').slice(-10))) {
      setError('ದಯವಿಟ್ಟು ಸರಿಯಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ (ಬಹುಮಾನ ಸಂಪರ್ಕಕ್ಕಾಗಿ ಅಗತ್ಯ).');
      return;
    }
    if (title.trim().length < 5) {
      setError('ದಯವಿಟ್ಟು ಸ್ಪಷ್ಟವಾದ ಸುದ್ದಿ ಶೀರ್ಷಿಕೆಯನ್ನು ನಮೂದಿಸಿ (ಕನಿಷ್ಠ 5 ಅಕ್ಷರಗಳು).');
      return;
    }
    if (finalLocation.length < 2) {
      setError('ದಯವಿಟ್ಟು ನಿಮ್ಮ ಊರು / ಗ್ರಾಮದ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.');
      return;
    }
    if (description.trim().length < 20) {
      setError('ದಯವಿಟ್ಟು ಸುದ್ದಿಯ ಸಂಪೂರ್ಣ ವಿವರಣೆಯನ್ನು ನಮೂದಿಸಿ (ಕನಿಷ್ಠ 20 ಅಕ್ಷರಗಳು).');
      return;
    }
    if (!confirmOriginalNews) {
      setError(
        'ದಯವಿಟ್ಟು ಇದು ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿಯಾಗಿದ್ದು ಜಾಹೀರಾತು ಅಥವಾ ಮಾರಾಟ ಪ್ರಕಟಣೆಯಲ್ಲ ಎಂದು ದೃಢೀಕರಿಸಿ.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitContestNewsEntry({
        contributorName: contributorName.trim(),
        mobileNumber: needsMobileInput ? mobileNumber.trim() : undefined,
        switchContributor: switchingContributor || undefined,
        title: title.trim(),
        description: description.trim(),
        location: finalLocation,
        photos,
        confirmOriginalNews: true,
      });
      setProfile(result.profile);
      setSwitchingContributor(false);
      setSubmittedResult(result);
      onSubmitted(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'ಸುದ್ದಿ ಪ್ರಕಟಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setTitle('');
    setDescription('');
    setPhotos([]);
    setConfirmOriginalNews(false);
    setSubmittedResult(null);
    setSwitchingContributor(false);
    setError('');
    onClose();
  };

  const shareOrigin =
    typeof window !== 'undefined'
      ? (window as unknown as { __COFFEENADU_SHARE_ORIGIN__?: string })
          .__COFFEENADU_SHARE_ORIGIN__ || window.location.origin
      : 'https://coffeenadu.in';

  const handleCopyPermanentUrl = async () => {
    if (!submittedResult) return;
    const url = `${shareOrigin}${submittedResult.permanentPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore clipboard fallback
    }
  };

  const handleWhatsAppShare = () => {
    if (!submittedResult) return;
    const msg = buildContestArticleShareText({
      title: submittedResult.entry.title,
      contributorName: submittedResult.entry.contributorName,
      slug: submittedResult.entry.slug,
      location: submittedResult.entry.location,
    });
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.location.href = waUrl;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-xs sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contest-submit-title"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-emerald-900/20 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-emerald-900/15 bg-[#0F3928] px-5 py-4 text-white sm:px-6">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Monthly News Contest · {monthLabel}</span>
            </div>
            <h3
              id="contest-submit-title"
              className="mt-1 font-serif text-lg font-bold leading-snug sm:text-xl"
            >
              ತಿಂಗಳ ಸುದ್ದಿ ಸ್ಪರ್ಧೆಗೆ ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ (ಉಚಿತ)
            </h3>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 text-white/90 transition hover:bg-white/10"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          {submittedResult ? (
            <div className="space-y-5 py-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
                  <div>
                    <h4 className="text-base font-bold text-emerald-950">
                      ನಿಮ್ಮ ಸುದ್ದಿ ಯಶಸ್ವಿಯಾಗಿ ಪ್ರಕಟವಾಗಿದೆ ಮತ್ತು ಸ್ಪರ್ಧೆಗೆ ಸೇರಿಸಲಾಗಿದೆ!
                    </h4>
                    <p className="mt-1 text-sm text-emerald-900/85">
                      ಈಗಲೇ ನಿಮ್ಮ ಸುದ್ದಿಯ ಲಿಂಕ್ ಅನ್ನು WhatsApp, ಕುಟುಂಬ ಮತ್ತು ಸ್ನೇಹಿತರೊಂದಿಗೆ
                      ಹಂಚಿಕೊಳ್ಳಿ — ಹೆಚ್ಚು ಜನರು ಓದಿದಷ್ಟೂ ₹500 ಬಹುಮಾನ ಗೆಲ್ಲುವ ಅವಕಾಶ ಹೆಚ್ಚುತ್ತದೆ.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Published Contest Entry
                </p>
                <p className="mt-1 font-serif text-lg font-bold text-slate-900">
                  {submittedResult.entry.title}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {submittedResult.entry.contributorName} · {submittedResult.entry.location} ·{' '}
                  ತಿಂಗಳ ಸುದ್ದಿ ಸ್ಪರ್ಧೆ
                </p>
                <div className="mt-3 rounded border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 break-all">
                  {`${shareOrigin}${submittedResult.permanentPath}`}
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#168A45] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#127239]"
                >
                  <Share2 className="h-4 w-4" />
                  <span>WhatsApp ನಲ್ಲಿ ಹಂಚಿಕೊಳ್ಳಿ</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyPermanentUrl}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  <Copy className="h-4 w-4" />
                  <span>{copiedLink ? 'ಲಿಂಕ್ ಕಾಪಿ ಆಗಿದೆ!' : 'ಲಿಂಕ್ ಕಾಪಿ ಮಾಡಿ'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    const slug = submittedResult.entry.slug;
                    resetAndClose();
                    onOpenArticle(slug);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-emerald-800 hover:text-emerald-950"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>ಸಂಪೂರ್ಣ ಸುದ್ದಿ ಪುಟ ತೆರೆಯಿರಿ</span>
                </button>
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  ಲೀಡರ್‌ಬೋರ್ಡ್ ನೋಡಿ
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Strict Category Separation Notice */}
              <div className="rounded-lg border border-emerald-800/15 bg-emerald-50/70 px-4 py-3 text-xs leading-relaxed text-emerald-950">
                <p className="font-bold">
                  ವಿಭಾಗ: ತಿಂಗಳ ಸುದ್ದಿ ಸ್ಪರ್ಧೆ (Monthly News Contest) — 100% ಉಚಿತ
                </p>
                <p className="mt-0.5 text-emerald-900/80">
                  ನಿಮ್ಮೂರಿನ ಮೂಲ ಸುದ್ದಿ, ಜನೋಪಯೋಗಿ ಮಾಹಿತಿ ಮತ್ತು ಸ್ಥಳೀಯ ಘಟನೆಗಳನ್ನು ಮಾತ್ರ ಪ್ರಕಟಿಸಿ.
                  ಮಾರಾಟ, ಅಂಗಡಿ ಜಾಹೀರಾತು ಅಥವಾ ಕಳೆದುಹೋದ ವಸ್ತು ಪ್ರಕಟಣೆಗಳು ಸ್ಪರ್ಧೆಗೆ ಅರ್ಹವಲ್ಲ.
                </p>
              </div>

              {/* Contributor Identity */}
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-800">
                    ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು (Contributor Name) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={contributorName}
                    onChange={(e) => setContributorName(e.target.value)}
                    placeholder="ಉದಾ: ರಮೇಶ್ ಕೊಪ್ಪ"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-800">
                    ಮೊಬೈಲ್ ಸಂಖ್ಯೆ (Private — Admin Only) *
                  </label>
                  {loadingProfile ? (
                    <div className="flex h-[42px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500">
                      ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...
                    </div>
                  ) : profile && !switchingContributor ? (
                    <div className="flex h-[42px] items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-900">
                      <span className="truncate">ನೋಂದಾಯಿತ: {profile.maskedMobile}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSwitchingContributor(true);
                          setContributorName('');
                          setMobileNumber('');
                          setError('');
                        }}
                        className="shrink-0 rounded border border-emerald-700/25 bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 cursor-pointer"
                      >
                        ಬೇರೆ ಲೇಖಕರು (Switch)
                      </button>
                    </div>
                  ) : (
                    <input
                      type="tel"
                      required
                      inputMode="numeric"
                      maxLength={14}
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ (OTP ಅಗತ್ಯವಿಲ್ಲ)"
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                    />
                  )}
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                    <Lock className="h-3 w-3 shrink-0 text-emerald-700" />
                    <span>
                      ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಸಾರ್ವಜನಿಕವಾಗಿ ಕಾಣಿಸುವುದಿಲ್ಲ. ವಿಜೇತರನ್ನು ಸಂಪರ್ಕಿಸಲು ಮಾತ್ರ
                      ಆಡ್ಮಿನ್ ಬಳಸುತ್ತಾರೆ.
                    </span>
                  </p>
                </div>
              </div>

              {/* Headline */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-800">
                  ಸುದ್ದಿಯ ಶೀರ್ಷಿಕೆ (News Headline) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ಉದಾ: ಕೊಪ್ಪ ತಾಲ್ಲೂಕಿನ ಜಯಪುರದಲ್ಲಿ ಗ್ರಾಮಸ್ಥರ ಶ್ರಮದಾನದಿಂದ ರಸ್ತೆ ದುರಸ್ತಿ"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                />
              </div>

              {/* Location */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-800">
                    ಊರು / ಪ್ರದೇಶ (Malnad Area) *
                  </label>
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                  >
                    {COMMUNITY_LOCATIONS_KN.map((loc) => (
                      <option key={loc.value} value={loc.value}>
                        {loc.labelKn} ({loc.labelEn})
                      </option>
                    ))}
                  </select>
                </div>

                {location === 'ಇತರೆ ಮಲೆನಾಡು ಗ್ರಾಮ' && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-800">
                      ಗ್ರಾಮದ ಹೆಸರು *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                      placeholder="ನಿಮ್ಮ ಗ್ರಾಮ / ಹೋಬಳಿ ಹೆಸರು"
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Full News Content */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-800">
                  ಸಂಪೂರ್ಣ ಸುದ್ದಿ ವಿವರ (Original Local News Report) *
                </label>
                <textarea
                  required
                  rows={5}
                  maxLength={4000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="ಘಟನೆ ಎಲ್ಲಿ, ಯಾವಾಗ ಮತ್ತು ಹೇಗೆ ನಡೆಯಿತು ಎಂಬ ನಿಖರ ಹಾಗೂ ಉಪಯುಕ್ತ ಮಾಹಿತಿಯನ್ನು ಕನ್ನಡದಲ್ಲಿ ಬರೆಯಿರಿ..."
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                />
                <p className="mt-1 text-right text-[11px] tabular-nums text-slate-500">
                  {description.length} / 4000
                </p>
              </div>

              {/* Optional Photos */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    ಸುದ್ದಿ ಫೋಟೋಗಳು (ಐಚ್ಛಿಕ — ಗರಿಷ್ಠ {MAX_PHOTOS})
                  </label>
                  <button
                    type="button"
                    disabled={photos.length >= MAX_PHOTOS || uploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-800/25 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-40 cursor-pointer"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5" />
                    )}
                    <span>{uploadingPhoto ? 'ಪ್ರಕ್ರಿಯೆಯಲ್ಲಿದೆ...' : 'ಫೋಟೋ ಸೇರಿಸಿ'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </div>
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative h-24 overflow-hidden rounded-lg border border-slate-200 bg-[#F4F1EA] flex items-center justify-center"
                      >
                        <img
                          src={src}
                          alt={`Upload ${idx + 1}`}
                          className="h-full w-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPhotos((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="absolute right-1.5 top-1.5 rounded bg-slate-900/80 p-1 text-white hover:bg-red-600 cursor-pointer"
                          aria-label="Remove photo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mandatory Originality & Non-Ad Confirmation */}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmOriginalNews}
                  onChange={(e) => setConfirmOriginalNews(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                />
                <span>
                  ಇದು ನನ್ನ ಮೂಲ ಸ್ಥಳೀಯ ಸುದ್ದಿ / ಉಪಯುಕ್ತ ಸಮುದಾಯ ಮಾಹಿತಿಯಾಗಿದೆ. ಇದು ಯಾವುದೇ
                  ಜಾಹೀರಾತು, ಅಂಗಡಿ ಪ್ರಚಾರ, ಮಾರಾಟ, ಕಳೆದುಹೋದ ವಸ್ತು ಅಥವಾ ನಕಲಿ ಸುದ್ದಿಯಲ್ಲ ಎಂದು ನಾನು
                  ದೃಢೀಕರಿಸುತ್ತೇನೆ.
                </span>
              </label>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ರದ್ದುಮಾಡಿ
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingPhoto || !isMonthOpen}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0F3928] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#144B35] disabled:opacity-50 cursor-pointer"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>ಸುದ್ದಿ ಪ್ರಕಟಿಸಿ ಮತ್ತು ಸ್ಪರ್ಧೆಗೆ ಸೇರಿ</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
