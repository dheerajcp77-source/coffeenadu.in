import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Globe,
  MapPin,
  MessageCircle,
  Monitor,
  Phone,
  Share2,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AD_CTA_LABELS,
  type AdPlacementsConfig,
  type AdPlatformSettings,
  type Advertisement,
} from '../../types/ads';
import {
  buildAdKannadaShareMessage,
  buildAdPublicUrl,
  createDefaultAdPlacements,
  formatReadableAdDate,
  sanitizeExternalWebsiteUrl,
} from '../../utils/adHelpers';
import { sanitizeRichTextHtml, stripRichTextToPlainText } from '../../utils/richText';
import { AdImage } from '../AdImage';

export type AdPreviewPlacementTab =
  | 'full'
  | 'articlePopup'
  | 'endOfArticle'
  | 'homepagePopup'
  | 'websiteEntry'
  | 'homepageSection'
  | 'articleInline';

interface AdPreviewContentProps {
  ad: Advertisement;
  settings?: AdPlatformSettings | null;
  initialPlacement?: AdPreviewPlacementTab;
  onEditAd?: (ad: Advertisement) => void;
  onClose?: () => void;
}

const PREVIEW_TABS: Array<{ id: AdPreviewPlacementTab; label: string }> = [
  { id: 'full', label: 'Full Ad Page' },
  { id: 'articlePopup', label: 'Article Popup' },
  { id: 'endOfArticle', label: 'End of Article' },
  { id: 'homepagePopup', label: 'Homepage Popup' },
  { id: 'websiteEntry', label: 'Website Entry' },
  { id: 'homepageSection', label: 'Homepage Banner/Card' },
  { id: 'articleInline', label: 'Article Inline' },
];

export function AdPreviewContent({
  ad,
  settings,
  initialPlacement = 'full',
}: AdPreviewContentProps) {
  const [placementTab, setPlacementTab] = useState<AdPreviewPlacementTab>(initialPlacement);
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop');

  const placements: AdPlacementsConfig = ad.placements || createDefaultAdPlacements();
  const plainDesc = stripRichTextToPlainText(ad.description);
  const ctaLabel =
    ad.ctaLabel?.trim() ||
    (ad.ctaType ? AD_CTA_LABELS[ad.ctaType] : 'Contact Now');
  const publicUrl = buildAdPublicUrl(ad.sharing?.customSlug || ad.id);
  const sharePreviewText = buildAdKannadaShareMessage(
    ad,
    publicUrl,
    settings?.defaultShareMessage
  );
  const previewLinkUrl = ad.previewToken
    ? buildAdPublicUrl(ad.id, undefined, ad.previewToken)
    : '';
  const safeWebsite = sanitizeExternalWebsiteUrl(ad.websiteUrl);

  const isPlacementEnabled = (tab: AdPreviewPlacementTab): boolean => {
    switch (tab) {
      case 'full':
        return true;
      case 'articlePopup':
        return placements.articlePopup.enabled;
      case 'endOfArticle':
        return placements.endOfArticle.enabled;
      case 'homepagePopup':
        return placements.homepagePopup.enabled;
      case 'websiteEntry':
        return placements.websiteEntry.enabled;
      case 'homepageSection':
        return placements.homepageSection.enabled;
      case 'articleInline':
        return (
          placements.articleInline.enabled &&
          (placements.articleInline.belowHeadline ||
            placements.articleInline.belowSummary ||
            placements.articleInline.betweenParagraphs ||
            placements.articleInline.aboveSharing)
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: Placement Selector + Desktop/Mobile Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center gap-1.5">
          {PREVIEW_TABS.map((tab) => {
            const active = placementTab === tab.id;
            const enabled = isPlacementEnabled(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPlacementTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#0B192C] text-white dark:bg-amber-500 dark:text-slate-950'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                }`}
              >
                <span>{tab.label}</span>
                {tab.id !== 'full' && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      enabled ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                    title={enabled ? 'Enabled on this ad' : 'Not enabled on this ad'}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setDeviceMode('desktop')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer ${
              deviceMode === 'desktop'
                ? 'bg-[#0F274A] text-white dark:bg-amber-500 dark:text-slate-950'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            <span>Desktop</span>
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode('mobile')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer ${
              deviceMode === 'mobile'
                ? 'bg-[#0F274A] text-white dark:bg-amber-500 dark:text-slate-950'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>Mobile</span>
          </button>
        </div>
      </div>

      {/* Placement Status Banner */}
      {placementTab !== 'full' && !isPlacementEnabled(placementTab) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Note: This placement is currently <strong>unchecked</strong> in Display Settings. Check its box to show this format to visitors.
        </div>
      )}

      {/* Preview Viewport Canvas */}
      <div className="rounded-2xl border border-slate-200 bg-slate-100/90 p-3 sm:p-5 dark:border-slate-800 dark:bg-slate-950/90">
        <div
          className={`transition-all duration-200 ${
            deviceMode === 'mobile'
              ? 'mx-auto w-full max-w-[375px] rounded-[26px] border-4 border-slate-800 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900'
              : 'w-full rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          {/* 1. FULL AD PAGE PREVIEW */}
          {placementTab === 'full' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-[#0F274A] dark:text-amber-300">
                    {ad.adNumber}
                  </span>
                  <span>·</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{ad.category}</span>
                  <span>·</span>
                  <span>
                    {formatReadableAdDate(ad.publishDate)} – {formatReadableAdDate(ad.expiryDate)}
                  </span>
                </div>
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  Full Ad Page
                </span>
              </div>

              {ad.advertiserName && (
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Advertiser: {ad.advertiserName}
                </p>
              )}

              <h3 className="font-kannada text-lg sm:text-xl font-extrabold text-slate-950 dark:text-white leading-snug">
                {ad.title || 'Untitled Local Advertisement'}
              </h3>

              <div className="rounded-xl overflow-hidden border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                <AdImage
                  src={ad.mainImageUrl}
                  alt={ad.title || 'Advertisement preview'}
                  fit="contain"
                  lazy={false}
                  className="w-full max-h-[380px] flex items-center justify-center bg-white dark:bg-slate-950"
                  imgClassName="max-h-[380px] w-auto mx-auto"
                />
              </div>

              {ad.description && (
                <div
                  className="article-rich-content font-kannada text-sm text-slate-800 dark:text-slate-200 leading-relaxed space-y-2"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(ad.description) }}
                />
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3 dark:border-slate-700 dark:bg-slate-800/60">
                {ad.businessAddress && (
                  <div className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <MapPin className="h-4 w-4 shrink-0 text-[#0F274A] dark:text-amber-300 mt-0.5" />
                    <span className="font-kannada">{ad.businessAddress}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-[#0F274A]">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{ctaLabel}</span>
                  </span>
                  {ad.contactNumber && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F274A] px-3 py-1.5 text-xs font-semibold text-white">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{ad.contactNumber}</span>
                    </span>
                  )}
                  {ad.whatsappNumber && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>WhatsApp</span>
                    </span>
                  )}
                  {safeWebsite && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                      <Globe className="h-3.5 w-3.5" />
                      <span>Website</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                    <Share2 className="h-3.5 w-3.5" />
                    <span>Share</span>
                  </span>
                </div>
              </div>

              {ad.additionalImages.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ad.additionalImages.map((img, i) => (
                    <div
                      key={`${img.imageUrl.slice(0, 20)}-${i}`}
                      className="rounded-lg border border-slate-200 overflow-hidden bg-white dark:border-slate-700 dark:bg-slate-950"
                    >
                      <AdImage
                        src={img.imageUrl}
                        alt={img.caption || `Extra ${i + 1}`}
                        fit="contain"
                        className="h-40 w-full"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-950">
                <p className="font-bold uppercase tracking-wider text-[10px] text-slate-500 mb-1.5">
                  Kannada Share Message Preview ({publicUrl})
                </p>
                <pre className="whitespace-pre-wrap font-kannada text-xs text-slate-700 dark:text-slate-300">
                  {sharePreviewText}
                </pre>
                {previewLinkUrl && (
                  <p className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 font-mono truncate">
                    Private Preview Link: {previewLinkUrl}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 2. ARTICLE READING POPUP PREVIEW */}
          {placementTab === 'articlePopup' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Trigger: <strong>{placements.articlePopup.scrollTriggerPercent}% scroll</strong> · Delay{' '}
                  <strong>{placements.articlePopup.delaySeconds}s</strong>
                </span>
                <span>
                  Size: <strong>{placements.articlePopup.size}</strong> · Position:{' '}
                  <strong>{placements.articlePopup.position}</strong>
                </span>
              </div>

              <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[290px] dark:border-slate-700 dark:bg-slate-950">
                {/* Simulated Article Lines */}
                <div className="space-y-2.5 opacity-45 pointer-events-none">
                  <div className="h-4 w-3/4 rounded bg-slate-300 dark:bg-slate-700" />
                  <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-11/12 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-5/6 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-4/5 rounded bg-slate-200 dark:bg-slate-800" />
                </div>

                {/* Floating Card */}
                <div
                  className={`mt-4 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:border-slate-700 dark:bg-slate-900 ${
                    placements.articlePopup.size === 'large'
                      ? 'max-w-[330px]'
                      : placements.articlePopup.size === 'medium'
                      ? 'max-w-[290px]'
                      : 'max-w-[250px]'
                  } ${
                    placements.articlePopup.position.includes('right')
                      ? 'ml-auto'
                      : placements.articlePopup.position.includes('center')
                      ? 'mx-auto'
                      : 'mr-auto'
                  }`}
                >
                  <div className="flex items-center justify-between px-3 py-1.5 bg-[#0F274A] text-white text-[10px] font-bold">
                    <span className="uppercase tracking-wider">Sponsored · {ad.adNumber}</span>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15">
                      <X className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="p-2.5 flex items-start gap-2.5">
                    <div className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-white overflow-hidden">
                      <AdImage
                        src={ad.mainImageThumbUrl || ad.mainImageUrl}
                        alt={ad.title}
                        fit="contain"
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-kannada text-xs font-bold text-slate-900 dark:text-white line-clamp-2">
                        {ad.title || 'Untitled Ad'}
                      </p>
                      <span className="inline-flex items-center gap-1 rounded bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-[#0F274A]">
                        {ctaLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. END OF ARTICLE PREVIEW */}
          {placementTab === 'endOfArticle' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Position relative to Related Articles:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {placements.endOfArticle.position === 'before_related'
                    ? 'Before Related Articles'
                    : 'After Related Articles'}
                </strong>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs dark:border-slate-700 dark:bg-slate-900">
                <div className="px-4 py-2 bg-[#0F274A] text-white flex items-center justify-between text-[11px] font-bold">
                  <span>LOCAL ADVERTISEMENT · {ad.adNumber}</span>
                  <span>{ad.category}</span>
                </div>
                <div className={`p-4 grid gap-4 ${deviceMode === 'mobile' ? 'grid-cols-1' : 'sm:grid-cols-12'}`}>
                  <div className={`${deviceMode === 'mobile' ? '' : 'sm:col-span-5'} rounded-lg border border-slate-200 bg-white overflow-hidden`}>
                    <AdImage
                      src={ad.mainImageUrl}
                      alt={ad.title}
                      fit="contain"
                      className="max-h-52 w-full"
                    />
                  </div>
                  <div className={`${deviceMode === 'mobile' ? '' : 'sm:col-span-7'} space-y-2.5`}>
                    <h4 className="font-kannada text-base font-extrabold text-slate-900 dark:text-white">
                      {ad.title || 'Untitled Advertisement'}
                    </h4>
                    {plainDesc && (
                      <p className="font-kannada text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                        {plainDesc}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-[#0F274A]">
                        {ctaLabel}
                      </span>
                      <span className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        Share
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. MAIN HOMEPAGE POPUP PREVIEW */}
          {placementTab === 'homepagePopup' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Delay: <strong>{placements.homepagePopup.delaySeconds}s</strong> · Design:{' '}
                  <strong>{placements.homepagePopup.design}</strong>
                </span>
                <span>
                  Position: <strong>{placements.homepagePopup.position}</strong> ·{' '}
                  <strong>{placements.homepagePopup.frequency.replace(/_/g, ' ')}</strong>
                </span>
              </div>
              <div className="rounded-xl bg-slate-900/75 p-4 sm:p-6 flex items-center justify-center">
                <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[#0F274A] text-white">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                      Featured Local Sponsor · {ad.adNumber}
                    </span>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800">
                    <AdImage
                      src={ad.mainImageUrl}
                      alt={ad.title}
                      fit="contain"
                      className="max-h-56 w-full"
                    />
                  </div>
                  <div className="p-4 space-y-2.5">
                    <h4 className="font-kannada text-base font-extrabold text-slate-900 dark:text-white">
                      {ad.title || 'Untitled Advertisement'}
                    </h4>
                    {plainDesc && (
                      <p className="font-kannada text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {plainDesc}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-[#0F274A]">
                        {ctaLabel}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">Dismiss</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. WEBSITE ENTRY OVERLAY PREVIEW */}
          {placementTab === 'websiteEntry' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Delay: <strong>{placements.websiteEntry.delaySeconds}s</strong> · Minimum View:{' '}
                  <strong>{placements.websiteEntry.minDurationSeconds}s</strong>
                </span>
                <span>
                  Layout: <strong>{placements.websiteEntry.layout}</strong>
                </span>
              </div>
              <div className="rounded-xl bg-slate-950/90 p-4 sm:p-6">
                <div className="mx-auto max-w-lg rounded-2xl border border-slate-700 bg-white overflow-hidden shadow-2xl dark:bg-slate-900">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[#0F274A] text-white">
                    <span className="text-[11px] font-bold text-amber-300">
                      SPONSORED WELCOME · {ad.adNumber}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-bold">
                      <Clock className="h-3 w-3" />
                      <span>
                        {placements.websiteEntry.minDurationSeconds > 0
                          ? `Continue in ${placements.websiteEntry.minDurationSeconds}s · X`
                          : 'Close (X)'}
                      </span>
                    </span>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-950">
                    <AdImage
                      src={ad.mainImageUrl}
                      alt={ad.title}
                      fit="contain"
                      className="max-h-72 w-full"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-t border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                    <span className="font-kannada text-sm font-bold text-slate-900 dark:text-white truncate">
                      {ad.title || 'Untitled Advertisement'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-bold text-[#0F274A]">
                        {ctaLabel}
                      </span>
                      <span className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        Enter Coffeenadu
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. HOMEPAGE SECTION BANNER/CARD PREVIEW */}
          {placementTab === 'homepageSection' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Homepage Position:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {placements.homepageSection.position.replace(/_/g, ' ')}
                  </strong>
                  {placements.homepageSection.position === 'custom' &&
                    ` (${placements.homepageSection.customPosition || 'right_rail'})`}
                </span>
                <span>
                  Category: <strong className="text-slate-800 dark:text-slate-200">{ad.category}</strong>
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#0F274A] text-white text-xs font-bold">
                  <span>LOCAL BUSINESS SPOTLIGHT · {ad.adNumber}</span>
                  <span className="text-amber-300 inline-flex items-center gap-1">
                    <span>View All</span>
                    <ExternalLink className="h-3 w-3" />
                  </span>
                </div>
                <div className={`grid gap-4 p-4 ${deviceMode === 'mobile' ? 'grid-cols-1' : 'sm:grid-cols-12'}`}>
                  <div className={`${deviceMode === 'mobile' ? '' : 'sm:col-span-5'} rounded-lg border border-slate-200 bg-white overflow-hidden`}>
                    <AdImage
                      src={ad.mainImageUrl}
                      alt={ad.title}
                      fit="contain"
                      className="max-h-48 w-full"
                    />
                  </div>
                  <div className={`${deviceMode === 'mobile' ? '' : 'sm:col-span-7'} space-y-2`}>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      {ad.category}
                    </span>
                    <h4 className="font-kannada text-base font-extrabold text-slate-900 dark:text-white">
                      {ad.title || 'Untitled Advertisement'}
                    </h4>
                    {plainDesc && (
                      <p className="font-kannada text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {plainDesc}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-bold text-[#0F274A]">
                        {ctaLabel}
                      </span>
                      <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                        Share
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 7. ARTICLE INLINE PREVIEW */}
          {placementTab === 'articleInline' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Active Article Inline Slots:</span>
                {placements.articleInline.belowHeadline && (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Below Headline
                  </span>
                )}
                {placements.articleInline.belowSummary && (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Below Summary
                  </span>
                )}
                {placements.articleInline.betweenParagraphs && (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> After Paragraph #{placements.articleInline.paragraphIndex}
                  </span>
                )}
                {placements.articleInline.aboveSharing && (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Above Sharing
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-950">
                <div className="h-5 w-4/5 rounded bg-slate-300 dark:bg-slate-700" />
                <div className="rounded-xl border border-amber-200 bg-white p-3 shadow-xs dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-2">
                    <span>Sponsored Local Business · {ad.adNumber}</span>
                    <span>{ad.category}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="h-24 sm:w-32 shrink-0 rounded-lg border border-slate-200 bg-white overflow-hidden">
                      <AdImage
                        src={ad.mainImageUrl}
                        alt={ad.title}
                        fit="contain"
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <h5 className="font-kannada text-sm font-bold text-slate-900 dark:text-white line-clamp-2">
                        {ad.title || 'Untitled Advertisement'}
                      </h5>
                      {plainDesc && (
                        <p className="font-kannada text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                          {plainDesc}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-[#0F274A]">
                          {ctaLabel}
                        </span>
                        <span className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                          Share
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 pt-1 opacity-50">
                  <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-10/12 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface AdPreviewModalProps {
  ad: Advertisement | null;
  settings?: AdPlatformSettings | null;
  initialPlacement?: AdPreviewPlacementTab;
  onClose: () => void;
  onEditAd?: (ad: Advertisement) => void;
}

export function AdPreviewModal({
  ad,
  settings,
  initialPlacement = 'full',
  onClose,
  onEditAd,
}: AdPreviewModalProps) {
  if (!ad) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-5 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Multi-placement preview for ${ad.adNumber}`}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0F172A]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#0B192C] px-5 py-3.5 text-white dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <Eye className="h-4 w-4 text-amber-300 shrink-0" />
            <span className="font-mono text-sm font-bold text-amber-300">{ad.adNumber}</span>
            <span className="truncate text-sm font-bold">{ad.title || 'Preview Advertisement'}</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={buildAdPublicUrl(ad.sharing?.customSlug || ad.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              <span>Public URL</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <AdPreviewContent ad={ad} settings={settings} initialPlacement={initialPlacement} />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
          {onEditAd && (
            <button
              type="button"
              onClick={() => {
                const target = ad;
                onClose();
                onEditAd(target);
              }}
              className="rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#142c4c] dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
            >
              Edit Advertisement
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
