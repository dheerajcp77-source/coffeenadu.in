import { useState, type MouseEvent } from 'react';
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react';
import { getKannadaLocationLabel } from '../constants/newsData';
import type { NewsArticle } from '../types/news';
import { buildKannadaArticleShareText } from '../utils/newsHelpers';
import { stripRichTextToPlainText } from '../utils/richText';
import { buildArticlePublicUrl } from '../utils/slug';

interface ShareNewsActionsProps {
  article: NewsArticle;
  variant?: 'card' | 'featured' | 'detail';
}

export function buildArticleSharePayload(article: NewsArticle) {
  const url = buildArticlePublicUrl(article.id);
  const plainTitle = stripRichTextToPlainText(article.titleKannada);
  const shareMessage = buildKannadaArticleShareText(
    article,
    url,
    getKannadaLocationLabel(article.location)
  );
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  return { url, whatsappUrl, plainTitle, shareMessage };
}

export function ShareNewsActions({
  article,
  variant = 'card',
}: ShareNewsActionsProps) {
  const [linkShared, setLinkShared] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const { url, whatsappUrl, plainTitle, shareMessage } = buildArticleSharePayload(article);

  const stopBubble = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const handleCopyLink = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore if clipboard API is unavailable
    }
  };

  const handleNativeShare = async (e: MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${plainTitle} — Coffeenadu News`,
          text: shareMessage,
          url,
        });
        setLinkShared(true);
        window.setTimeout(() => setLinkShared(false), 2000);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }
    await handleCopyLink(e);
  };

  if (variant === 'featured') {
    return (
      <div className="inline-flex flex-wrap items-center gap-2" onClick={stopBubble}>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Share "${plainTitle}" on WhatsApp`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap"
        >
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>WhatsApp</span>
        </a>

        <button
          type="button"
          onClick={(e) => void handleCopyLink(e)}
          aria-label={`Copy link for "${plainTitle}"`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/25 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          {copiedLink ? (
            <>
              <Check className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Copy Link</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleNativeShare}
          aria-label={`Share "${plainTitle}" to other apps`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/25 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          {linkShared ? (
            <>
              <Check className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
              <span>Shared</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Share</span>
            </>
          )}
        </button>
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share this news on WhatsApp"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors min-h-[38px] whitespace-nowrap"
        >
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>WhatsApp</span>
        </a>

        <button
          type="button"
          onClick={(e) => void handleCopyLink(e)}
          aria-label="Copy article link"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0F274A] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer min-h-[38px] whitespace-nowrap"
        >
          {copiedLink ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Copy Link</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleNativeShare}
          aria-label="Share to other apps"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0F274A] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer min-h-[38px] whitespace-nowrap"
        >
          {linkShared ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
              <span>Shared</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Other Apps</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" onClick={stopBubble}>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Share "${plainTitle}" on WhatsApp`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap"
      >
        <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
        <span>WhatsApp</span>
      </a>

      <button
        type="button"
        onClick={(e) => void handleCopyLink(e)}
        aria-label={`Copy link for "${plainTitle}"`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
      >
        {copiedLink ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Copy Link</span>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={handleNativeShare}
        aria-label={`Share "${plainTitle}" to other apps`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
      >
        {linkShared ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            <span>Shared</span>
          </>
        ) : (
          <>
            <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Share</span>
          </>
        )}
      </button>
    </div>
  );
}
