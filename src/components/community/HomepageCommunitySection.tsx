import React from 'react';
import { ArrowRight, Calendar, LayoutDashboard, MapPin, Plus, User } from 'lucide-react';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_MAP,
} from '../../constants/communityCategories';
import type { CommunityCategoryId, PublicCommunityPost } from '../../types/community';
import { formatCommunityDateKn } from '../../utils/communityHelpers';
import { CommunityShareBar } from './CommunityShareBar';

interface HomepageCommunitySectionProps {
  posts: PublicCommunityPost[];
  isSignedIn: boolean;
  onAddInformation: () => void;
  onOpenCommunity: (category?: CommunityCategoryId) => void;
  onOpenDashboard: () => void;
  onOpenPost: (slug: string) => void;
}

export const HomepageCommunitySection: React.FC<HomepageCommunitySectionProps> = ({
  posts,
  isSignedIn,
  onAddInformation,
  onOpenCommunity,
  onOpenDashboard,
  onOpenPost,
}) => {
  const latestPosts = posts.slice(0, 6);

  return (
    <section
      aria-label="COFFEENADU COMMUNITY – ನಮ್ಮ ಮಲೆನಾಡು ಸಮುದಾಯ"
      className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800 space-y-6"
    >
      {/* Prominent Community Header Banner */}
      <div className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#176B4A] dark:text-[#D9A441]">
              COFFEENADU COMMUNITY
            </p>
            <h2 className="font-kannada text-xl sm:text-2xl font-extrabold text-[#10243D] dark:text-white leading-snug">
              COFFEENADU COMMUNITY – ನಮ್ಮ ಮಲೆನಾಡು ಸಮುದಾಯ
            </h2>
            <p className="font-kannada text-xs sm:text-sm text-[#5A677A] dark:text-slate-400">
              ನಿಮ್ಮ ಅಂಗಡಿ, ಮಾರಾಟಕ್ಕಿರುವ ವಸ್ತು, ಉದ್ಯೋಗ, ಕಳೆದುಹೋದ/ಸಿಕ್ಕ ವಸ್ತು, ಸೇವೆ ಅಥವಾ ಸ್ಥಳೀಯ ಮಾಹಿತಿಯನ್ನು ಉಚಿತವಾಗಿ ತಕ್ಷಣ ಪ್ರಕಟಿಸಿ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onAddInformation}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#13593D] text-white font-kannada text-sm font-extrabold shadow-xs transition-colors cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>ನಿಮ್ಮ ಮಾಹಿತಿ ಸೇರಿಸಿ</span>
            </button>

            <button
              type="button"
              onClick={onOpenDashboard}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[#10243D] dark:text-slate-200 hover:border-[#176B4A] font-kannada text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
            >
              <LayoutDashboard className="w-4 h-4 text-[#176B4A] dark:text-[#D9A441]" />
              <span>{isSignedIn ? 'ನನ್ನ ಪ್ರಕಟಣೆಗಳು' : 'ನನ್ನ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್'}</span>
            </button>
          </div>
        </div>

        {/* All 13 Exact Kannada Categories Quick Strip */}
        <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          {COMMUNITY_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onOpenCommunity(cat.id)}
              className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 hover:border-[#176B4A] hover:text-[#176B4A] dark:hover:text-[#D9A441] font-kannada text-xs font-bold text-[#1E293B] dark:text-slate-200 transition-colors cursor-pointer"
            >
              {cat.labelKn}
            </button>
          ))}
        </div>
      </div>

      {/* Latest Live Published Community Posts */}
      {latestPosts.length > 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {latestPosts.map((post) => {
              const cat = COMMUNITY_CATEGORY_MAP[post.category];
              return (
                <article
                  key={post.id}
                  className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between shadow-2xs hover:border-[#176B4A]/60 transition-colors"
                >
                  <div>
                    {post.photos[0] && (
                      <button
                        type="button"
                        onClick={() => onOpenPost(post.slug)}
                        className="block w-full aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-slate-900 cursor-pointer"
                      >
                        <img
                          src={post.photos[0]}
                          alt={post.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    )}

                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-kannada">
                        <span className="font-bold text-[#176B4A] dark:text-[#D9A441]">
                          {cat?.labelKn || post.category}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[#64748B] dark:text-slate-400">
                          <Calendar className="w-3 h-3" />
                          {formatCommunityDateKn(post.createdAt)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenPost(post.slug)}
                        className="block text-left font-kannada text-sm sm:text-base font-extrabold text-[#10243D] dark:text-white hover:text-[#176B4A] dark:hover:text-[#D9A441] leading-snug cursor-pointer"
                      >
                        {post.title}
                      </button>

                      {post.price && (
                        <div className="font-kannada text-xs font-extrabold text-[#9A6700] dark:text-[#D9A441]">
                          ಬೆಲೆ: {post.price}
                        </div>
                      )}

                      <p className="font-kannada text-xs text-[#475569] dark:text-slate-300 line-clamp-2">
                        {post.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-kannada text-[#5A677A] dark:text-slate-400 pt-1">
                        <span className="inline-flex items-center gap-1 font-semibold text-[#10243D] dark:text-slate-200">
                          <User className="w-3 h-3 text-[#176B4A]" />
                          {post.authorName}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" />
                          {post.location}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-[#FAFBFC] dark:bg-slate-900/40 space-y-2">
                    <CommunityShareBar post={post} compact />
                    <button
                      type="button"
                      onClick={() => onOpenPost(post.slug)}
                      className="text-xs font-kannada font-bold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
                    >
                      ವಿವರ ನೋಡಿ →
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => onOpenCommunity()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#10243D] hover:bg-[#19385F] text-white font-kannada text-xs sm:text-sm font-bold transition-colors cursor-pointer min-h-[44px]"
            >
              <span>ಎಲ್ಲಾ COFFEENADU COMMUNITY ಮಾಹಿತಿ ನೋಡಿ ({posts.length})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 p-7 text-center space-y-3">
          <p className="font-kannada text-sm sm:text-base font-extrabold text-[#10243D] dark:text-white">
            ಮಲೆನಾಡಿನ ಮೊದಲ ಸಮುದಾಯ ಮಾಹಿತಿಯನ್ನು ನೀವೇ ಪ್ರಕಟಿಸಿ!
          </p>
          <p className="font-kannada text-xs text-[#5A677A] dark:text-slate-400 max-w-lg mx-auto">
            ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನೀಡಿ (OTP ಇಲ್ಲ) — ನಿಮ್ಮ ಅಂಗಡಿ, ಮಾರಾಟ, ಸೇವೆ, ಉದ್ಯೋಗ ಅಥವಾ ಸ್ಥಳೀಯ ಪ್ರಕಟಣೆ ತಕ್ಷಣ ಲೈವ್ ಆಗುತ್ತದೆ ಮತ್ತು ಸ್ವಯಂಚಾಲಿತ ಶೇರ್ ಲಿಂಕ್ ಸಿಗುತ್ತದೆ.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={onAddInformation}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#13593D] text-white font-kannada text-xs sm:text-sm font-bold cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>ನಿಮ್ಮ ಮಾಹಿತಿ ಸೇರಿಸಿ</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenCommunity()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[#10243D] dark:text-slate-200 font-kannada text-xs font-bold cursor-pointer min-h-[44px]"
            >
              <span>ಸಮುದಾಯ ಪುಟ ತೆರೆಯಿರಿ</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
