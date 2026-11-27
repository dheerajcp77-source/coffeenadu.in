import React from 'react';
import {
  Briefcase,
  Bus,
  Calendar,
  CloudRain,
  FileText,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Megaphone,
  Mountain,
  Newspaper,
  PhoneCall,
  SearchCheck,
  ShieldAlert,
  ShoppingBag,
  Sprout,
  Store,
  Tag,
  UserCheck,
  Wrench,
} from 'lucide-react';
import type { ListingIconKey } from '../../types/platform';

interface PlatformIconProps {
  icon: ListingIconKey;
  className?: string;
}

export const PlatformIcon: React.FC<PlatformIconProps> = ({ icon, className = 'w-5 h-5' }) => {
  switch (icon) {
    case 'newspaper':
      return <Newspaper className={className} aria-hidden="true" />;
    case 'store':
      return <Store className={className} aria-hidden="true" />;
    case 'briefcase':
      return <Briefcase className={className} aria-hidden="true" />;
    case 'shopping-bag':
      return <ShoppingBag className={className} aria-hidden="true" />;
    case 'sprout':
      return <Sprout className={className} aria-hidden="true" />;
    case 'bus':
      return <Bus className={className} aria-hidden="true" />;
    case 'graduation-cap':
      return <GraduationCap className={className} aria-hidden="true" />;
    case 'heart-pulse':
      return <HeartPulse className={className} aria-hidden="true" />;
    case 'landmark':
      return <Landmark className={className} aria-hidden="true" />;
    case 'mountain':
      return <Mountain className={className} aria-hidden="true" />;
    case 'home':
      return <Home className={className} aria-hidden="true" />;
    case 'calendar':
      return <Calendar className={className} aria-hidden="true" />;
    case 'megaphone':
      return <Megaphone className={className} aria-hidden="true" />;
    case 'search-check':
      return <SearchCheck className={className} aria-hidden="true" />;
    case 'shield-alert':
      return <ShieldAlert className={className} aria-hidden="true" />;
    case 'wrench':
      return <Wrench className={className} aria-hidden="true" />;
    case 'cloud-rain':
      return <CloudRain className={className} aria-hidden="true" />;
    case 'gamepad':
      return <Gamepad2 className={className} aria-hidden="true" />;
    case 'tag':
      return <Tag className={className} aria-hidden="true" />;
    case 'phone-call':
      return <PhoneCall className={className} aria-hidden="true" />;
    case 'file-text':
      return <FileText className={className} aria-hidden="true" />;
    case 'user-check':
      return <UserCheck className={className} aria-hidden="true" />;
    default:
      return <Store className={className} aria-hidden="true" />;
  }
};
