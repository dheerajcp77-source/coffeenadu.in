import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  Trash2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth } from '../../firebase';
import { PLATFORM_MODULE_MAP } from '../../constants/platformCatalog';
import { fetchMySubmissions } from '../../services/platformClient';
import type { NewsArticle } from '../../types/news';
import type {
  DirectoryModuleId,
  PlatformLanguage,
  PlatformListing,
  PlatformModuleId,
  UserSavedBundle,
} from '../../types/platform';
import { pickLangText } from '../../utils/platformHelpers';

interface PlatformAccountPageProps {
  lang: PlatformLanguage;
  articles: NewsArticle[];
  allListings: PlatformListing[];
  savedArticleIds: string[];
  savedBundle: UserSavedBundle;
  onRemoveSavedArticle: (id: string) => void;
  onToggleSaveListing: (module: DirectoryModuleId, id: string) => void;
  onOpenArticle: (article: NewsArticle) => void;
  onNavigateModule: (modId: PlatformModuleId, listingId?: string) => void;
  onBackHome: () => void;
}

export const PlatformAccountPage: React.FC<PlatformAccountPageProps> = ({
  lang,
  articles,
  allListings,
  savedArticleIds,
  savedBundle,
  onRemoveSavedArticle,
  onToggleSaveListing,
  onOpenArticle,
  onNavigateModule,
  onBackHome,
}) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<'articles' | 'listings' | 'submissions'>('articles');
  const [mySubmissions, setMySubmissions] = useState<PlatformListing[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setMySubmissions([]);
      return;
    }
    setLoadingSubs(true);
    fetchMySubmissions(user.uid)
      .then((res) => setMySubmissions(res.listings || []))
      .catch(() => setMySubmissions([]))
      .finally(() => setLoadingSubs(false));
  }, [user?.uid]);

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in cancelled or blocked.');
    }
  };

  const savedArticles = articles.filter((a) => savedArticleIds.includes(a.id));
  const savedListingIds = [
    ...savedBundle.businesses,
    ...savedBundle.jobs,
    ...savedBundle.marketplace,
    ...savedBundle.otherListings,
  ];
  const savedListings = allListings.filter((l) => savedListingIds.includes(l.id));

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{pickLangText('ಮುಖಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ', 'Back to Home', lang)}</span>
        </button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#176B4A]/10 dark:bg-[#176B4A]/25 text-[#176B4A] dark:text-emerald-300 flex items-center justify-center">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-kannada text-xl sm:text-2xl font-extrabold text-[#10243D] dark:text-white">
                {pickLangText('ನನ್ನ ಖಾತೆ ಮತ್ತು ಉಳಿಸಿದ ಮಾಹಿತಿ', 'My Account & Saved Items', lang)}
              </h1>
              <p className="text-xs sm:text-sm text-[#5A677A] dark:text-slate-300 font-kannada">
                {user
                  ? `${user.displayName || 'Malnad User'} · ${user.email || ''}`
                  : pickLangText(
                      'ಉಳಿಸಿದ ಸುದ್ದಿ ಮತ್ತು ಪಟ್ಟಿಗಳು ಈ ಸಾಧನದಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿರುತ್ತವೆ. ನಿಮ್ಮ ಸಲ್ಲಿಕೆಗಳನ್ನು ಟ್ರ್ಯಾಕ್ ಮಾಡಲು Google ಲಾಗಿನ್ ಮಾಡಿ.',
                      'Saved items work without sign-in. Sign in with Google optionally to track your submitted listings.',
                      lang
                    )}
              </p>
            </div>
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-[#10243D] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{pickLangText('ಲಾಗ್ ಔಟ್', 'Sign Out', lang)}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10243D] hover:bg-[#1B3A63] text-white text-xs font-bold cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-[#D9A441]" />
              <span>{pickLangText('Google ಮೂಲಕ ಲಾಗಿನ್', 'Sign in with Google', lang)}</span>
            </button>
          )}
        </div>

        {authError && (
          <p className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{authError}</p>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => setTab('articles')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
              tab === 'articles'
                ? 'bg-[#176B4A] text-white'
                : 'bg-[#F3F6F8] dark:bg-slate-800 text-[#475569] dark:text-slate-300'
            }`}
          >
            {pickLangText('ಉಳಿಸಿದ ಸುದ್ದಿಗಳು', 'Saved Articles', lang)} ({savedArticles.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('listings')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
              tab === 'listings'
                ? 'bg-[#176B4A] text-white'
                : 'bg-[#F3F6F8] dark:bg-slate-800 text-[#475569] dark:text-slate-300'
            }`}
          >
            {pickLangText('ಉಳಿಸಿದ ವ್ಯಾಪಾರ / ಉದ್ಯೋಗ / ವಸ್ತುಗಳು', 'Saved Businesses, Jobs & Items', lang)} (
            {savedListings.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('submissions')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
              tab === 'submissions'
                ? 'bg-[#176B4A] text-white'
                : 'bg-[#F3F6F8] dark:bg-slate-800 text-[#475569] dark:text-slate-300'
            }`}
          >
            {pickLangText('ನನ್ನ ಸಲ್ಲಿಕೆಗಳು', 'My Submissions', lang)} ({mySubmissions.length})
          </button>
        </div>
      </div>

      {tab === 'articles' && (
        <div className="space-y-3">
          {savedArticles.length === 0 ? (
            <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-[#5A677A] dark:text-slate-400 font-kannada">
              <Bookmark className="w-7 h-7 mx-auto mb-2 text-slate-400" />
              {pickLangText('ಯಾವುದೇ ಸುದ್ದಿ ಉಳಿಸಲಾಗಿಲ್ಲ.', 'No saved news articles yet.', lang)}
            </div>
          ) : (
            savedArticles.map((art) => (
              <div
                key={art.id}
                className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <button
                  type="button"
                  onClick={() => onOpenArticle(art)}
                  className="text-left flex-1 cursor-pointer"
                >
                  <div className="text-[11px] font-semibold text-[#176B4A] dark:text-[#D9A441]">
                    {art.category} · {art.location} · {art.publishedDate}
                  </div>
                  <div className="font-kannada text-sm font-bold text-[#10243D] dark:text-white mt-0.5 hover:underline">
                    {String(art.titleKannada || '').replace(/<[^>]+>/g, '')}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSavedArticle(art.id)}
                  aria-label="Remove saved article"
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'listings' && (
        <div className="space-y-3">
          {savedListings.length === 0 ? (
            <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-[#5A677A] dark:text-slate-400 font-kannada">
              {pickLangText(
                'ವ್ಯಾಪಾರ, ಉದ್ಯೋಗ ಅಥವಾ ಮಾರುಕಟ್ಟೆ ಪುಟಗಳಲ್ಲಿ Bookmark ಒತ್ತಿ ಇಲ್ಲಿ ಉಳಿಸಬಹುದು.',
                'Bookmark businesses, jobs, or marketplace items to view them quickly here.',
                lang
              )}
            </div>
          ) : (
            savedListings.map((item) => {
              const mod = PLATFORM_MODULE_MAP[item.module];
              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <button
                    type="button"
                    onClick={() => onNavigateModule(item.module, item.id)}
                    className="text-left flex-1 cursor-pointer"
                  >
                    <div className="text-[11px] font-semibold text-[#176B4A] dark:text-[#D9A441]">
                      {pickLangText(mod.titleKn, mod.titleEn, lang)} · {item.location}
                    </div>
                    <div className="font-kannada text-sm font-bold text-[#10243D] dark:text-white mt-0.5 hover:underline">
                      {item.title}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleSaveListing(item.module, item.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'submissions' && (
        <div className="space-y-3">
          {!user ? (
            <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-[#5A677A] dark:text-slate-400 font-kannada">
              {pickLangText(
                'ನಿಮ್ಮ ಸಲ್ಲಿಕೆಗಳ ಅನುಮೋದನೆ ಸ್ಥಿತಿ ನೋಡಲು ದಯವಿಟ್ಟು Google ಲಾಗಿನ್ ಮಾಡಿ.',
                'Sign in with Google to track the approval status of your submitted listings.',
                lang
              )}
            </div>
          ) : loadingSubs ? (
            <div className="h-24 rounded-xl bg-white dark:bg-[#111F33] animate-pulse" />
          ) : mySubmissions.length === 0 ? (
            <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-[#5A677A] dark:text-slate-400 font-kannada">
              {pickLangText(
                'ನೀವು ಇನ್ನೂ ಯಾವುದೇ ವ್ಯಾಪಾರ, ಉದ್ಯೋಗ ಅಥವಾ ಜಾಹೀರಾತು ಸಲ್ಲಿಸಿಲ್ಲ.',
                'You have not submitted any listings under this account yet.',
                lang
              )}
            </div>
          ) : (
            mySubmissions.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {PLATFORM_MODULE_MAP[item.module]?.titleEn} · {item.location}
                  </div>
                  <div className="font-kannada text-sm font-bold text-[#10243D] dark:text-white">
                    {item.title}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg ${
                    item.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : item.status === 'rejected'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                  }`}
                >
                  {item.status === 'approved' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : item.status === 'rejected' ? (
                    <XCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Clock className="w-3.5 h-3.5" />
                  )}
                  <span className="capitalize">{item.status}</span>
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
