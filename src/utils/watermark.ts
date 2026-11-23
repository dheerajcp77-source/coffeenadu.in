import coffeenaduCircleLogoUrl from '../assets/images/coffeenadu_logo_circle.png';

let cachedCircleLogo: HTMLImageElement | null = null;
let loadingPromise: Promise<HTMLImageElement | null> | null = null;

/**
 * Loads the pre-cropped circular transparent CoffeeNadu logo PNG once and caches it.
 */
export function loadCircleLogoImage(): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  if (cachedCircleLogo && cachedCircleLogo.complete && cachedCircleLogo.naturalWidth > 0) {
    return Promise.resolve(cachedCircleLogo);
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      cachedCircleLogo = img;
      resolve(img);
    };
    img.onerror = () => {
      loadingPromise = null;
      resolve(null);
    };
    img.src = coffeenaduCircleLogoUrl;
  });

  return loadingPromise;
}

export function getCachedCircleLogoImage(): HTMLImageElement | null {
  if (cachedCircleLogo && cachedCircleLogo.complete && cachedCircleLogo.naturalWidth > 0) {
    return cachedCircleLogo;
  }
  return null;
}

// Start preloading on client startup so logos render immediately on first paint
if (typeof window !== 'undefined') {
  void loadCircleLogoImage();
}

/**
 * Computes consistent size and top-left edge padding proportional to image/canvas size.
 * `larger` is used for newly uploaded future news photos (slightly larger top-left circular logo).
 */
export function computeCircularWatermarkMetrics(
  width: number,
  height: number,
  larger = false
): {
  size: number;
  pad: number;
} {
  const minDim = Math.max(1, Math.min(width, height));
  if (larger) {
    const size =
      minDim <= 140
        ? Math.max(24, Math.min(42, Math.round(minDim * 0.3)))
        : Math.max(46, Math.min(156, Math.round(minDim * 0.19)));
    const pad =
      minDim <= 140
        ? Math.max(5, Math.round(minDim * 0.055))
        : Math.max(12, Math.round(minDim * 0.032));
    return { size, pad };
  }

  // Standard metrics preserved for existing/legacy images
  const size =
    minDim <= 140
      ? Math.max(20, Math.min(36, Math.round(minDim * 0.26)))
      : Math.max(36, Math.min(112, Math.round(minDim * 0.145)));

  const pad =
    minDim <= 140
      ? Math.max(5, Math.round(minDim * 0.06))
      : Math.max(10, Math.round(minDim * 0.032));

  return { size, pad };
}

/**
 * Draws the circular CoffeeNadu logo at the TOP-LEFT corner with crisp edge clipping
 * and subtle elevation shadow so there are never square corners or extra borders.
 */
export function drawCircularLogoWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  logoImg: HTMLImageElement | null = getCachedCircleLogoImage(),
  options?: { offsetX?: number; offsetY?: number; larger?: boolean }
): boolean {
  if (!logoImg || !logoImg.naturalWidth || width <= 0 || height <= 0) {
    return false;
  }

  const originX = options?.offsetX ?? 0;
  const originY = options?.offsetY ?? 0;
  const { size, pad } = computeCircularWatermarkMetrics(width, height, Boolean(options?.larger));
  const x = originX + pad;
  const y = originY + pad;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2;

  ctx.save();
  // Subtle circular drop-shadow around the gold rim for contrast against bright skies/walls
  ctx.shadowColor = 'rgba(0, 0, 0, 0.36)';
  ctx.shadowBlur = Math.max(3, Math.round(size * 0.1));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1, r - 0.5), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(logoImg, x, y, size, size);
  ctx.restore();

  return true;
}

/**
 * Draws "COFFEENADU NEWS" cleanly 2 repeated times across the middle of newly uploaded
 * news photos (both main & extra photos). Never applied retroactively to already-published news.
 */
export function drawMiddleBrandWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  if (width < 120 || height < 90) return;

  const text = 'COFFEENADU NEWS';
  const isWide = width >= height * 1.15;

  // Target font size scales proportionally and auto-fits so text never clips on any orientation
  const maxTextWidth = isWide ? width * 0.42 : width * 0.78;
  let fontSize = Math.round(Math.max(14, Math.min(54, Math.min(width, height) * (isWide ? 0.068 : 0.072))));

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const makeFont = (px: number) =>
    `800 ${px}px "Plus Jakarta Sans", "Inter", system-ui, -apple-system, sans-serif`;

  ctx.font = makeFont(fontSize);
  const measured = ctx.measureText(text).width;
  if (measured > maxTextWidth && measured > 0) {
    fontSize = Math.max(12, Math.floor(fontSize * (maxTextWidth / measured)));
    ctx.font = makeFont(fontSize);
  }

  // Two repeated placements across the middle band of the photo
  const placements: Array<{ x: number; y: number; angleDeg: number }> = isWide
    ? [
        { x: width * 0.27, y: height * 0.46, angleDeg: -10 },
        { x: width * 0.73, y: height * 0.56, angleDeg: -10 },
      ]
    : [
        { x: width * 0.5, y: height * 0.43, angleDeg: -8 },
        { x: width * 0.5, y: height * 0.58, angleDeg: -8 },
      ];

  for (const pos of placements) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate((pos.angleDeg * Math.PI) / 180);

    // Subtle dark shadow + hairline outline ensures visibility over bright skies & dark foliage alike
    ctx.shadowColor = 'rgba(0, 0, 0, 0.52)';
    ctx.shadowBlur = Math.max(3, Math.round(fontSize * 0.16));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;

    ctx.lineWidth = Math.max(1, fontSize * 0.06);
    ctx.strokeStyle = 'rgba(15, 39, 74, 0.34)';
    ctx.strokeText(text, 0, 0);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.44)';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Full future-publish news photo watermark applied to newly uploaded Main & Extra photos:
 * 1) Slightly larger circular CoffeeNadu logo at Top-Left.
 * 2) "COFFEENADU NEWS" printed 2 repeated times across the middle of the photo.
 */
export function drawNewsUploadWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  logoImg: HTMLImageElement | null = getCachedCircleLogoImage()
): void {
  drawMiddleBrandWatermark(ctx, width, height);
  if (logoImg) {
    drawCircularLogoWatermark(ctx, width, height, logoImg, { larger: true });
  }
}

const MAX_FIRESTORE_IMAGE_CHARS = 320000;

/**
 * Takes an existing photo source (data URL or image URL), preserves aspect ratio and quality,
 * applies the circular CoffeeNadu logo watermark once at the top-left corner, and outputs a
 * Firestore-safe JPEG data URL. Never modifies original files on disk.
 */
export async function applyWatermarkToImageSrc(
  imageSrc: string,
  options?: { includeMiddleBrand?: boolean }
): Promise<string> {
  const logoImg = await loadCircleLogoImage();

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.referrerPolicy = 'no-referrer';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Unable to load image for watermarking.'));
    el.src = imageSrc;
  });

  const naturalWidth = Math.max(1, img.naturalWidth || img.width);
  const naturalHeight = Math.max(1, img.naturalHeight || img.height);
  const longest = Math.max(naturalWidth, naturalHeight);

  const attempts = [
    { maxDim: Math.min(960, longest), quality: 0.82 },
    { maxDim: 800, quality: 0.72 },
    { maxDim: 640, quality: 0.6 },
    { maxDim: 520, quality: 0.5 },
  ];

  for (const attempt of attempts) {
    const scale = longest > attempt.maxDim ? attempt.maxDim / longest : 1;
    const targetW = Math.max(1, Math.round(naturalWidth * scale));
    const targetH = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize canvas for watermarking.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    if (options?.includeMiddleBrand) {
      drawNewsUploadWatermark(ctx, targetW, targetH, logoImg);
    } else if (logoImg) {
      drawCircularLogoWatermark(ctx, targetW, targetH, logoImg);
    }

    const jpegUrl = canvas.toDataURL('image/jpeg', attempt.quality);
    if (jpegUrl.length <= MAX_FIRESTORE_IMAGE_CHARS) {
      return jpegUrl;
    }
  }

  throw new Error('Watermarked photo exceeded maximum size limit.');
}
