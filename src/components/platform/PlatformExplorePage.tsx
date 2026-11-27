import React from 'react';
import { ArrowLeft, ArrowRight, Compass } from 'lucide-react';
import { PLATFORM_MODULES } from '../../constants/platformCatalog';
import type { PlatformLanguage, PlatformModuleId } from '../../types/platform';
import { pickLangText } from '../../utils/platformHelpers';
import { PlatformIcon } from './PlatformIcon';

interface PlatformExplorePageProps {
  lang: PlatformLanguage;
  moduleCounts: Record<string, number>;
  articleCount: number;
  eventCount: number;
  onNavigateModule: (modId: PlatformModuleId) => void;
  onBackHome: () => void;
}

const GROUPS: Array<{
  id: 'core' | 'commerce' | 'civic' | 'life';
  titleKn: string;
  titleEn: string;
}> = [
  { id: 'core', titleKn: 'ದೈನಂದಿನ ಮಲೆನಾಡು ಮಾಹಿತಿ', titleEn: 'Daily Malnad Essentials' },
  { id: 'commerce', titleKn: 'ವ್ಯಾಪಾರ, ಉದ್ಯೋಗ ಮತ್ತು ಮಾರುಕಟ್ಟೆ', titleEn: 'Business, Jobs & Marketplace' },
  { id: 'civic', titleKn: 'ಸರ್ಕಾರಿ, ಆರೋಗ್ಯ, ಶಿಕ್ಷಣ ಮತ್ತು ನಾಗರಿಕ ಸೇವೆಗಳು', titleEn: 'Civic, Health, Education & Govt' },
  { id: 'life', titleKn: 'ಪ್ರವಾಸೋದ್ಯಮ, ಉತ್ಸವ, ಆಟಗಳು ಮತ್ತು ಖಾತೆ', titleEn: 'Tourism, Events, Games & Account' },
];

export const PlatformExplorePage: React.FC<PlatformExplorePageProps> = ({
  lang,
  moduleCounts,
  articleCount,
  eventCount,
  onNavigateModule,
  onBackHome,
}) => {
  const getRealCountLabel = (id: PlatformModuleId): string => {
    if (id === 'news') return `${articleCount} ${pickLangText('ಸುದ್ದಿಗಳು', 'articles', lang)}`;
    if (id === 'events') return `${eventCount} ${pickLangText('ಕಾರ್ಯಕ್ರಮಗಳು', 'events', lang)}`;
    if (id === 'transport') return pickLangText('ಲೈವ್ ವೇಳಾಪಟ್ಟಿ', 'Live schedules', lang);
    if (id === 'account') return pickLangText('ನಿಮ್ಮ ಉಳಿಸಿದವು', 'Saved & submissions', lang);
    const count = moduleCounts[id] ?? 0;
    if (id === 'games') return `${count} ${pickLangText('ಕ್ವಿಜ್‌ಗಳು', 'quizzes', lang)}`;
    if (id === 'weather') return `${count} ${pickLangText('ದಾಖಲೆಗಳು', 'logs', lang)}`;
    return `${count} ${pickLangText('ದಾಖಲೆಗಳು', count === 1 ? 'listing' : 'listings', lang)}`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{pickLangText('ಮುಖಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ', 'Back to Home', lang)}</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#176B4A]/10 dark:bg-[#176B4A]/25 text-[#176B4A] dark:text-emerald-300 flex items-center justify-center">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-kannada text-xl sm:text-2xl font-extrabold text-[#10243D] dark:text-white">
              {pickLangText('ಕಾಫಿನಾಡು ಮಲೆನಾಡು ಸೇವೆಗಳು (ಎಲ್ಲಾ 22 ವಿಭಾಗಗಳು)', 'Explore All 22 Coffeenadu Malnad Services', lang)}
            </h1>
            <p className="text-xs sm:text-sm text-[#5A677A] dark:text-slate-300 font-kannada">
              {pickLangText(
                'ಕೊಪ್ಪ, ಜಯಪುರ, ಹರಿಹರಪುರ, ಶೃಂಗೇರಿ, ಬಾಳೆಹೊನ್ನೂರು ಮತ್ತು ಎನ್.ಆರ್. ಪುರದ ಸಮಗ್ರ ಡಿಜಿಟಲ್ ವೇದಿಕೆ',
                'Complete regional ecosystem for Koppa, Jayapura, Hariharapura, Sringeri, Balehonnur & N.R. Pura',
                lang
              )}
            </p>
          </div>
        </div>
      </div>

      {GROUPS.map((group) => {
        const items = PLATFORM_MODULES.filter((m) => m.group === group.id);
        return (
          <section key={group.id} className="space-y-3">
            <h2 className="font-kannada text-base sm:text-lg font-extrabold text-[#10243D] dark:text-white px-1">
              {pickLangText(group.titleKn, group.titleEn, lang)}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {items.map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => onNavigateModule(mod.id)}
                  className="text-left bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 hover:border-[#176B4A] dark:hover:border-[#D9A441] rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F3F6F8] dark:bg-slate-800 text-[#176B4A] dark:text-[#D9A441] group-hover:bg-[#176B4A] group-hover:text-white transition-colors flex items-center justify-center shrink-0">
                      <PlatformIcon icon={mod.icon} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-kannada text-sm sm:text-base font-bold text-[#10243D] dark:text-white group-hover:text-[#176B4A] dark:group-hover:text-[#D9A441]">
                        {pickLangText(mod.titleKn, mod.titleEn, lang)}
                      </h3>
                      <p className="text-xs text-[#5A677A] dark:text-slate-400 font-kannada mt-1 line-clamp-2">
                        {pickLangText(mod.shortDescKn, mod.shortDescEn, lang)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
                    <span>{getRealCountLabel(mod.id)}</span>
                    <span className="inline-flex items-center gap-1 text-[#176B4A] dark:text-[#D9A441] font-bold">
                      {pickLangText('ತೆರೆಯಿರಿ', 'Open', lang)}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
