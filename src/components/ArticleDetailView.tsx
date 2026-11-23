import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getKannadaLocationLabel, resolveArticleImage } from '../data/newsData';
import { recordArticleView } from '../services/articlesStore';
import type { NewsArticle } from '../types/news';
import { sanitizeRichTextHtml, stripRichTextToPlainText } from '../utils/richText';
import { ArticleShareBar } from './ArticleShareBar';
import { NewsImage } from './NewsImage';
import { WhatsAppGroupBanner } from './WhatsAppGroupBanner';

interface ArticleDetailViewProps {
  article: NewsArticle;
  relatedArticles: NewsArticle[];
  onBack: () => void;
  onSelectArticle: (article: NewsArticle) => void;
}

export function ArticleDetailView({
  article,
  relatedArticles,
  onBack,
  onSelectArticle,
}: ArticleDetailViewProps) {
  const resolvedImage = resolveArticleImage(article);

  useEffect(() => {
    void recordArticleView(article.id);
  }, [article.id]);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 select-none">
      {/* Top Action Row with Share above article */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-stone-200">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-700 hover:text-[#0F274A] transition-colors cursor-pointer min-h-[40px] px-2 -ml-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to Feed</span>
        </button>

        <ArticleShareBar article={article} />
      </div>

      {/* Protected Article Body */}
      <article className="relative py-8 max-w-3xl mx-auto overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 news-watermark-layer opacity-60 z-10"
        />

        <div className="relative z-20">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-stone-500 mb-4">
            <span className="uppercase tracking-wider text-[#0F274A] font-semibold">
              {article.category}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-kannada">{getKannadaLocationLabel(article.location)}</span>
            <span aria-hidden="true">·</span>
            <span>{article.publishedDate}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{article.publishedTime}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{article.readTimeMinutes} min read</span>
          </div>

          <h1
            className="article-rich-content article-rich-inline font-kannada text-2xl sm:text-3xl lg:text-4xl font-bold text-stone-950 leading-snug text-balance mb-5"
            dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(article.titleKannada) }}
          />

          <div
            className="article-rich-content article-rich-inline font-kannada text-base sm:text-lg text-stone-700 leading-relaxed mb-6 pb-6 border-b border-stone-200"
            dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(article.summaryKannada) }}
          />

          <div className="flex items-center justify-between text-xs text-stone-500 mb-6">
            <span>
              Reported by <strong className="font-semibold text-stone-800">{article.reporter}</strong>
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
                className="rounded-md border border-stone-200"
                watermarkApplied={Boolean(article.watermarkApplied && article.imageUrl)}
              />
              {article.imageCaption && (
                <figcaption
                  className="article-rich-content article-rich-inline font-kannada text-xs text-stone-500 mt-2.5 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(article.imageCaption) }}
                />
              )}
            </figure>
          )}

          <div className="article-rich-content space-y-5 max-w-prose font-kannada text-base sm:text-[17px] text-stone-800 leading-[1.85]">
            {article.bodyKannada.map((paragraph, index) => {
              const sanitized = sanitizeRichTextHtml(paragraph);
              if (!sanitized) return null;
              const isBlockWrapper = /^<(p|div|h2|h3|ul|ol|blockquote)\b/i.test(sanitized);
              if (isBlockWrapper) {
                return (
                  <div
                    key={index}
                    dangerouslySetInnerHTML={{ __html: sanitized }}
                  />
                );
              }
              return (
                <p
                  key={index}
                  dangerouslySetInnerHTML={{ __html: sanitized }}
                />
              );
            })}
          </div>

          {/* Optional Extra Photos Gallery — shown ONLY after the end of the news report */}
          {article.extraImages && article.extraImages.length > 0 && (
            <section
              aria-label="Additional news photos"
              className="mt-8 pt-6 border-t border-stone-200 space-y-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-kannada text-sm font-bold text-[#0F274A] tracking-wide">
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
                      className="rounded-md border border-stone-200"
                      watermarkApplied={photo.watermarkApplied !== false}
                    />
                    {photo.caption && (
                      <figcaption className="font-kannada text-xs text-stone-500 mt-2 leading-relaxed">
                        {photo.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          )}

          {/* Join Coffeenadu News WhatsApp Group below every article */}
          <div className="mt-8">
            <WhatsAppGroupBanner variant="card" />
          </div>

          {/* Share Bar below article */}
          <div className="mt-6 pt-6 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">
              Share this Koppa Taluk story
            </span>
            <ArticleShareBar article={article} />
          </div>
        </div>
      </article>

      {/* Related Stories */}
      {relatedArticles.length > 0 && (
        <section
          aria-label="More local news"
          className="mt-6 pt-8 border-t border-stone-200 max-w-3xl mx-auto"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 mb-5">
            More from {article.category}
          </h2>
          <div className="divide-y divide-stone-200 border-t border-b border-stone-200">
            {relatedArticles.map((related) => (
              <button
                key={related.id}
                type="button"
                onClick={() => onSelectArticle(related)}
                className="w-full text-left py-4 group flex flex-col gap-1.5 hover:bg-stone-50/80 transition-colors cursor-pointer px-2 -mx-2 rounded-sm"
              >
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <span className="font-kannada">{getKannadaLocationLabel(related.location)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{related.publishedDate}</span>
                </div>
                <h3
                  className="article-rich-content article-rich-inline-compact font-kannada text-base sm:text-lg font-semibold text-stone-900 group-hover:text-emerald-900 transition-colors leading-snug"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(related.titleKannada) }}
                />
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
