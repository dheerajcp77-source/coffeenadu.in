import React from 'react';
import { ArrowLeft, CloudRain, Droplets, Info, MapPin, Thermometer } from 'lucide-react';
import type {
  LocalityOption,
  PlatformLanguage,
  WeatherConfig,
  WeatherRainfallRecord,
} from '../../types/platform';
import { matchesLocality, pickLangText } from '../../utils/platformHelpers';

interface PlatformWeatherPageProps {
  lang: PlatformLanguage;
  selectedLocation: string;
  localities: LocalityOption[];
  weatherConfig: WeatherConfig;
  weatherLogs: WeatherRainfallRecord[];
  onSelectLocation: (loc: string) => void;
  onBackHome: () => void;
}

export const PlatformWeatherPage: React.FC<PlatformWeatherPageProps> = ({
  lang,
  selectedLocation,
  localities,
  weatherConfig,
  weatherLogs,
  onSelectLocation,
  onBackHome,
}) => {
  const filtered = weatherLogs.filter((w) => matchesLocality(w.location, selectedLocation));

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

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 flex items-center justify-center">
              <CloudRain className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-kannada text-xl sm:text-2xl font-extrabold text-[#10243D] dark:text-white">
                {pickLangText('ಮಲೆನಾಡು ಹವಾಮಾನ ಮತ್ತು ಮಳೆ ವರದಿ', 'Malnad Weather & Rainfall', lang)}
              </h1>
              <p className="text-xs sm:text-sm text-[#5A677A] dark:text-slate-300 font-kannada">
                {pickLangText(
                  'ಕೊಪ್ಪ, ಜಯಪುರ, ಶೃಂಗೇರಿ, ಬಾಳೆಹೊನ್ನೂರು ಮತ್ತು ಎನ್.ಆರ್. ಪುರ ಮಳೆ ಮಾಪನ ದಾಖಲೆಗಳು',
                  'Verified Malnad rainfall readings, monsoon advisories & station logs',
                  lang
                )}
              </p>
            </div>
          </div>

          <select
            value={selectedLocation}
            onChange={(e) => onSelectLocation(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-sm font-medium text-[#10243D] dark:text-white"
          >
            <option value="all">{pickLangText('ಎಲ್ಲಾ ಮಲೆನಾಡು ಕೇಂದ್ರಗಳು', 'All Stations', lang)}</option>
            {localities.map((l) => (
              <option key={l.id} value={l.nameEn}>
                {l.nameEn} ({l.nameKn})
              </option>
            ))}
          </select>
        </div>

        {/* Honest External API Configuration Banner — zero fabricated live readings */}
        <div className="mt-5 p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-100 space-y-1 font-kannada">
            <p className="font-bold">
              {weatherConfig.externalApiConfigured
                ? weatherConfig.providerName
                : pickLangText(
                    'ನೇರ ಹವಾಮಾನ API ಸ್ಥಿತಿ: ಸ್ಥಳೀಯ ಪರಿಶೀಲಿತ ದಾಖಲೆ ಮೋಡ್',
                    'Live Weather API Status: Verified Local Log Mode',
                    lang
                  )}
            </p>
            <p>{pickLangText(weatherConfig.sourceNoteKn, weatherConfig.sourceNoteEn, lang)}</p>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-2">
          <Droplets className="w-8 h-8 mx-auto text-sky-600 dark:text-sky-400" />
          <h2 className="font-kannada text-base font-bold text-[#10243D] dark:text-white">
            {pickLangText(
              'ಇಂದಿನ ಮಳೆ ಮಾಪನ ದಾಖಲೆ ಇನ್ನೂ ನಮೂದಾಗಿಲ್ಲ',
              'No rainfall station logs published yet for this filter',
              lang
            )}
          </h2>
          <p className="text-xs text-[#5A677A] dark:text-slate-400 max-w-lg mx-auto font-kannada">
            {pickLangText(
              'Coffeenadu ಸುಳ್ಳು ಹವಾಮಾನ ಅಂಕಿಅಂಶಗಳನ್ನು ತೋರಿಸುವುದಿಲ್ಲ. ಆಡ್ಮಿನ್ ಪ್ಯಾನೆಲ್‌ನಿಂದ ಅಧಿಕೃತ ಮಳೆ ದಾಖಲೆ ಪ್ರಕಟಿಸಿದ ತಕ್ಷಣ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.',
              'Coffeenadu never displays fabricated live weather numbers. As soon as verified rainfall logs are added via Admin Panel or an external Weather API key is connected, readings will appear here with source attribution.',
              lang
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((log) => (
            <div
              key={log.id}
              className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#10243D] dark:text-white">
                  <MapPin className="w-4 h-4 text-[#176B4A]" />
                  {log.location}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {log.dateYmd}
                </span>
              </div>

              <div className="flex items-baseline gap-4">
                <div>
                  <div className="text-2xl font-extrabold text-sky-700 dark:text-sky-300">
                    {log.rainfallMm} mm
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {pickLangText('ದಾಖಲಾದ ಮಳೆ', 'Recorded Rainfall', lang)}
                  </div>
                </div>
                {(log.tempMinC !== null || log.tempMaxC !== null) && (
                  <div className="inline-flex items-center gap-1 text-xs font-semibold text-[#10243D] dark:text-slate-200">
                    <Thermometer className="w-3.5 h-3.5 text-amber-600" />
                    <span>
                      {log.tempMinC ?? '—'}°C – {log.tempMaxC ?? '—'}°C
                    </span>
                  </div>
                )}
              </div>

              <p className="text-xs font-semibold text-[#10243D] dark:text-slate-200 font-kannada">
                {pickLangText(log.conditionKn, log.conditionEn, lang)}
              </p>

              {(log.advisoryKn || log.advisoryEn) && (
                <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-lg font-kannada">
                  {pickLangText(log.advisoryKn || '', log.advisoryEn || '', lang)}
                </p>
              )}

              <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                {pickLangText('ಮೂಲ:', 'Source:', lang)} {log.sourceAttribution}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
