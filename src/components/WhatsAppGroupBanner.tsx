import { ArrowUpRight } from 'lucide-react';

export const COFFEENADU_WHATSAPP_COMMUNITY_URL =
  'https://chat.whatsapp.com/J4eAfuE5m24H73AER4vOxc';

/** Backwards-compatible export alias */
export const COFFEENADU_WHATSAPP_GROUP_URL = COFFEENADU_WHATSAPP_COMMUNITY_URL;

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.766.469 3.484 1.344 5l-1.406 5.156 5.281-1.375c1.469.797 3.109 1.219 4.75 1.219 5.516 0 9.969-4.453 9.969-9.969S17.547 2 12.031 2zm5.813 14.125c-.25.703-1.438 1.344-2 1.422-.516.078-1.172.109-1.891-.125-.438-.141-1-.328-1.719-.641-3.031-1.313-5-4.375-5.156-4.578-.156-.203-1.234-1.641-1.234-3.125s.781-2.219 1.063-2.516c.281-.297.609-.375.813-.375s.406 0 .578.016c.188.016.438-.078.688.516.25.609.859 2.094.938 2.25.078.156.125.344.031.547-.094.203-.141.328-.281.5s-.297.391-.422.516c-.141.141-.297.297-.125.594.172.297.766 1.266 1.641 2.047 1.125 1 2.078 1.313 2.375 1.469.297.156.469.125.641-.078.172-.203.75-.875.953-1.172.203-.297.406-.25.672-.156.266.094 1.703.813 2 .953.297.141.484.219.563.344.078.125.078.734-.172 1.438z" />
    </svg>
  );
}

interface WhatsAppGroupBannerProps {
  variant?: 'top-bar' | 'card' | 'inline-news';
}

export function WhatsAppGroupBanner({ variant = 'card' }: WhatsAppGroupBannerProps) {
  if (variant === 'top-bar') {
    return (
      <div className="bg-[#181512] text-[#FBF9F5] border-b border-[#D4A238]/30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#D4A238] text-[#181512] shrink-0">
              <WhatsAppIcon className="w-3.5 h-3.5" />
            </span>
            <p className="text-[11px] sm:text-xs font-medium leading-snug text-[#F3ECE0]">
              <span className="font-semibold text-white">Join our WhatsApp Community</span>
              <span className="mx-1.5 text-[#D4A238]" aria-hidden="true">·</span>
              <span className="font-kannada text-[#EED9A4]">
                ನಮ್ಮ ವಾಟ್ಸಾಪ್ ಸಮುದಾಯಕ್ಕೆ ಸೇರಿ
              </span>
            </p>
          </div>

          <a
            href={COFFEENADU_WHATSAPP_COMMUNITY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] sm:text-xs font-bold text-[#181512] bg-gradient-to-r from-[#D4A238] to-[#E6BC5C] hover:from-[#E0B148] hover:to-[#F0CA70] rounded-md transition-colors whitespace-nowrap shrink-0 shadow-2xs"
          >
            <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Join our WhatsApp Community</span>
            <span className="font-kannada font-semibold hidden sm:inline">· ಸೇರಿ</span>
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>
      </div>
    );
  }

  if (variant === 'inline-news') {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="mt-2 pt-2 border-t border-[#EFE8D8] dark:border-[#2E2922] flex flex-wrap items-center justify-between gap-2"
      >
        <a
          href={COFFEENADU_WHATSAPP_COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-[#926710] dark:text-[#E2B44B] hover:text-[#724E09] dark:hover:text-[#F0CA70] transition-colors group/wa"
        >
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#B8861B] dark:bg-[#D4A238] text-white dark:text-[#181512] shrink-0">
            <WhatsAppIcon className="w-3 h-3" />
          </span>
          <span className="group-hover/wa:underline">
            Join our WhatsApp Community
          </span>
          <span className="text-[#B8AD9E] dark:text-[#6E655A]" aria-hidden="true">·</span>
          <span className="font-kannada text-[#7C560B] dark:text-[#EED9A4] group-hover/wa:underline">
            ನಮ್ಮ ವಾಟ್ಸಾಪ್ ಸಮುದಾಯಕ್ಕೆ ಸೇರಿ
          </span>
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-[#926710] dark:text-[#E2B44B]" aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <section
      aria-label="Join our WhatsApp Community"
      className="bg-gradient-to-br from-[#FBF6E9] to-[#F5EBD2] dark:from-[#1D1914] dark:to-[#171410] border border-[#DFC996] dark:border-[#3D3322] rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#B8861B] to-[#D4A238] text-white shrink-0 mt-0.5 shadow-2xs">
          <WhatsAppIcon className="w-5 h-5" />
        </span>
        <div className="space-y-1 min-w-0">
          <h2 className="text-sm sm:text-base font-extrabold text-[#1C1917] dark:text-[#FBF9F5] leading-snug">
            Join our WhatsApp Community
          </h2>
          <p className="font-kannada text-sm font-bold text-[#8C620E] dark:text-[#E5BC5E] leading-snug">
            ನಮ್ಮ ವಾಟ್ಸಾಪ್ ಸಮುದಾಯಕ್ಕೆ ಸೇರಿ
          </p>
          <p className="text-xs text-[#574E44] dark:text-[#C5BBA9] leading-relaxed">
            Get instant Koppa Taluk &amp; Malnad news updates directly on WhatsApp.{' '}
            <span className="font-kannada text-[#3E3730] dark:text-[#DDD4C4]">
              ಕೊಪ್ಪ ತಾಲೂಕು ಮತ್ತು ಮಲೆನಾಡಿನ ತಾಜಾ ಸುದ್ದಿ ಹಾಗೂ ಪ್ರಮುಖ ಮಾಹಿತಿಗಳನ್ನು ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ತಕ್ಷಣ ಪಡೆಯಿರಿ.
            </span>
          </p>
        </div>
      </div>

      <a
        href={COFFEENADU_WHATSAPP_COMMUNITY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-[#181512] bg-gradient-to-r from-[#D4A238] to-[#E6BC5C] hover:from-[#C5932B] hover:to-[#DEB04B] rounded-xl transition-colors min-h-[42px] shadow-2xs"
      >
        <WhatsAppIcon className="w-4 h-4 shrink-0" />
        <span>Join our WhatsApp Community</span>
        <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
      </a>
    </section>
  );
}
