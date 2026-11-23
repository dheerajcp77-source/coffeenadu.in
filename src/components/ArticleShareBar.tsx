import { useEffect, useRef, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { getKannadaLocationLabel } from '../constants/newsData';
import type { NewsArticle } from '../types/news';
import { stripRichTextToPlainText } from '../utils/richText';
import { buildArticlePublicUrl } from '../utils/slug';

interface ArticleShareBarProps {
  article: NewsArticle;
  compact?: boolean;
  variant?: 'light' | 'dark';
}

export const SHARE_PROMO_FOOTER = [
  '📰 *ಕೊಪ್ಪದ ಎಲ್ಲಾ ಸ್ಥಳೀಯ ಸುದ್ದಿಗಳಿಗಾಗಿ!*',
  '',
  'ಪ್ರತಿದಿನದ ಸುದ್ದಿ, ಬಸ್ ಸಮಯ, ಕಾರ್ಯಕ್ರಮಗಳು ಮತ್ತು ಪ್ರಮುಖ ಮಾಹಿತಿಗಾಗಿ ನಮ್ಮ ವೆಬ್ಸೈಟ್ಗೆ ಭೇಟಿ ನೀಡಿ.',
  '',
  '📲 *ಈ ಸುದ್ದಿಯನ್ನು ನಿಮ್ಮ ಸ್ನೇಹಿತರು, ಕುಟುಂಬದವರು ಹಾಗೂ ಇತರ WhatsApp ಗ್ರೂಪ್ಗಳಲ್ಲಿ ಶೇರ್ ಮಾಡಿ.*',
].join('\n');

function buildArticleUrl(articleId: string): string {
  return buildArticlePublicUrl(articleId);
}

function buildShareText(article: NewsArticle): string {
  const url = buildArticleUrl(article.id);
  const plainTitle = stripRichTextToPlainText(article.titleKannada);
  return `${plainTitle}\n\n📍 ${getKannadaLocationLabel(article.location)} · Coffeenadu News\n${url}\n\n${SHARE_PROMO_FOOTER}`;
}

export function ArticleShareBar({
  article,
  compact = false,
  variant = 'light',
}: ArticleShareBarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sharedFeedback, setSharedFeedback] = useState<string>('');
  const [showFallbackMenu, setShowFallbackMenu] = useState(false);

  useEffect(() => {
    if (!showFallbackMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowFallbackMenu(false);
      }
    };
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, [showFallbackMenu]);

  const plainTitle = stripRichTextToPlainText(article.titleKannada);
  const articleUrl = buildArticleUrl(article.id);
  const fullShareText = buildShareText(article);
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(fullShareText)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(articleUrl)}&text=${encodeURIComponent(
    `${plainTitle} — Coffeenadu News (${getKannadaLocationLabel(article.location)})\n\n${SHARE_PROMO_FOOTER}`
  )}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}&quote=${encodeURIComponent(
    `${plainTitle}\n\n${SHARE_PROMO_FOOTER}`
  )}`;

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${plainTitle} — Coffeenadu News`,
          text: fullShareText,
        });
        setSharedFeedback('Shared');
        window.setTimeout(() => setSharedFeedback(''), 2000);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }
    setShowFallbackMenu((prev) => !prev);
  };

  const stopProp = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
  };

  const isDark = variant === 'dark';

  if (compact) {
    return (
      <div ref={containerRef} className="relative inline-flex items-center gap-1.5" onClick={stopProp}>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stopProp}
          aria-label="Share on WhatsApp"
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
            isDark
              ? 'bg-emerald-500 text-white hover:bg-emerald-400'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
          <span>WhatsApp</span>
        </a>

        <button
          type="button"
          onClick={handleNativeShare}
          onKeyDown={stopProp}
          aria-label="Share to other apps"
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            isDark
              ? 'bg-white/15 text-white hover:bg-white/25'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {sharedFeedback ? (
            <>
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{sharedFeedback}</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Share</span>
            </>
          )}
        </button>

        {showFallbackMenu && (
          <div
            onClick={stopProp}
            className="absolute right-0 bottom-full mb-1.5 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5 flex flex-col min-w-[140px] text-xs text-slate-800"
          >
            <a
              href={telegramHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowFallbackMenu(false)}
              className="px-2.5 py-1.5 rounded hover:bg-slate-100 font-medium text-left"
            >
              Telegram
            </a>
            <a
              href={facebookHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowFallbackMenu(false)}
              className="px-2.5 py-1.5 rounded hover:bg-slate-100 font-medium text-left"
            >
              Facebook
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-2" onClick={stopProp}>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-md transition-colors min-h-[38px]"
      >
        <WhatsAppIcon className="w-4 h-4 shrink-0" />
        <span>Share on WhatsApp</span>
      </a>

      <button
        type="button"
        onClick={handleNativeShare}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer min-h-[38px]"
      >
        {sharedFeedback ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            <span>{sharedFeedback}</span>
          </>
        ) : (
          <>
            <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>More Apps</span>
          </>
        )}
      </button>

      {showFallbackMenu && (
        <div className="flex items-center gap-1.5">
          <a
            href={telegramHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setShowFallbackMenu(false)}
            className="px-3 py-2 text-xs font-semibold text-sky-900 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-md transition-colors min-h-[38px] inline-flex items-center"
          >
            Telegram
          </a>
          <a
            href={facebookHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setShowFallbackMenu(false)}
            className="px-3 py-2 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-md transition-colors min-h-[38px] inline-flex items-center"
          >
            Facebook
          </a>
        </div>
      )}
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
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
