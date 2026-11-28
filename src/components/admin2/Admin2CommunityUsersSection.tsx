import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  History,
  Loader2,
  Lock,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { COMMUNITY_CATEGORY_MAP } from '../../constants/communityCategories';
import type {
  AdminCommunityPostView,
  AdminCommunityUserSummary,
  CommunityPostStatus,
  CommunityReportRecord,
  CommunityUserStatus,
} from '../../types/community';
import {
  deleteAdminCommunityPost,
  fetchAdminCommunityPosts,
  fetchAdminCommunityReports,
  fetchAdminCommunityUserHistory,
  fetchAdminCommunityUsers,
  resolveAdminCommunityReport,
  setAdminCommunityPostStatus,
  setAdminCommunityUserStatus,
} from '../../services/communityClient';
import { getAdmin2AuthHeaders } from '../../services/admin2Client';
import { formatAdminViewCount, sumViewCounts } from '../../utils/viewCounts';

interface Admin2CommunityUsersSectionProps {
  darkMode: boolean;
}

export const Admin2CommunityUsersSection: React.FC<Admin2CommunityUsersSectionProps> = ({
  darkMode,
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'posts' | 'reports'>('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Registered users (private admin-only data including mobileNumber)
  const [users, setUsers] = useState<AdminCommunityUserSummary[]>([]);
  const [totals, setTotals] = useState({
    totalUsers: 0,
    activeUsers: 0,
    suspendedUsers: 0,
    totalPosts: 0,
    publishedPosts: 0,
    openReports: 0,
  });
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | CommunityUserStatus>('all');

  // Individual user submission history modal
  const [historyUser, setHistoryUser] = useState<{
    id: string;
    fullName: string;
    mobileNumber: string;
    registeredAt: string;
    status: CommunityUserStatus;
  } | null>(null);
  const [historyPosts, setHistoryPosts] = useState<AdminCommunityPostView[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Community posts & reports
  const [posts, setPosts] = useState<AdminCommunityPostView[]>([]);
  const [postSearch, setPostSearch] = useState('');
  const [postStatusFilter, setPostStatusFilter] = useState<'all' | CommunityPostStatus>('all');
  const [reports, setReports] = useState<CommunityReportRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);

  const notifyPublicDataMutated = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('coffeenadu:data-mutated'));
    }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, postsRes, reportsRes] = await Promise.all([
        fetchAdminCommunityUsers({ q: userSearch.trim() || undefined, status: userStatusFilter }),
        fetchAdminCommunityPosts({ q: postSearch.trim() || undefined, status: postStatusFilter }),
        fetchAdminCommunityReports(),
      ]);
      setUsers(usersRes.users);
      setTotals(usersRes.totals);
      setPosts(postsRes);
      setReports(reportsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load community users data.');
    } finally {
      setLoading(false);
    }
  }, [userSearch, userStatusFilter, postSearch, postStatusFilter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleOpenHistory = async (userId: string) => {
    setLoadingHistory(true);
    setError('');
    try {
      const data = await fetchAdminCommunityUserHistory(userId);
      setHistoryUser(data.user);
      setHistoryPosts(data.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submission history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleToggleUserStatus = async (user: AdminCommunityUserSummary) => {
    const nextStatus: CommunityUserStatus = user.status === 'suspended' ? 'active' : 'suspended';
    setBusyId(user.id);
    setNotice('');
    try {
      await setAdminCommunityUserStatus(
        user.id,
        nextStatus,
        nextStatus === 'suspended' ? 'Suspended by admin moderation' : undefined
      );
      setNotice(
        nextStatus === 'suspended'
          ? `Suspended ${user.fullName}'s account and revoked active sessions.`
          : `Restored ${user.fullName}'s account to active.`
      );
      await loadAll();
      notifyPublicDataMutated();
      if (historyUser && historyUser.id === user.id) {
        setHistoryUser({ ...historyUser, status: nextStatus });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSetPostStatus = async (postId: string, status: CommunityPostStatus) => {
    setBusyId(postId);
    setNotice('');
    try {
      await setAdminCommunityPostStatus(
        postId,
        status,
        status === 'hidden' ? 'Hidden by admin' : undefined
      );
      setNotice(
        status === 'published'
          ? 'Community post restored to public feed.'
          : 'Community post hidden from public feed.'
      );
      await loadAll();
      notifyPublicDataMutated();
      if (historyUser) {
        await handleOpenHistory(historyUser.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update post visibility.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    setBusyId(postId);
    setNotice('');
    try {
      await deleteAdminCommunityPost(postId);
      setConfirmDeletePostId(null);
      setNotice('Community post permanently removed.');
      await loadAll();
      notifyPublicDataMutated();
      if (historyUser) {
        await handleOpenHistory(historyUser.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete post.');
    } finally {
      setBusyId(null);
    }
  };

  const handleResolveReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
    setBusyId(reportId);
    try {
      await resolveAdminCommunityReport(reportId, status);
      setNotice(`Report marked as ${status}.`);
      await loadAll();
      notifyPublicDataMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update report.');
    } finally {
      setBusyId(null);
    }
  };

  const handleExportBackup = async () => {
    try {
      const resp = await fetch('/api/admin2/community/export', {
        headers: await getAdmin2AuthHeaders(),
      });
      if (!resp.ok) throw new Error('Export failed.');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coffeenadu-community-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export backup.');
    }
  };

  const cardClass = darkMode
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900';

  return (
    <div className="space-y-5">
      {/* Header + Privacy Badge */}
      <div className={`rounded-2xl border p-5 ${cardClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <Lock className="w-3.5 h-3.5" />
              <span>Admin-Only Private Directory · Mobile Numbers Never Public</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold">
              Coffeenadu Community — Registered Users & Content Moderation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Community posts publish immediately without admin pre-approval. Use this console to inspect registered user mobile numbers privately, suspend/restore accounts, and remove reported or inappropriate posts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExportBackup()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON Backup</span>
            </button>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#10243D] text-white text-xs font-bold hover:bg-[#19385F] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
            <p className="text-[11px] font-semibold text-slate-500">Registered Users</p>
            <p className="text-xl font-extrabold mt-0.5 tabular-nums">{totals.totalUsers}</p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
              {totals.activeUsers} active · {totals.suspendedUsers} suspended
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
            <p className="text-[11px] font-semibold text-slate-500">Total Submissions</p>
            <p className="text-xl font-extrabold mt-0.5 tabular-nums">{totals.totalPosts}</p>
            <p className="text-[11px] text-slate-500">{totals.publishedPosts} live published</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
            <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <Eye className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>Total Post Views (Admin)</span>
            </p>
            <p className="text-xl font-extrabold mt-0.5 tabular-nums text-slate-900 dark:text-amber-300">
              {formatAdminViewCount(sumViewCounts(posts.map((p) => p.viewsCount)))}
            </p>
            <p className="text-[11px] text-slate-500">Sales, shops &amp; community posts</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
            <p className="text-[11px] font-semibold text-slate-500">Open User Reports</p>
            <p className="text-xl font-extrabold mt-0.5 tabular-nums text-red-600 dark:text-red-400">
              {totals.openReports}
            </p>
            <p className="text-[11px] text-slate-500">Immediate live · post-moderation</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs font-bold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
            activeTab === 'users'
              ? 'bg-[#10243D] text-white'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Registered Users ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
            activeTab === 'posts'
              ? 'bg-[#10243D] text-white'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>All Community Posts ({posts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
            activeTab === 'reports'
              ? 'bg-[#10243D] text-white'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <Flag className="w-4 h-4" />
          <span>User Reports ({totals.openReports} open)</span>
        </button>
      </div>

      {/* ================================================================== */}
      {/* TAB 1: PRIVATE REGISTERED USERS (Full Name + Private Mobile)       */}
      {/* ================================================================== */}
      {activeTab === 'users' && (
        <div className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${cardClass}`}>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by full name or 10-digit mobile number..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>

            <select
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value as 'all' | CommunityUserStatus)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-semibold"
            >
              <option value="all">All Accounts</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
            </select>
          </div>

          {loading ? (
            <div className="py-10 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#176B4A]" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">
              No registered community users match your filter yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 pr-3">Full Name</th>
                    <th className="py-2.5 pr-3">Mobile Number (Private)</th>
                    <th className="py-2.5 pr-3">Registered</th>
                    <th className="py-2.5 pr-3">Last Active</th>
                    <th className="py-2.5 pr-3">Submissions</th>
                    <th className="py-2.5 pr-3">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 pr-3 font-kannada font-bold">{u.fullName}</td>
                      <td className="py-3 pr-3 font-mono font-bold text-[#176B4A] dark:text-emerald-400">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {u.mobileNumber}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-slate-500">
                        {new Date(u.registeredAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-3 text-slate-500">
                        {new Date(u.lastActiveAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-3 font-semibold">
                        {u.totalPosts} total ({u.publishedPosts} live)
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            u.status === 'suspended'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {u.status === 'suspended' ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleOpenHistory(u.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>History</span>
                          </button>

                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => void handleToggleUserStatus(u)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer ${
                              u.status === 'suspended'
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900'
                            }`}
                          >
                            {u.status === 'suspended' ? (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Restore</span>
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>Suspend</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2: ALL PUBLISHED & HIDDEN COMMUNITY POSTS                      */}
      {/* ================================================================== */}
      {activeTab === 'posts' && (
        <div className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${cardClass}`}>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={postSearch}
                onChange={(e) => setPostSearch(e.target.value)}
                placeholder="Search posts by title, contributor name, mobile, or location..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>

            <select
              value={postStatusFilter}
              onChange={(e) => setPostStatusFilter(e.target.value as 'all' | CommunityPostStatus)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="published">Published (Live)</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>

          {posts.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No community posts found.</p>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => {
                const cat = COMMUNITY_CATEGORY_MAP[post.category];
                return (
                  <div
                    key={post.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-kannada font-bold text-[#176B4A] dark:text-emerald-400">
                          {cat?.labelKn || post.category}
                        </span>
                        <span>·</span>
                        <span>{post.location}</span>
                        <span>·</span>
                        <span className="font-semibold">{post.authorName}</span>
                        {post.authorMobileNumber && (
                          <span className="font-mono text-slate-500">
                            ({post.authorMobileNumber})
                          </span>
                        )}
                        {post.status !== 'published' && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                            {post.status}
                          </span>
                        )}
                        {post.openReportsCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold">
                            {post.openReportsCount} open report(s)
                          </span>
                        )}
                      </div>
                      <h3 className="font-kannada text-sm font-extrabold">{post.title}</h3>
                      <p className="font-kannada text-xs text-slate-500 line-clamp-2">
                        {post.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1 font-bold tabular-nums text-slate-800 dark:text-amber-300">
                          <Eye className="w-3.5 h-3.5 text-slate-400 dark:text-amber-400/80" />
                          {formatAdminViewCount(post.viewsCount)} views
                        </span>
                        <span className="font-mono">
                          /community/{post.slug} · {new Date(post.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {post.status === 'published' ? (
                        <button
                          type="button"
                          disabled={busyId === post.id}
                          onClick={() => void handleSetPostStatus(post.id, 'hidden')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Hide</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === post.id}
                          onClick={() => void handleSetPostStatus(post.id, 'published')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </button>
                      )}

                      {confirmDeletePostId === post.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busyId === post.id}
                            onClick={() => void handleDeletePost(post.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold cursor-pointer"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePostId(null)}
                            className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePostId(post.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 3: USER REPORTS                                                */}
      {/* ================================================================== */}
      {activeTab === 'reports' && (
        <div className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardClass}`}>
          {reports.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">
              No community reports submitted yet.
            </p>
          ) : (
            reports.map((rep) => {
              const linkedPost = posts.find((p) => p.id === rep.postId);
              const targetUrl =
                rep.targetType === 'news'
                  ? `/?article=${encodeURIComponent(rep.postId)}`
                  : `/community/${encodeURIComponent(
                      rep.postSlug || linkedPost?.slug || rep.postId
                    )}?preview=1`;
              return (
                <div
                  key={rep.id}
                  data-testid={`admin-report-card-${rep.id}`}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                          rep.status === 'open'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                            : rep.status === 'resolved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {rep.status}
                      </span>
                      {rep.targetType && (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200 font-bold text-[10px] uppercase">
                          {rep.targetType}
                        </span>
                      )}
                      <a
                        href={targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-kannada font-bold hover:underline inline-flex items-center gap-1"
                      >
                        <span>{rep.postTitle}</span>
                        <ExternalLink className="w-3 h-3 opacity-70" />
                      </a>
                    </div>
                    <p className="font-kannada text-xs font-semibold text-red-700 dark:text-red-300">
                      Reason: {rep.reason}
                    </p>
                    {rep.details && (
                      <p className="font-kannada text-xs text-slate-600 dark:text-slate-300">
                        Details: {rep.details}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400">
                      Submitted: {new Date(rep.createdAt).toLocaleString()}
                      {rep.resolvedAt
                        ? ` · ${rep.status === 'resolved' ? 'Resolved' : 'Dismissed'}: ${new Date(
                            rep.resolvedAt
                          ).toLocaleString()}${rep.resolvedBy ? ` by ${rep.resolvedBy}` : ''}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <a
                      href={targetUrl}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`admin-report-open-article-${rep.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Article</span>
                    </a>
                    {rep.status === 'open' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === rep.id}
                          data-testid={`admin-report-resolve-btn-${rep.id}`}
                          onClick={() => void handleResolveReport(rep.id, 'resolved')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Resolved</span>
                        </button>
                        {rep.targetType !== 'news' && (
                          <button
                            type="button"
                            disabled={busyId === rep.id}
                            data-testid={`admin-report-hide-resolve-btn-${rep.id}`}
                            onClick={async () => {
                              await handleSetPostStatus(rep.postId, 'hidden');
                              await handleResolveReport(rep.id, 'resolved');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hide Post & Resolve</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === rep.id}
                          data-testid={`admin-report-dismiss-btn-${rep.id}`}
                          onClick={() => void handleResolveReport(rep.id, 'dismissed')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Dismiss</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* INDIVIDUAL USER SUBMISSION HISTORY DRAWER / MODAL                  */}
      {/* ================================================================== */}
      {historyUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${cardClass}`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-kannada text-base font-extrabold">{historyUser.fullName}</h3>
                <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                  Mobile (Private): {historyUser.mobileNumber} · Registered:{' '}
                  {new Date(historyUser.registeredAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryUser(null)}
                aria-label="Close history"
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              {loadingHistory ? (
                <div className="py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#176B4A]" />
                </div>
              ) : historyPosts.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  This user has not published any community posts yet.
                </p>
              ) : (
                historyPosts.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-kannada text-slate-500 flex flex-wrap items-center gap-2">
                        <span>
                          {COMMUNITY_CATEGORY_MAP[p.category]?.labelKn} · {p.location} ·{' '}
                          {new Date(p.createdAt).toLocaleDateString()} · Status: <strong>{p.status}</strong>
                        </span>
                        <span className="inline-flex items-center gap-1 font-sans font-bold tabular-nums text-slate-800 dark:text-amber-300">
                          <Eye className="w-3 h-3 text-slate-400" />
                          {formatAdminViewCount(p.viewsCount)} views
                        </span>
                      </div>
                      <p className="font-kannada text-sm font-bold">{p.title}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          void handleSetPostStatus(
                            p.id,
                            p.status === 'published' ? 'hidden' : 'published'
                          )
                        }
                        className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
                      >
                        {p.status === 'published' ? 'Hide' : 'Restore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeletePost(p.id)}
                        className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
