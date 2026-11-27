import React, { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import type { PublicCommunityPost } from '../../types/community';
import {
  buildCommunityPostPublicUrl,
  buildCommunityShareText,
  buildCommunityWhatsappUrl,
} from '../../utils/communityHelpers';
import { trackCommunityPostShare } from '../../services/communityClient';

interface CommunityShareBarProps {
  post: Pick<PublicCommunityPost, 'id' | 'slug' | 'title' | 'category' | 'location'>;
  compact?: boolean;
}

export const CommunityShareBar: React.FC<CommunityShareBarProps> = ({ post, compact = false }) => {
  const [copied, setCopied] = useState(false);
  const [sharedOk, setSharedOk] = useState(false);

  const shareOrigin =
    typeof window !== 'undefined' &&
    window.location.hostname &&
    window.location.hostname.includes('coffeenadu')
      ? window.location.origin
      : undefined;

  const permanentUrl = buildCommunityPostPublicUrl(post.slug || post.id, shareOrigin);
  const shareText = buildCommunityShareText(post, shareOrigin);
  const whatsappUrl = buildCommunityWhatsappUrl(post, shareOrigin);

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    trackCommunityPostShare(post.id);

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${post.title} — COFFEENADU COMMUNITY`,
          text: shareText,
          url: permanentUrl,
        });
        setSharedOk(true);
        window.setTimeout(() => setSharedOk(false), 2000);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    // Fallback to copying link cleanly
    await handleCopy(e);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    trackCommunityPostShare(post.id);
    try {
      await navigator.clipboard.writeText(permanentUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback textarea copy without alert()
      try {
        const ta = document.createElement('textarea');
        ta.value = permanentUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      } catch {
        // ignore clipboard failure
      }
    }
  };

  const handleWhatsappClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    trackCommunityPostShare(post.id);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleWhatsappClick}
        aria-label={`WhatsApp ನಲ್ಲಿ ಹಂಚಿಕೊಳ್ಳಿ: ${post.title}`}
        className={`inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors whitespace-nowrap bg-[#176B4A] hover:bg-[#13593D] text-white ${
          compact ? 'px-2.5 py-1.5 text-[11px] min-h-[34px]' : 'px-3.5 py-2 text-xs min-h-[40px]'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="w-3.5 h-3.5 shrink-0">
          <path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.766.469 3.484 1.344 5l-1.406 5.156 5.281-1.375c1.469.797 3.109 1.219 4.75 1.219 5.516 0 9.969-4.453 9.969-9.969S17.547 2 12.031 2zm5.813 14.125c-.25.703-1.438 1.344-2 1.422-.516.078-1.172.109-1.891-.125-.438-.141-1-.328-1.719-.641-3.031-1.313-5-4.375-5.156-4.578-.156-.203-1.234-1.641-1.234-3.125s.781-2.219 1.063-2.516c.281-.297.609-.375.813-.375s.406 0 .578.016c.188.016.438-.078.688.516.25.609.859 2.094.938 2.25.078.156.125.344.031.547-.094.203-.141.328-.281.5s-.297.391-.422.516c-.141.141-.297.297-.125.594.172.297.766 1.266 1.641 2.047 1.125 1 2.078 1.313 2.375 1.469.297.156.469.125.641-.078.172-.203.75-.875.953-1.172.203-.297.406-.25.672-.156.266.094 1.703.813 2 .953.297.141.484.219.563.344.078.125.078.734-.172 1.438z" />
        </svg>
        <span className="font-kannada">WhatsApp</span>
      </a>

      <button
        type="button"
        onClick={(e) => void handleNativeShare(e)}
        aria-label={`ಹಂಚಿಕೊಳ್ಳಿ: ${post.title}`}
        className={`inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer bg-[#10243D] hover:bg-[#19385F] text-white ${
          compact ? 'px-2.5 py-1.5 text-[11px] min-h-[34px]' : 'px-3.5 py-2 text-xs min-h-[40px]'
        }`}
      >
        {sharedOk ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
        <span className="font-kannada">{sharedOk ? 'ಹಂಚಲಾಗಿದೆ' : 'ಹಂಚಿಕೊಳ್ಳಿ'}</span>
      </button>

      <button
        type="button"
        onClick={(e) => void handleCopy(e)}
        aria-label={`ಲಿಂಕ್ ಕಾಪಿ ಮಾಡಿ: ${post.title}`}
        className={`inline-flex items-center gap-1.5 font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#17263A] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer ${
          compact ? 'px-2.5 py-1.5 text-[11px] min-h-[34px]' : 'px-3 py-2 text-xs min-h-[40px]'
        }`}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-[#176B4A] dark:text-emerald-400" />
            <span className="font-kannada">ಕಾಪಿ ಆಯಿತು</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span className="font-kannada">{compact ? 'ಲಿಂಕ್' : 'ಲಿಂಕ್ ಕಾಪಿ ಮಾಡಿ'}</span>
          </>
        )}
      </button>
    </div>
  );
};
