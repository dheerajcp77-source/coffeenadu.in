import { ArrowUpRight } from 'lucide-react';

export const COFFEENADU_WHATSAPP_GROUP_URL =
  'https://chat.whatsapp.com/Cb9NTGQ0uG41hUdVkH9FdY?s=sh&p=a&mlu=4&ilr=4';

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
      <div className="bg-[#0B2A1E] text-white border-b border-emerald-800/70">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#16A34A] text-white shrink-0">
              <WhatsAppIcon className="w-3.5 h-3.5" />
            </span>
            <p className="text-[11px] sm:text-xs font-medium leading-snug text-emerald-50">
              <span className="font-semibold text-white">Join Coffeenadu News WhatsApp Group</span>
              <span className="mx-1.5 text-emerald-400" aria-hidden="true">·</span>
              <span className="font-kannada text-emerald-100">
                ಕಾಫಿನಾಡು ನ್ಯೂಸ್ ವಾಟ್ಸಾಪ್ ಗುಂಪಿಗೆ ಸೇರಿ
              </span>
            </p>
          </div>

          <a
            href={COFFEENADU_WHATSAPP_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] sm:text-xs font-bold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Join Group</span>
            <span className="font-kannada font-semibold">· ಸೇರಿ</span>
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
        className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
      >
        <a
          href={COFFEENADU_WHATSAPP_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-[#176B4A] dark:text-emerald-400 hover:text-emerald-950 dark:hover:text-emerald-300 transition-colors group/wa"
        >
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#16A34A] text-white shrink-0">
            <WhatsAppIcon className="w-3 h-3" />
          </span>
          <span className="group-hover/wa:underline">
            Join Coffeenadu News WhatsApp Group
          </span>
          <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">·</span>
          <span className="font-kannada text-[#176B4A] dark:text-emerald-300 group-hover/wa:underline">
            ಕಾಫಿನಾಡು ನ್ಯೂಸ್ ವಾಟ್ಸಾಪ್ ಗುಂಪಿಗೆ ಸೇರಿ
          </span>
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-[#176B4A] dark:text-emerald-400" aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <section
      aria-label="Join Coffeenadu News WhatsApp Group"
      className="bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#16A34A] text-white shrink-0 mt-0.5">
          <WhatsAppIcon className="w-5 h-5" />
        </span>
        <div className="space-y-1 min-w-0">
          <h2 className="text-sm sm:text-base font-extrabold text-emerald-950 dark:text-emerald-100 leading-snug">
            Join Coffeenadu News WhatsApp Group
          </h2>
          <p className="font-kannada text-sm font-bold text-emerald-900 dark:text-emerald-300 leading-snug">
            ಕಾಫಿನಾಡು ನ್ಯೂಸ್ ವಾಟ್ಸಾಪ್ ಗುಂಪಿಗೆ ಸೇರಿ
          </p>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            Get instant Koppa Taluk &amp; Malnad news updates directly on WhatsApp.{' '}
            <span className="font-kannada text-slate-800 dark:text-slate-200">
              ಕೊಪ್ಪ ತಾಲೂಕು ಮತ್ತು ಮಲೆನಾಡಿನ ತಾಜಾ ಸುದ್ದಿ ಹಾಗೂ ಪ್ರಮುಖ ಮಾಹಿತಿಗಳನ್ನು ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ತಕ್ಷಣ ಪಡೆಯಿರಿ.
            </span>
          </p>
        </div>
      </div>

      <a
        href={COFFEENADU_WHATSAPP_GROUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-[#176B4A] hover:bg-[#13593D] rounded-lg transition-colors min-h-[42px]"
      >
        <WhatsAppIcon className="w-4 h-4 shrink-0" />
        <span>Join WhatsApp Group</span>
        <span className="font-kannada">· ಗುಂಪಿಗೆ ಸೇರಿ</span>
        <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
      </a>
    </section>
  );
}
