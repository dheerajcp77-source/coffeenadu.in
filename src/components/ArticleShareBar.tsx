import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { getKannadaLocationLabel } from '../constants/newsData';
import type { NewsArticle } from '../types/news';
import { buildKannadaArticleShareText, SHARE_PROMO_FOOTER } from '../utils/newsHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { buildArticlePublicUrl } from '../utils/slug';
import { trackPlatformEvent } from '../services/platformClient';

export { SHARE_PROMO_FOOTER };

interface ArticleShareBarProps {
  article: NewsArticle;
  compact?: boolean;
  variant?: 'light' | 'dark';
}

function buildArticleUrl(articleId: string): string {
  return buildArticlePublicUrl(articleId);
}

function buildShareText(article: NewsArticle): string {
  const url = buildArticleUrl(article.id);
  return buildKannadaArticleShareText(article, url, getKannadaLocationLabel(article.location));
}

export function ArticleShareBar({
  article,
  compact = false,
  variant = 'light',
}: ArticleShareBarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sharedFeedback, setSharedFeedback] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
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
    `*${plainTitle}*\n\nCoffeenadu News (${getKannadaLocationLabel(article.location)})\n\n${SHARE_PROMO_FOOTER}`
  )}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}&quote=${encodeURIComponent(
    `*${plainTitle}*\n\n${SHARE_PROMO_FOOTER}`
  )}`;
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `${plainTitle} — Coffeenadu News`
  )}&url=${encodeURIComponent(articleUrl)}`;

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(articleUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setShowFallbackMenu(true);
    }
  };

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${plainTitle} — Coffeenadu News`,
          text: fullShareText,
          url: articleUrl,
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
      <div
        ref={containerRef}
        className="relative inline-flex flex-wrap items-center gap-1.5"
        onClick={stopProp}
      >
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            stopProp(e);
            trackPlatformEvent({ type: 'whatsapp_share', module: 'news' });
          }}
          aria-label="Share on WhatsApp"
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
            isDark
              ? 'bg-[#176B4A] text-white hover:bg-emerald-600'
              : 'bg-emerald-50 dark:bg-emerald-950/50 text-[#176B4A] dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
          }`}
        >
          <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
          <span>WhatsApp</span>
        </a>

        <button
          type="button"
          onClick={(e) => void handleCopyLink(e)}
          onKeyDown={stopProp}
          aria-label="Copy article link"
          className={`inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            isDark
              ? 'bg-white/15 text-white hover:bg-white/25'
              : 'bg-white dark:bg-slate-900 text-[#17263A] dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {copiedLink ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#176B4A] dark:text-emerald-400" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleNativeShare}
          onKeyDown={stopProp}
          aria-label="Share to other apps"
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
            isDark
              ? 'bg-white/15 text-white hover:bg-white/25'
              : 'bg-slate-100 dark:bg-slate-800 text-[#17263A] dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
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
            className="absolute right-0 bottom-full mb-1.5 z-30 bg-white dark:bg-[#0F1E33] border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-1.5 flex flex-col min-w-[155px] text-xs text-slate-800 dark:text-slate-100"
          >
            <a
              href={telegramHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowFallbackMenu(false)}
              className="px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-left"
            >
              Telegram
            </a>
            <a
              href={facebookHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowFallbackMenu(false)}
              className="px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-left"
            >
              Facebook
            </a>
            <a
              href={xHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowFallbackMenu(false)}
              className="px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-left"
            >
              X (Twitter)
            </a>
            <button
              type="button"
              onClick={(e) => {
                void handleCopyLink(e);
                setShowFallbackMenu(false);
              }}
              className="px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-left flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
            </button>
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
        onClick={() => trackPlatformEvent({ type: 'whatsapp_share', module: 'news' })}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#176B4A] hover:bg-[#13593D] rounded-lg transition-colors min-h-[40px]"
      >
        <WhatsAppIcon className="w-4 h-4 shrink-0" />
        <span>WhatsApp</span>
      </a>

      <a
        href={telegramHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center px-3 py-2 text-xs font-semibold text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 rounded-lg transition-colors min-h-[40px]"
      >
        Telegram
      </a>

      <a
        href={facebookHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center px-3 py-2 text-xs font-semibold text-blue-900 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 rounded-lg transition-colors min-h-[40px]"
      >
        Facebook
      </a>

      <a
        href={xHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors min-h-[40px]"
      >
        X
      </a>

      <button
        type="button"
        onClick={(e) => void handleCopyLink(e)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#17263A] dark:text-slate-200 bg-white dark:bg-[#13253E] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer min-h-[40px]"
      >
        {copiedLink ? (
          <>
            <Check className="w-3.5 h-3.5 text-[#176B4A] dark:text-emerald-400" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Link</span>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={handleNativeShare}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#10243D] dark:text-[#10243D] bg-[#D9A441] hover:bg-[#E5B65C] rounded-lg transition-colors cursor-pointer min-h-[40px]"
      >
        {sharedFeedback ? (
          <>
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{sharedFeedback}</span>
          </>
        ) : (
          <>
            <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>More Apps</span>
          </>
        )}
      </button>
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
