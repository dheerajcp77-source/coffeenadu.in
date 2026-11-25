import { useEffect, useState } from 'react';
import { Bookmark, Clock, History, MapPin, Trash2, X } from 'lucide-react';
import { getKannadaLocationLabel, resolveArticleImage } from '../constants/newsData';
import type { NewsArticle } from '../types/news';
import type {
  HistoryArticleSnapshot,
  SavedArticleSnapshot,
} from '../utils/readerPreferences';
import { NewsImage } from './NewsImage';

interface SavedAndHistoryDrawerProps {
  isOpen: boolean;
  initialTab?: 'saved' | 'history';
  onClose: () => void;
  bookmarks: SavedArticleSnapshot[];
  history: HistoryArticleSnapshot[];
  articles: NewsArticle[];
  onRemoveBookmark: (id: string) => void;
  onClearHistory: () => void;
  onSelectArticle: (article: NewsArticle) => void;
}

export function SavedAndHistoryDrawer({
  isOpen,
  initialTab = 'saved',
  onClose,
  bookmarks,
  history,
  articles,
  onRemoveBookmark,
  onClearHistory,
  onSelectArticle,
}: SavedAndHistoryDrawerProps) {
  const [activeTab, setActiveTab] = useState<'saved' | 'history'>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const openSnapshot = (snap: SavedArticleSnapshot) => {
    const live = articles.find((a) => a.id === snap.id);
    const fallbackArticle: NewsArticle = live || {
      id: snap.id,
      titleKannada: snap.titleKannada,
      summaryKannada: snap.summaryKannada,
      bodyKannada: [snap.summaryKannada],
      category: snap.category,
      location: snap.location,
      publishedDate: snap.publishedDate,
      publishedTime: snap.publishedTime,
      readTimeMinutes: snap.readTimeMinutes || 2,
      reporter: 'Coffeenadu Desk',
      imageUrl: snap.imageUrl,
      imageKey: snap.imageKey,
    };
    onSelectArticle(fallbackArticle);
    onClose();
  };

  const list = activeTab === 'saved' ? bookmarks : history;

  return (
    <div
      className="fixed inset-0 z-[75] flex justify-end bg-slate-950/65 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-history-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md h-full bg-white dark:bg-[#0F1E33] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        <div className="bg-[#10243D] text-white px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-[#D9A441]" />
            <div>
              <h2 id="saved-history-drawer-title" className="text-sm font-bold">
                Your Reading Library
              </h2>
              <p className="font-kannada text-[11px] text-slate-300">
                ಉಳಿಸಿದ ಸುದ್ದಿಗಳು ಮತ್ತು ಓದಿದ ಇತಿಹಾಸ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close library"
            className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0B1728]">
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'saved'
                ? 'border-[#176B4A] dark:border-[#D9A441] text-[#10243D] dark:text-white bg-white dark:bg-[#0F1E33]'
                : 'border-transparent text-[#738093] dark:text-slate-400'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved ({bookmarks.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'border-[#176B4A] dark:border-[#D9A441] text-[#10243D] dark:text-white bg-white dark:bg-[#0F1E33]'
                : 'border-transparent text-[#738093] dark:text-slate-400'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>History ({history.length})</span>
          </button>
        </div>

        {activeTab === 'history' && history.length > 0 && (
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Reading History
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {list.length === 0 ? (
            <div className="p-8 text-center">
              {activeTab === 'saved' ? (
                <Bookmark className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              ) : (
                <History className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              )}
              <p className="text-sm font-bold text-[#17263A] dark:text-white">
                {activeTab === 'saved' ? 'No saved articles yet' : 'No reading history yet'}
              </p>
              <p className="font-kannada text-xs text-[#738093] dark:text-slate-400 mt-1">
                {activeTab === 'saved'
                  ? 'ನಿಮಗೆ ಇಷ್ಟವಾದ ಸುದ್ದಿಗಳನ್ನು ನಂತರ ಓದಲು Save ಬಟನ್ ಒತ್ತಿ.'
                  : 'ನೀವು ಓದಿದ ಸುದ್ದಿಗಳು ಇಲ್ಲಿ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಕಾಣಿಸುತ್ತವೆ.'}
              </p>
            </div>
          ) : (
            list.map((item) => {
              const place = getKannadaLocationLabel(item.location).split('(')[0].trim();
              const imgSrc = resolveArticleImage(
                { category: item.category, imageUrl: item.imageUrl, imageKey: item.imageKey },
                true
              );
              return (
                <div
                  key={item.id}
                  className="p-3.5 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => openSnapshot(item)}
                    className="flex-1 min-w-0 flex items-start gap-3 text-left cursor-pointer"
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <NewsImage
                        src={imgSrc}
                        alt={item.titleKannada}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[10px] font-semibold text-[#738093] dark:text-slate-400 mb-1">
                        <span className="text-[#176B4A] dark:text-emerald-400 font-bold">
                          {item.category}
                        </span>
                        <span className="inline-flex items-center gap-0.5 font-kannada">
                          <MapPin className="w-3 h-3" />
                          {place}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {item.publishedDate}
                        </span>
                      </div>
                      <h3 className="font-kannada text-xs sm:text-sm font-bold text-[#17263A] dark:text-slate-100 line-clamp-2 leading-snug">
                        {item.titleKannada}
                      </h3>
                    </div>
                  </button>
                  {activeTab === 'saved' && (
                    <button
                      type="button"
                      onClick={() => onRemoveBookmark(item.id)}
                      aria-label="Remove bookmark"
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
