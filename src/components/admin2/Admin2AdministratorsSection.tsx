import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import type { AdminDirectoryEntry } from '../../services/articlesStore';
import {
  createAdmin2Account,
  deleteAdmin2Account,
  fetchAdmin2Accounts,
  issueAdmin2ResetLink,
  revokeAdmin2AccountSessions,
  updateAdmin2Account,
} from '../../services/admin2Client';
import {
  ALL_ADMIN_PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type Admin2AccountPublic,
  type Admin2SessionUser,
  type AdminPermission,
  type AdminRole,
} from '../../types/admin2';

interface Admin2AdministratorsSectionProps {
  sessionUser: Admin2SessionUser;
  // Preserved Firebase Co-Editors props
  firebaseCoEditors: AdminDirectoryEntry[];
  loadingCoEditors: boolean;
  onAddFirebaseCoEditor: (uid: string, label: string) => Promise<void>;
  onRemoveFirebaseCoEditor: (uid: string) => Promise<void>;
}

const ROLE_OPTIONS: Array<{ value: AdminRole; label: string; desc: string }> = [
  { value: 'super_admin', label: 'Super Admin', desc: 'Full unrestricted control over all sections & administrators' },
  { value: 'admin', label: 'Admin', desc: 'Operations, editorial, backups & settings (delegated)' },
  { value: 'editor', label: 'Editor', desc: 'Create, edit, approve, schedule, publish & manage SEO/media' },
  { value: 'reporter', label: 'Reporter', desc: 'Create/edit drafts, use AI studio (drafts only), upload media' },
  { value: 'analyst', label: 'Analyst', desc: 'Read-only access to Dashboard, Analytics, SEO & Audit Logs' },
  { value: 'custom', label: 'Custom Role', desc: 'Fine-grained custom permission set' },
];

export function Admin2AdministratorsSection({
  sessionUser,
  firebaseCoEditors,
  loadingCoEditors,
  onAddFirebaseCoEditor,
  onRemoveFirebaseCoEditor,
}: Admin2AdministratorsSectionProps) {
  const [accounts, setAccounts] = useState<Admin2AccountPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'rbac' | 'firebase'>('rbac');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Admin2AccountPublic | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('editor');
  const [customRoleLabel, setCustomRoleLabel] = useState('');
  const [permissions, setPermissions] = useState<AdminPermission[]>([...ROLE_DEFAULT_PERMISSIONS.editor]);
  const [saving, setSaving] = useState(false);

  const [generatedLinkModal, setGeneratedLinkModal] = useState<{
    title: string;
    email: string;
    fullUrl: string;
    token: string;
    expiresInHours: number;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Preserved Firebase Co-editor inputs
  const [fbUid, setFbUid] = useState('');
  const [fbLabel, setFbLabel] = useState('');
  const [savingFb, setSavingFb] = useState(false);

  const actorIsSuper = sessionUser.protectedSuperAdmin || sessionUser.role === 'super_admin';

  const load = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchAdmin2Accounts();
      setAccounts(res.accounts || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load administrators.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreateModal = () => {
    setEditingAccount(null);
    setFullName('');
    setEmail('');
    setRole('editor');
    setCustomRoleLabel('');
    setPermissions(
      ROLE_DEFAULT_PERMISSIONS.editor.filter(
        (p) => actorIsSuper || sessionUser.permissions.includes(p)
      )
    );
    setModalOpen(true);
  };

  const openEditModal = (acc: Admin2AccountPublic) => {
    setEditingAccount(acc);
    setFullName(acc.fullName);
    setEmail(acc.email);
    setRole(acc.role);
    setCustomRoleLabel(acc.customRoleLabel || '');
    setPermissions([...acc.permissions]);
    setModalOpen(true);
  };

  const handleRoleChange = (nextRole: AdminRole) => {
    setRole(nextRole);
    const defaults = ROLE_DEFAULT_PERMISSIONS[nextRole];
    setPermissions(
      actorIsSuper ? [...defaults] : defaults.filter((p) => sessionUser.permissions.includes(p))
    );
  };

  const togglePermission = (perm: AdminPermission) => {
    if (!actorIsSuper && !sessionUser.permissions.includes(perm)) return;
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleSubmitAccount = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    setFeedback('');
    try {
      if (editingAccount) {
        await updateAdmin2Account(editingAccount.id, {
          fullName: fullName.trim(),
          role,
          customRoleLabel: role === 'custom' ? customRoleLabel.trim() : undefined,
          permissions,
        });
        setFeedback(`Updated administrator "${fullName.trim()}".`);
        setModalOpen(false);
      } else {
        const res = await createAdmin2Account({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          role,
          customRoleLabel: role === 'custom' ? customRoleLabel.trim() : undefined,
          permissions,
        });
        setModalOpen(false);
        setGeneratedLinkModal({
          title: 'Account Created — One-Time Activation Link',
          email: res.account.email,
          fullUrl: `${window.location.origin}${res.activationPath}`,
          token: res.activationToken,
          expiresInHours: res.expiresInHours,
        });
      }
      await load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save administrator account.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuspend = async (acc: Admin2AccountPublic) => {
    setErrorMsg('');
    try {
      const nextStatus = acc.status === 'suspended' ? 'active' : 'suspended';
      await updateAdmin2Account(acc.id, { status: nextStatus });
      setFeedback(
        nextStatus === 'suspended'
          ? `Suspended ${acc.email} and revoked active sessions.`
          : `Reactivated ${acc.email}.`
      );
      await load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Status update failed.');
    }
  };

  const handleIssueLink = async (acc: Admin2AccountPublic) => {
    setErrorMsg('');
    try {
      const res = await issueAdmin2ResetLink(acc.id);
      setGeneratedLinkModal({
        title:
          res.kind === 'activate'
            ? 'Re-Issued Account Activation Link'
            : 'One-Time Password Reset Link',
        email: acc.email,
        fullUrl: `${window.location.origin}${res.path}`,
        token: res.token,
        expiresInHours: res.expiresInHours,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to issue security link.');
    }
  };

  const handleRevokeSessions = async (acc: Admin2AccountPublic) => {
    setErrorMsg('');
    try {
      const res = await revokeAdmin2AccountSessions(acc.id);
      setFeedback(`Revoked ${res.revokedCount} active session(s) for ${acc.email}.`);
      await load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Session revocation failed.');
    }
  };

  const handleCopyGeneratedLink = async () => {
    if (!generatedLinkModal) return;
    try {
      await navigator.clipboard.writeText(generatedLinkModal.fullUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Non-fatal
    }
  };

  const handleAddFbSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fbUid.trim() || !fbLabel.trim()) return;
    setSavingFb(true);
    setErrorMsg('');
    try {
      await onAddFirebaseCoEditor(fbUid.trim(), fbLabel.trim());
      setFbUid('');
      setFbLabel('');
      setFeedback('Added Firebase Co-Editor UID.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add co-editor.');
    } finally {
      setSavingFb(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Administrator &amp; Role Management
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Create delegated newsroom accounts with granular permissions, one-time secure activation links, and session revocation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Create Admin Account
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setSubTab('rbac')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            subTab === 'rbac'
              ? 'bg-[#0B192C] text-white dark:bg-blue-600'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          Admin 2.0 RBAC Accounts ({accounts.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('firebase')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            subTab === 'firebase'
              ? 'bg-[#0B192C] text-white dark:bg-blue-600'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          Firebase Co-Editors ({firebaseCoEditors.length})
        </button>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {subTab === 'rbac' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Administrator</th>
                  <th className="px-4 py-3">Role &amp; Scope</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sessions / Last Login</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white">{acc.fullName}</p>
                        {acc.protectedSuperAdmin && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                            <Shield className="h-3 w-3" /> Protected
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">{acc.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                        {acc.customRoleLabel || acc.role.replace('_', ' ')}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {acc.permissions.length} permission(s)
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold capitalize ${
                          acc.status === 'active'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : acc.status === 'suspended'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {acc.status.replace('_', ' ')}
                      </span>
                      <p className="text-[10px] text-slate-400">
                        {acc.hasPassword ? 'Password Set (scrypt)' : 'Google Sign-In / Pending'}
                      </p>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                      <p>{acc.activeSessionCount} active session(s)</p>
                      <p className="text-[11px] text-slate-400">
                        {acc.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleString('en-IN') : 'Never signed in'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {acc.protectedSuperAdmin ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                          <Lock className="h-3 w-3" /> Owner Protected
                        </span>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(acc)}
                            title="Edit Role & Permissions"
                            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleIssueLink(acc)}
                            title="Issue Activation / Reset Link"
                            className="rounded-md border border-slate-200 p-1.5 text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-400"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRevokeSessions(acc)}
                            title="Revoke All Active Sessions"
                            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleSuspend(acc)}
                            title={acc.status === 'suspended' ? 'Reactivate' : 'Suspend Account'}
                            className="rounded-md border border-slate-200 p-1.5 text-amber-700 hover:bg-amber-50 dark:border-slate-700 dark:text-amber-400"
                          >
                            {acc.status === 'suspended' ? (
                              <UserCheck className="h-3.5 w-3.5" />
                            ) : (
                              <UserX className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {confirmDeleteId === acc.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                setConfirmDeleteId(null);
                                await deleteAdmin2Account(acc.id);
                                await load();
                              }}
                              className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(acc.id)}
                              title="Delete Account"
                              className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={(e) => void handleAddFbSubmit(e)}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 text-xs dark:border-slate-800 dark:bg-[#111C2E] lg:col-span-5"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Add Legacy Firebase Co-Editor UID
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              Preserved for existing Firestore chat &amp; co-editor access rules.
            </p>
            <input
              type="text"
              required
              value={fbUid}
              onChange={(e) => setFbUid(e.target.value)}
              placeholder="Firebase User UID"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <input
              type="text"
              required
              value={fbLabel}
              onChange={(e) => setFbLabel(e.target.value)}
              placeholder="Editor Name / Desk Label"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={savingFb}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600"
            >
              {savingFb && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add Co-Editor
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#111C2E] lg:col-span-7">
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">
              Registered Firebase Co-Editors
            </h3>
            {loadingCoEditors ? (
              <p className="py-6 text-xs text-slate-500">Loading…</p>
            ) : firebaseCoEditors.length === 0 ? (
              <p className="py-6 text-xs text-slate-500">No additional Firebase co-editors listed.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {firebaseCoEditors.map((ed) => (
                  <li key={ed.uid} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{ed.label}</p>
                      <p className="font-mono text-[11px] text-slate-400">{ed.uid}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onRemoveFirebaseCoEditor(ed.uid)}
                      className="text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* CREATE / EDIT ACCOUNT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={(e) => void handleSubmitAccount(e)}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#111C2E]"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingAccount ? `Edit ${editingAccount.fullName}` : 'Create New Administrator Account'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Rajesh Kulkarni"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Email Address</label>
                  <input
                    type="email"
                    required
                    disabled={Boolean(editingAccount)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="reporter@coffeenadunews.in"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">Role</label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value as AdminRole)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {ROLE_OPTIONS.filter((opt) => actorIsSuper || opt.value !== 'super_admin').map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {role === 'custom' && (
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                      Custom Role Name
                    </label>
                    <input
                      type="text"
                      value={customRoleLabel}
                      onChange={(e) => setCustomRoleLabel(e.target.value)}
                      placeholder="e.g. Photo Desk Lead"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 font-semibold text-slate-700 dark:text-slate-200">
                  Granular Permissions ({permissions.length} selected)
                </p>
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700">
                  {ALL_ADMIN_PERMISSIONS.map((perm) => {
                    const allowedToGrant = actorIsSuper || sessionUser.permissions.includes(perm.key);
                    const checked = role === 'super_admin' || permissions.includes(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={`flex items-center gap-2 ${
                          allowedToGrant ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={!allowedToGrant || role === 'super_admin'}
                          checked={checked}
                          onChange={() => togglePermission(perm.key)}
                          className="h-3.5 w-3.5 rounded accent-[#0B192C]"
                        />
                        <span className="text-slate-700 dark:text-slate-200">{perm.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {!editingAccount && (
                <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    No plaintext passwords are ever stored. After creation, you will receive a one-time 48-hour activation link so this user sets their own scrypt-hashed password.
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingAccount ? 'Save Changes' : 'Create & Generate Activation Link'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* GENERATED ONE-TIME LINK MODAL */}
      {generatedLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#111C2E]">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {generatedLinkModal.title}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Share this secure one-time link privately with <strong>{generatedLinkModal.email}</strong>. It expires in{' '}
              {generatedLinkModal.expiresInHours} hours and will not be displayed again.
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] break-all text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {generatedLinkModal.fullUrl}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleCopyGeneratedLink()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedLink ? 'Copied Secure Link' : 'Copy Activation Link'}
              </button>
              <button
                type="button"
                onClick={() => setGeneratedLinkModal(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
