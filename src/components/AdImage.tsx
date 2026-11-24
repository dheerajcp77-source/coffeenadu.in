import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';

interface AdImageProps {
  src?: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  fit?: 'contain' | 'cover';
  lazy?: boolean;
}

/**
 * Renders original advertisement creative unmodified — zero CoffeeNadu logos,
 * zero "2X" badges, zero watermarks, and graceful broken-image fallback.
 */
export function AdImage({
  src,
  alt,
  className = '',
  imgClassName = '',
  fit = 'contain',
  lazy = true,
}: AdImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-4 text-center ${className}`}
        aria-label={alt}
      >
        <Megaphone className="w-6 h-6 mb-1.5 text-slate-400" aria-hidden="true" />
        <span className="text-[11px] font-medium text-slate-500 line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden bg-slate-50 ${className}`}>
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading={lazy ? 'lazy' : 'eager'}
        onError={() => setFailed(true)}
        className={`w-full h-full ${
          fit === 'cover' ? 'object-cover object-center' : 'object-contain object-center'
        } block ${imgClassName}`}
      />
    </div>
  );
}
