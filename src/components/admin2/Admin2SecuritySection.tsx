import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  fetchAdmin2SecurityOverview,
  revokeAdmin2SingleSession,
  setOwnAdmin2Password,
} from '../../services/admin2Client';
import {
  ALL_ADMIN_PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type Admin2AuditLog,
  type Admin2LoginHistoryItem,
  type Admin2Notification,
  type Admin2SessionInfo,
  type AdminRole,
} from '../../types/admin2';

export function Admin2SecuritySection() {
  const [sessions, setSessions] = useState<Admin2SessionInfo[]>([]);
  const [auditLogs, setAuditLogs] = useState<Admin2AuditLog[]>([]);
  const [loginHistory, setLoginHistory] = useState<Admin2LoginHistoryItem[]>([]);
  const [alerts, setAlerts] = useState<Admin2Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'audit' | 'sessions' | 'logins' | 'matrix'>('audit');

  // Set own Admin 2.0 password form (useful for Google Sign-In Super Admins)
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwFeedback, setPwFeedback] = useState('');
  const [pwError, setPwError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAdmin2SecurityOverview();
      setSessions(res.sessions || []);
      setAuditLogs(res.auditLogs || []);
      setLoginHistory(res.loginHistory || []);
      setAlerts(res.securityAlerts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwFeedback('');
    if (newPassword.length < 10) {
      setPwError('Password must be at least 10 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }
    setSavingPw(true);
    try {
      const res = await setOwnAdmin2Password(newPassword);
      setPwFeedback(res.message);
      setNewPassword('');
      setConfirmPassword('');
      await load();
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Unable to save password.');
    } finally {
      setSavingPw(false);
    }
  };

  const filteredLogs = auditLogs.filter((l) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${l.action} ${l.actorEmail} ${l.details} ${l.targetId}`.toLowerCase().includes(q);
  });

  const roles: AdminRole[] = ['super_admin', 'admin', 'editor', 'reporter', 'analyst'];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Security &amp; Audit Logs
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Active admin sessions, server-side RBAC audit trail, login history, security alerts, and personal password controls.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Security Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-slate-500 dark:text-slate-400">Active Admin 2.0 Sessions</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {sessions.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-slate-500 dark:text-slate-400">Recorded Audit Events</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {auditLogs.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111C2E]">
          <p className="text-slate-500 dark:text-slate-400">Security Alerts</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
            {alerts.length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {(
          [
            { id: 'audit', label: `Audit Logs (${auditLogs.length})` },
            { id: 'sessions', label: `Active Sessions (${sessions.length})` },
            { id: 'logins', label: `Login History (${loginHistory.length})` },
            { id: 'matrix', label: 'Role Permission Matrix' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === t.id
                ? 'bg-[#0B192C] text-white dark:bg-blue-600'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && auditLogs.length === 0 ? (
        <div className="flex h-40 items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading security logs…
        </div>
      ) : (
        <>
          {tab === 'audit' && (
            <section className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
              <div className="border-b border-slate-100 p-3.5 dark:border-slate-800">
                <div className="relative max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter by action, admin email, or target…"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Timestamp</th>
                      <th className="px-4 py-2.5">Actor</th>
                      <th className="px-4 py-2.5">Action</th>
                      <th className="px-4 py-2.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-500">
                          {new Date(log.timestamp).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                          {log.actorEmail}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] font-semibold text-[#1D4ED8] dark:text-blue-400">
                          {log.action}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'sessions' && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
              {sessions.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-500">
                  No active Admin 2.0 password sessions. (Google Sign-In sessions are managed by Firebase Auth.)
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5">Account</th>
                        <th className="px-4 py-2.5">IP Address</th>
                        <th className="px-4 py-2.5">Last Active</th>
                        <th className="px-4 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sessions.map((s) => (
                        <tr key={s.id}>
                          <td className="px-4 py-2.5">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {s.fullName} {s.isCurrent ? '(Current)' : ''}
                            </p>
                            <p className="text-[11px] text-slate-500">{s.email}</p>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {s.ip}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-slate-500">
                            {new Date(s.lastSeenAt).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                await revokeAdmin2SingleSession(s.id);
                                await load();
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400"
                            >
                              <LogOut className="h-3 w-3" /> Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {tab === 'logins' && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
              {loginHistory.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-500">No password sign-in attempts recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5">Time</th>
                        <th className="px-4 py-2.5">Email</th>
                        <th className="px-4 py-2.5">Result</th>
                        <th className="px-4 py-2.5">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {loginHistory.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 tabular-nums text-slate-500">
                            {new Date(item.timestamp).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{item.email}</td>
                          <td className="px-4 py-2.5">
                            {item.success ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Success
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                                <AlertTriangle className="h-3.5 w-3.5" /> Failed ({item.reason || 'Denied'})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{item.ip || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {tab === 'matrix' && (
            <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111C2E]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Permission Capability</th>
                    {roles.map((r) => (
                      <th key={r} className="px-3 py-3 text-center capitalize">
                        {r.replace('_', ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ALL_ADMIN_PERMISSIONS.map((perm) => (
                    <tr key={perm.key}>
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                        {perm.label}
                      </td>
                      {roles.map((r) => (
                        <td key={r} className="px-3 py-2.5 text-center">
                          {ROLE_DEFAULT_PERMISSIONS[r].includes(perm.key) ? (
                            <ShieldCheck className="mx-auto h-4 w-4 text-emerald-600" />
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {/* Personal Admin 2.0 Password Setup Card */}
      <form
        onSubmit={(e) => void handleSetPassword(e)}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#111C2E]"
      >
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#0B192C] dark:text-blue-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Set or Update Your Admin 2.0 Password
          </h3>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Optional: Configure a scrypt-hashed password for your account so you can sign in via Email &amp; Password in addition to Google Sign-In.
        </p>
        {pwFeedback && <p className="mb-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">{pwFeedback}</p>}
        {pwError && <p className="mb-3 text-xs font-medium text-rose-600 dark:text-rose-400">{pwError}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            type="password"
            required
            minLength={10}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 10 chars)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <input
            type="password"
            required
            minLength={10}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={savingPw}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0B192C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#13294B] dark:bg-blue-600"
          >
            {savingPw && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Encrypted Password
          </button>
        </div>
      </form>
    </div>
  );
}
