export interface EditorFontOption {
  id: string;
  label: string;
  cssFamily: string;
}

export const EDITOR_FONT_OPTIONS: EditorFontOption[] = [
  {
    id: 'noto-sans-kannada',
    label: 'Noto Sans Kannada (Default)',
    cssFamily: '"Noto Sans Kannada", "Plus Jakarta Sans", sans-serif',
  },
  {
    id: 'noto-serif-kannada',
    label: 'Noto Serif Kannada (Newspaper)',
    cssFamily: '"Noto Serif Kannada", Georgia, serif',
  },
  {
    id: 'tiro-kannada',
    label: 'Tiro Kannada (Classic Print)',
    cssFamily: '"Tiro Kannada", "Noto Serif Kannada", serif',
  },
  {
    id: 'anek-kannada',
    label: 'Anek Kannada (Modern Clean)',
    cssFamily: '"Anek Kannada", "Noto Sans Kannada", sans-serif',
  },
  {
    id: 'baloo-tamma-2',
    label: 'Baloo Tamma 2 (Bold Rounded)',
    cssFamily: '"Baloo Tamma 2", "Noto Sans Kannada", sans-serif',
  },
  {
    id: 'hubballi',
    label: 'Hubballi (Feature Style)',
    cssFamily: '"Hubballi", "Noto Sans Kannada", sans-serif',
  },
  {
    id: 'plus-jakarta',
    label: 'Plus Jakarta Sans (English)',
    cssFamily: '"Plus Jakarta Sans", "Noto Sans Kannada", sans-serif',
  },
  {
    id: 'playfair',
    label: 'Playfair Display (Editorial)',
    cssFamily: '"Playfair Display", "Noto Serif Kannada", Georgia, serif',
  },
  {
    id: 'georgia',
    label: 'Georgia Serif',
    cssFamily: 'Georgia, "Noto Serif Kannada", serif',
  },
  {
    id: 'monospace',
    label: 'Monospace',
    cssFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
];

export const EDITOR_FONT_SIZES: number[] = [12, 14, 16, 18, 20, 22, 24, 28, 32, 36];

export const EDITOR_TEXT_COLORS: Array<{ label: string; value: string }> = [
  { label: 'Default Black', value: '#1e293b' },
  { label: 'CoffeeNadu Navy', value: '#0f274a' },
  { label: 'Breaking Red', value: '#b91c1c' },
  { label: 'Malnad Green', value: '#065f46' },
  { label: 'Royal Blue', value: '#1d4ed8' },
  { label: 'Warm Orange', value: '#c2410c' },
  { label: 'Deep Purple', value: '#6d28d9' },
  { label: 'Muted Gray', value: '#475569' },
];

export const EDITOR_HIGHLIGHT_COLORS: Array<{ label: string; value: string }> = [
  { label: 'No Highlight', value: 'transparent' },
  { label: 'Yellow Highlight', value: '#fef08a' },
  { label: 'Soft Green', value: '#bbf7d0' },
  { label: 'Soft Blue', value: '#bfdbfe' },
  { label: 'Soft Pink', value: '#fbcfe8' },
  { label: 'Soft Peach', value: '#fed7aa' },
];

const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'STRIKE',
  'DEL',
  'SUB',
  'SUP',
  'SPAN',
  'FONT',
  'P',
  'DIV',
  'BR',
  'H2',
  'H3',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
]);

const LEGACY_FONT_SIZE_MAP: Record<string, string> = {
  '1': '12px',
  '2': '14px',
  '3': '16px',
  '4': '18px',
  '5': '22px',
  '6': '28px',
  '7': '36px',
};

const SAFE_COLOR_REGEX =
  /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)|transparent|inherit)$/i;

const SAFE_FONT_FAMILY_REGEX = /^[a-zA-Z0-9\s,"'-]+$/;
const SAFE_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify']);
const SAFE_FONT_WEIGHT_REGEX = /^(normal|bold|bolder|lighter|[1-9]00)$/i;
const SAFE_FONT_STYLE_VALUES = new Set(['normal', 'italic', 'oblique']);
const SAFE_TEXT_DECORATION_REGEX = /^(none|underline|line-through|underline line-through|line-through underline)$/i;

function sanitizeFontSize(raw: string): string | null {
  const clean = raw.trim().toLowerCase();
  const pxMatch = clean.match(/^(\d+(?:\.\d+)?)px$/);
  if (pxMatch) {
    const val = Math.round(Number(pxMatch[1]));
    if (val >= 10 && val <= 48) {
      return `${val}px`;
    }
    return null;
  }
  const remMatch = clean.match(/^(\d+(?:\.\d+)?)rem$/);
  if (remMatch) {
    const px = Math.round(Number(remMatch[1]) * 16);
    if (px >= 10 && px <= 48) {
      return `${px}px`;
    }
  }
  const ptMatch = clean.match(/^(\d+(?:\.\d+)?)pt$/);
  if (ptMatch) {
    const px = Math.round(Number(ptMatch[1]) * 1.333);
    if (px >= 10 && px <= 48) {
      return `${px}px`;
    }
  }
  return null;
}

function sanitizeInlineStyle(styleText: string): string {
  if (!styleText) return '';
  const safeParts: string[] = [];
  const declarations = styleText.split(';');
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    if (!val || /url\s*\(|expression\s*\(|javascript:/i.test(val)) continue;

    if (prop === 'font-family' && SAFE_FONT_FAMILY_REGEX.test(val)) {
      safeParts.push(`font-family: ${val}`);
    } else if (prop === 'font-size') {
      const cleanSize = sanitizeFontSize(val);
      if (cleanSize) safeParts.push(`font-size: ${cleanSize}`);
    } else if (prop === 'color' && SAFE_COLOR_REGEX.test(val)) {
      safeParts.push(`color: ${val}`);
    } else if (prop === 'background-color' && SAFE_COLOR_REGEX.test(val)) {
      if (val.toLowerCase() !== 'transparent' && val.toLowerCase() !== 'rgba(0, 0, 0, 0)') {
        safeParts.push(`background-color: ${val}`);
      }
    } else if (prop === 'text-align' && SAFE_ALIGN_VALUES.has(val.toLowerCase())) {
      safeParts.push(`text-align: ${val.toLowerCase()}`);
    } else if (prop === 'font-weight' && SAFE_FONT_WEIGHT_REGEX.test(val)) {
      safeParts.push(`font-weight: ${val}`);
    } else if (prop === 'font-style' && SAFE_FONT_STYLE_VALUES.has(val.toLowerCase())) {
      safeParts.push(`font-style: ${val.toLowerCase()}`);
    } else if (prop === 'text-decoration' && SAFE_TEXT_DECORATION_REGEX.test(val)) {
      safeParts.push(`text-decoration: ${val}`);
    }
  }
  return safeParts.join('; ');
}

export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function containsHtmlMarkup(value: string): boolean {
  return /<\/?(b|strong|i|em|u|s|strike|del|sub|sup|span|font|p|div|br|h2|h3|ul|ol|li|blockquote)\b[^>]*>/i.test(
    value
  );
}

/**
 * Strips all HTML tags cleanly to plain text for auto-summaries, read time,
 * search indexing, and OpenGraph descriptions.
 */
export function stripRichTextToPlainText(value: string): string {
  if (!value) return '';
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(`<div>${value}</div>`, 'text/html');
      return (doc.body.textContent || '')
        .replace(/[\u00a0\u200B]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      // Fallback regex below
    }
  }
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h2|h3|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u200B/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeDomNode(node: Node, targetDoc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return targetDoc.createTextNode((node.textContent || '').replace(/\u200B/g, ''));
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const el = node as HTMLElement;
  const rawTag = el.tagName.toUpperCase();

  // Completely drop dangerous elements and their inner content
  if (
    rawTag === 'SCRIPT' ||
    rawTag === 'STYLE' ||
    rawTag === 'IFRAME' ||
    rawTag === 'OBJECT' ||
    rawTag === 'EMBED' ||
    rawTag === 'SVG' ||
    rawTag === 'LINK' ||
    rawTag === 'META'
  ) {
    return null;
  }

  // Unwrap disallowed tags while keeping safe text/children
  if (!ALLOWED_TAGS.has(rawTag)) {
    const fragment = targetDoc.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) {
      const cleanChild = sanitizeDomNode(child, targetDoc);
      if (cleanChild) fragment.appendChild(cleanChild);
    }
    return fragment;
  }

  // Normalize legacy <font> to <span> with safe inline styles
  let outTag = rawTag.toLowerCase();
  if (outTag === 'b') outTag = 'strong';
  if (outTag === 'i') outTag = 'em';
  if (outTag === 'strike' || outTag === 'del') outTag = 's';
  if (outTag === 'font') outTag = 'span';

  const cleanEl = targetDoc.createElement(outTag);
  const stylePieces: string[] = [];

  if (rawTag === 'FONT') {
    const face = el.getAttribute('face');
    if (face && SAFE_FONT_FAMILY_REGEX.test(face)) {
      stylePieces.push(`font-family: ${face}`);
    }
    const color = el.getAttribute('color');
    if (color && SAFE_COLOR_REGEX.test(color)) {
      stylePieces.push(`color: ${color}`);
    }
    const size = el.getAttribute('size');
    if (size && LEGACY_FONT_SIZE_MAP[size.trim()]) {
      stylePieces.push(`font-size: ${LEGACY_FONT_SIZE_MAP[size.trim()]}`);
    }
  }

  const alignAttr = el.getAttribute('align');
  if (alignAttr && SAFE_ALIGN_VALUES.has(alignAttr.toLowerCase())) {
    stylePieces.push(`text-align: ${alignAttr.toLowerCase()}`);
  }

  const inlineStyle = sanitizeInlineStyle(el.getAttribute('style') || '');
  if (inlineStyle) {
    stylePieces.push(inlineStyle);
  }

  if (stylePieces.length > 0) {
    cleanEl.setAttribute('style', stylePieces.join('; '));
  }

  for (const child of Array.from(el.childNodes)) {
    const cleanChild = sanitizeDomNode(child, targetDoc);
    if (cleanChild) cleanEl.appendChild(cleanChild);
  }

  return cleanEl;
}

/**
 * Strictly sanitizes rich-text HTML for safe rendering and persistence.
 * Legacy plain text (without HTML tags) is preserved safely with line breaks.
 */
export function sanitizeRichTextHtml(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.replace(/\u200B/g, '').trim();
  if (!trimmed) return '';

  if (!containsHtmlMarkup(trimmed)) {
    return escapeHtmlText(trimmed).replace(/\n/g, '<br />');
  }

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    // Server-safe fallback
    return trimmed
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${trimmed}</div>`, 'text/html');
  const root = parsed.body.firstElementChild;
  if (!root) return '';

  const outDoc = document.implementation.createHTMLDocument('');
  const container = outDoc.createElement('div');
  for (const child of Array.from(root.childNodes)) {
    const clean = sanitizeDomNode(child, outDoc);
    if (clean) container.appendChild(clean);
  }
  return container.innerHTML.trim();
}

/**
 * Sanitizes single-line or compact rich-text fields (Headline, Photo Caption, Short Summary).
 * Strips empty trailing <br> and unnecessary outer <p>/<div> wrappers while preserving inline
 * formatting (bold, italic, underline, font family, size, color, highlight, alignment).
 */
export function sanitizeInlineRichTextHtml(raw: string, allowLineBreaks = false): string {
  const sanitized = sanitizeRichTextHtml(raw);
  if (!sanitized || !stripRichTextToPlainText(sanitized)) return '';
  if (!containsHtmlMarkup(sanitized)) {
    return allowLineBreaks ? sanitized : sanitized.replace(/<br\s*\/?>/gi, ' ').trim();
  }

  let cleaned = sanitized
    .replace(/^(?:<br\s*\/?>|\s)+/i, '')
    .replace(/(?:<br\s*\/?>|\s)+$/i, '');

  // If browser wrapped a single line in a plain <div> or <p> with no style, unwrap it cleanly
  const singleBlockMatch = cleaned.match(/^<(div|p)>([\s\S]*)<\/\1>$/i);
  if (singleBlockMatch && !/<\/(div|p)>/i.test(singleBlockMatch[2])) {
    cleaned = singleBlockMatch[2].trim();
  }

  if (!allowLineBreaks) {
    cleaned = cleaned.replace(/<br\s*\/?>/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  }
  return cleaned;
}

/**
 * Prepares an existing Headline, Summary, or Photo Caption value (plain or rich HTML)
 * for loading into a contentEditable RichTextField.
 */
export function fieldValueToEditorHtml(value: string): string {
  if (!value || !value.trim()) return '';
  return sanitizeRichTextHtml(value);
}

/**
 * Converts existing bodyKannada string[] (plain text or rich HTML blocks)
 * into clean editable HTML for the rich text editor.
 */
export function paragraphsToEditorHtml(paragraphs: string[]): string {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) return '';
  return paragraphs
    .map((block) => {
      const trimmed = (block || '').trim();
      if (!trimmed) return '';
      if (/^<(p|div|h2|h3|ul|ol|blockquote)\b/i.test(trimmed)) {
        return sanitizeRichTextHtml(trimmed);
      }
      if (containsHtmlMarkup(trimmed)) {
        return `<p>${sanitizeRichTextHtml(trimmed)}</p>`;
      }
      return `<p>${escapeHtmlText(trimmed).replace(/\n/g, '<br />')}</p>`;
    })
    .filter(Boolean)
    .join('');
}

/**
 * Extracts sanitized top-level blocks from the rich editor HTML into `string[]`
 * compatible with Google Sheets `fullContent` and Firestore `bodyKannada`.
 */
export function editorHtmlToParagraphs(html: string): string[] {
  if (!html || !html.trim()) return [];
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    const plain = stripRichTextToPlainText(html);
    return plain ? [plain] : [];
  }

  const sanitized = sanitizeRichTextHtml(html);
  if (!sanitized) return [];

  const parsed = new DOMParser().parseFromString(`<div>${sanitized}</div>`, 'text/html');
  const root = parsed.body.firstElementChild;
  if (!root) return [];

  const blocks: string[] = [];
  let inlineBuffer = '';

  const flushInlineBuffer = () => {
    const trimmed = inlineBuffer.trim();
    if (trimmed && stripRichTextToPlainText(trimmed)) {
      blocks.push(trimmed);
    }
    inlineBuffer = '';
  };

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const txt = child.textContent || '';
      if (txt.trim()) {
        inlineBuffer += escapeHtmlText(txt);
      }
      continue;
    }

    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toUpperCase();
      if (tag === 'P' || tag === 'DIV') {
        flushInlineBuffer();
        const inner = el.innerHTML.trim();
        const alignStyle = el.style?.textAlign ? ` style="text-align: ${el.style.textAlign}"` : '';
        if (inner && stripRichTextToPlainText(inner)) {
          if (alignStyle) {
            blocks.push(`<p${alignStyle}>${inner}</p>`);
          } else {
            blocks.push(inner);
          }
        }
      } else if (tag === 'H2' || tag === 'H3' || tag === 'UL' || tag === 'OL' || tag === 'BLOCKQUOTE') {
        flushInlineBuffer();
        const outer = el.outerHTML.trim();
        if (outer && stripRichTextToPlainText(outer)) {
          blocks.push(outer);
        }
      } else if (tag === 'BR') {
        if (inlineBuffer.trim()) {
          inlineBuffer += '<br />';
        }
      } else {
        inlineBuffer += el.outerHTML;
      }
    }
  }

  flushInlineBuffer();
  return blocks;
}
