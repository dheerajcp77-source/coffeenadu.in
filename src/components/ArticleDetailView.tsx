import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  MapPin,
  MessageSquare,
  Pause,
  Square,
  ThumbsUp,
  Type,
  Volume2,
} from 'lucide-react';
import { getKannadaLocationLabel, resolveArticleImage } from '../constants/newsData';
import { recordArticleView } from '../services/articlesStore';
import type { AdPlatformSettings, Advertisement } from '../types/ads';
import type { NewsArticle } from '../types/news';
import {
  getAdjacentArticles,
  getSameLocationArticles,
  getSmartRecommendations,
} from '../utils/newsHelpers';
import type {
  HistoryArticleSnapshot,
  ReadingFontScale,
  ReadingPreferences,
} from '../utils/readerPreferences';
import { sanitizeRichTextHtml, stripRichTextToPlainText } from '../utils/richText';
import { ArticleEndAd } from './ArticleEndAd';
import { ArticleInlineAd } from './ArticleInlineAd';
import { ArticleShareBar } from './ArticleShareBar';
import { NewsImage } from './NewsImage';
import { ArticleEcosystemEngagement } from './platform/ArticleEcosystemEngagement';
import { WhatsAppGroupBanner } from './WhatsAppGroupBanner';
import type { PlatformLanguage, PlatformListing, PlatformModuleId } from '../types/platform';

interface ArticleDetailViewProps {
  article: NewsArticle;
  allArticles: NewsArticle[];
  relatedArticles: NewsArticle[];
  activeAds?: Advertisement[];
  adSettings?: AdPlatformSettings | null;
  isBookmarked: boolean;
  readingPrefs: ReadingPreferences;
  readingHistory: HistoryArticleSnapshot[];
  onToggleBookmark: (article: NewsArticle) => void;
  onUpdateReadingPrefs: (next: ReadingPreferences) => void;
  onBack: () => void;
  onSelectArticle: (article: NewsArticle) => void;
  onSelectAd?: (ad: Advertisement) => void;
  onOpenMessageAdmin?: () => void;
  platformLang?: PlatformLanguage;
  platformListings?: PlatformListing[];
  onNavigatePlatformModule?: (modId: PlatformModuleId, listingId?: string) => void;
  onExploreAllServices?: () => void;
}

const FONT_SCALE_ORDER: ReadingFontScale[] = ['sm', 'md', 'lg', 'xl'];

const FONT_SCALE_CLASSES: Record<ReadingFontScale, string> = {
  sm: 'text-[15px] leading-[1.78]',
  md: 'text-base sm:text-[17px] leading-[1.85]',
  lg: 'text-[18px] sm:text-[19px] leading-[1.9]',
  xl: 'text-[20px] sm:text-[21px] leading-[1.95]',
};

export function ArticleDetailView({
  article,
  allArticles,
  relatedArticles,
  activeAds = [],
  adSettings,
  isBookmarked,
  readingPrefs,
  readingHistory,
  onToggleBookmark,
  onUpdateReadingPrefs,
  onBack,
  onSelectArticle,
  onSelectAd,
  onOpenMessageAdmin,
  platformLang = 'kn',
  platformListings = [],
  onNavigatePlatformModule,
  onExploreAllServices,
}: ArticleDetailViewProps) {
  const resolvedImage = resolveArticleImage(article);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [ttsState, setTtsState] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [feedbackSent, setFeedbackSent] = useState<'helpful' | 'informative' | 'correction' | null>(
    null
  );
  const [feedbackCounts, setFeedbackCounts] = useState({
    helpful: 0,
    informative: 0,
    correction: 0,
  });

  const isMountedRef = useRef(true);
  const recordedMountArticleIdRef = useRef<string | null>(null);
  const articleContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    setFeedbackSent(null);
    setTtsState('idle');
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [article.id]);

  // Preserve single-per-mount/article-open backend view counting
  useEffect(() => {
    if (recordedMountArticleIdRef.current === article.id) return;
    recordedMountArticleIdRef.current = article.id;

    void recordArticleView(article);
  }, [article]);

  // Fetch article reader feedback counts
  useEffect(() => {
    let active = true;
    fetch(`/api/public/article-feedback/${encodeURIComponent(article.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { ok?: boolean; counts?: { helpful: number; informative: number; correction: number } } | null) => {
        if (active && json?.ok && json.counts) {
          setFeedbackCounts(json.counts);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [article.id]);

  // Reading progress indicator
  useEffect(() => {
    const updateProgress = () => {
      const el = articleContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const totalScrollable = Math.max(1, el.offsetHeight - window.innerHeight * 0.65);
      const scrolled = Math.max(0, -rect.top + window.innerHeight * 0.2);
      const pct = Math.min(100, Math.max(0, Math.round((scrolled / totalScrollable) * 100)));
      setScrollProgress(pct);
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    return () => window.removeEventListener('scroll', updateProgress);
  }, [article.id]);

  const supportsTts =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const toggleListen = () => {
    if (!supportsTts) return;
    const synth = window.speechSynthesis;
    if (ttsState === 'speaking') {
      synth.pause();
      setTtsState('paused');
      return;
    }
    if (ttsState === 'paused') {
      synth.resume();
      setTtsState('speaking');
      return;
    }

    synth.cancel();
    const fullText = [
      stripRichTextToPlainText(article.titleKannada),
      stripRichTextToPlainText(article.summaryKannada),
      ...article.bodyKannada.map((p) => stripRichTextToPlainText(p)),
    ]
      .filter(Boolean)
      .join('. ');

    if (!fullText) return;
    const utterance = new SpeechSynthesisUtterance(fullText);
    const hasKannadaChars = /[\u0C80-\u0CFF]/.test(fullText);
    utterance.lang = hasKannadaChars ? 'kn-IN' : 'en-IN';
    utterance.rate = 0.96;
    utterance.onend = () => {
      if (isMountedRef.current) setTtsState('idle');
    };
    utterance.onerror = () => {
      if (isMountedRef.current) setTtsState('idle');
    };
    setTtsState('speaking');
    synth.speak(utterance);
  };

  const stopListen = () => {
    if (!supportsTts) return;
    window.speechSynthesis.cancel();
    setTtsState('idle');
  };

  const submitFeedback = async (type: 'helpful' | 'informative' | 'correction') => {
    if (feedbackSent) return;
    setFeedbackSent(type);
    try {
      const resp = await fetch('/api/public/article-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: article.id, type }),
      });
      const json = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        counts?: { helpful: number; informative: number; correction: number };
      } | null;
      if (resp.ok && json?.ok && json.counts) {
        setFeedbackCounts(json.counts);
      }
    } catch {
      // Non-fatal
    }
  };

  const stepFontScale = (delta: -1 | 1) => {
    const idx = FONT_SCALE_ORDER.indexOf(readingPrefs.fontScale);
    const nextIdx = Math.max(0, Math.min(FONT_SCALE_ORDER.length - 1, idx + delta));
    onUpdateReadingPrefs({ ...readingPrefs, fontScale: FONT_SCALE_ORDER[nextIdx] });
  };

  const smartRecommendations = useMemo(() => {
    const base = allArticles.length > 0 ? allArticles : relatedArticles;
    return getSmartRecommendations(article, base, readingHistory, 4);
  }, [article, allArticles, relatedArticles, readingHistory]);

  const sameLocationStories = useMemo(() => {
    const base = allArticles.length > 0 ? allArticles : relatedArticles;
    return getSameLocationArticles(article, base, 3);
  }, [article, allArticles, relatedArticles]);

  const { previous: previousArticle, next: nextArticle } = useMemo(() => {
    const base = allArticles.length > 0 ? allArticles : relatedArticles;
    return getAdjacentArticles(article, base);
  }, [article, allArticles, relatedArticles]);

  const placeLabel = getKannadaLocationLabel(article.location);

  return (
    <>
      {/* Sticky Top Reading Progress Bar */}
      <div
        className="fixed top-0 left-0 right-0 z-50 h-1 bg-transparent pointer-events-none"
        aria-hidden="true"
      >
        <div
          className="h-full bg-gradient-to-r from-[#176B4A] via-[#D9A441] to-[#176B4A] transition-[width] duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 select-none">
        {/* Top Action Row with Back + Bookmark + Share */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#17263A] dark:text-slate-200 hover:text-[#176B4A] dark:hover:text-[#D9A441] transition-colors cursor-pointer min-h-[42px] px-2 -ml-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176B4A]"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to Feed</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleBookmark(article)}
              aria-pressed={isBookmarked}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer min-h-[40px] ${
                isBookmarked
                  ? 'bg-[#10243D] text-white border-[#10243D] dark:bg-[#D9A441] dark:text-[#10243D] dark:border-[#D9A441]'
                  : 'bg-white dark:bg-[#0F1E33] text-[#17263A] dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-[#10243D]'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
              <span>{isBookmarked ? 'Saved' : 'Save'}</span>
            </button>
            <ArticleShareBar article={article} />
          </div>
        </div>

        {/* Protected Article Body */}
        <article
          ref={articleContainerRef}
          className={`relative py-7 sm:py-8 mx-auto overflow-hidden transition-all ${
            readingPrefs.comfortMode ? 'max-w-2xl' : 'max-w-3xl'
          }`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 news-watermark-layer opacity-60 z-10"
          />

          <div className="relative z-20">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#738093] dark:text-slate-400 mb-4">
              <span className="uppercase tracking-wider text-[#176B4A] dark:text-[#D9A441] font-bold">
                {article.category}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-kannada inline-flex items-center gap-1 text-[#17263A] dark:text-slate-200">
                <MapPin className="w-3.5 h-3.5 text-[#176B4A] dark:text-[#D9A441]" />
                {placeLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span>{article.publishedDate}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{article.publishedTime}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{article.readTimeMinutes} min read</span>
            </div>

            <h1
              className="article-rich-content article-rich-inline font-kannada text-2xl sm:text-3xl lg:text-4xl font-bold text-[#10243D] dark:text-white leading-snug text-balance mb-5"
              dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(article.titleKannada) }}
            />

            {/* Inline Ad Position: Below Article Headline */}
            {onSelectAd && activeAds.length > 0 && (
              <ArticleInlineAd
                ads={activeAds}
                settings={adSettings}
                articleId={article.id}
                slot="belowHeadline"
                onOpenAd={onSelectAd}
              />
            )}

            <div
              className="article-rich-content article-rich-inline font-kannada text-base sm:text-lg text-slate-700 dark:text-slate-200 leading-relaxed mb-5 pb-5 border-b border-slate-200 dark:border-slate-800"
              dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(article.summaryKannada) }}
            />

            {/* Reader Controls Toolbar (Font Size, Comfort Reading, Listen to News) */}
            <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1E33] p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-xs">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#13253E] p-0.5">
                  <button
                    type="button"
                    onClick={() => stepFontScale(-1)}
                    disabled={readingPrefs.fontScale === 'sm'}
                    aria-label="Decrease article font size"
                    className="px-2.5 py-1.5 text-xs font-bold text-[#17263A] dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    A-
                  </button>
                  <span className="px-1.5 text-[11px] font-semibold text-[#738093] dark:text-slate-400 inline-flex items-center gap-1">
                    <Type className="w-3 h-3" />
                    {readingPrefs.fontScale.toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={() => stepFontScale(1)}
                    disabled={readingPrefs.fontScale === 'xl'}
                    aria-label="Increase article font size"
                    className="px-2.5 py-1.5 text-xs font-bold text-[#17263A] dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    A+
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateReadingPrefs({
                      ...readingPrefs,
                      comfortMode: !readingPrefs.comfortMode,
                    })
                  }
                  aria-pressed={readingPrefs.comfortMode}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer min-h-[34px] ${
                    readingPrefs.comfortMode
                      ? 'bg-[#176B4A] text-white border-[#176B4A]'
                      : 'bg-slate-50 dark:bg-[#13253E] text-[#17263A] dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Comfort View</span>
                </button>
              </div>

              {supportsTts && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleListen}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer min-h-[34px] ${
                      ttsState === 'speaking'
                        ? 'bg-[#D9A441] text-[#10243D]'
                        : 'bg-[#10243D] text-white dark:bg-[#1A3558] hover:bg-[#183357]'
                    }`}
                  >
                    {ttsState === 'speaking' ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause Audio</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{ttsState === 'paused' ? 'Resume Listen' : 'Listen to News'}</span>
                      </>
                    )}
                  </button>
                  {ttsState !== 'idle' && (
                    <button
                      type="button"
                      onClick={stopListen}
                      aria-label="Stop reading aloud"
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Inline Ad Position: Below Article Summary */}
            {onSelectAd && activeAds.length > 0 && (
              <ArticleInlineAd
                ads={activeAds}
                settings={adSettings}
                articleId={article.id}
                slot="belowSummary"
                onOpenAd={onSelectAd}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#738093] dark:text-slate-400 mb-6">
              <span>
                Reported by{' '}
                <strong className="font-semibold text-[#17263A] dark:text-slate-100">
                  {article.reporter}
                </strong>
              </span>
              <span>Koppa Taluk Desk · Protected Read-Only</span>
            </div>

            {resolvedImage && (
              <figure className="mb-8">
                <NewsImage
                  src={resolvedImage}
                  alt={stripRichTextToPlainText(article.titleKannada)}
                  fitMode="natural"
                  maxHeightClass="max-h-[560px]"
                  className="rounded-xl border border-slate-200 dark:border-slate-800"
                  watermarkApplied={Boolean(article.watermarkApplied && article.imageUrl)}
                />
                {article.imageCaption && (
                  <figcaption
                    className="article-rich-content article-rich-inline font-kannada text-xs text-[#738093] dark:text-slate-400 mt-2.5 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(article.imageCaption) }}
                  />
                )}
              </figure>
            )}

            <div
              className={`article-rich-content space-y-5 font-kannada text-[#17263A] dark:text-slate-100 ${
                readingPrefs.comfortMode ? 'max-w-[65ch] mx-auto' : 'max-w-prose'
              } ${FONT_SCALE_CLASSES[readingPrefs.fontScale]}`}
            >
              {article.bodyKannada.map((paragraph, index) => {
                const sanitized = sanitizeRichTextHtml(paragraph);
                if (!sanitized) return null;
                const isBlockWrapper = /^<(p|div|h2|h3|ul|ol|blockquote)\b/i.test(sanitized);
                const paragraphNum = index + 1;
                return (
                  <div key={index} className="space-y-5">
                    {isBlockWrapper ? (
                      <div dangerouslySetInnerHTML={{ __html: sanitized }} />
                    ) : (
                      <p dangerouslySetInnerHTML={{ __html: sanitized }} />
                    )}

                    {/* Inline Ad Position: Between Article Paragraphs */}
                    {onSelectAd && activeAds.length > 0 && (
                      <ArticleInlineAd
                        ads={activeAds}
                        settings={adSettings}
                        articleId={article.id}
                        slot="betweenParagraphs"
                        paragraphNumber={paragraphNum}
                        onOpenAd={onSelectAd}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Extra Photos Gallery */}
            {article.extraImages && article.extraImages.length > 0 && (
              <section
                aria-label="Additional news photos"
                className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-kannada text-sm font-bold text-[#10243D] dark:text-white tracking-wide">
                    ಹೆಚ್ಚುವರಿ ಚಿತ್ರಗಳು · More Photos ({article.extraImages.length})
                  </h2>
                </div>

                <div className="space-y-6">
                  {article.extraImages.map((photo, idx) => (
                    <figure key={`${photo.imageDriveId || photo.imageUrl.slice(0, 28)}-${idx}`}>
                      <NewsImage
                        src={photo.imageUrl}
                        alt={
                          photo.caption ||
                          `${stripRichTextToPlainText(article.titleKannada)} - Photo ${idx + 2}`
                        }
                        fitMode="natural"
                        maxHeightClass="max-h-[540px]"
                        className="rounded-xl border border-slate-200 dark:border-slate-800"
                        watermarkApplied={photo.watermarkApplied !== false}
                      />
                      {photo.caption && (
                        <figcaption className="font-kannada text-xs text-[#738093] dark:text-slate-400 mt-2 leading-relaxed">
                          {photo.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {/* Join Coffeenadu News WhatsApp Group */}
            <div className="mt-8">
              <WhatsAppGroupBanner variant="card" />
            </div>

            {/* Reader Feedback Box */}
            <section
              aria-label="Reader article feedback"
              className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1E33] p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#10243D] dark:text-white">
                    Was this report helpful?
                  </h2>
                  <p className="font-kannada text-[11px] text-[#738093] dark:text-slate-400">
                    ಈ ಸುದ್ದಿ ಕುರಿತು ನಿಮ್ಮ ಅಭಿಪ್ರಾಯ ತಿಳಿಸಿ
                  </p>
                </div>
                {onOpenMessageAdmin && (
                  <button
                    type="button"
                    onClick={onOpenMessageAdmin}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Message Desk
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void submitFeedback('helpful')}
                  disabled={Boolean(feedbackSent)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:cursor-default ${
                    feedbackSent === 'helpful'
                      ? 'bg-[#176B4A] text-white border-[#176B4A]'
                      : 'bg-slate-50 dark:bg-[#13253E] text-[#17263A] dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-[#176B4A]'
                  }`}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  <span>Helpful</span>
                  {feedbackCounts.helpful > 0 && (
                    <span className="tabular-nums opacity-80">({feedbackCounts.helpful})</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void submitFeedback('informative')}
                  disabled={Boolean(feedbackSent)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:cursor-default ${
                    feedbackSent === 'informative'
                      ? 'bg-[#10243D] text-white border-[#10243D]'
                      : 'bg-slate-50 dark:bg-[#13253E] text-[#17263A] dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-[#10243D]'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Clear &amp; Accurate</span>
                  {feedbackCounts.informative > 0 && (
                    <span className="tabular-nums opacity-80">({feedbackCounts.informative})</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void submitFeedback('correction')}
                  disabled={Boolean(feedbackSent)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:cursor-default ${
                    feedbackSent === 'correction'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-slate-50 dark:bg-[#13253E] text-[#17263A] dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-amber-500'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Report Issue</span>
                </button>
              </div>
              {feedbackSent && (
                <p className="mt-2 text-xs font-semibold text-[#176B4A] dark:text-emerald-400">
                  Thank you! Your feedback has been recorded.
                </p>
              )}
            </section>

            {/* Inline Ad Position: Above Article Sharing Section */}
            {onSelectAd && activeAds.length > 0 && (
              <ArticleInlineAd
                ads={activeAds}
                settings={adSettings}
                articleId={article.id}
                slot="aboveSharing"
                onOpenAd={onSelectAd}
              />
            )}

            {/* Share Bar below article */}
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#738093] dark:text-slate-400">
                Share this story
              </span>
              <ArticleShareBar article={article} />
            </div>

            {/* Previous / Next Article Navigation */}
            {(previousArticle || nextArticle) && (
              <nav
                aria-label="Adjacent news articles"
                className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                {previousArticle ? (
                  <button
                    type="button"
                    onClick={() => onSelectArticle(previousArticle)}
                    className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1E33] p-3.5 hover:border-[#10243D] dark:hover:border-[#D9A441] transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#738093] dark:text-slate-400">
                      <ArrowLeft className="w-3 h-3" />
                      Previous Story
                    </span>
                    <p className="font-kannada text-xs sm:text-sm font-bold text-[#17263A] dark:text-slate-100 line-clamp-2 mt-1">
                      {stripRichTextToPlainText(previousArticle.titleKannada)}
                    </p>
                  </button>
                ) : (
                  <div className="hidden sm:block" />
                )}

                {nextArticle && (
                  <button
                    type="button"
                    onClick={() => onSelectArticle(nextArticle)}
                    className="text-left sm:text-right rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1E33] p-3.5 hover:border-[#10243D] dark:hover:border-[#D9A441] transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#738093] dark:text-slate-400">
                      Next Story
                      <ArrowRight className="w-3 h-3" />
                    </span>
                    <p className="font-kannada text-xs sm:text-sm font-bold text-[#17263A] dark:text-slate-100 line-clamp-2 mt-1">
                      {stripRichTextToPlainText(nextArticle.titleKannada)}
                    </p>
                  </button>
                )}
              </nav>
            )}

            {/* Post-Article Malnad Platform Discovery & Contextual Recommendations */}
            {onNavigatePlatformModule && onExploreAllServices && (
              <ArticleEcosystemEngagement
                articleLocation={article.location}
                articleCategory={article.category}
                lang={platformLang}
                allListings={platformListings}
                onNavigateModule={onNavigatePlatformModule}
                onExploreAll={onExploreAllServices}
              />
            )}
          </div>
        </article>

        {/* End of Article Advertisement (Before Related Stories) */}
        {onSelectAd && activeAds.length > 0 && (
          <ArticleEndAd
            ads={activeAds}
            settings={adSettings}
            articleId={article.id}
            position="before_related"
            onOpenAd={onSelectAd}
          />
        )}

        {/* More from Same Location */}
        {sameLocationStories.length > 0 && (
          <section
            aria-label="More news from this location"
            className="mt-6 pt-7 border-t border-slate-200 dark:border-slate-800 max-w-3xl mx-auto"
          >
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#176B4A] dark:text-[#D9A441] mb-4 font-kannada">
              More from {placeLabel}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {sameLocationStories.map((locArticle) => (
                <button
                  key={locArticle.id}
                  type="button"
                  onClick={() => onSelectArticle(locArticle)}
                  className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F1E33] p-3 hover:border-[#10243D] dark:hover:border-[#D9A441] transition-colors cursor-pointer flex flex-col justify-between gap-2"
                >
                  <h3 className="font-kannada text-xs sm:text-sm font-bold text-[#17263A] dark:text-slate-100 line-clamp-3 leading-snug">
                    {stripRichTextToPlainText(locArticle.titleKannada)}
                  </h3>
                  <span className="text-[11px] text-[#738093] dark:text-slate-400">
                    {locArticle.publishedDate}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Smart Recommended & Related Stories */}
        {smartRecommendations.length > 0 && (
          <section
            aria-label="Recommended local news"
            className="mt-8 pt-7 border-t border-slate-200 dark:border-slate-800 max-w-3xl mx-auto"
          >
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#738093] dark:text-slate-400 mb-4">
              Recommended for You · {article.category} &amp; Malnad
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
              {smartRecommendations.map((related) => (
                <button
                  key={related.id}
                  type="button"
                  onClick={() => onSelectArticle(related)}
                  className="w-full text-left py-4 group flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer px-2 -mx-2 rounded-lg"
                >
                  <div className="w-16 h-14 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <NewsImage
                      src={resolveArticleImage(related, true)}
                      alt={stripRichTextToPlainText(related.titleKannada)}
                      watermarkApplied={related.watermarkApplied}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-[#738093] dark:text-slate-400 mb-1">
                      <span className="font-bold text-[#176B4A] dark:text-emerald-400">
                        {related.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-kannada">
                        {getKannadaLocationLabel(related.location)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{related.publishedDate}</span>
                    </div>
                    <h3
                      className="article-rich-content article-rich-inline-compact font-kannada text-sm sm:text-base font-bold text-[#17263A] dark:text-slate-100 group-hover:text-[#176B4A] dark:group-hover:text-[#D9A441] transition-colors leading-snug"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(related.titleKannada) }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* End of Article Advertisement (After Related Stories) */}
        {onSelectAd && activeAds.length > 0 && (
          <ArticleEndAd
            ads={activeAds}
            settings={adSettings}
            articleId={article.id}
            position="after_related"
            onOpenAd={onSelectAd}
          />
        )}
      </main>
    </>
  );
}
