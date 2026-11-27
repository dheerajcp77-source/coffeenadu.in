import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { PLATFORM_MODULE_MAP } from '../../constants/platformCatalog';
import {
  fetchPlatformListings,
  recordListingEnquiry,
  submitListingReport,
  submitPublicListing,
} from '../../services/platformClient';
import type {
  DirectoryModuleId,
  LocalityOption,
  PlatformLanguage,
  PlatformListing,
} from '../../types/platform';
import {
  buildTelUrl,
  buildWhatsappContactUrl,
  matchesLocality,
  pickLangText,
  sanitizePlatformUrl,
} from '../../utils/platformHelpers';
import { PlatformIcon } from './PlatformIcon';

interface PlatformDirectoryPageProps {
  moduleId: DirectoryModuleId;
  lang: PlatformLanguage;
  selectedLocation: string;
  localities: LocalityOption[];
  initialListingId?: string | null;
  savedListingIds: string[];
  currentUserUid?: string;
  currentUserName?: string;
  onToggleSave: (module: DirectoryModuleId, listingId: string) => void;
  onSelectLocation: (loc: string) => void;
  onBackHome: () => void;
  onListingsChanged?: () => void;
}

export const PlatformDirectoryPage: React.FC<PlatformDirectoryPageProps> = ({
  moduleId,
  lang,
  selectedLocation,
  localities,
  initialListingId,
  savedListingIds,
  currentUserUid,
  currentUserName,
  onToggleSave,
  onSelectLocation,
  onBackHome,
  onListingsChanged,
}) => {
  const mod = PLATFORM_MODULE_MAP[moduleId];
  const [listings, setListings] = useState<PlatformListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<PlatformListing | null>(null);

  // Public submission modal state
  const [submitOpen, setSubmitOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [formState, setFormState] = useState({
    title: '',
    titleEn: '',
    category: mod.categories[0]?.id || 'general',
    location: selectedLocation !== 'all' ? selectedLocation : 'Koppa',
    address: '',
    phone: '',
    whatsapp: '',
    website: '',
    summary: '',
    description: '',
    price: '',
    priceLabel: '',
    negotiable: false,
    condition: 'used',
    employer: '',
    jobType: 'private',
    qualification: '',
    salary: '',
    applicationDeadline: '',
    openingHours: '',
    weeklyHoliday: '',
    discountText: '',
    validUntil: '',
    propertyType: 'rent',
    areaSize: '',
    lostOrFound: 'lost',
    submittedByName: currentUserName || '',
    submittedByContact: '',
    website_hp: '',
  });

  // Report modal state
  const [reportTarget, setReportTarget] = useState<PlatformListing | null>(null);
  const [reportReason, setReportReason] = useState('Incorrect phone number / details');
  const [reportDetails, setReportDetails] = useState('');
  const [reportMessage, setReportMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setActiveCategory('all');
    setFormState((prev) => ({
      ...prev,
      category: mod.categories[0]?.id || 'general',
      location: selectedLocation !== 'all' ? selectedLocation : 'Koppa',
      submittedByName: currentUserName || prev.submittedByName,
    }));

    fetchPlatformListings({ module: moduleId, limit: 150 })
      .then((res) => {
        if (!active) return;
        setListings(res.listings || []);
        if (initialListingId) {
          const found = (res.listings || []).find((l) => l.id === initialListingId);
          if (found) setSelectedItem(found);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load listings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [moduleId, initialListingId, mod.categories, selectedLocation, currentUserName]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter((item) => {
      if (activeCategory !== 'all' && item.category.toLowerCase() !== activeCategory.toLowerCase()) {
        return false;
      }
      if (!matchesLocality(item.location, selectedLocation)) return false;
      if (q) {
        const hay =
          `${item.title} ${item.titleEn || ''} ${item.summary} ${item.description} ${item.location} ${item.employer || ''} ${item.address || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [listings, activeCategory, selectedLocation, query]);

  const handlePublicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');
    setIsSubmitting(true);
    try {
      const resp = await submitPublicListing({
        ...formState,
        module: moduleId,
        price: formState.price ? Number(formState.price) : undefined,
        submittedByUid: currentUserUid || undefined,
      });
      setSubmitSuccess(
        pickLangText(
          'ನಿಮ್ಮ ಮಾಹಿತಿ ಯಶಸ್ವಿಯಾಗಿ ಸಲ್ಲಿಕೆಯಾಗಿದೆ! ಆಡ್ಮಿನ್ ಪರಿಶೀಲನೆಯ ನಂತರ ವೆಬ್‌ಸೈಟ್‌ನಲ್ಲಿ ಪ್ರಕಟವಾಗುತ್ತದೆ.',
          resp.message || 'Submitted! Your listing will appear live once verified by Admin.',
          lang
        )
      );
      setFormState((prev) => ({
        ...prev,
        title: '',
        titleEn: '',
        summary: '',
        description: '',
        price: '',
        priceLabel: '',
        address: '',
        phone: '',
        whatsapp: '',
        website: '',
      }));
      onListingsChanged?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget) return;
    try {
      await submitListingReport({
        listingId: reportTarget.id,
        reason: reportReason,
        details: reportDetails,
        reporterName: currentUserName || undefined,
      });
      setReportMessage(
        pickLangText(
          'ನಿಮ್ಮ ವರದಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ. ಆಡ್ಮಿನ್ ಪರಿಶೀಲಿಸುತ್ತಾರೆ.',
          'Thank you. Your report has been queued for admin review.',
          lang
        )
      );
      setReportDetails('');
      window.setTimeout(() => {
        setReportTarget(null);
        setReportMessage('');
      }, 1600);
    } catch {
      setReportMessage('Could not submit report right now.');
    }
  };

  const handleShareWhatsapp = (item: PlatformListing) => {
    const shareUrl = `${window.location.origin}${mod.route}?item=${encodeURIComponent(item.id)}`;
    const text = `*${item.title}*\n📍 ${item.location} · Coffeenadu Malnad\n🔗 ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Module Masthead */}
      <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <button
              type="button"
              onClick={onBackHome}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{pickLangText('ಮುಖಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ', 'Back to Coffeenadu Home', lang)}</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#176B4A]/10 dark:bg-[#176B4A]/25 text-[#176B4A] dark:text-emerald-300 flex items-center justify-center shrink-0">
                <PlatformIcon icon={mod.icon} className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-kannada text-xl sm:text-2xl font-extrabold text-[#10243D] dark:text-white tracking-tight">
                  {pickLangText(mod.titleKn, mod.titleEn, lang)}
                </h1>
                <p className="text-xs sm:text-sm text-[#5A677A] dark:text-slate-300 font-kannada mt-0.5">
                  {pickLangText(mod.shortDescKn, mod.shortDescEn, lang)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-xs text-[#5A677A] dark:text-slate-300 font-semibold px-3 py-2 rounded-lg bg-[#F3F6F8] dark:bg-slate-800/80">
              {filtered.length}{' '}
              {pickLangText('ಲಭ್ಯವಿರುವ ದಾಖಲೆಗಳು', filtered.length === 1 ? 'listing' : 'listings', lang)}
            </div>
            {mod.allowPublicSubmission && (
              <button
                type="button"
                onClick={() => {
                  setSubmitSuccess('');
                  setSubmitError('');
                  setSubmitOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#12553A] text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span className="font-kannada">
                  {pickLangText('ಹೊಸ ಮಾಹಿತಿ ಸೇರಿಸಿ', 'Submit Listing', lang)}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Marketplace transparent direct-contact notice */}
        {moduleId === 'marketplace' && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-[#5A677A] dark:text-slate-300 font-kannada">
            {pickLangText(
              'ಸೂಚನೆ: Coffeenadu ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಯಾವುದೇ ಆನ್‌ಲೈನ್ ಪಾವತಿ ಅಥವಾ ಮಧ್ಯವರ್ತಿಗಳಿಲ್ಲ. ಖರೀದಿದಾರರು ಮತ್ತು ಮಾರಾಟಗಾರರು ನೇರವಾಗಿ ಫೋನ್ ಅಥವಾ WhatsApp ಮೂಲಕ ವ್ಯವಹರಿಸಿ.',
              'Direct local marketplace: No online checkout or middlemen. Contact sellers directly via phone or WhatsApp and verify items in person.',
              lang
            )}
          </div>
        )}

        {/* Search & Location Filter Row */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-8 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={pickLangText(
                `${mod.titleKn} ನಲ್ಲಿ ಹುಡುಕಿ...`,
                `Search in ${mod.titleEn}...`,
                lang
              )}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-sm text-[#10243D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
            />
          </div>
          <div className="md:col-span-4">
            <select
              value={selectedLocation}
              onChange={(e) => onSelectLocation(e.target.value)}
              aria-label="Filter by Malnad location"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-sm font-medium text-[#10243D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
            >
              <option value="all">
                {pickLangText('ಎಲ್ಲಾ ಮಲೆನಾಡು ಊರುಗಳು', 'All Malnad Locations', lang)}
              </option>
              {localities.map((loc) => (
                <option key={loc.id} value={loc.nameEn}>
                  {pickLangText(`${loc.nameKn} (${loc.nameEn})`, `${loc.nameEn} (${loc.nameKn})`, lang)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Filter Bar */}
        {mod.categories.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-[#10243D] text-white dark:bg-[#D9A441] dark:text-[#10243D]'
                  : 'bg-[#F3F6F8] dark:bg-slate-800 text-[#475569] dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {pickLangText('ಎಲ್ಲಾ', 'All', lang)}
            </button>
            {mod.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer font-kannada ${
                  activeCategory === cat.id
                    ? 'bg-[#176B4A] text-white'
                    : 'bg-[#F3F6F8] dark:bg-slate-800 text-[#475569] dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {pickLangText(cat.labelKn, cat.labelEn, lang)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Listings Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-48 rounded-2xl bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-sm text-rose-800 dark:text-rose-200">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-10 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#F3F6F8] dark:bg-slate-800 text-[#176B4A] dark:text-[#D9A441] flex items-center justify-center">
            <PlatformIcon icon={mod.icon} className="w-6 h-6" />
          </div>
          <h2 className="font-kannada text-base sm:text-lg font-bold text-[#10243D] dark:text-white">
            {pickLangText(
              'ಪ್ರಸ್ತುತ ಈ ವಿಭಾಗದಲ್ಲಿ ಯಾವುದೇ ದಾಖಲೆಗಳಿಲ್ಲ',
              'No verified listings match your filter yet',
              lang
            )}
          </h2>
          <p className="text-xs sm:text-sm text-[#5A677A] dark:text-slate-400 max-w-md mx-auto font-kannada">
            {pickLangText(
              'ಮಲೆನಾಡಿನ ನಿಜವಾದ ಮಾಹಿತಿಯನ್ನು ಮಾತ್ರ ಇಲ್ಲಿ ಪ್ರಕಟಿಸಲಾಗುತ್ತದೆ. ನಿಮ್ಮ ವ್ಯಾಪಾರ, ಉದ್ಯೋಗ ಅಥವಾ ಪ್ರಕಟಣೆಯನ್ನು ಉಚಿತವಾಗಿ ಸಲ್ಲಿಸಿ.',
              'Coffeenadu publishes only real, verified Malnad records — never fake placeholder listings. Be the first to add your listing.',
              lang
            )}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {selectedLocation !== 'all' && (
              <button
                type="button"
                onClick={() => onSelectLocation('all')}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-[#10243D] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {pickLangText('ಎಲ್ಲಾ ಊರುಗಳಲ್ಲಿ ನೋಡಿ', 'Show All Locations', lang)}
              </button>
            )}
            {mod.allowPublicSubmission && (
              <button
                type="button"
                onClick={() => setSubmitOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#12553A] text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{pickLangText('ಮೊದಲ ಮಾಹಿತಿ ಸಲ್ಲಿಸಿ', 'Submit First Listing', lang)}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const isSaved = savedListingIds.includes(item.id);
            const telHref = buildTelUrl(item.phone);
            const waHref = buildWhatsappContactUrl(
              item.whatsapp || item.phone,
              `Namaste, I saw "${item.title}" on Coffeenadu.in`
            );
            const extHref = sanitizePlatformUrl(item.applyUrl || item.documentUrl || item.website);
            const priceDisplay =
              item.priceLabel ||
              (item.price !== null && item.price !== undefined && item.price > 0
                ? `₹${item.price.toLocaleString('en-IN')}`
                : '');

            return (
              <article
                key={item.id}
                className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-[#176B4A]/50 transition-colors"
              >
                <div>
                  {item.imageUrl && (
                    <div className="aspect-[16/9] w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="p-4 sm:p-5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[11px] font-semibold text-[#5A677A] dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[#176B4A] dark:text-emerald-400">
                          <MapPin className="w-3 h-3" />
                          {item.location}
                        </span>
                        {item.verified && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 text-[#10243D] dark:text-[#D9A441]">
                              <ShieldCheck className="w-3 h-3" />
                              {pickLangText('ಪರಿಶೀಲಿತ', 'Verified', lang)}
                            </span>
                          </>
                        )}
                        {item.emergency24x7 && (
                          <>
                            <span>·</span>
                            <span className="text-rose-600 dark:text-rose-400 font-bold">24×7</span>
                          </>
                        )}
                        {item.grievanceStatus && (
                          <>
                            <span>·</span>
                            <span className="uppercase tracking-wide font-bold text-amber-700 dark:text-amber-300">
                              {item.grievanceStatus.replace('_', ' ')}
                            </span>
                          </>
                        )}
                        {item.lostOrFound && (
                          <>
                            <span>·</span>
                            <span className="uppercase tracking-wide font-bold text-amber-700 dark:text-amber-300">
                              {item.lostOrFound}
                            </span>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleSave(moduleId, item.id)}
                        aria-label={isSaved ? 'Remove from saved' : 'Save listing'}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#176B4A] dark:hover:text-[#D9A441] cursor-pointer"
                      >
                        {isSaved ? (
                          <BookmarkCheck className="w-4 h-4 text-[#176B4A] dark:text-[#D9A441]" />
                        ) : (
                          <Bookmark className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="text-left block w-full cursor-pointer group"
                    >
                      <h2 className="font-kannada text-base font-bold text-[#10243D] dark:text-white group-hover:text-[#176B4A] dark:group-hover:text-[#D9A441] leading-snug line-clamp-2">
                        {lang === 'en' && item.titleEn ? item.titleEn : item.title}
                      </h2>
                    </button>

                    {(priceDisplay || item.salary || item.discountText) && (
                      <div className="text-sm font-extrabold text-[#176B4A] dark:text-[#D9A441]">
                        {priceDisplay || item.salary || item.discountText}
                        {item.negotiable && (
                          <span className="ml-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                            · {pickLangText('ಮಾತುಕತೆ ಸಾಧ್ಯ', 'Negotiable', lang)}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-[#5A677A] dark:text-slate-300 font-kannada leading-relaxed line-clamp-3">
                      {item.summary}
                    </p>

                    {(item.employer || item.openingHours || item.sourceAttribution || item.applicationDeadline) && (
                      <div className="pt-1 space-y-1 text-[11px] text-[#64748B] dark:text-slate-400">
                        {item.employer && (
                          <div>
                            <strong className="text-[#10243D] dark:text-slate-200">
                              {pickLangText('ಸಂಸ್ಥೆ:', 'Employer:', lang)}
                            </strong>{' '}
                            {item.employer}
                          </div>
                        )}
                        {item.applicationDeadline && (
                          <div className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {pickLangText('ಕೊನೆಯ ದಿನಾಂಕ:', 'Deadline:', lang)} {item.applicationDeadline}
                            </span>
                          </div>
                        )}
                        {item.openingHours && (
                          <div className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{item.openingHours}</span>
                          </div>
                        )}
                        {item.sourceAttribution && (
                          <div>
                            {pickLangText('ಮೂಲ:', 'Source:', lang)} {item.sourceAttribution}
                            {item.lastUpdatedLabel ? ` · ${item.lastUpdatedLabel}` : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Bar */}
                <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-[#FAFBFC] dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-center gap-2">
                    {telHref && (
                      <a
                        href={telHref}
                        onClick={() => void recordListingEnquiry(item.id, 'call')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#10243D] hover:bg-[#1B3A63] text-white text-xs font-bold"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{item.phone && item.phone.length <= 5 ? item.phone : pickLangText('ಕರೆ', 'Call', lang)}</span>
                      </a>
                    )}
                    {waHref && (
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void recordListingEnquiry(item.id, 'whatsapp')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#176B4A] hover:bg-[#12553A] text-white text-xs font-bold"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    {extHref && (
                      <a
                        href={extHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void recordListingEnquiry(item.id, 'apply')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[#10243D] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>
                          {moduleId === 'documents'
                            ? pickLangText('ತೆರೆಯಿರಿ / ಡೌನ್‌ಲೋಡ್', 'Open / Download', lang)
                            : moduleId === 'jobs'
                              ? pickLangText('ಅರ್ಜಿ ಸಲ್ಲಿಸಿ', 'Apply', lang)
                              : pickLangText('ಅಧಿಕೃತ ಲಿಂಕ್', 'Official Link', lang)}
                        </span>
                      </a>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className="text-xs font-bold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
                  >
                    {pickLangText('ವಿವರ ನೋಡಿ →', 'Details →', lang)}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white/95 dark:bg-[#111F33]/95 backdrop-blur-xs px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="text-xs font-bold text-[#176B4A] dark:text-[#D9A441] font-kannada">
                {pickLangText(mod.titleKn, mod.titleEn, lang)} · {selectedItem.location}
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="Close details"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              {selectedItem.imageUrl && (
                <img
                  src={selectedItem.imageUrl}
                  alt={selectedItem.title}
                  className="w-full max-h-72 object-cover rounded-xl"
                />
              )}

              <div>
                <h2 className="font-kannada text-xl font-extrabold text-[#10243D] dark:text-white leading-snug">
                  {selectedItem.title}
                </h2>
                {selectedItem.titleEn && selectedItem.titleEn !== selectedItem.title && (
                  <p className="text-sm font-semibold text-[#5A677A] dark:text-slate-300 mt-1">
                    {selectedItem.titleEn}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#F8FAFC] dark:bg-slate-900/70 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">
                    {pickLangText('ಸ್ಥಳ:', 'Location:', lang)}
                  </span>{' '}
                  <strong className="text-[#10243D] dark:text-white">{selectedItem.location}</strong>
                </div>
                {selectedItem.address && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {pickLangText('ವಿಳಾಸ:', 'Address:', lang)}
                    </span>{' '}
                    <strong className="text-[#10243D] dark:text-white">{selectedItem.address}</strong>
                  </div>
                )}
                {selectedItem.openingHours && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {pickLangText('ಸಮಯ:', 'Hours:', lang)}
                    </span>{' '}
                    <strong className="text-[#10243D] dark:text-white">
                      {selectedItem.openingHours}
                    </strong>
                  </div>
                )}
                {selectedItem.weeklyHoliday && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {pickLangText('ವಾರದ ರಜೆ:', 'Weekly Off:', lang)}
                    </span>{' '}
                    <strong className="text-[#10243D] dark:text-white">
                      {selectedItem.weeklyHoliday}
                    </strong>
                  </div>
                )}
                {selectedItem.employer && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {pickLangText('ಸಂಸ್ಥೆ:', 'Employer:', lang)}
                    </span>{' '}
                    <strong className="text-[#10243D] dark:text-white">{selectedItem.employer}</strong>
                  </div>
                )}
                {selectedItem.qualification && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {pickLangText('ವಿದ್ಯಾರ್ಹತೆ:', 'Qualification:', lang)}
                    </span>{' '}
                    <strong className="text-[#10243D] dark:text-white">
                      {selectedItem.qualification}
                    </strong>
                  </div>
                )}
                {selectedItem.salary && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">
                      {pickLangText('ವೇತನ:', 'Salary:', lang)}
                    </span>{' '}
                    <strong className="text-[#176B4A] dark:text-[#D9A441]">{selectedItem.salary}</strong>
                  </div>
                )}
                {selectedItem.sourceAttribution && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 dark:text-slate-400">
                      {pickLangText('ಮಾಹಿತಿ ಮೂಲ:', 'Source:', lang)}
                    </span>{' '}
                    <strong className="text-[#10243D] dark:text-white">
                      {selectedItem.sourceAttribution}
                    </strong>
                  </div>
                )}
              </div>

              <div className="text-sm text-[#334155] dark:text-slate-200 font-kannada leading-relaxed whitespace-pre-line">
                {selectedItem.description}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {buildTelUrl(selectedItem.phone) && (
                    <a
                      href={buildTelUrl(selectedItem.phone)}
                      onClick={() => void recordListingEnquiry(selectedItem.id, 'call')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#10243D] text-white text-xs font-bold"
                    >
                      <Phone className="w-4 h-4" />
                      <span>{selectedItem.phone}</span>
                    </a>
                  )}
                  {buildWhatsappContactUrl(
                    selectedItem.whatsapp || selectedItem.phone,
                    `Namaste, enquiry about "${selectedItem.title}" from Coffeenadu.in`
                  ) && (
                    <a
                      href={buildWhatsappContactUrl(
                        selectedItem.whatsapp || selectedItem.phone,
                        `Namaste, enquiry about "${selectedItem.title}" from Coffeenadu.in`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void recordListingEnquiry(selectedItem.id, 'whatsapp')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#176B4A] text-white text-xs font-bold"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp</span>
                    </a>
                  )}
                  {sanitizePlatformUrl(
                    selectedItem.applyUrl || selectedItem.documentUrl || selectedItem.website
                  ) && (
                    <a
                      href={sanitizePlatformUrl(
                        selectedItem.applyUrl || selectedItem.documentUrl || selectedItem.website
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void recordListingEnquiry(selectedItem.id, 'apply')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-[#10243D] dark:text-white"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>{pickLangText('ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್', 'Visit Official Link', lang)}</span>
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleShareWhatsapp(selectedItem)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#10243D] dark:text-slate-200 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{pickLangText('ಹಂಚಿಕೊಳ್ಳಿ', 'Share', lang)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportTarget(selectedItem)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>{pickLangText('ವರದಿ ಮಾಡಿ', 'Report', lang)}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Public Submission Modal */}
      {submitOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-700 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white dark:bg-[#111F33] px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-kannada text-base font-extrabold text-[#10243D] dark:text-white">
                  {pickLangText(
                    `${mod.titleKn} — ಹೊಸ ಮಾಹಿತಿ ಸಲ್ಲಿಸಿ`,
                    `Submit to ${mod.titleEn}`,
                    lang
                  )}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pickLangText(
                    'ಆಡ್ಮಿನ್ ಪರಿಶೀಲನೆಯ ನಂತರ ನಿಮ್ಮ ಮಾಹಿತಿ ಸಾರ್ವಜನಿಕವಾಗಿ ಕಾಣಿಸುತ್ತದೆ.',
                    'All community submissions are verified by Admin before publishing.',
                    lang
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubmitOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePublicSubmit} className="p-5 space-y-3.5 text-sm">
              {/* Hidden spam honeypot */}
              <input
                type="text"
                name="website_hp"
                value={formState.website_hp}
                onChange={(e) => setFormState({ ...formState, website_hp: e.target.value })}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
              />

              {submitSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{submitSuccess}</span>
                </div>
              )}
              {submitError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs font-semibold text-rose-700 dark:text-rose-200">
                  {submitError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                  {pickLangText('ಶೀರ್ಷಿಕೆ / ಹೆಸರು *', 'Title / Name *', lang)}
                </label>
                <input
                  required
                  value={formState.title}
                  onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                  placeholder={pickLangText('ಉದಾ: ಶ್ರೀ ಗಣೇಶ್ ಹಾರ್ಡ್‌ವೇರ್, ಕೊಪ್ಪ', 'e.g., Sri Ganesh Hardware, Koppa', lang)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                    {pickLangText('ವರ್ಗ', 'Category', lang)}
                  </label>
                  <select
                    value={formState.category}
                    onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    {mod.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {pickLangText(c.labelKn, c.labelEn, lang)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                    {pickLangText('ಊರು / ಸ್ಥಳ *', 'Location / Village *', lang)}
                  </label>
                  <select
                    value={formState.location}
                    onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    {localities.map((l) => (
                      <option key={l.id} value={l.nameEn}>
                        {l.nameEn} ({l.nameKn})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                    {pickLangText('ದೂರವಾಣಿ ಸಂಖ್ಯೆ', 'Phone Number', lang)}
                  </label>
                  <input
                    value={formState.phone}
                    onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                    placeholder="98XXXXXXXX"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                    WhatsApp
                  </label>
                  <input
                    value={formState.whatsapp}
                    onChange={(e) => setFormState({ ...formState, whatsapp: e.target.value })}
                    placeholder="98XXXXXXXX"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
              </div>

              {(moduleId === 'marketplace' || moduleId === 'property') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                      {pickLangText('ಬೆಲೆ / ಬಾಡಿಗೆ (₹)', 'Price / Rent (₹)', lang)}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formState.price}
                      onChange={(e) => setFormState({ ...formState, price: e.target.value })}
                      placeholder="15000"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    />
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formState.negotiable}
                        onChange={(e) => setFormState({ ...formState, negotiable: e.target.checked })}
                      />
                      <span>{pickLangText('ಬೆಲೆ ಮಾತುಕತೆ ಸಾಧ್ಯ', 'Price Negotiable', lang)}</span>
                    </label>
                  </div>
                </div>
              )}

              {moduleId === 'jobs' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                      {pickLangText('ಸಂಸ್ಥೆ / ಉದ್ಯೋಗದಾತರು', 'Employer / Organization', lang)}
                    </label>
                    <input
                      value={formState.employer}
                      onChange={(e) => setFormState({ ...formState, employer: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                      {pickLangText('ವೇತನ ಶ್ರೇಣಿ', 'Salary Range', lang)}
                    </label>
                    <input
                      value={formState.salary}
                      onChange={(e) => setFormState({ ...formState, salary: e.target.value })}
                      placeholder="₹15,000 - ₹22,000/month"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                  {pickLangText('ಪೂರ್ಣ ವಿವರ *', 'Full Description *', lang)}
                </label>
                <textarea
                  required
                  rows={4}
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  placeholder={pickLangText(
                    'ಸೇವೆ, ಸಮಯ, ವಿಳಾಸ ಅಥವಾ ಇತರ ಮುಖ್ಯ ವಿವರಗಳನ್ನು ಬರೆಯಿರಿ...',
                    'Provide full details, address, timings, or requirements...',
                    lang
                  )}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                    {pickLangText('ನಿಮ್ಮ ಹೆಸರು', 'Your Name', lang)}
                  </label>
                  <input
                    value={formState.submittedByName}
                    onChange={(e) => setFormState({ ...formState, submittedByName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1">
                    {pickLangText('ವಿಳಾಸ / ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್', 'Address / Landmark', lang)}
                  </label>
                  <input
                    value={formState.address}
                    onChange={(e) => setFormState({ ...formState, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSubmitOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
                >
                  {pickLangText('ಮುಚ್ಚಿ', 'Cancel', lang)}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#12553A] disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
                >
                  {isSubmitting
                    ? pickLangText('ಸಲ್ಲಿಸಲಾಗುತ್ತಿದೆ...', 'Submitting...', lang)
                    : pickLangText('ಪರಿಶೀಲನೆಗೆ ಸಲ್ಲಿಸಿ', 'Submit for Approval', lang)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Incorrect Info Modal */}
      {reportTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#10243D] dark:text-white">
                {pickLangText('ತಪ್ಪು ಮಾಹಿತಿ ವರದಿ ಮಾಡಿ', 'Report Incorrect Listing', lang)}
              </h3>
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {reportMessage ? (
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {reportMessage}
              </p>
            ) : (
              <form onSubmit={handleSubmitReport} className="space-y-3 text-xs">
                <p className="text-slate-500 dark:text-slate-400">{reportTarget.title}</p>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="Incorrect phone number / details">Incorrect phone number / details</option>
                  <option value="Expired / Sold / Closed">Expired / Sold / Closed</option>
                  <option value="Duplicate or Spam">Duplicate or Spam</option>
                  <option value="Misleading or inappropriate">Misleading or inappropriate</option>
                </select>
                <textarea
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Optional details for our moderation team..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReportTarget(null)}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                  >
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
