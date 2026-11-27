import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Edit3,
  Flag,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_MAP,
  COMMUNITY_FEED_TABS,
  COMMUNITY_LOCATIONS_KN,
  type CommunityFeedTabId,
} from '../../constants/communityCategories';
import type {
  CommunityCategoryId,
  CommunityPostStatus,
  CommunitySelfProfile,
  PublicCommunityPost,
} from '../../types/community';
import {
  deleteCommunityPost,
  fetchCommunityPostBySlug,
  fetchCommunityPosts,
  fetchMyCommunityPosts,
  logoutCommunityUser,
  updateCommunityProfile,
} from '../../services/communityClient';
import {
  filterCommunityPosts,
  formatCommunityDateKn,
} from '../../utils/communityHelpers';
import { CommunityShareBar } from './CommunityShareBar';
import {
  CommunityComposerModal,
  CommunityRegisterModal,
  CommunityReportModal,
} from './CommunityModals';

interface CoffeenaduCommunityPageProps {
  /** Permanent post slug or ID from /community/:slug (null when viewing feed or dashboard) */
  activePostSlug: string | null;
  /** True when viewing /community/dashboard */
  initialDashboardOpen?: boolean;
  /** Optional pre-selected category from homepage quick chips */
  initialCategory?: CommunityCategoryId | 'all';
  /** Selected Malnad location from global header/site state */
  globalLocation: string;
  /** Current community user profile (if signed in) */
  userProfile: CommunitySelfProfile | null;
  onUserProfileChange: (profile: CommunitySelfProfile | null) => void;
  onNavigateHome: () => void;
  onNavigateCommunityRoot: () => void;
  onNavigatePost: (slug: string) => void;
  onNavigateDashboard: () => void;
  onPostsUpdated?: (posts: PublicCommunityPost[]) => void;
}

export const CoffeenaduCommunityPage: React.FC<CoffeenaduCommunityPageProps> = ({
  activePostSlug,
  initialDashboardOpen = false,
  initialCategory = 'all',
  globalLocation,
  userProfile,
  onUserProfileChange,
  onNavigateHome,
  onNavigateCommunityRoot,
  onNavigatePost,
  onNavigateDashboard,
  onPostsUpdated,
}) => {
  const [posts, setPosts] = useState<PublicCommunityPost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [activeTab, setActiveTab] = useState<CommunityFeedTabId>('all');
  const [selectedCategory, setSelectedCategory] = useState<CommunityCategoryId | 'all'>(
    initialCategory
  );
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Single post detail view (when navigating directly to /community/<slug>)
  const [detailPost, setDetailPost] = useState<PublicCommunityPost | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // User Dashboard state
  const [dashboardOpen, setDashboardOpen] = useState(initialDashboardOpen);
  const [dashboardTab, setDashboardTab] = useState<'my-posts' | 'profile'>('my-posts');
  const [myPosts, setMyPosts] = useState<
    Array<PublicCommunityPost & { status?: CommunityPostStatus }>
  >([]);
  const [loadingMyPosts, setLoadingMyPosts] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [profileNameInput, setProfileNameInput] = useState(userProfile?.fullName || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');

  // Modals
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [pendingActionAfterReg, setPendingActionAfterReg] = useState<'compose' | 'dashboard' | null>(
    null
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<PublicCommunityPost | null>(null);
  const [reportingPost, setReportingPost] = useState<PublicCommunityPost | null>(null);

  useEffect(() => {
    setDashboardOpen(initialDashboardOpen);
  }, [initialDashboardOpen]);

  useEffect(() => {
    if (initialCategory) setSelectedCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    setProfileNameInput(userProfile?.fullName || '');
  }, [userProfile?.fullName]);

  const onPostsUpdatedRef = useRef(onPostsUpdated);
  onPostsUpdatedRef.current = onPostsUpdated;

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const res = await fetchCommunityPosts({ limit: 120 });
      setPosts(res.posts);
      onPostsUpdatedRef.current?.(res.posts);
    } catch {
      // Keep current posts if network fails
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  // Load exact post when visiting /community/:slug
  useEffect(() => {
    if (!activePostSlug) {
      setDetailPost(null);
      setDetailError('');
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');
    setActivePhotoIdx(0);

    void fetchCommunityPostBySlug(activePostSlug)
      .then((found) => {
        if (!cancelled) {
          setDetailPost(found);
          setDetailLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailPost(null);
          setDetailError(
            err instanceof Error ? err.message : 'ಈ ಸಮುದಾಯ ಪ್ರಕಟಣೆ ಕಂಡುಬಂದಿಲ್ಲ.'
          );
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activePostSlug]);

  const loadMyPosts = useCallback(async () => {
    if (!userProfile) return;
    setLoadingMyPosts(true);
    try {
      const mine = await fetchMyCommunityPosts();
      setMyPosts(mine);
    } catch {
      setMyPosts([]);
    } finally {
      setLoadingMyPosts(false);
    }
  }, [userProfile]);

  useEffect(() => {
    if (dashboardOpen && userProfile) {
      void loadMyPosts();
    }
  }, [dashboardOpen, userProfile, loadMyPosts]);

  const handleRequestAddInfo = () => {
    setEditingPost(null);
    if (!userProfile) {
      setPendingActionAfterReg('compose');
      setRegisterModalOpen(true);
      return;
    }
    setComposerOpen(true);
  };

  const handleRequestDashboard = () => {
    if (!userProfile) {
      setPendingActionAfterReg('dashboard');
      setRegisterModalOpen(true);
      return;
    }
    setDashboardOpen(true);
    setDashboardTab('my-posts');
    onNavigateDashboard();
  };

  const handleRegistered = (profile: CommunitySelfProfile) => {
    onUserProfileChange(profile);
    setRegisterModalOpen(false);
    void loadFeed();
    if (pendingActionAfterReg === 'compose') {
      setComposerOpen(true);
    } else if (pendingActionAfterReg === 'dashboard') {
      setDashboardOpen(true);
      setDashboardTab('my-posts');
      onNavigateDashboard();
    }
    setPendingActionAfterReg(null);
  };

  const handleSavedPost = (saved: PublicCommunityPost, isEdit: boolean) => {
    const nextPosts = isEdit
      ? posts.map((p) => (p.id === saved.id ? saved : p))
      : [saved, ...posts.filter((p) => p.id !== saved.id)];
    setPosts(nextPosts);
    onPostsUpdatedRef.current?.(nextPosts);
    if (detailPost && detailPost.id === saved.id) {
      setDetailPost(saved);
    }
    if (userProfile) {
      onUserProfileChange({
        ...userProfile,
        totalPosts: isEdit ? userProfile.totalPosts : userProfile.totalPosts + 1,
      });
      void loadMyPosts();
    }
  };

  const handleDeletePost = async (postId: string) => {
    setDeletingId(postId);
    try {
      await deleteCommunityPost(postId);
      const nextPosts = posts.filter((p) => p.id !== postId);
      setPosts(nextPosts);
      onPostsUpdatedRef.current?.(nextPosts);
      setMyPosts((prev) => prev.filter((p) => p.id !== postId));
      setConfirmDeleteId(null);
      if (detailPost && detailPost.id === postId) {
        onNavigateCommunityRoot();
      }
      if (userProfile) {
        onUserProfileChange({
          ...userProfile,
          totalPosts: Math.max(0, userProfile.totalPosts - 1),
        });
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileNameInput.trim()) return;
    setSavingProfile(true);
    setProfileNotice('');
    try {
      const updated = await updateCommunityProfile(profileNameInput.trim());
      onUserProfileChange(updated);
      setProfileNotice('ನಿಮ್ಮ ಹೆಸರನ್ನು ಯಶಸ್ವಿಯಾಗಿ ನವೀಕರಿಸಲಾಗಿದೆ.');
      void loadFeed();
      void loadMyPosts();
    } catch (err) {
      setProfileNotice(err instanceof Error ? err.message : 'ನವೀಕರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSignOut = async () => {
    await logoutCommunityUser();
    onUserProfileChange(null);
    setMyPosts([]);
    setDashboardOpen(false);
    onNavigateCommunityRoot();
    void loadFeed();
  };

  const visiblePosts = useMemo(
    () =>
      filterCommunityPosts(posts, {
        tab: activeTab,
        category: selectedCategory,
        location: selectedLocation,
        nearbyLocation:
          activeTab === 'nearby'
            ? selectedLocation !== 'all'
              ? selectedLocation
              : globalLocation !== 'all'
                ? globalLocation
                : 'ಕೊಪ್ಪ'
            : undefined,
        query: searchQuery,
      }),
    [posts, activeTab, selectedCategory, selectedLocation, globalLocation, searchQuery]
  );

  // ==========================================================================
  // VIEW A: DEDICATED SINGLE POST VIEW (/community/<slug>)
  // ==========================================================================
  if (activePostSlug) {
    const catMeta = detailPost ? COMMUNITY_CATEGORY_MAP[detailPost.category] : null;
    return (
      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onNavigateCommunityRoot}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-kannada font-bold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ಎಲ್ಲಾ ಸಮುದಾಯ ಮಾಹಿತಿ ನೋಡಿ</span>
          </button>

          <button
            type="button"
            onClick={handleRequestAddInfo}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#176B4A] hover:bg-[#13593D] text-white font-kannada text-xs font-bold cursor-pointer min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>ನಿಮ್ಮ ಮಾಹಿತಿ ಸೇರಿಸಿ</span>
          </button>
        </div>

        {detailLoading ? (
          <div className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#176B4A] mx-auto" />
            <p className="font-kannada text-sm text-[#5A677A] dark:text-slate-400 mt-3">
              ಮಾಹಿತಿ ಲೋಡ್ ಆಗುತ್ತಿದೆ...
            </p>
          </div>
        ) : !detailPost ? (
          <div className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
            <p className="font-kannada text-base font-bold text-[#10243D] dark:text-white">
              {detailError || 'ಈ ಸಮುದಾಯ ಪ್ರಕಟಣೆ ಲಭ್ಯವಿಲ್ಲ.'}
            </p>
            <button
              type="button"
              onClick={onNavigateCommunityRoot}
              className="px-4 py-2 rounded-xl bg-[#10243D] text-white font-kannada text-xs font-bold cursor-pointer"
            >
              COFFEENADU COMMUNITY ಗೆ ಹಿಂತಿರುಗಿ
            </button>
          </div>
        ) : (
          <article className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            {/* Photos */}
            {detailPost.photos.length > 0 && (
              <div className="bg-slate-950/5 dark:bg-slate-950/40">
                <div className="aspect-[16/10] max-h-[440px] w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                  <img
                    src={detailPost.photos[activePhotoIdx] || detailPost.photos[0]}
                    alt={detailPost.title}
                    className="w-full h-full object-contain bg-slate-100 dark:bg-slate-950"
                  />
                </div>
                {detailPost.photos.length > 1 && (
                  <div className="flex items-center gap-2 p-3 border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
                    {detailPost.photos.map((photoUrl, idx) => (
                      <button
                        key={photoUrl}
                        type="button"
                        onClick={() => setActivePhotoIdx(idx)}
                        className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer bg-[#F4F1EA] dark:bg-[#0B1714] flex items-center justify-center ${
                          activePhotoIdx === idx
                            ? 'border-[#14452F] dark:border-[#D9A441]'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={photoUrl} alt="" className="w-full h-full object-contain" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="p-5 sm:p-7 space-y-5">
              {/* Public Metadata ONLY — Contributor Name, Category, Location, Date */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-kannada text-[#5A677A] dark:text-slate-400">
                <span className="font-bold text-[#176B4A] dark:text-[#D9A441]">
                  {catMeta?.labelKn || detailPost.category}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {detailPost.location}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatCommunityDateKn(detailPost.createdAt)}
                </span>
              </div>

              <h1 className="font-kannada text-xl sm:text-2xl font-extrabold text-[#10243D] dark:text-white leading-snug">
                {detailPost.title}
              </h1>

              {detailPost.price && (
                <div className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 font-kannada text-sm font-extrabold text-[#9A6700] dark:text-[#D9A441]">
                  ಬೆಲೆ: {detailPost.price}
                </div>
              )}

              <div className="font-kannada text-sm sm:text-base text-[#1E293B] dark:text-slate-200 leading-relaxed whitespace-pre-line">
                {detailPost.description}
              </div>

              {/* Public contributor card (Name ONLY, optional public contact ONLY if user explicitly added it) */}
              <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#10243D] text-white flex items-center justify-center font-bold text-sm">
                    {detailPost.authorName.slice(0, 1)}
                  </div>
                  <div>
                    <p className="font-kannada text-[11px] text-[#64748B] dark:text-slate-400">
                      ಮಾಹಿತಿ ಪ್ರಕಟಿಸಿದವರು
                    </p>
                    <p className="font-kannada text-sm font-extrabold text-[#10243D] dark:text-white">
                      {detailPost.authorName}
                    </p>
                  </div>
                </div>

                {detailPost.optionalPublicContact && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-kannada font-bold text-[#176B4A] dark:text-emerald-300">
                    <Phone className="w-3.5 h-3.5" />
                    <span>ಸಂಪರ್ಕ: {detailPost.optionalPublicContact}</span>
                  </div>
                )}
              </div>

              {/* Share & Actions */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <CommunityShareBar post={detailPost} />

                <div className="flex items-center gap-2">
                  {detailPost.isOwner && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPost(detailPost);
                          setComposerOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-kannada font-bold text-[#10243D] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer min-h-[40px]"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>ಸಂಪಾದಿಸಿ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(detailPost.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900 text-xs font-kannada font-bold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer min-h-[40px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>ಅಳಿಸಿ</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setReportingPost(detailPost)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-kannada font-semibold text-[#64748B] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer min-h-[40px]"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>ವರದಿ ಮಾಡಿ</span>
                  </button>
                </div>
              </div>

              {confirmDeleteId === detailPost.id && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-kannada text-xs font-bold text-red-800 dark:text-red-200">
                    ಈ ಪ್ರಕಟಣೆಯನ್ನು ಶಾಶ್ವತವಾಗಿ ಅಳಿಸಬೇಕೆ?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-xs font-kannada font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      ಬೇಡ
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === detailPost.id}
                      onClick={() => void handleDeletePost(detailPost.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-kannada font-bold cursor-pointer"
                    >
                      {deletingId === detailPost.id ? 'ಅಳಿಸಲಾಗುತ್ತಿದೆ...' : 'ಹೌದು, ಅಳಿಸಿ'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </article>
        )}

        <CommunityRegisterModal
          open={registerModalOpen}
          onClose={() => setRegisterModalOpen(false)}
          onRegistered={handleRegistered}
        />
        <CommunityComposerModal
          open={composerOpen}
          editingPost={editingPost}
          authorName={userProfile?.fullName || ''}
          onClose={() => {
            setComposerOpen(false);
            setEditingPost(null);
          }}
          onSaved={handleSavedPost}
          onOpenPost={(p) => onNavigatePost(p.slug)}
        />
        <CommunityReportModal post={reportingPost} onClose={() => setReportingPost(null)} />
      </div>
    );
  }

  // ==========================================================================
  // VIEW B: MAIN COFFEENADU COMMUNITY PAGE + KANNADA USER DASHBOARD
  // ==========================================================================
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Breadcrumb & Prominent Hero Header */}
      <section className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-1.5 text-xs font-kannada font-bold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>ಮುಖಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {dashboardOpen ? (
              <button
                type="button"
                onClick={() => {
                  setDashboardOpen(false);
                  onNavigateCommunityRoot();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-kannada font-bold text-[#10243D] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer min-h-[40px]"
              >
                <Users className="w-4 h-4" />
                <span>ಎಲ್ಲಾ ಸಮುದಾಯ ಪ್ರಕಟಣೆಗಳು</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRequestDashboard}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-kannada font-bold text-[#10243D] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer min-h-[40px]"
              >
                <LayoutDashboard className="w-4 h-4 text-[#176B4A] dark:text-[#D9A441]" />
                <span>
                  {userProfile ? `ನನ್ನ ಪ್ರಕಟಣೆಗಳು (${userProfile.totalPosts})` : 'ನನ್ನ ಪ್ರಕಟಣೆಗಳು'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleRequestAddInfo}
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#13593D] text-white font-kannada text-xs sm:text-sm font-extrabold shadow-xs transition-colors cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>ನಿಮ್ಮ ಮಾಹಿತಿ ಸೇರಿಸಿ</span>
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#176B4A] dark:text-[#D9A441]">
            COFFEENADU COMMUNITY
          </p>
          <h1 className="font-kannada text-xl sm:text-3xl font-extrabold text-[#10243D] dark:text-white leading-tight">
            COFFEENADU COMMUNITY – ನಮ್ಮ ಮಲೆನಾಡು ಸಮುದಾಯ
          </h1>
          <p className="font-kannada text-xs sm:text-sm text-[#5A677A] dark:text-slate-400 max-w-3xl">
            ನಿಮ್ಮ ಅಂಗಡಿ, ಮಾರಾಟ, ಉದ್ಯೋಗ, ಕಳೆದುಹೋದ/ಸಿಕ್ಕ ವಸ್ತು, ಕೃಷಿ ಉತ್ಪನ್ನ, ಮನೆ-ಜಮೀನು ಮತ್ತು ಸ್ಥಳೀಯ ಮಾಹಿತಿಯನ್ನು ಉಚಿತವಾಗಿ ಸೇರಿಸಿ — ತಕ್ಷಣ ಪ್ರಕಟವಾಗುತ್ತದೆ!
          </p>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* KANNADA USER DASHBOARD                                               */}
      {/* ==================================================================== */}
      {dashboardOpen && !userProfile ? (
        <section
          aria-label="ನನ್ನ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಲಾಗಿನ್"
          className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center space-y-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-[#176B4A] dark:text-[#D9A441] flex items-center justify-center mx-auto">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="font-kannada text-lg sm:text-xl font-extrabold text-[#10243D] dark:text-white">
              ನನ್ನ ಪ್ರಕಟಣೆಗಳು — ಖಾತೆ ಪ್ರವೇಶಿಸಿ
            </h2>
            <p className="font-kannada text-xs sm:text-sm text-[#5A677A] dark:text-slate-400 leading-relaxed">
              ನಿಮ್ಮ ಪ್ರಕಟಣೆಗಳನ್ನು ನೋಡಲು, ಸಂಪಾದಿಸಲು ಅಥವಾ ಅಳಿಸಲು ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನೀಡಿ (OTP ಅಗತ್ಯವಿಲ್ಲ). ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಸಂಪೂರ್ಣ ಗೌಪ್ಯವಾಗಿರುತ್ತದೆ.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setPendingActionAfterReg('dashboard');
                setRegisterModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#13593D] text-white font-kannada text-sm font-bold cursor-pointer min-h-[44px]"
            >
              <User className="w-4 h-4" />
              <span>ನೋಂದಣಿ ಮಾಡಿ / ಲಾಗಿನ್ ಆಗಿ</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDashboardOpen(false);
                onNavigateCommunityRoot();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[#10243D] dark:text-slate-200 font-kannada text-sm font-bold cursor-pointer min-h-[44px]"
            >
              <span>ಎಲ್ಲಾ ಪ್ರಕಟಣೆ ನೋಡಿ</span>
            </button>
          </div>
        </section>
      ) : dashboardOpen && userProfile ? (
        <section
          aria-label="ನನ್ನ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್"
          className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDashboardTab('my-posts')}
                className={`px-4 py-2 rounded-xl font-kannada text-xs sm:text-sm font-bold cursor-pointer min-h-[40px] ${
                  dashboardTab === 'my-posts'
                    ? 'bg-[#10243D] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-[#10243D] dark:text-slate-200'
                }`}
              >
                ನನ್ನ ಪ್ರಕಟಣೆಗಳು ({myPosts.length})
              </button>

              <button
                type="button"
                onClick={handleRequestAddInfo}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#176B4A] hover:bg-[#13593D] text-white font-kannada text-xs sm:text-sm font-bold cursor-pointer min-h-[40px]"
              >
                <Plus className="w-4 h-4" />
                <span>ಹೊಸ ಮಾಹಿತಿ ಸೇರಿಸಿ</span>
              </button>

              <button
                type="button"
                onClick={() => setDashboardTab('profile')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-kannada text-xs sm:text-sm font-bold cursor-pointer min-h-[40px] ${
                  dashboardTab === 'profile'
                    ? 'bg-[#10243D] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-[#10243D] dark:text-slate-200'
                }`}
              >
                <User className="w-4 h-4" />
                <span>ನನ್ನ ಪ್ರೊಫೈಲ್</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-kannada font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>ಲಾಗ್ ಔಟ್</span>
            </button>
          </div>

          {dashboardTab === 'my-posts' ? (
            loadingMyPosts ? (
              <div className="py-10 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#176B4A] mx-auto" />
              </div>
            ) : myPosts.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <p className="font-kannada text-sm font-bold text-[#10243D] dark:text-white">
                  ನೀವು ಇನ್ನೂ ಯಾವುದೇ ಮಾಹಿತಿಯನ್ನು ಪ್ರಕಟಿಸಿಲ್ಲ.
                </p>
                <button
                  type="button"
                  onClick={handleRequestAddInfo}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#176B4A] text-white font-kannada text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>ಮೊದಲ ಮಾಹಿತಿ ಸೇರಿಸಿ</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myPosts.map((post) => {
                  const cat = COMMUNITY_CATEGORY_MAP[post.category];
                  return (
                    <div
                      key={post.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#FAFBFC] dark:bg-slate-900/60 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-kannada font-bold text-[#176B4A] dark:text-[#D9A441]">
                            {cat?.labelKn} · {post.location} · {formatCommunityDateKn(post.createdAt)}
                          </div>
                          <button
                            type="button"
                            onClick={() => onNavigatePost(post.slug)}
                            className="font-kannada text-sm font-extrabold text-[#10243D] dark:text-white hover:underline text-left mt-1 cursor-pointer"
                          >
                            {post.title}
                          </button>
                        </div>
                        {post.status === 'hidden' && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-kannada font-bold shrink-0">
                            ಮರೆಮಾಡಲಾಗಿದೆ
                          </span>
                        )}
                      </div>

                      <p className="font-kannada text-xs text-[#475569] dark:text-slate-300 line-clamp-2">
                        {post.description}
                      </p>

                      <CommunityShareBar post={post} compact />

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPost(post);
                            setComposerOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-kannada font-bold text-[#10243D] dark:text-white hover:border-[#176B4A] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>ನನ್ನ ಪ್ರಕಟಣೆಯನ್ನು ಸಂಪಾದಿಸಿ</span>
                        </button>

                        {confirmDeleteId === post.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={deletingId === post.id}
                              onClick={() => void handleDeletePost(post.id)}
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-kannada font-bold cursor-pointer"
                            >
                              {deletingId === post.id ? 'ಅಳಿಸಲಾಗುತ್ತಿದೆ...' : 'ಖಚಿತವಾಗಿ ಅಳಿಸಿ'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-kannada font-bold cursor-pointer"
                            >
                              ಬೇಡ
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(post.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-xs font-kannada font-bold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>ನನ್ನ ಪ್ರಕಟಣೆಯನ್ನು ಅಳಿಸಿ</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <form onSubmit={(e) => void handleUpdateProfile(e)} className="max-w-md space-y-4">
              {profileNotice && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 font-kannada text-xs font-bold text-[#14533A] dark:text-emerald-200">
                  {profileNotice}
                </div>
              )}

              <div>
                <label
                  htmlFor="comm-profile-name"
                  className="block font-kannada text-xs font-bold text-[#10243D] dark:text-slate-200 mb-1"
                >
                  ಪೂರ್ಣ ಹೆಸರು
                </label>
                <input
                  id="comm-profile-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-kannada text-[#10243D] dark:text-white"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 font-kannada text-xs font-bold text-[#10243D] dark:text-white">
                  <Lock className="w-3.5 h-3.5 text-[#176B4A]" />
                  <span>ನೋಂದಾಯಿತ ಮೊಬೈಲ್: {userProfile.maskedMobile}</span>
                </div>
                <p className="font-kannada text-[11px] text-[#5A677A] dark:text-slate-400">
                  ನೋಂದಣಿ ದಿನಾಂಕ: {formatCommunityDateKn(userProfile.registeredAt)} · ಒಟ್ಟು ಪ್ರಕಟಣೆಗಳು: {userProfile.totalPosts}
                </p>
                <p className="font-kannada text-[11px] text-[#176B4A] dark:text-emerald-300">
                  ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಸಾರ್ವಜನಿಕವಾಗಿ ಎಲ್ಲಿಯೂ ಕಾಣಿಸುವುದಿಲ್ಲ.
                </p>
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#13593D] text-white font-kannada text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {savingProfile ? 'ಉಳಿಸಲಾಗುತ್ತಿದೆ...' : 'ಹೆಸರು ಉಳಿಸಿ'}
              </button>
            </form>
          )}
        </section>
      ) : (
        /* ================================================================== */
        /* UNIFIED COFFEENADU COMMUNITY FEED                                  */
        /* ================================================================== */
        <div className="space-y-5">
          {/* Feed Tabs + Search + Location Filter */}
          <div className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3.5">
            {/* Unified section tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {COMMUNITY_FEED_TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setSelectedCategory('all');
                    }}
                    className={`px-3.5 py-2 rounded-xl font-kannada text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#10243D] text-white'
                        : 'bg-slate-100 dark:bg-slate-900 text-[#475569] dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.labelKn}
                  </button>
                );
              })}
            </div>

            {/* Search & Location Filter */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
              <div className="md:col-span-8 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ಅಂಗಡಿ, ವಸ್ತು, ಉದ್ಯೋಗ, ಊರು ಅಥವಾ ಹೆಸರು ಹುಡುಕಿ..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-sm font-kannada text-[#10243D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#176B4A]"
                />
              </div>
              <div className="md:col-span-4">
                <select
                  aria-label="ಊರು ಆಯ್ಕೆಮಾಡಿ"
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 text-sm font-kannada font-semibold text-[#10243D] dark:text-white"
                >
                  <option value="all">ಎಲ್ಲಾ ಮಲೆನಾಡು ಊರುಗಳು</option>
                  {COMMUNITY_LOCATIONS_KN.map((loc) => (
                    <option key={loc.value} value={loc.value}>
                      {loc.labelKn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* All 13 Exact Kannada Categories Filter Row */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-lg font-kannada text-[11px] font-bold cursor-pointer transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-[#176B4A] text-white'
                    : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[#475569] dark:text-slate-300 hover:border-[#176B4A]'
                }`}
              >
                ಎಲ್ಲಾ ವಿಭಾಗಗಳು
              </button>
              {COMMUNITY_CATEGORIES.map((cat) => {
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setActiveTab('all');
                    }}
                    className={`px-3 py-1.5 rounded-lg font-kannada text-[11px] font-bold cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#176B4A] text-white'
                        : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[#475569] dark:text-slate-300 hover:border-[#176B4A]'
                    }`}
                  >
                    {cat.labelKn}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results Grid */}
          {loadingFeed ? (
            <div className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
              <Loader2 className="w-7 h-7 animate-spin text-[#176B4A] mx-auto" />
              <p className="font-kannada text-sm text-[#5A677A] dark:text-slate-400 mt-3">
                ಸಮುದಾಯ ಪ್ರಕಟಣೆಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ...
              </p>
            </div>
          ) : visiblePosts.length === 0 ? (
            <div className="bg-white dark:bg-[#111F33] rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
              <p className="font-kannada text-base font-extrabold text-[#10243D] dark:text-white">
                ಈ ವಿಭಾಗದಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ಪ್ರಕಟಣೆ ಇಲ್ಲ
              </p>
              <p className="font-kannada text-xs sm:text-sm text-[#5A677A] dark:text-slate-400 max-w-md mx-auto">
                ಮೊದಲ ಮಾಹಿತಿಯನ್ನು ನೀವೇ ಸೇರಿಸಿ — ಅಂಗಡಿ, ಮಾರಾಟ, ಉದ್ಯೋಗ, ಕಳೆದುಹೋದ ವಸ್ತು ಅಥವಾ ಸ್ಥಳೀಯ ಪ್ರಕಟಣೆ ತಕ್ಷಣ ಪ್ರಕಟವಾಗುತ್ತದೆ.
              </p>
              <button
                type="button"
                onClick={handleRequestAddInfo}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#13593D] text-white font-kannada text-sm font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>ನಿಮ್ಮ ಮಾಹಿತಿ ಸೇರಿಸಿ</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visiblePosts.map((post) => {
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
                          onClick={() => onNavigatePost(post.slug)}
                          className="block w-full overflow-hidden bg-[#F4F1EA] dark:bg-[#0B1714] border-b border-[#E6E1D1] dark:border-[#1E3B34] cursor-pointer"
                        >
                          <img
                            src={post.photos[0]}
                            alt={post.title}
                            loading="lazy"
                            className="w-full h-auto max-h-72 object-contain mx-auto block"
                          />
                        </button>
                      )}

                      <div className="p-4 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-kannada">
                          <span className="font-bold text-[#176B4A] dark:text-[#D9A441]">
                            {cat?.labelKn || post.category}
                          </span>
                          <span className="text-[#64748B] dark:text-slate-400">
                            {formatCommunityDateKn(post.createdAt)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onNavigatePost(post.slug)}
                          className="block text-left font-kannada text-base font-extrabold text-[#10243D] dark:text-white hover:text-[#176B4A] dark:hover:text-[#D9A441] leading-snug cursor-pointer"
                        >
                          {post.title}
                        </button>

                        {post.price && (
                          <div className="font-kannada text-xs font-extrabold text-[#9A6700] dark:text-[#D9A441]">
                            ಬೆಲೆ: {post.price}
                          </div>
                        )}

                        <p className="font-kannada text-xs text-[#475569] dark:text-slate-300 line-clamp-3 leading-relaxed">
                          {post.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-kannada text-[#5A677A] dark:text-slate-400 pt-1">
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

                        {post.optionalPublicContact && (
                          <div className="text-[11px] font-kannada font-semibold text-[#176B4A] dark:text-emerald-300 inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span>{post.optionalPublicContact}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-[#FAFBFC] dark:bg-slate-900/40 space-y-2">
                      <CommunityShareBar post={post} compact />

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => onNavigatePost(post.slug)}
                          className="text-xs font-kannada font-bold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer"
                        >
                          ಪೂರ್ಣ ವಿವರ ನೋಡಿ →
                        </button>

                        <div className="flex items-center gap-2">
                          {post.isOwner && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPost(post);
                                setComposerOpen(true);
                              }}
                              className="text-[11px] font-kannada font-bold text-[#10243D] dark:text-slate-200 hover:underline cursor-pointer"
                            >
                              ಸಂಪಾದಿಸಿ
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setReportingPost(post)}
                            aria-label={`ವರದಿ ಮಾಡಿ: ${post.title}`}
                            className="inline-flex items-center gap-1 text-[11px] font-kannada text-[#64748B] hover:text-red-600 cursor-pointer"
                          >
                            <Flag className="w-3 h-3" />
                            <span>ವರದಿ</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <CommunityRegisterModal
        open={registerModalOpen}
        onClose={() => {
          setRegisterModalOpen(false);
          setPendingActionAfterReg(null);
        }}
        onRegistered={handleRegistered}
      />

      <CommunityComposerModal
        open={composerOpen}
        editingPost={editingPost}
        defaultCategory={selectedCategory !== 'all' ? selectedCategory : undefined}
        defaultLocation={selectedLocation !== 'all' ? selectedLocation : globalLocation}
        authorName={userProfile?.fullName || ''}
        onClose={() => {
          setComposerOpen(false);
          setEditingPost(null);
        }}
        onSaved={handleSavedPost}
        onOpenPost={(p) => onNavigatePost(p.slug)}
      />

      <CommunityReportModal post={reportingPost} onClose={() => setReportingPost(null)} />
    </div>
  );
};
