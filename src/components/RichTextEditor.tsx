import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Palette,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import {
  EDITOR_FONT_OPTIONS,
  EDITOR_FONT_SIZES,
  EDITOR_HIGHLIGHT_COLORS,
  EDITOR_TEXT_COLORS,
  escapeHtmlText,
  sanitizeInlineRichTextHtml,
  sanitizeRichTextHtml,
  stripRichTextToPlainText,
} from '../utils/richText';

export interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  alignJustify: boolean;
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
}

const DEFAULT_FORMATS: ActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  unorderedList: false,
  orderedList: false,
  alignLeft: true,
  alignCenter: false,
  alignRight: false,
  alignJustify: false,
  fontFamily: EDITOR_FONT_OPTIONS[0].cssFamily,
  fontSizePx: 16,
  textColor: '#1e293b',
};

interface RegisteredField {
  id: string;
  label: string;
  element: HTMLDivElement;
  emitChange: () => void;
  singleLine: boolean;
}

export interface RichTextController {
  activeFieldId: string | null;
  activeFieldLabel: string;
  activeFieldSingleLine: boolean;
  formats: ActiveFormats;
  registerField: (field: RegisteredField) => () => void;
  activateField: (id: string) => void;
  saveSelection: (fieldId?: string) => void;
  refreshActiveFormats: () => void;
  execCmd: (command: string, commandValue?: string) => void;
  applyFontFamily: (cssFamily: string) => void;
  applyFontSizePx: (sizePx: number) => void;
  stepFontSize: (direction: 1 | -1) => void;
  applyTextColor: (hex: string) => void;
  applyHighlightColor: (hex: string) => void;
  applyBlockTag: (tagName: 'H2' | 'BLOCKQUOTE' | 'P') => void;
  clearFormatting: () => void;
}

function findMatchingFontOption(computedFont: string): string {
  const lower = (computedFont || '').toLowerCase();
  for (const opt of EDITOR_FONT_OPTIONS) {
    const primary = opt.cssFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    if (primary && lower.includes(primary)) {
      return opt.cssFamily;
    }
  }
  return EDITOR_FONT_OPTIONS[0].cssFamily;
}

function closestFontSize(px: number): number {
  let best = 16;
  let bestDiff = Infinity;
  for (const size of EDITOR_FONT_SIZES) {
    const diff = Math.abs(size - px);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = size;
    }
  }
  return best;
}

/**
 * Shared formatting controller that connects ONE top MS Word-style toolbar
 * to multiple rich-text fields (Headline, Short Summary, Full Report, Photo Caption).
 */
export function useRichTextController(defaultFieldId = 'headline'): RichTextController {
  const fieldsRef = useRef<Map<string, RegisteredField>>(new Map());
  const activeFieldIdRef = useRef<string | null>(defaultFieldId);
  const savedRangesRef = useRef<Map<string, Range>>(new Map());

  const [activeFieldId, setActiveFieldId] = useState<string | null>(defaultFieldId);
  const [activeFieldLabel, setActiveFieldLabel] = useState<string>('Headline');
  const [activeFieldSingleLine, setActiveFieldSingleLine] = useState<boolean>(true);
  const [formats, setFormats] = useState<ActiveFormats>(DEFAULT_FORMATS);

  const getActiveField = useCallback((): RegisteredField | null => {
    const currentId = activeFieldIdRef.current;
    if (currentId && fieldsRef.current.has(currentId)) {
      return fieldsRef.current.get(currentId) || null;
    }
    const fallback = fieldsRef.current.get(defaultFieldId) || fieldsRef.current.values().next().value;
    return fallback || null;
  }, [defaultFieldId]);

  const activateField = useCallback((id: string) => {
    const field = fieldsRef.current.get(id);
    if (!field) return;
    activeFieldIdRef.current = id;
    setActiveFieldId(id);
    setActiveFieldLabel(field.label);
    setActiveFieldSingleLine(field.singleLine);
  }, []);

  const saveSelection = useCallback(
    (explicitFieldId?: string) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

      if (explicitFieldId) {
        const target = fieldsRef.current.get(explicitFieldId);
        if (target && target.element.contains(range.commonAncestorContainer)) {
          savedRangesRef.current.set(explicitFieldId, range.cloneRange());
          activeFieldIdRef.current = explicitFieldId;
          setActiveFieldId(explicitFieldId);
          setActiveFieldLabel(target.label);
          setActiveFieldSingleLine(target.singleLine);
        }
        return;
      }

      for (const [id, field] of fieldsRef.current.entries()) {
        if (field.element.contains(range.commonAncestorContainer)) {
          savedRangesRef.current.set(id, range.cloneRange());
          activeFieldIdRef.current = id;
          setActiveFieldId(id);
          setActiveFieldLabel(field.label);
          setActiveFieldSingleLine(field.singleLine);
          return;
        }
      }
    },
    []
  );

  const restoreSelection = useCallback((): RegisteredField | null => {
    const field = getActiveField();
    if (!field) return null;

    field.element.focus();
    const sel = window.getSelection();
    if (!sel) return field;

    const saved = savedRangesRef.current.get(field.id);
    if (saved && field.element.contains(saved.commonAncestorContainer)) {
      try {
        sel.removeAllRanges();
        sel.addRange(saved);
        return field;
      } catch {
        // Fall through to end-of-field cursor
      }
    }

    // If selection is not currently inside the target element, place caret at end
    if (sel.rangeCount === 0 || !field.element.contains(sel.anchorNode)) {
      try {
        const range = document.createRange();
        range.selectNodeContents(field.element);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        // Ignore range errors
      }
    }
    return field;
  }, [getActiveField]);

  const refreshActiveFormats = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const anchorNode = sel.anchorNode;
    if (!anchorNode) return;

    let matchedField: RegisteredField | null = null;
    for (const field of fieldsRef.current.values()) {
      if (field.element.contains(anchorNode)) {
        matchedField = field;
        break;
      }
    }
    if (!matchedField) return;

    activeFieldIdRef.current = matchedField.id;
    setActiveFieldId(matchedField.id);
    setActiveFieldLabel(matchedField.label);
    setActiveFieldSingleLine(matchedField.singleLine);
    savedRangesRef.current.set(matchedField.id, sel.getRangeAt(0).cloneRange());

    const anchorEl =
      anchorNode.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as HTMLElement)
        : anchorNode.parentElement;

    let fontFamily = EDITOR_FONT_OPTIONS[0].cssFamily;
    let fontSizePx = 16;
    let textColor = '#1e293b';

    if (anchorEl && matchedField.element.contains(anchorEl)) {
      const computed = window.getComputedStyle(anchorEl);
      fontFamily = findMatchingFontOption(computed.fontFamily);
      const parsedPx = parseFloat(computed.fontSize);
      if (Number.isFinite(parsedPx)) {
        fontSizePx = closestFontSize(parsedPx);
      }
      if (computed.color) {
        textColor = computed.color;
      }
    }

    const queryState = (cmd: string): boolean => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };

    setFormats({
      bold: queryState('bold'),
      italic: queryState('italic'),
      underline: queryState('underline'),
      strikethrough: queryState('strikeThrough'),
      unorderedList: queryState('insertUnorderedList'),
      orderedList: queryState('insertOrderedList'),
      alignLeft: queryState('justifyLeft'),
      alignCenter: queryState('justifyCenter'),
      alignRight: queryState('justifyRight'),
      alignJustify: queryState('justifyFull'),
      fontFamily,
      fontSizePx,
      textColor,
    });
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      refreshActiveFormats();
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [refreshActiveFormats]);

  const registerField = useCallback((field: RegisteredField) => {
    fieldsRef.current.set(field.id, field);
    if (activeFieldIdRef.current === field.id) {
      setActiveFieldLabel(field.label);
      setActiveFieldSingleLine(field.singleLine);
    }
    return () => {
      fieldsRef.current.delete(field.id);
      savedRangesRef.current.delete(field.id);
    };
  }, []);

  const execCmd = useCallback(
    (command: string, commandValue?: string) => {
      const field = restoreSelection();
      if (!field) return;
      try {
        document.execCommand('styleWithCSS', false, 'false');
        document.execCommand(command, false, commandValue);
      } catch {
        // Ignore unsupported commands
      }
      field.emitChange();
      refreshActiveFormats();
    },
    [refreshActiveFormats, restoreSelection]
  );

  const applyFontFamily = useCallback(
    (cssFamily: string) => {
      const field = restoreSelection();
      if (!field) return;
      const el = field.element;
      const sel = window.getSelection();
      const isCollapsed = !sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed;

      if (isCollapsed && sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const span = document.createElement('span');
        span.style.fontFamily = cssFamily;
        span.appendChild(document.createTextNode('\u200B'));
        range.insertNode(span);
        const nextRange = document.createRange();
        nextRange.setStart(span.firstChild as Text, 1);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
      } else {
        try {
          document.execCommand('styleWithCSS', false, 'true');
          document.execCommand('fontName', false, cssFamily);
          el.querySelectorAll('font[face]').forEach((fontEl) => {
            const span = document.createElement('span');
            span.style.fontFamily = fontEl.getAttribute('face') || cssFamily;
            span.innerHTML = fontEl.innerHTML;
            fontEl.replaceWith(span);
          });
        } catch {
          // Ignore browser command errors
        }
      }
      setFormats((prev) => ({ ...prev, fontFamily: cssFamily }));
      field.emitChange();
      saveSelection(field.id);
    },
    [restoreSelection, saveSelection]
  );

  const applyFontSizePx = useCallback(
    (sizePx: number) => {
      const clamped = Math.max(12, Math.min(36, Math.round(sizePx)));
      const field = restoreSelection();
      if (!field) return;
      const el = field.element;
      const sel = window.getSelection();
      const isCollapsed = !sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed;

      if (isCollapsed && sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const span = document.createElement('span');
        span.style.fontSize = `${clamped}px`;
        span.appendChild(document.createTextNode('\u200B'));
        range.insertNode(span);
        const nextRange = document.createRange();
        nextRange.setStart(span.firstChild as Text, 1);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
      } else {
        try {
          document.execCommand('styleWithCSS', false, 'false');
          document.execCommand('fontSize', false, '7');
          el.querySelectorAll('font[size="7"]').forEach((fontEl) => {
            const span = document.createElement('span');
            span.style.fontSize = `${clamped}px`;
            span.innerHTML = fontEl.innerHTML;
            fontEl.replaceWith(span);
          });
          el.querySelectorAll<HTMLElement>('span[style]').forEach((spanEl) => {
            const fs = spanEl.style.fontSize;
            if (fs === '-webkit-xxx-large' || fs === 'xxx-large') {
              spanEl.style.fontSize = `${clamped}px`;
            }
          });
        } catch {
          // Ignore browser command errors
        }
      }
      setFormats((prev) => ({ ...prev, fontSizePx: clamped }));
      field.emitChange();
      saveSelection(field.id);
    },
    [restoreSelection, saveSelection]
  );

  const stepFontSize = useCallback(
    (direction: 1 | -1) => {
      const currentIdx = EDITOR_FONT_SIZES.indexOf(closestFontSize(formats.fontSizePx));
      const nextIdx = Math.max(
        0,
        Math.min(EDITOR_FONT_SIZES.length - 1, (currentIdx === -1 ? 2 : currentIdx) + direction)
      );
      applyFontSizePx(EDITOR_FONT_SIZES[nextIdx]);
    },
    [applyFontSizePx, formats.fontSizePx]
  );

  const applyTextColor = useCallback(
    (hex: string) => {
      const field = restoreSelection();
      if (!field) return;
      try {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('foreColor', false, hex);
      } catch {
        // Ignore
      }
      field.emitChange();
      saveSelection(field.id);
    },
    [restoreSelection, saveSelection]
  );

  const applyHighlightColor = useCallback(
    (hex: string) => {
      const field = restoreSelection();
      if (!field) return;
      try {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('hiliteColor', false, hex === 'transparent' ? 'transparent' : hex);
      } catch {
        try {
          document.execCommand('backColor', false, hex === 'transparent' ? 'transparent' : hex);
        } catch {
          // Ignore
        }
      }
      field.emitChange();
      saveSelection(field.id);
    },
    [restoreSelection, saveSelection]
  );

  const applyBlockTag = useCallback(
    (tagName: 'H2' | 'BLOCKQUOTE' | 'P') => {
      const field = restoreSelection();
      if (!field || field.singleLine) return;
      try {
        const currentBlock = document.queryCommandValue('formatBlock').toUpperCase();
        const target = currentBlock === tagName ? 'P' : tagName;
        document.execCommand('formatBlock', false, `<${target}>`);
      } catch {
        // Ignore
      }
      field.emitChange();
      refreshActiveFormats();
    },
    [refreshActiveFormats, restoreSelection]
  );

  const clearFormatting = useCallback(() => {
    const field = restoreSelection();
    if (!field) return;
    try {
      document.execCommand('removeFormat', false);
      if (!field.singleLine) {
        document.execCommand('formatBlock', false, '<P>');
      }
    } catch {
      // Ignore
    }
    field.emitChange();
    refreshActiveFormats();
  }, [refreshActiveFormats, restoreSelection]);

  return useMemo(
    () => ({
      activeFieldId,
      activeFieldLabel,
      activeFieldSingleLine,
      formats,
      registerField,
      activateField,
      saveSelection,
      refreshActiveFormats,
      execCmd,
      applyFontFamily,
      applyFontSizePx,
      stepFontSize,
      applyTextColor,
      applyHighlightColor,
      applyBlockTag,
      clearFormatting,
    }),
    [
      activeFieldId,
      activeFieldLabel,
      activeFieldSingleLine,
      formats,
      registerField,
      activateField,
      saveSelection,
      refreshActiveFormats,
      execCmd,
      applyFontFamily,
      applyFontSizePx,
      stepFontSize,
      applyTextColor,
      applyHighlightColor,
      applyBlockTag,
      clearFormatting,
    ]
  );
}

interface RichTextToolbarProps {
  controller: RichTextController;
  className?: string;
}

/**
 * Single unified MS Word-style formatting ribbon placed at the top of the Admin modal.
 * Applies Bold, Italic, Underline, Font, Size, Color, Highlight, Alignment & Lists
 * to whichever field (Headline, Summary, Full Report, or Photo Caption) is active.
 */
export function RichTextToolbar({ controller, className = '' }: RichTextToolbarProps) {
  const [openMenu, setOpenMenu] = useState<'color' | 'highlight' | null>(null);
  const [activeTextColor, setActiveTextColor] = useState('#0f274a');
  const [activeHighlightColor, setActiveHighlightColor] = useState('#fef08a');
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  const { formats, activeFieldLabel, activeFieldSingleLine } = controller;

  const toolBtnBase =
    'inline-flex items-center justify-center rounded border text-xs transition-colors cursor-pointer select-none min-h-[32px] disabled:opacity-40 disabled:cursor-not-allowed';
  const toolBtnIdle =
    'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300';
  const toolBtnActive = 'bg-[#0F274A] border-[#0F274A] text-white shadow-xs';

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Unified news text formatting toolbar"
      className={`bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-2.5 space-y-2 ${className}`}
    >
      {/* Row 1: Prominent Bold, Italic, Underline, Font Family, Font Size + Active Field Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Prominent Bold Button */}
          <button
            type="button"
            title="Bold (Ctrl+B)"
            aria-label="Bold"
            aria-pressed={formats.bold}
            onMouseDown={(e) => {
              e.preventDefault();
              controller.execCmd('bold');
            }}
            className={`${toolBtnBase} px-2.5 gap-1 font-bold ${
              formats.bold
                ? 'bg-[#0F274A] border-[#0F274A] text-white shadow-xs'
                : 'bg-white border-[#0F274A]/40 text-[#0F274A] hover:bg-[#0F274A]/10'
            }`}
          >
            <Bold className="w-4 h-4 stroke-[2.6]" aria-hidden="true" />
            <span>Bold</span>
          </button>

          <button
            type="button"
            title="Italic (Ctrl+I)"
            aria-label="Italic"
            aria-pressed={formats.italic}
            onMouseDown={(e) => {
              e.preventDefault();
              controller.execCmd('italic');
            }}
            className={`${toolBtnBase} w-8 ${formats.italic ? toolBtnActive : toolBtnIdle}`}
          >
            <Italic className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            title="Underline (Ctrl+U)"
            aria-label="Underline"
            aria-pressed={formats.underline}
            onMouseDown={(e) => {
              e.preventDefault();
              controller.execCmd('underline');
            }}
            className={`${toolBtnBase} w-8 ${formats.underline ? toolBtnActive : toolBtnIdle}`}
          >
            <Underline className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            title="Strikethrough"
            aria-label="Strikethrough"
            aria-pressed={formats.strikethrough}
            onMouseDown={(e) => {
              e.preventDefault();
              controller.execCmd('strikeThrough');
            }}
            className={`${toolBtnBase} w-8 ${formats.strikethrough ? toolBtnActive : toolBtnIdle}`}
          >
            <Strikethrough className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <span className="h-5 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

          {/* Font Family Selector (Kannada + Editorial Fonts) */}
          <select
            aria-label="Font family"
            title="Font Style"
            value={formats.fontFamily}
            onMouseDown={() => controller.saveSelection()}
            onChange={(e) => controller.applyFontFamily(e.target.value)}
            className="h-8 max-w-[180px] px-2 text-xs font-medium bg-white border border-slate-200 hover:border-slate-300 rounded text-slate-800 focus:outline-none focus:border-[#0F274A] cursor-pointer"
          >
            {EDITOR_FONT_OPTIONS.map((font) => (
              <option key={font.id} value={font.cssFamily} style={{ fontFamily: font.cssFamily }}>
                {font.label}
              </option>
            ))}
          </select>

          {/* Font Size Selector */}
          <select
            aria-label="Font size"
            title="Font Size"
            value={formats.fontSizePx}
            onMouseDown={() => controller.saveSelection()}
            onChange={(e) => controller.applyFontSizePx(Number(e.target.value))}
            className="h-8 w-[70px] px-1.5 text-xs font-medium bg-white border border-slate-200 hover:border-slate-300 rounded text-slate-800 focus:outline-none focus:border-[#0F274A] cursor-pointer tabular-nums"
          >
            {EDITOR_FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} px
              </option>
            ))}
          </select>

          <button
            type="button"
            title="Increase Font Size"
            aria-label="Increase Font Size"
            onMouseDown={(e) => {
              e.preventDefault();
              controller.stepFontSize(1);
            }}
            className={`${toolBtnBase} w-8 ${toolBtnIdle}`}
          >
            <AArrowUp className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            title="Decrease Font Size"
            aria-label="Decrease Font Size"
            onMouseDown={(e) => {
              e.preventDefault();
              controller.stepFontSize(-1);
            }}
            className={`${toolBtnBase} w-8 ${toolBtnIdle}`}
          >
            <AArrowDown className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Active Target Field Indicator */}
        <div className="text-[11px] font-semibold text-[#0F274A] bg-white border border-slate-200 rounded px-2.5 py-1 whitespace-nowrap">
          Target: <span className="text-emerald-800">{activeFieldLabel}</span>
        </div>
      </div>

      {/* Row 2: Text Color, Highlight, Alignment, Lists, Heading, Quote, Undo/Redo, Clear */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-200/70">
        {/* Text Color Picker */}
        <div className="relative">
          <button
            type="button"
            title="Font Color"
            aria-label="Font Color"
            onMouseDown={(e) => {
              e.preventDefault();
              controller.saveSelection();
              setOpenMenu((prev) => (prev === 'color' ? null : 'color'));
            }}
            className={`${toolBtnBase} px-2 gap-1 ${toolBtnIdle}`}
          >
            <Palette className="w-3.5 h-3.5" aria-hidden="true" />
            <span
              className="w-3.5 h-1.5 rounded-xs border border-slate-300"
              style={{ backgroundColor: activeTextColor }}
              aria-hidden="true"
            />
          </button>
          {openMenu === 'color' && (
            <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-44">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Text Color
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {EDITOR_TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setActiveTextColor(c.value);
                      setOpenMenu(null);
                      controller.applyTextColor(c.value);
                    }}
                    className="w-8 h-7 rounded border border-slate-200 hover:scale-105 transition-transform cursor-pointer"
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Highlight Color Picker */}
        <div className="relative">
          <button
            type="button"
            title="Text Highlight Color"
            aria-label="Text Highlight Color"
            onMouseDown={(e) => {
              e.preventDefault();
              controller.saveSelection();
              setOpenMenu((prev) => (prev === 'highlight' ? null : 'highlight'));
            }}
            className={`${toolBtnBase} px-2 gap-1 ${toolBtnIdle}`}
          >
            <Highlighter className="w-3.5 h-3.5" aria-hidden="true" />
            <span
              className="w-3.5 h-1.5 rounded-xs border border-slate-300"
              style={{
                backgroundColor:
                  activeHighlightColor === 'transparent' ? '#ffffff' : activeHighlightColor,
              }}
              aria-hidden="true"
            />
          </button>
          {openMenu === 'highlight' && (
            <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-44">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Highlight Color
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {EDITOR_HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setActiveHighlightColor(c.value);
                      setOpenMenu(null);
                      controller.applyHighlightColor(c.value);
                    }}
                    className="h-7 px-1 rounded border border-slate-200 text-[10px] font-medium text-slate-700 hover:scale-105 transition-transform cursor-pointer"
                    style={{
                      backgroundColor: c.value === 'transparent' ? '#f8fafc' : c.value,
                    }}
                  >
                    {c.value === 'transparent' ? 'None' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <span className="h-5 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

        {/* Alignment */}
        <button
          type="button"
          title="Align Left"
          aria-label="Align Left"
          onMouseDown={(e) => {
            e.preventDefault();
            controller.execCmd('justifyLeft');
          }}
          className={`${toolBtnBase} w-8 ${formats.alignLeft ? toolBtnActive : toolBtnIdle}`}
        >
          <AlignLeft className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Align Center"
          aria-label="Align Center"
          onMouseDown={(e) => {
            e.preventDefault();
            controller.execCmd('justifyCenter');
          }}
          className={`${toolBtnBase} w-8 ${formats.alignCenter ? toolBtnActive : toolBtnIdle}`}
        >
          <AlignCenter className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Align Right"
          aria-label="Align Right"
          onMouseDown={(e) => {
            e.preventDefault();
            controller.execCmd('justifyRight');
          }}
          className={`${toolBtnBase} w-8 ${formats.alignRight ? toolBtnActive : toolBtnIdle}`}
        >
          <AlignRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Justify"
          aria-label="Justify"
          onMouseDown={(e) => {
            e.preventDefault();
            controller.execCmd('justifyFull');
          }}
          className={`${toolBtnBase} w-8 ${formats.alignJustify ? toolBtnActive : toolBtnIdle}`}
        >
          <AlignJustify className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        <span className="h-5 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

        {/* Lists & Editorial Blocks (Multi-line fields: Summary & Full Report) */}
        <button
          type="button"
          disabled={activeFieldSingleLine}
          title={activeFieldSingleLine ? 'Lists work in Summary & Full Report' : 'Bullet List'}
          aria-label="Bullet List"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!activeFieldSingleLine) controller.execCmd('insertUnorderedList');
          }}
          className={`${toolBtnBase} w-8 ${formats.unorderedList && !activeFieldSingleLine ? toolBtnActive : toolBtnIdle}`}
        >
          <List className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={activeFieldSingleLine}
          title={activeFieldSingleLine ? 'Lists work in Summary & Full Report' : 'Numbered List'}
          aria-label="Numbered List"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!activeFieldSingleLine) controller.execCmd('insertOrderedList');
          }}
          className={`${toolBtnBase} w-8 ${formats.orderedList && !activeFieldSingleLine ? toolBtnActive : toolBtnIdle}`}
        >
          <ListOrdered className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={activeFieldSingleLine}
          title={activeFieldSingleLine ? 'Subheading works in Full Report' : 'Subheading'}
          aria-label="Toggle Subheading"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!activeFieldSingleLine) controller.applyBlockTag('H2');
          }}
          className={`${toolBtnBase} w-8 ${toolBtnIdle}`}
        >
          <Heading2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={activeFieldSingleLine}
          title={activeFieldSingleLine ? 'Quote works in Full Report' : 'Quote Block'}
          aria-label="Toggle Quote"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!activeFieldSingleLine) controller.applyBlockTag('BLOCKQUOTE');
          }}
          className={`${toolBtnBase} w-8 ${toolBtnIdle}`}
        >
          <Quote className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        <span className="h-5 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

        {/* Undo, Redo & Clear Formatting */}
        <button
          type="button"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          onMouseDown={(e) => {
            e.preventDefault();
            controller.execCmd('undo');
          }}
          className={`${toolBtnBase} w-8 ${toolBtnIdle}`}
        >
          <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          onMouseDown={(e) => {
            e.preventDefault();
            controller.execCmd('redo');
          }}
          className={`${toolBtnBase} w-8 ${toolBtnIdle}`}
        >
          <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Clear Formatting"
          aria-label="Clear Formatting"
          onMouseDown={(e) => {
            e.preventDefault();
            controller.clearFormatting();
          }}
          className={`${toolBtnBase} px-2 gap-1 ${toolBtnIdle}`}
        >
          <RemoveFormatting className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline text-[11px]">Clear</span>
        </button>
      </div>
    </div>
  );
}

interface RichTextFieldProps {
  id?: string;
  fieldId: string;
  fieldLabel: string;
  controller: RichTextController;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  singleLine?: boolean;
  minHeightClass?: string;
  maxHeightClass?: string;
  contentClassName?: string;
  showStats?: boolean;
}

/**
 * Editable rich-text input/textarea box linked to the single top RichTextToolbar.
 * Click or select text inside any RichTextField and use the top ribbon to style it.
 */
export function RichTextField({
  id,
  fieldId,
  fieldLabel,
  controller,
  value,
  onChange,
  placeholder = '',
  singleLine = false,
  minHeightClass = 'min-h-[42px]',
  maxHeightClass = 'max-h-[340px]',
  contentClassName = 'text-sm leading-relaxed',
  showStats = false,
}: RichTextFieldProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedHtmlRef = useRef<string>(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const rawHtml = el.innerHTML;
    const cleaned = stripRichTextToPlainText(rawHtml) ? rawHtml : '';
    lastEmittedHtmlRef.current = cleaned;
    onChangeRef.current(cleaned);
  }, []);

  // Register this box with the unified top toolbar controller
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    return controller.registerField({
      id: fieldId,
      label: fieldLabel,
      element: el,
      emitChange,
      singleLine,
    });
  }, [controller, emitChange, fieldId, fieldLabel, singleLine]);

  // Sync external value changes (e.g., opening modal for a different article)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastEmittedHtmlRef.current) {
      el.innerHTML = value || '';
      lastEmittedHtmlRef.current = value || '';
    }
  }, [value]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (singleLine && e.key === 'Enter') {
        e.preventDefault();
      }
    },
    [singleLine]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const htmlData = e.clipboardData.getData('text/html');
      const plainData = e.clipboardData.getData('text/plain');

      let insertable = '';
      if (htmlData && htmlData.trim()) {
        insertable = singleLine
          ? sanitizeInlineRichTextHtml(htmlData, false)
          : sanitizeRichTextHtml(htmlData);
      } else if (plainData) {
        if (singleLine) {
          insertable = escapeHtmlText(plainData.replace(/\r?\n+/g, ' ').trim());
        } else {
          insertable = plainData
            .split(/\r?\n/)
            .map((line) => escapeHtmlText(line))
            .join('<br />');
        }
      }

      if (!insertable) return;
      try {
        document.execCommand('insertHTML', false, insertable);
      } catch {
        document.execCommand(
          'insertText',
          false,
          singleLine ? plainData.replace(/\r?\n+/g, ' ') : plainData
        );
      }
      emitChange();
    },
    [emitChange, singleLine]
  );

  const plainStats = stripRichTextToPlainText(value);
  const wordCount = plainStats ? plainStats.split(/\s+/).filter(Boolean).length : 0;
  const charCount = plainStats.length;
  const isActive = controller.activeFieldId === fieldId;

  return (
    <div
      className={`border rounded-md bg-white overflow-hidden transition-colors ${
        isActive
          ? 'border-[#0F274A] ring-1 ring-[#0F274A]/20'
          : 'border-slate-300 hover:border-slate-400'
      }`}
    >
      <div className="relative">
        {!plainStats && placeholder && (
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute top-2.5 left-3 right-3 text-sm font-kannada text-slate-400 truncate"
          >
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          id={id}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline={!singleLine}
          aria-label={fieldLabel}
          onFocus={() => {
            controller.activateField(fieldId);
            controller.refreshActiveFormats();
          }}
          onInput={() => {
            emitChange();
            controller.refreshActiveFormats();
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={() => controller.refreshActiveFormats()}
          onMouseUp={() => {
            controller.activateField(fieldId);
            controller.refreshActiveFormats();
          }}
          onBlur={() => controller.saveSelection(fieldId)}
          onPaste={handlePaste}
          className={`article-rich-content ${
            singleLine ? 'article-rich-inline' : ''
          } font-kannada w-full px-3 py-2 text-slate-900 outline-none overflow-y-auto ${minHeightClass} ${maxHeightClass} ${contentClassName}`}
        />
      </div>

      {showStats && (
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            Use the <strong className="text-slate-700">top formatting bar</strong> for Headline, Summary, Report &amp; Caption ·{' '}
            <kbd className="font-mono text-[10px] px-1 py-0.5 bg-white border border-slate-200 rounded">
              Ctrl+B
            </kbd>{' '}
            <kbd className="font-mono text-[10px] px-1 py-0.5 bg-white border border-slate-200 rounded">
              Ctrl+I
            </kbd>{' '}
            <kbd className="font-mono text-[10px] px-1 py-0.5 bg-white border border-slate-200 rounded">
              Ctrl+U
            </kbd>
          </span>
          <span className="tabular-nums font-medium text-slate-600">
            {wordCount} words · {charCount} chars
          </span>
        </div>
      )}
    </div>
  );
}

interface RichTextEditorProps {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClass?: string;
}

/**
 * Standalone wrapper preserved for compatibility if used outside the unified modal.
 */
export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = 'ಸಂಪೂರ್ಣ ವರದಿಯನ್ನು ಕನ್ನಡದಲ್ಲಿ ನಮೂದಿಸಿ...',
  minHeightClass = 'min-h-[220px]',
}: RichTextEditorProps) {
  const controller = useRichTextController('standalone');
  return (
    <div className="border border-slate-300 rounded-lg bg-white overflow-hidden">
      <RichTextToolbar controller={controller} className="px-2.5 py-2" />
      <RichTextField
        id={id}
        fieldId="standalone"
        fieldLabel="Full Report"
        controller={controller}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeightClass={minHeightClass}
        contentClassName="text-[15px] leading-[1.8]"
        showStats
      />
    </div>
  );
}
