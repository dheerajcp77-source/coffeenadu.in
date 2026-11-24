import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Copy,
  Globe,
  MapPin,
  Megaphone,
  MessageCircle,
  Phone,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { trackAdInteraction } from '../services/adsClient';
import { AD_CATEGORIES, type Advertisement } from '../types/ads';
import {
  buildAdPublicUrl,
  buildTelHref,
  buildWhatsAppAdHref,
  formatReadableAdDate,
  isAdCurrentlyActive,
  sanitizeExternalWebsiteUrl,
} from '../utils/adHelpers';
import { sanitizeRichTextHtml, stripRichTextToPlainText } from '../utils/richText';
import { AdImage } from './AdImage';
import { AdSlider } from './AdSlider';

interface LocalAdsSectionProps {
  ads: Advertisement[];
  directAd: Advertisement | null;
  isLoading: boolean;
  selectedAdId: string | null;
  onSelectAd: (ad: Advertisement) => void;
  onCloseAd: () => void;
  onBackToNews: () => void;
}

export function LocalAdsSection({
  ads,
  directAd,
  isLoading,
  selectedAdId,
  onSelectAd,
  onCloseAd,
  onBackToNews,
}: LocalAdsSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption?: string } | null>(null);

  const activeAds = useMemo(
    () => ads.filter((ad) => isAdCurrentlyActive(ad)),
    [ads]
  );

  const selectedAd = useMemo(() => {
    if (!selectedAdId) return null;
    const fromList = activeAds.find(
      (a) => a.id === selectedAdId || a.adNumber.toUpperCase() === selectedAdId.toUpperCase()
    );
    if (fromList) return fromList;
    if (
      directAd &&
      (directAd.id === selectedAdId ||
        directAd.adNumber.toUpperCase() === selectedAdId.toUpperCase())
    ) {
      return directAd;
    }
    return null;
  }, [activeAds, directAd, selectedAdId]);

  useEffect(() => {
    if (!selectedAd?.id) return;
    void trackAdInteraction(selectedAd.id, 'view');
  }, [selectedAd?.id]);

  const availableCategories = useMemo(() => {
    const present = new Set(activeAds.map((a) => a.category));
    const ordered = AD_CATEGORIES.filter((cat) => present.has(cat));
    const extras = Array.from(present).filter(
      (cat) => !(AD_CATEGORIES as readonly string[]).includes(cat)
    );
    return ['All', ...ordered, ...extras];
  }, [activeAds]);

  const filteredAds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeAds.filter((ad) => {
      if (selectedCategory !== 'All' && ad.category !== selectedCategory) {
        return false;
      }
      if (q) {
        const haystack = [
          ad.adNumber,
          ad.title,
          ad.category,
          stripRichTextToPlainText(ad.description),
          ad.businessAddress || '',
          ad.contactNumber || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      }
      return true;
    });
  }, [activeAds, selectedCategory, searchQuery]);

  const handleCopyAdLink = async (ad: Advertisement) => {
    try {
      await navigator.clipboard.writeText(buildAdPublicUrl(ad.id));
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  // --- Full Advertisement Details Page ---
  if (selectedAdId) {
    if (isLoading && !selectedAd) {
      return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
          <div className="h-9 w-40 rounded bg-slate-200 animate-pulse" />
          <div className="h-8 w-3/4 rounded bg-slate-200 animate-pulse" />
          <div className="h-80 w-full rounded-xl bg-slate-200 animate-pulse" />
        </div>
      );
    }

    if (!selectedAd) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
          <Megaphone className="w-8 h-8 mx-auto text-slate-400" aria-hidden="true" />
          <h1 className="text-lg font-bold text-slate-900">
            Advertisement not available
          </h1>
          <p className="text-sm text-slate-600">
            This local advertisement may have expired or been paused by the advertiser.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={onCloseAd}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0F274A] hover:bg-[#173a6e] rounded-lg cursor-pointer"
            >
              Browse Active Local Ads
            </button>
            <button
              type="button"
              onClick={onBackToNews}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              Back to News
            </button>
          </div>
        </div>
      );
    }

    const telHref = selectedAd.contactNumber ? buildTelHref(selectedAd.contactNumber) : '';
    const waHref = selectedAd.whatsappNumber
      ? buildWhatsAppAdHref(selectedAd.whatsappNumber, selectedAd)
      : '';
    const websiteHref = sanitizeExternalWebsiteUrl(selectedAd.websiteUrl);
    const shareText = `${selectedAd.title} (${selectedAd.adNumber}) - CoffeeNadu News Local Ads: ${buildAdPublicUrl(selectedAd.id)}`;
    const shareWaHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    return (
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {/* Top Navigation & Share Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-stone-200">
            <button
              type="button"
              onClick={onCloseAd}
              className="inline-flex items-center gap-2 text-sm font-medium text-stone-700 hover:text-[#0F274A] transition-colors cursor-pointer min-h-[40px] px-2 -ml-2 rounded-md"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Back to Local Ads</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyAdLink(selectedAd)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
              </button>
              <a
                href={shareWaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </a>
            </div>
          </div>

          {/* Editorial Metadata & Headline */}
          <div className="pt-6 space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-stone-500">
              <span className="font-mono font-bold text-[#0F274A]">{selectedAd.adNumber}</span>
              <span aria-hidden="true">·</span>
              <span className="uppercase tracking-wider font-semibold text-[#0F274A]">
                {selectedAd.category}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  Published {formatReadableAdDate(selectedAd.publishDate)} · Valid until{' '}
                  {formatReadableAdDate(selectedAd.expiryDate)}
                </span>
              </span>
            </div>

            <h1 className="font-kannada text-2xl sm:text-3xl font-extrabold text-stone-950 leading-snug text-balance">
              {selectedAd.title}
            </h1>

            {/* Original Main Advertisement Image (Unmodified) */}
            <figure className="rounded-xl overflow-hidden border border-stone-200 bg-stone-50">
              <button
                type="button"
                onClick={() =>
                  setLightboxImage({ url: selectedAd.mainImageUrl, caption: selectedAd.title })
                }
                className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A]"
                aria-label="Open full-size advertisement image"
              >
                <AdImage
                  src={selectedAd.mainImageUrl}
                  alt={selectedAd.title}
                  fit="contain"
                  lazy={false}
                  className="w-full max-h-[580px] flex items-center justify-center bg-white"
                  imgClassName="max-h-[580px] w-auto mx-auto"
                />
              </button>
            </figure>

            {/* Business Contact & Location Strip */}
            {(selectedAd.businessAddress || telHref || waHref || websiteHref) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5 space-y-3.5">
                {selectedAd.businessAddress && (
                  <div className="flex items-start gap-2.5 text-sm text-slate-800">
                    <MapPin className="w-4 h-4 text-[#0F274A] shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="font-kannada leading-relaxed">{selectedAd.businessAddress}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  {telHref && (
                    <a
                      href={telHref}
                      onClick={() => void trackAdInteraction(selectedAd.id, 'click')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-[#0F274A] hover:bg-[#173a6e] rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Phone className="w-4 h-4" aria-hidden="true" />
                      <span>Call {selectedAd.contactNumber}</span>
                    </a>
                  )}

                  {waHref && (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void trackAdInteraction(selectedAd.id, 'click')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <MessageCircle className="w-4 h-4" aria-hidden="true" />
                      <span>WhatsApp</span>
                    </a>
                  )}

                  {websiteHref && (
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void trackAdInteraction(selectedAd.id, 'click')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Globe className="w-4 h-4" aria-hidden="true" />
                      <span>Visit Website</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Full Description */}
            {selectedAd.description && (
              <div
                className="article-rich-content font-kannada text-base text-stone-800 leading-[1.85] space-y-4 pt-2"
                dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(selectedAd.description) }}
              />
            )}

            {/* Additional Images Gallery */}
            {selectedAd.additionalImages && selectedAd.additionalImages.length > 0 && (
              <section
                aria-label="Additional advertisement photos"
                className="pt-6 mt-6 border-t border-stone-200 space-y-4"
              >
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#0F274A]">
                  Gallery ({selectedAd.additionalImages.length})
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedAd.additionalImages.map((img, idx) => (
                    <figure
                      key={`${img.imageUrl.slice(0, 24)}-${idx}`}
                      className="rounded-xl border border-stone-200 overflow-hidden bg-white"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxImage({
                            url: img.imageUrl,
                            caption: img.caption || `${selectedAd.title} - Photo ${idx + 2}`,
                          })
                        }
                        className="block w-full cursor-zoom-in"
                      >
                        <AdImage
                          src={img.imageUrl}
                          alt={img.caption || `${selectedAd.title} - Photo ${idx + 2}`}
                          fit="contain"
                          className="w-full h-56 bg-white"
                        />
                      </button>
                      {img.caption && (
                        <figcaption className="px-3.5 py-2 font-kannada text-xs text-stone-600 border-t border-stone-100">
                          {img.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Lightbox for Full-Size Viewing */}
        {lightboxImage && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Full size advertisement image"
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-50 bg-slate-950/85 p-4 flex items-center justify-center"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-5xl max-h-[90vh] flex flex-col items-center"
            >
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label="Close image preview"
                className="absolute -top-10 right-0 rounded-lg bg-white/15 p-2 text-white hover:bg-white/25 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={lightboxImage.url}
                alt={lightboxImage.caption || 'Advertisement image'}
                referrerPolicy="no-referrer"
                className="max-h-[82vh] max-w-full rounded-lg object-contain bg-white"
              />
              {lightboxImage.caption && (
                <p className="mt-2 font-kannada text-xs text-slate-200 text-center">
                  {lightboxImage.caption}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Dedicated Local Advertisements Listing Page ---
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onBackToNews}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#0F274A] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back to Latest News</span>
          </button>
          <div className="flex items-center gap-2.5">
            <Megaphone className="w-6 h-6 text-[#0F274A] shrink-0" aria-hidden="true" />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F274A]">
              Local Advertisements
            </h1>
          </div>
          <p className="font-kannada text-xs sm:text-sm text-slate-600">
            ಸ್ಥಳೀಯ ವ್ಯಾಪಾರ, ಶಿಕ್ಷಣ, ಸೇವೆಗಳು ಮತ್ತು ಕೊಪ್ಪ ತಾಲೂಕಿನ ಜಾಹೀರಾತುಗಳು
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search local ads or business..."
            aria-label="Search local advertisements"
            className="w-full pl-9 pr-8 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0F274A]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear advertisement search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Buttons */}
      {availableCategories.length > 1 && (
        <div
          role="tablist"
          aria-label="Advertisement categories"
          className="flex items-center gap-2 overflow-x-auto pb-1"
        >
          {availableCategories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#0F274A] text-white border-[#0F274A]'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:text-slate-950'
                }`}
              >
                {cat === 'All' ? 'All Ads' : cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Automatic Spotlight Slider (only when browsing All and 2+ ads exist) */}
      {selectedCategory === 'All' && !searchQuery.trim() && activeAds.length > 1 && (
        <AdSlider
          ads={activeAds}
          onOpenAd={onSelectAd}
          title="Featured Local Advertisements"
        />
      )}

      {/* Listing Grid */}
      {isLoading && activeAds.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="h-48 bg-slate-200 animate-pulse" />
              <div className="p-4 space-y-2.5">
                <div className="h-3 w-24 rounded bg-slate-200 animate-pulse" />
                <div className="h-5 w-4/5 rounded bg-slate-200 animate-pulse" />
                <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredAds.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-2.5">
          <Megaphone className="w-8 h-8 mx-auto text-slate-400" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">
            {activeAds.length === 0
              ? 'No active local advertisements at the moment'
              : 'No matching advertisements found'}
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {activeAds.length === 0
              ? 'Local businesses and services in Koppa Taluk will appear here as soon as new advertisements are published.'
              : 'Try clearing your search or selecting another category.'}
          </p>
          {(selectedCategory !== 'All' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('All');
                setSearchQuery('');
              }}
              className="mt-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F274A] rounded-lg hover:bg-[#173a6e] cursor-pointer"
            >
              Show All Advertisements
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAds.map((ad) => {
            const excerpt = stripRichTextToPlainText(ad.description);
            const telHref = ad.contactNumber ? buildTelHref(ad.contactNumber) : '';
            const waHref = ad.whatsappNumber
              ? buildWhatsAppAdHref(ad.whatsappNumber, ad)
              : '';

            return (
              <article
                key={ad.id}
                onClick={() => onSelectAd(ad)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectAd(ad);
                  }
                }}
                role="button"
                tabIndex={0}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F274A]"
              >
                {/* Unmodified Original Advertisement Image */}
                <div className="h-52 w-full bg-slate-50 border-b border-slate-100 p-2 flex items-center justify-center">
                  <AdImage
                    src={ad.mainImageUrl}
                    alt={ad.title}
                    fit="contain"
                    className="w-full h-full bg-white rounded-lg"
                  />
                </div>

                {/* Card Content */}
                <div className="flex-1 p-4 flex flex-col justify-between gap-3.5">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <span className="font-mono font-bold text-[#0F274A]">{ad.adNumber}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ad.category}</span>
                      {ad.additionalImages.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            +{ad.additionalImages.length} photos
                          </span>
                        </>
                      )}
                    </div>

                    <h2 className="font-kannada text-base font-extrabold text-slate-950 group-hover:text-[#0F274A] transition-colors leading-snug line-clamp-2">
                      {ad.title}
                    </h2>

                    {excerpt && (
                      <p className="font-kannada text-xs text-slate-600 leading-relaxed line-clamp-2">
                        {excerpt}
                      </p>
                    )}

                    {ad.businessAddress && (
                      <p className="inline-flex items-center gap-1 font-kannada text-[11px] text-slate-500 max-w-full">
                        <MapPin className="w-3 h-3 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="truncate">{ad.businessAddress}</span>
                      </p>
                    )}
                  </div>

                  {/* Card Actions Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0F274A] group-hover:underline whitespace-nowrap">
                      <span>View More</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>

                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {telHref && (
                        <a
                          href={telHref}
                          onClick={() => void trackAdInteraction(ad.id, 'click')}
                          aria-label={`Call ${ad.title}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#0F274A] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#173a6e] transition-colors whitespace-nowrap"
                        >
                          <Phone className="w-3 h-3" aria-hidden="true" />
                          <span>Call</span>
                        </a>
                      )}
                      {waHref && (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => void trackAdInteraction(ad.id, 'click')}
                          aria-label={`WhatsApp ${ad.title}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
                        >
                          <MessageCircle className="w-3 h-3" aria-hidden="true" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
