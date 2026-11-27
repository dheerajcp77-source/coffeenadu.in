import React, { useMemo } from 'react';
import { ArrowRight, Compass, MapPin } from 'lucide-react';
import { PLATFORM_MODULE_MAP } from '../../constants/platformCatalog';
import type {
  PlatformLanguage,
  PlatformListing,
  PlatformModuleId,
} from '../../types/platform';
import { getContextualPlatformRecommendations, pickLangText } from '../../utils/platformHelpers';
import { PlatformIcon } from './PlatformIcon';

interface ArticleEcosystemEngagementProps {
  articleLocation?: string;
  articleCategory?: string;
  lang: PlatformLanguage;
  allListings: PlatformListing[];
  onNavigateModule: (modId: PlatformModuleId, listingId?: string) => void;
  onExploreAll: () => void;
}

const POST_ARTICLE_DESTINATIONS: Array<{
  module: PlatformModuleId;
  labelKn: string;
  labelEn: string;
  subKn: string;
  subEn: string;
}> = [
  {
    module: 'businesses',
    labelKn: 'ಸಮೀಪದ ವ್ಯಾಪಾರಗಳು',
    labelEn: 'Find Nearby Businesses',
    subKn: 'ಅಂಗಡಿ, ಹೋಟೆಲ್, ಮೆಡಿಕಲ್',
    subEn: 'Shops, hotels & pharmacies',
  },
  {
    module: 'jobs',
    labelKn: 'ಸ್ಥಳೀಯ ಉದ್ಯೋಗಗಳು',
    labelEn: 'Browse Local Jobs',
    subKn: 'ಸರ್ಕಾರಿ & ಖಾಸಗಿ ಹುದ್ದೆಗಳು',
    subEn: 'Govt & Malnad openings',
  },
  {
    module: 'marketplace',
    labelKn: 'ಖರೀದಿ ಮತ್ತು ಮಾರಾಟ',
    labelEn: 'Buy & Sell Products',
    subKn: 'ನೇರ WhatsApp ವ್ಯವಹಾರ',
    subEn: 'Direct local listings',
  },
  {
    module: 'transport',
    labelKn: 'ಬಸ್ ಸಮಯ ಪರಿಶೀಲಿಸಿ',
    labelEn: 'Check Bus Timings',
    subKn: 'ಕೊಪ್ಪ, ಶೃಂಗೇರಿ, ಶಿವಮೊಗ್ಗ',
    subEn: 'KSRTC & Private routes',
  },
  {
    module: 'health',
    labelKn: 'ಆಸ್ಪತ್ರೆ ಮತ್ತು ವೈದ್ಯರು',
    labelEn: 'Find Hospitals',
    subKn: 'ಆಸ್ಪತ್ರೆ & 108 ತುರ್ತು ಸೇವೆ',
    subEn: 'Clinics & 24x7 emergency',
  },
  {
    module: 'tourism',
    labelKn: 'ಪ್ರವಾಸಿ ತಾಣಗಳು',
    labelEn: 'Explore Tourist Places',
    subKn: 'ದೇವಾಲಯ, ಜಲಪಾತ, ಬೆಟ್ಟ',
    subEn: 'Temples, hills & stays',
  },
  {
    module: 'events',
    labelKn: 'ಮುಂಬರುವ ಕಾರ್ಯಕ್ರಮಗಳು',
    labelEn: 'View Upcoming Events',
    subKn: 'ಜಾತ್ರೆ, ಯಕ್ಷಗಾನ, ಸಭೆ',
    subEn: 'Festivals & programs',
  },
  {
    module: 'agriculture',
    labelKn: 'ಕೃಷಿ ಮತ್ತು ತೋಟಗಾರಿಕೆ',
    labelEn: 'Agricultural Services',
    subKn: 'ಕಾಫಿ, ಅಡಿಕೆ & ಯೋಜನೆಗಳು',
    subEn: 'Coffee, arecanut & guides',
  },
];

export const ArticleEcosystemEngagement: React.FC<ArticleEcosystemEngagementProps> = ({
  articleLocation,
  articleCategory,
  lang,
  allListings,
  onNavigateModule,
  onExploreAll,
}) => {
  const recommendations = useMemo(
    () => getContextualPlatformRecommendations(articleLocation, articleCategory, allListings),
    [articleLocation, articleCategory, allListings]
  );

  const combinedContextListings = useMemo(() => {
    const merged: PlatformListing[] = [
      ...recommendations.businesses.slice(0, 2),
      ...recommendations.jobs.slice(0, 2),
      ...recommendations.marketplace.slice(0, 2),
      ...recommendations.services.slice(0, 2),
      ...recommendations.schemesAndHealth.slice(0, 4),
    ];
    return merged.slice(0, 6);
  }, [recommendations]);

  return (
    <section
      aria-label="Malnad Services Discovery"
      className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-6"
    >
      {/* Mandatory Kannada Post-Article Prompt */}
      <div className="bg-[#F6F9F7] dark:bg-[#0F2032] border border-[#176B4A]/20 dark:border-slate-700 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-kannada text-lg sm:text-xl font-extrabold text-[#10243D] dark:text-white">
              ಮಲೆನಾಡಿನಲ್ಲಿ ನಿಮಗೆ ಇನ್ನೇನು ಬೇಕು?
            </h2>
            <p className="text-xs text-[#5A677A] dark:text-slate-300 mt-0.5">
              {pickLangText(
                `${articleLocation || 'ಕೊಪ್ಪ'} ಮತ್ತು ಸುತ್ತಮುತ್ತಲಿನ ಅಗತ್ಯ ಸೇವೆಗಳನ್ನು ತಕ್ಷಣ ತೆರೆಯಿರಿ`,
                `Explore local Malnad services near ${articleLocation || 'Koppa'}`,
                lang
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onExploreAll}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{pickLangText('ಎಲ್ಲಾ 22 ಸೇವೆಗಳು', 'Explore All 22 Services', lang)}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {POST_ARTICLE_DESTINATIONS.map((dest) => {
            const mod = PLATFORM_MODULE_MAP[dest.module];
            return (
              <button
                key={dest.module}
                type="button"
                onClick={() => onNavigateModule(dest.module)}
                className="text-left bg-white dark:bg-[#111F33] border border-slate-200/80 dark:border-slate-700/80 hover:border-[#176B4A] dark:hover:border-[#D9A441] rounded-xl p-3 transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#176B4A]/10 dark:bg-[#176B4A]/25 text-[#176B4A] dark:text-emerald-300 flex items-center justify-center mb-2">
                  <PlatformIcon icon={mod.icon} className="w-4 h-4" />
                </div>
                <div className="font-kannada text-xs font-bold text-[#10243D] dark:text-white group-hover:text-[#176B4A] dark:group-hover:text-[#D9A441] leading-snug">
                  {pickLangText(dest.labelKn, dest.labelEn, lang)}
                </div>
                <div className="font-kannada text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5 line-clamp-1">
                  {pickLangText(dest.subKn, dest.subEn, lang)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Location-Aware Contextual Recommendations from Live Platform Store */}
      {combinedContextListings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-kannada text-base font-extrabold text-[#10243D] dark:text-white">
              {pickLangText(
                `${articleLocation || 'ಮಲೆನಾಡು'} ಭಾಗದ ಉಪಯುಕ್ತ ಮಾಹಿತಿ ಮತ್ತು ಸೇವೆಗಳು`,
                `Recommended Services & Info near ${articleLocation || 'Malnad'}`,
                lang
              )}
            </h3>
            <button
              type="button"
              onClick={onExploreAll}
              className="text-xs font-bold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <span>{pickLangText('ಇನ್ನಷ್ಟು', 'More', lang)}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {combinedContextListings.map((item) => {
              const mod = PLATFORM_MODULE_MAP[item.module];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigateModule(item.module, item.id)}
                  className="text-left bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 hover:border-[#176B4A] rounded-xl p-3.5 transition-colors cursor-pointer space-y-1.5"
                >
                  <div className="text-[11px] font-semibold text-[#176B4A] dark:text-[#D9A441] flex items-center gap-1.5">
                    <span>{pickLangText(mod.titleKn, mod.titleEn, lang)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-0.5 text-slate-500 dark:text-slate-400">
                      <MapPin className="w-3 h-3" />
                      {item.location}
                    </span>
                  </div>
                  <div className="font-kannada text-sm font-bold text-[#10243D] dark:text-white line-clamp-2">
                    {lang === 'en' && item.titleEn ? item.titleEn : item.title}
                  </div>
                  <p className="font-kannada text-xs text-[#5A677A] dark:text-slate-400 line-clamp-2">
                    {item.summary}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
