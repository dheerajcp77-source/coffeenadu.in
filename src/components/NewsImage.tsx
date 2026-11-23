import { useCallback, useEffect, useRef, useState } from 'react';
import { Newspaper } from 'lucide-react';
import {
  drawCircularLogoWatermark,
  getCachedCircleLogoImage,
  loadCircleLogoImage,
} from '../utils/watermark';

export type NewsImageFitMode = 'natural' | 'contain-blur' | 'contain' | 'cover';

interface NewsImageProps {
  src?: string;
  alt: string;
  className?: string;
  aspectClass?: string;
  maxHeightClass?: string;
  fitMode?: NewsImageFitMode;
  showWatermark?: boolean;
  watermarkApplied?: boolean;
  fillParent?: boolean;
}

export function NewsImage({
  src,
  alt,
  className = '',
  aspectClass = 'aspect-[4/3]',
  maxHeightClass = 'max-h-[560px]',
  fitMode,
  watermarkApplied = false,
  fillParent = false,
}: NewsImageProps) {
  const effectiveFitMode: NewsImageFitMode = fitMode ?? (fillParent ? 'contain-blur' : 'natural');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(getCachedCircleLogoImage());
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>(
    src ? 'loading' : 'idle'
  );

  const drawCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!container || !canvas || !img || !img.naturalWidth || !img.naturalHeight) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Natural mode: canvas adopts the image's exact natural aspect ratio so ANY size photo
    // (square, portrait, wide, ultra-wide) fits 100% uncut without cropping!
    if (effectiveFitMode === 'natural' && !fillParent) {
      const maxDim = 1400;
      const longest = Math.max(img.naturalWidth, img.naturalHeight, 1);
      const scale = longest > maxDim ? maxDim / longest : 1;
      const targetW = Math.max(1, Math.round(img.naturalWidth * scale));
      const targetH = Math.max(1, Math.round(img.naturalHeight * scale));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      if (!watermarkApplied && logoImageRef.current) {
        drawCircularLogoWatermark(ctx, targetW, targetH, logoImageRef.current);
      }
      return;
    }

    const rect = container.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width <= 0 || height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (effectiveFitMode === 'cover') {
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const offsetX = watermarkApplied && drawW > width ? 0 : (width - drawW) / 2;
      const offsetY = watermarkApplied && drawH > height ? 0 : (height - drawH) / 2;

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
      if (!watermarkApplied && logoImageRef.current) {
        drawCircularLogoWatermark(ctx, width, height, logoImageRef.current);
      }
      return;
    }

    // 'contain' and 'contain-blur': NEVER crop any part of square, portrait, or wide photos!
    if (effectiveFitMode === 'contain-blur') {
      const coverScale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const bgW = img.naturalWidth * coverScale;
      const bgH = img.naturalHeight * coverScale;
      const bgX = (width - bgW) / 2;
      const bgY = (height - bgH) / 2;

      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
      try {
        ctx.filter = 'blur(14px) brightness(0.55)';
      } catch {
        // Fallback smoothly if browser ignores canvas filter
      }
      ctx.drawImage(img, bgX - 12, bgY - 12, bgW + 24, bgH + 24);
      ctx.restore();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.fillRect(0, 0, width, height);
    }

    const containScale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
    const drawW = img.naturalWidth * containScale;
    const drawH = img.naturalHeight * containScale;
    const offsetX = (width - drawW) / 2;
    const offsetY = (height - drawH) / 2;

    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

    // Draw circular CoffeeNadu logo on the actual visible photo bounds when not already baked
    if (!watermarkApplied && logoImageRef.current) {
      drawCircularLogoWatermark(ctx, drawW, drawH, logoImageRef.current, {
        offsetX,
        offsetY,
      });
    }
  }, [effectiveFitMode, fillParent, watermarkApplied]);

  useEffect(() => {
    let active = true;
    if (!logoImageRef.current) {
      void loadCircleLogoImage().then((logoImg) => {
        if (!active || !logoImg) return;
        logoImageRef.current = logoImg;
        if (loadedImageRef.current) {
          drawCanvas();
        }
      });
    }
    return () => {
      active = false;
    };
  }, [drawCanvas]);

  useEffect(() => {
    loadedImageRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (!src) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    const img = new Image();
    img.referrerPolicy = 'no-referrer';

    img.onload = () => {
      if (cancelled) return;
      loadedImageRef.current = img;
      setStatus('loaded');
      window.requestAnimationFrame(() => {
        if (!cancelled) drawCanvas();
      });
    };

    img.onerror = () => {
      if (cancelled) return;
      loadedImageRef.current = null;
      setStatus('error');
    };

    img.src = src;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [src, drawCanvas]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (loadedImageRef.current) {
        drawCanvas();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [drawCanvas]);

  const isNaturalMode = effectiveFitMode === 'natural' && !fillParent;
  const wrapperLayoutClass = fillParent
    ? 'absolute inset-0 w-full h-full'
    : isNaturalMode
    ? 'relative w-full flex items-center justify-center'
    : `relative ${aspectClass} w-full`;

  if (!src || status === 'error') {
    return (
      <div
        className={`${wrapperLayoutClass} ${
          isNaturalMode ? 'min-h-[160px]' : ''
        } bg-stone-100 border border-stone-200 flex flex-col items-center justify-center p-4 text-center select-none ${className}`}
        aria-label={alt}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        <Newspaper className="w-6 h-6 text-stone-400 mb-2" aria-hidden="true" />
        <span className="text-xs font-medium text-stone-500 line-clamp-2 max-w-[220px] font-kannada">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={alt}
      className={`${wrapperLayoutClass} ${
        isNaturalMode && status === 'loading' ? 'min-h-[180px]' : ''
      } isolate overflow-hidden ${
        effectiveFitMode === 'contain-blur' ? 'bg-slate-950' : 'bg-stone-100'
      } select-none ${className}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {status === 'loading' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-20 bg-stone-200 animate-pulse"
        />
      )}

      {/* Protected Canvas Renderer: no <img> tag in DOM, blocking Save/Download/Open Image menus */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        className={
          isNaturalMode
            ? `w-full h-auto ${maxHeightClass} object-contain block mx-auto pointer-events-none select-none`
            : 'w-full h-full block pointer-events-none select-none transition-transform duration-300 ease-out group-hover:scale-[1.01]'
        }
      />

      {/* Transparent protective overlay intercepts long-press & right-click */}
      <div
        aria-hidden="true"
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        className="absolute inset-0 z-10 select-none bg-transparent"
      />
    </div>
  );
}
