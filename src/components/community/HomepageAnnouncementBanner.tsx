import { ArrowRight, PlusCircle, ShoppingBag, Users } from 'lucide-react';
import type {
  AnnouncementButtonConfig,
  HomepageAnnouncementConfig,
  PlatformLanguage,
} from '../../types/platform';
import { isAnnouncementScheduledActive } from '../../utils/unifiedFeedHelpers';

interface HomepageAnnouncementBannerProps {
  config: HomepageAnnouncementConfig;
  language: PlatformLanguage;
  onButtonClick: (button: AnnouncementButtonConfig) => void;
}

function renderButtonIcon(action: AnnouncementButtonConfig['action']) {
  if (action === 'open-submit-modal') {
    return <PlusCircle className="w-4 h-4 shrink-0" aria-hidden="true" />;
  }
  if (action === 'filter:marketplace' || action === 'route:/marketplace') {
    return <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden="true" />;
  }
  if (action === 'route:/community' || action === 'filter:community') {
    return <Users className="w-4 h-4 shrink-0" aria-hidden="true" />;
  }
  return <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />;
}

export function HomepageAnnouncementBanner({
  config,
  language,
  onButtonClick,
}: HomepageAnnouncementBannerProps) {
  if (!isAnnouncementScheduledActive(config)) return null;

  const heading =
    language === 'kn'
      ? config.headingKn || config.headingEn
      : config.headingEn || config.headingKn;
  const description =
    language === 'kn'
      ? config.descriptionKn || config.descriptionEn
      : config.descriptionEn || config.descriptionKn;
  const hasImage = Boolean(config.imageUrl && config.imageUrl.trim());

  return (
    <section
      aria-label="Coffeenadu community invitation"
      data-testid="homepage-announcement-banner"
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3.5 pb-1"
    >
      <div className="rounded-2xl border border-[#DFC996] dark:border-[#3A3122] bg-white dark:bg-[#1A1815] shadow-2xs overflow-hidden relative">
        <div
          aria-hidden="true"
          className="h-1 w-full bg-gradient-to-r from-[#9E7015] via-[#D4A238] to-[#F0CA70]"
        />
        <div
          className={`flex flex-col ${
            hasImage ? 'lg:flex-row lg:items-center' : ''
          }`}
        >
          {hasImage && (
            <div className="lg:w-72 xl:w-80 shrink-0 bg-[#F7F3EA] dark:bg-[#12100D] flex items-center justify-center p-2">
              <img
                src={config.imageUrl}
                alt={heading}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  (e.currentTarget.parentElement as HTMLElement | null)?.classList.add('hidden');
                }}
                className="w-full h-auto max-h-56 object-contain rounded-lg"
              />
            </div>
          )}

          <div className="flex-1 p-4 sm:p-5 lg:px-6 lg:py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#9A6D12] dark:text-[#E2B44B]">
                COFFEENADU COMMUNITY · {language === 'kn' ? 'ಕಾಫಿನಾಡು ಸಮುದಾಯ' : 'Malnad Local Hub'}
              </p>
              <h2
                className={`text-base sm:text-lg lg:text-xl font-extrabold text-[#1C1917] dark:text-[#FBF9F5] leading-snug ${
                  language === 'kn' ? 'font-kannada' : ''
                }`}
              >
                {heading}
              </h2>
              {description && (
                <p
                  className={`text-sm text-[#574E44] dark:text-[#C5BBA9] leading-relaxed ${
                    language === 'kn' ? 'font-kannada' : ''
                  }`}
                >
                  {description}
                </p>
              )}
            </div>

            {Array.isArray(config.buttons) && config.buttons.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {config.buttons.map((btn) => {
                  const label =
                    language === 'kn'
                      ? btn.labelKn || btn.labelEn
                      : btn.labelEn || btn.labelKn;

                  const variantClasses =
                    btn.variant === 'primary'
                      ? 'bg-gradient-to-r from-[#C5932B] to-[#DEB04B] hover:from-[#B6841E] hover:to-[#D4A238] text-[#181512] border-[#B6841E] shadow-2xs'
                      : btn.variant === 'secondary'
                        ? 'bg-[#1C1917] hover:bg-[#2F2A25] text-[#FBF9F5] border-[#1C1917] dark:bg-[#26211B] dark:hover:bg-[#332C24] dark:text-[#FBF9F5] dark:border-[#3E3528]'
                        : 'bg-[#FBF9F5] hover:bg-[#F5EBD2] text-[#1C1917] border-[#DFD2B6] dark:bg-[#1E1B16] dark:hover:bg-[#29241D] dark:text-[#EFE8DC] dark:border-[#3A3227]';

                  return (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => onButtonClick(btn)}
                      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-bold transition-colors cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5932B] ${variantClasses} ${
                        language === 'kn' ? 'font-kannada' : ''
                      }`}
                    >
                      {renderButtonIcon(btn.action)}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
