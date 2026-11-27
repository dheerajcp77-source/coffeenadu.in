import { MessageCircle, Megaphone, Shield, X } from 'lucide-react';
import { COFFEENADU_WHATSAPP_GROUP_URL } from './WhatsAppGroupBanner';

export type SiteInfoPageKey = 'about' | 'contact' | 'privacy' | 'terms' | 'advertise';

interface SiteInfoModalProps {
  page: SiteInfoPageKey | null;
  onClose: () => void;
  onOpenMessageAdmin: () => void;
  onOpenLocalAds: () => void;
}

const CONTENT: Record<
  SiteInfoPageKey,
  { title: string; titleKn: string; paragraphs: string[] }
> = {
  about: {
    title: 'About Coffeenadu News',
    titleKn: 'ಕಾಫಿನಾಡು ನ್ಯೂಸ್ ಬಗ್ಗೆ',
    paragraphs: [
      'Coffeenadu News (coffeenadu.in) is Koppa Taluk and Malnad’s dedicated Kannada digital news platform covering local civic developments, coffee and arecanut agriculture updates, education, health, and cultural programs.',
      'Published by the Coffeenadu Editorial Desk and developed by Dheeraj, the platform connects readers across Koppa, Jayapura, Hariharapura, Basarikatte, Kudregundi, Megur, Narve, Sringeri, N.R. Pura, and Chikkamagaluru.',
    ],
  },
  contact: {
    title: 'Contact Editorial Desk',
    titleKn: 'ಸಂಪಾದಕೀಯ ವಿಭಾಗವನ್ನು ಸಂಪರ್ಕಿಸಿ',
    paragraphs: [
      'Have a verified local news tip, event announcement, public grievance, or correction request for Koppa Taluk?',
      'Reach the Coffeenadu editorial team directly using Message Admin below or join our official Coffeenadu News WhatsApp Community for updates.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    titleKn: 'ಗೌಪ್ಯತಾ ನೀತಿ',
    paragraphs: [
      'Reader bookmarks, reading history, theme preferences, and font settings are stored locally on your own device browser storage and are never sold to third parties.',
      'Optional newsletter or breaking-news alerts store only the email address or WhatsApp mobile number you explicitly submit with consent, and can be removed anytime.',
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    titleKn: 'ನಿಯಮಗಳು ಮತ್ತು ನಿಬಂಧನೆಗಳು',
    paragraphs: [
      'All news photography, Kannada reports, and Coffeenadu editorial content published on coffeenadu.in are protected copyright material. Sharing official article links via WhatsApp, Facebook, Telegram, and X is encouraged with proper attribution.',
      'Local advertisements and bus timing schedules are published for community convenience; please verify critical travel or business details directly with operators when required.',
    ],
  },
  advertise: {
    title: 'Advertise With Coffeenadu',
    titleKn: 'ಜಾಹೀರಾತು ನೀಡಿ',
    paragraphs: [
      'Promote your Koppa, Sringeri, Jayapura, N.R. Pura, or Chikkamagaluru business to active Malnad readers through Coffeenadu Local Advertisements.',
      'Browse active local business listings or message our team directly to publish sponsored placements across homepage cards, article banners, and directory listings.',
    ],
  },
};

export function SiteInfoModal({
  page,
  onClose,
  onOpenMessageAdmin,
  onOpenLocalAds,
}: SiteInfoModalProps) {
  if (!page) return null;
  const info = CONTENT[page];

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-info-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F1E33] shadow-2xl overflow-hidden">
        <div className="bg-[#10243D] text-white px-5 py-4 flex items-center justify-between">
          <div>
            <h2 id="site-info-modal-title" className="text-base font-bold">
              {info.title}
            </h2>
            <p className="font-kannada text-xs text-slate-300">{info.titleKn}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm text-[#17263A] dark:text-slate-200 leading-relaxed">
          {info.paragraphs.map((p, idx) => (
            <p key={idx}>{p}</p>
          ))}

          <div className="pt-3 flex flex-wrap items-center gap-2.5 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenMessageAdmin();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1C1917] dark:bg-[#D4A238] text-white dark:text-[#181512] px-3.5 py-2 text-xs font-bold cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              Message Admin
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenLocalAds();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4DAC6] dark:border-[#362F26] px-3.5 py-2 text-xs font-bold text-[#1C1917] dark:text-[#FBF9F5] cursor-pointer"
            >
              <Megaphone className="w-3.5 h-3.5 text-[#C5932B]" />
              Local Ads
            </button>
            <a
              href={COFFEENADU_WHATSAPP_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#D4A238] to-[#E6BC5C] text-[#181512] px-3.5 py-2 text-xs font-bold"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Join our WhatsApp Community
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
