import coffeeEstateImg from '../assets/images/coffee_arecanut_estate_1794709367051.jpg';
import crimeAlertImg from '../assets/images/crime_police_patrol_1794833449002.jpg';
import educationLibraryImg from '../assets/images/education_library_study_1794833645509.jpg';
import entertainmentStageImg from '../assets/images/entertainment_cinema_stage_1794833457980.jpg';
import generalNewsImg from '../assets/images/general_news_morning_1794833645570.jpg';
import healthMedicalImg from '../assets/images/health_hospital_care_1794833609245.jpg';
import koppaLandscapeImg from '../assets/images/koppa_town_landscape_1794709366123.jpg';
import malnadCultureImg from '../assets/images/malnad_cultural_heritage_1794709367996.jpg';
import malnadHillsImg from '../assets/images/malnad_hills_road_1794833446049.jpg';
import nationParliamentImg from '../assets/images/nation_parliament_flag_1794833641928.jpg';
import politicsAssemblyImg from '../assets/images/politics_assembly_podium_1794833641337.jpg';
import specialFeatureImg from '../assets/images/special_feature_ghats_1794833452939.jpg';
import sportsStadiumImg from '../assets/images/sports_stadium_match_1794833642170.jpg';
import stateCivicImg from '../assets/images/state_civic_architecture_1794833643485.jpg';
import tungaBridgeImg from '../assets/images/tunga_river_bridge_1794709366458.jpg';
import type {
  ImageKey,
  LocalBrief,
  MarketRate,
  NewsArticle,
  NewsCategory,
  PlaceOption,
} from '../types/news';

export { KOPPA_LOCATIONS, NEWS_CATEGORIES, SEED_ARTICLES } from './seedArticles';

export const KOPPA_PLACE_OPTIONS: PlaceOption[] = [
  {
    id: 'koppa',
    labelKn: 'ಕೊಪ್ಪ (Koppa)',
    labelEn: 'Koppa',
    aliases: ['koppa', 'koppa town', 'ಕೊಪ್ಪ', 'ಕೊಪ್ಪ ಪಟ್ಟಣ'],
  },
  {
    id: 'jayapura',
    labelKn: 'ಜಯಪುರ (Jayapura)',
    labelEn: 'Jayapura',
    aliases: ['jayapura', 'ಜಯಪುರ'],
  },
  {
    id: 'hariharapura',
    labelKn: 'ಹರಿಹರಪುರ (Hariharapura)',
    labelEn: 'Hariharapura',
    aliases: ['hariharapura', 'ಹರಿಹರಪುರ'],
  },
  {
    id: 'basarikatte',
    labelKn: 'ಬಸರೀಕಟ್ಟೆ (Basarikatte)',
    labelEn: 'Basarikatte',
    aliases: ['basarikatte', 'ಬಸರೀಕಟ್ಟೆ'],
  },
  {
    id: 'kudregundi',
    labelKn: 'ಕುದುರೆಗುಂಡಿ (Kudregundi)',
    labelEn: 'Kudregundi',
    aliases: ['kudregundi', 'ಕುದುರೆಗುಂಡಿ'],
  },
  {
    id: 'megur',
    labelKn: 'ಮೇಗೂರು (Megur)',
    labelEn: 'Megur',
    aliases: ['megur', 'ಮೇಗೂರು'],
  },
  {
    id: 'narve',
    labelKn: 'ನಾರ್ವೆ (Narve)',
    labelEn: 'Narve',
    aliases: ['narve', 'ನಾರ್ವೆ'],
  },
  {
    id: 'sringeri',
    labelKn: 'ಶೃಂಗೇರಿ (Sringeri)',
    labelEn: 'Sringeri',
    aliases: ['sringeri', 'ಶೃಂಗೇರಿ'],
  },
  {
    id: 'nrpura',
    labelKn: 'ಎನ್.ಆರ್. ಪುರ (N.R. Pura)',
    labelEn: 'N.R. Pura',
    aliases: ['n.r. pura', 'nr pura', 'narasimharajapura', 'ಎನ್.ಆರ್. ಪುರ', 'ನರಸಿಂಹರಾಜಪುರ'],
  },
  {
    id: 'chikkamagaluru',
    labelKn: 'ಚಿಕ್ಕಮಗಳೂರು (Chikkamagaluru)',
    labelEn: 'Chikkamagaluru',
    aliases: ['chikkamagaluru', 'chikmagalur', 'ಚಿಕ್ಕಮಗಳೂರು'],
  },
];

export const IMAGE_PRESETS: Array<{ key: ImageKey; label: string; src: string }> = [
  { key: 'none', label: 'Auto Section Preset', src: '' },
  { key: 'koppa-landscape', label: 'Koppa Town Landscape', src: koppaLandscapeImg },
  { key: 'malnad-hills', label: 'Malnad Hills & Road', src: malnadHillsImg },
  { key: 'coffee-estate', label: 'Coffee & Arecanut Estate', src: coffeeEstateImg },
  { key: 'health-medical', label: 'Health & Hospital', src: healthMedicalImg },
  { key: 'entertainment-stage', label: 'Entertainment & Stage', src: entertainmentStageImg },
  { key: 'crime-alert', label: 'Crime & Police', src: crimeAlertImg },
  { key: 'general-news', label: 'General Morning News', src: generalNewsImg },
  { key: 'politics-assembly', label: 'Politics & Assembly', src: politicsAssemblyImg },
  { key: 'sports-stadium', label: 'Sports & Stadium', src: sportsStadiumImg },
  { key: 'special-feature', label: 'Special Ghats Feature', src: specialFeatureImg },
  { key: 'state-civic', label: 'State & Civic', src: stateCivicImg },
  { key: 'nation-parliament', label: 'Nation & Parliament', src: nationParliamentImg },
  { key: 'tunga-bridge', label: 'Tunga River Bridge', src: tungaBridgeImg },
  { key: 'education-library', label: 'Education & Library', src: educationLibraryImg },
  { key: 'malnad-culture', label: 'Malnad Cultural Heritage', src: malnadCultureImg },
];

const IMAGE_KEY_TO_SRC: Record<Exclude<ImageKey, 'none'>, string> = {
  'koppa-landscape': koppaLandscapeImg,
  'malnad-hills': malnadHillsImg,
  'coffee-estate': coffeeEstateImg,
  'health-medical': healthMedicalImg,
  'entertainment-stage': entertainmentStageImg,
  'crime-alert': crimeAlertImg,
  'general-news': generalNewsImg,
  'politics-assembly': politicsAssemblyImg,
  'sports-stadium': sportsStadiumImg,
  'special-feature': specialFeatureImg,
  'state-civic': stateCivicImg,
  'nation-parliament': nationParliamentImg,
  'tunga-bridge': tungaBridgeImg,
  'education-library': educationLibraryImg,
  'malnad-culture': malnadCultureImg,
};

const CATEGORY_DEFAULT_IMAGE_KEY: Record<NewsCategory, Exclude<ImageKey, 'none'>> = {
  Local: 'koppa-landscape',
  Malnad: 'malnad-hills',
  Agriculture: 'coffee-estate',
  Health: 'health-medical',
  Entertainment: 'entertainment-stage',
  Crime: 'crime-alert',
  General: 'general-news',
  Politics: 'politics-assembly',
  Sports: 'sports-stadium',
  Special: 'special-feature',
  State: 'state-civic',
  Nation: 'nation-parliament',
  'Civic & Roads': 'tunga-bridge',
  Education: 'education-library',
  Culture: 'malnad-culture',
};

export function resolveArticleImage(
  article: Partial<NewsArticle> & Pick<NewsArticle, 'category'>,
  preferThumb = false
): string {
  if (preferThumb && article.imageThumbUrl?.trim()) {
    return article.imageThumbUrl.trim();
  }
  if (article.imageUrl?.trim()) {
    return article.imageUrl.trim();
  }
  if (article.imageKey && article.imageKey !== 'none' && IMAGE_KEY_TO_SRC[article.imageKey]) {
    return IMAGE_KEY_TO_SRC[article.imageKey];
  }
  return IMAGE_KEY_TO_SRC[CATEGORY_DEFAULT_IMAGE_KEY[article.category] || 'koppa-landscape'] || koppaLandscapeImg;
}

export function getKannadaLocationLabel(location: string): string {
  const trimmed = (location || '').trim();
  if (!trimmed) return KOPPA_PLACE_OPTIONS[0].labelKn;
  const lower = trimmed.toLowerCase();
  const matched = KOPPA_PLACE_OPTIONS.find(
    (place) =>
      place.labelKn.toLowerCase() === lower ||
      place.labelEn.toLowerCase() === lower ||
      place.id === lower ||
      place.aliases.some((alias) => alias.toLowerCase() === lower || lower.includes(alias.toLowerCase()))
  );
  return matched ? matched.labelKn : trimmed;
}

export function matchesSelectedLocation(articleLocation: string, selectedLocation: string): boolean {
  if (!selectedLocation || selectedLocation === 'All') return true;
  const normArticle = getKannadaLocationLabel(articleLocation).toLowerCase();
  const normSelected = getKannadaLocationLabel(selectedLocation).toLowerCase();
  if (normArticle === normSelected) return true;
  const rawLower = (articleLocation || '').trim().toLowerCase();
  const matchedPlace = KOPPA_PLACE_OPTIONS.find(
    (p) => p.labelKn.toLowerCase() === normSelected || p.labelEn.toLowerCase() === normSelected
  );
  if (matchedPlace) {
    return matchedPlace.aliases.some((alias) => rawLower.includes(alias.toLowerCase()));
  }
  return rawLower.includes(selectedLocation.toLowerCase());
}

export const KOPPA_BRIEFS: LocalBrief[] = [
  {
    id: 'brief-koppa-1',
    area: 'ಕೊಪ್ಪ ಪಟ್ಟಣ',
    timeLabel: 'ಇಂದು',
    textKannada:
      'ಕೊಪ್ಪ ಬಸ್ ನಿಲ್ದಾಣದಿಂದ ಶೃಂಗೇರಿ, ತೀರ್ಥಹಳ್ಳಿ ಹಾಗೂ ಚಿಕ್ಕಮಗಳೂರು ಮಾರ್ಗದ ಬಸ್ ವೇಳಾಪಟ್ಟಿ ಲಭ್ಯವಿದೆ.',
  },
  {
    id: 'brief-jayapura-2',
    area: 'ಜಯಪುರ',
    timeLabel: 'ಇಂದು',
    textKannada: 'ಕಾಫಿ ಹಾಗೂ ಅಡಿಕೆ ಮಾರುಕಟ್ಟೆ ದರ ವಿವರಗಳಿಗಾಗಿ ಎಪಿಎಂಸಿ ಪ್ರಕಟಣೆ ಗಮನಿಸಿ.',
  },
  {
    id: 'brief-hariharapura-3',
    area: 'ಹರಿಹರಪುರ',
    timeLabel: 'ಸ್ಥಳೀಯ',
    textKannada:
      'ತಾಲೂಕಿನ ಕಾರ್ಯಕ್ರಮಗಳು ಮತ್ತು ಸುದ್ದಿ ಮಾಹಿತಿಗಾಗಿ ನಮ್ಮ ವಾಟ್ಸಾಪ್ ಸಮುದಾಯಕ್ಕೆ ಸೇರಿ.',
  },
];

export const KOPPA_MARKET_RATES: MarketRate[] = [
  { commodity: 'Arabica Parchment', variety: '50 kg Bag Ref', pricePerQuintal: 26500, change: 250 },
  { commodity: 'Robusta Cherry', variety: 'Malnad Grade', pricePerQuintal: 14200, change: 150 },
  { commodity: 'Arecanut (Rashi)', variety: 'Koppa APMC', pricePerQuintal: 48500, change: -100 },
  { commodity: 'Black Pepper', variety: 'Malnad Garbled', pricePerQuintal: 64000, change: 300 },
];
