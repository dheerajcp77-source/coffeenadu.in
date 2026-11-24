import { ArrowRight, Globe, MapPin, MessageCircle, Phone } from 'lucide-react';
import { trackAdInteraction, type AdTrackPlacement } from '../services/adsClient';
import type { Advertisement } from '../types/ads';
import { resolveAdCtaAction } from '../utils/adHelpers';

interface AdActionButtonsProps {
  ad: Advertisement;
  placement?: AdTrackPlacement;
  onOpenAd?: (ad: Advertisement) => void;
  isPreview?: boolean;
  compact?: boolean;
}

export function AdActionButtons({
  ad,
  placement = 'direct',
  onOpenAd,
  isPreview = false,
  compact = false,
}: AdActionButtonsProps) {
  const cta = resolveAdCtaAction(ad);

  const handlePrimaryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void trackAdInteraction(ad.id, cta.trackType, { placement, isPreview });
    if (!cta.href && onOpenAd) {
      onOpenAd(ad);
    }
  };

  const renderIcon = () => {
    switch (cta.trackType) {
      case 'whatsapp':
        return <MessageCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      case 'phone':
        return <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      case 'directions':
        return <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      case 'website':
        return <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      default:
        return <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    }
  };

  const btnCls = compact
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#0F274A] hover:bg-[#173a6e] rounded-lg transition-colors whitespace-nowrap cursor-pointer'
    : 'inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#0F274A] hover:bg-[#173a6e] rounded-lg transition-colors whitespace-nowrap cursor-pointer';

  if (cta.href) {
    return (
      <a
        href={cta.href}
        target={cta.isExternal ? '_blank' : undefined}
        rel={cta.isExternal ? 'noopener noreferrer' : undefined}
        onClick={handlePrimaryClick}
        className={btnCls}
      >
        {renderIcon()}
        <span>{cta.label}</span>
      </a>
    );
  }

  return (
    <button type="button" onClick={handlePrimaryClick} className={btnCls}>
      <span>{cta.label}</span>
      <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
    </button>
  );
}
