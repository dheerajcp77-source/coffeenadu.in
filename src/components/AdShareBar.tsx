import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { trackAdInteraction, type AdTrackPlacement } from '../services/adsClient';
import type { AdPlatformSettings, Advertisement } from '../types/ads';
import { buildAdKannadaShareMessage, buildAdPublicUrl } from '../utils/adHelpers';

interface AdShareBarProps {
  ad: Advertisement;
  settings?: AdPlatformSettings | null;
  placement?: AdTrackPlacement;
  compact?: boolean;
  isPreview?: boolean;
}

export function AdShareBar({
  ad,
  settings,
  placement = 'direct',
  compact = false,
  isPreview = false,
}: AdShareBarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharedFeedback, setSharedFeedback] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  const adUrl = buildAdPublicUrl(ad.sharing?.customSlug || ad.id);
  const kannadaMessage = buildAdKannadaShareMessage(
    ad,
    adUrl,
    settings?.defaultShareMessage
  );

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(kannadaMessage)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(adUrl)}&text=${encodeURIComponent(
    kannadaMessage
  )}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    adUrl
  )}&quote=${encodeURIComponent(kannadaMessage)}`;

  const trackShare = () => {
    void trackAdInteraction(ad.id, 'share', { placement, isPreview });
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    trackShare();
    try {
      await navigator.clipboard.writeText(adUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore restricted clipboard
    }
  };

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        trackShare();
        await navigator.share({
          title: `${ad.title} — Coffeenadu News`,
          text: kannadaMessage,
          url: adUrl,
        });
        setSharedFeedback('Shared');
        window.setTimeout(() => setSharedFeedback(''), 2000);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    setMenuOpen((prev) => !prev);
  };

  const stopProp = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
  };

  if (compact) {
    return (
      <div
        ref={containerRef}
        className="relative inline-flex items-center gap-1"
        onClick={stopProp}
      >
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            stopProp(e);
            trackShare();
          }}
          aria-label={`Share ${ad.title} on WhatsApp`}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors whitespace-nowrap"
        >
          <WhatsAppIcon className="w-3 h-3 shrink-0" />
          <span>Share</span>
        </a>

        <button
          type="button"
          onClick={handleNativeShare}
          onKeyDown={stopProp}
          aria-label={`More sharing options for ${ad.title}`}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          {sharedFeedback || copied ? (
            <Check className="w-3 h-3 text-emerald-700" aria-hidden="true" />
          ) : (
            <Share2 className="w-3 h-3" aria-hidden="true" />
          )}
        </button>

        {menuOpen && (
          <div
            onClick={stopProp}
            className="absolute right-0 bottom-full mb-1.5 z-40 min-w-[160px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg text-xs text-slate-800 flex flex-col"
          >
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                trackShare();
                setMenuOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 font-medium text-emerald-800"
            >
              WhatsApp
            </a>
            <a
              href={facebookHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                trackShare();
                setMenuOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg hover:bg-blue-50 font-medium text-blue-800"
            >
              Facebook
            </a>
            <a
              href={telegramHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                trackShare();
                setMenuOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg hover:bg-sky-50 font-medium text-sky-800"
            >
              Telegram
            </a>
            <button
              type="button"
              onClick={(e) => {
                void handleCopyLink(e);
                setMenuOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg hover:bg-slate-100 font-medium text-left cursor-pointer"
            >
              {copied ? 'Link Copied!' : 'Copy Link'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-wrap items-center gap-2"
      onClick={stopProp}
    >
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={trackShare}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] px-3 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap"
      >
        <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
        <span>WhatsApp</span>
      </a>

      <a
        href={facebookHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={trackShare}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#1877F2] hover:bg-[#166fe5] px-3 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap"
      >
        <span>Facebook</span>
      </a>

      <a
        href={telegramHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={trackShare}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0088cc] hover:bg-[#0077b3] px-3 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap"
      >
        <span>Telegram</span>
      </a>

      <button
        type="button"
        onClick={(e) => void handleCopyLink(e)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
        ) : (
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        <span>{copied ? 'Link Copied' : 'Copy Link'}</span>
      </button>

      <button
        type="button"
        onClick={(e) => void handleNativeShare(e)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{sharedFeedback || 'Share'}</span>
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
