import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { CoffeeCupLogo } from '../CoffeeCupLogo';
import {
  activateAdmin2Account,
  fetchRememberedLoginState,
  forgetRememberedDevice,
  loginAdmin2WithPassword,
  loginAdmin2WithRememberedDevice,
  resetAdmin2Password,
} from '../../services/admin2Client';
import {
  clearAndroidKeystoreCredentials,
  isAndroidKeystoreVaultAvailable,
  loadAndroidKeystoreCredentials,
  saveAndroidKeystoreCredentials,
} from '../../services/androidVaultBridge';
import type { Admin2SessionUser } from '../../types/admin2';

interface Admin2LoginViewProps {
  onNavigateHome: () => void;
  onGoogleSignIn: (rememberMe: boolean) => Promise<void>;
  onFirebasePasswordSignIn: (
    email: string,
    password: string,
    rememberMe: boolean
  ) => Promise<void>;
  onAdmin2PasswordLoginSuccess: (user: Admin2SessionUser) => void;
  signingInGoogle: boolean;
  externalError?: string;
  lockNotice?: string;
  reloadNonce?: number;
  verificationPendingEmail?: string | null;
  verificationMessage?: string;
  sendingVerification?: boolean;
  onResendVerification?: () => Promise<void>;
  onRefreshVerification?: () => Promise<void>;
  onSignOutPending?: () => Promise<void>;
  initialActivateToken?: string;
  initialResetToken?: string;
}

export function Admin2LoginView({
  onNavigateHome,
  onGoogleSignIn,
  onFirebasePasswordSignIn,
  onAdmin2PasswordLoginSuccess,
  signingInGoogle,
  externalError,
  lockNotice,
  reloadNonce = 0,
  verificationPendingEmail,
  verificationMessage,
  sendingVerification,
  onResendVerification,
  onRefreshVerification,
  onSignOutPending,
  initialActivateToken = '',
  initialResetToken = '',
}: Admin2LoginViewProps) {
  const [mode, setMode] = useState<'signin' | 'activate' | 'reset'>(
    initialActivateToken ? 'activate' : initialResetToken ? 'reset' : 'signin'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tokenInput, setTokenInput] = useState(initialActivateToken || initialResetToken);
  const [rememberMe, setRememberMe] = useState(false);

  // App-controlled saved credential state (Android Keystore OR server-backed Web remembered device)
  const [androidVaultMode, setAndroidVaultMode] = useState<boolean>(() =>
    isAndroidKeystoreVaultAvailable()
  );
  const [hasSavedLogin, setHasSavedLogin] = useState(false);
  const [savedEmail, setSavedEmail] = useState('');
  const [webRememberedReady, setWebRememberedReady] = useState(false);
  const [passwordEdited, setPasswordEdited] = useState(false);
  const [loadingSavedState, setLoadingSavedState] = useState(true);

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localSuccess, setLocalSuccess] = useState('');

  const displayError = localError || externalError || '';

  // Load saved credentials from app-controlled secure storage on mount or after auto-lock/logout.
  // Never auto-submits: administrator must always manually press "Login Now".
  useEffect(() => {
    let cancelled = false;
    const isNativeVault = isAndroidKeystoreVaultAvailable();
    setAndroidVaultMode(isNativeVault);

    if (isNativeVault) {
      const saved = loadAndroidKeystoreCredentials();
      if (saved) {
        setEmail(saved.email);
        setPassword(saved.password);
        setSavedEmail(saved.email.toLowerCase());
        setRememberMe(true);
        setHasSavedLogin(true);
        setWebRememberedReady(false);
        setPasswordEdited(false);
      } else {
        setEmail('');
        setPassword('');
        setSavedEmail('');
        setRememberMe(false);
        setHasSavedLogin(false);
        setWebRememberedReady(false);
        setPasswordEdited(false);
      }
      setLoadingSavedState(false);
      return;
    }

    setLoadingSavedState(true);
    void fetchRememberedLoginState()
      .then((info) => {
        if (cancelled) return;
        if (info.remembered && info.email) {
          setEmail(info.email);
          setPassword('');
          setSavedEmail(info.email.toLowerCase());
          setRememberMe(true);
          setHasSavedLogin(true);
          setWebRememberedReady(true);
          setPasswordEdited(false);
        } else {
          setEmail('');
          setPassword('');
          setSavedEmail('');
          setRememberMe(false);
          setHasSavedLogin(false);
          setWebRememberedReady(false);
          setPasswordEdited(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSavedState(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  const handleEmailChange = (nextValue: string) => {
    setEmail(nextValue);
    setLocalError('');
    const cleanNext = nextValue.trim().toLowerCase();
    // If administrator switches to a different account, clear any prefilled saved password
    if (savedEmail && cleanNext !== savedEmail) {
      if (webRememberedReady) {
        setWebRememberedReady(false);
      }
      if (androidVaultMode && !passwordEdited) {
        setPassword('');
      }
    }
  };

  const handlePasswordChange = (nextValue: string) => {
    setPassword(nextValue);
    setPasswordEdited(true);
    setLocalError('');
    if (webRememberedReady && nextValue.length > 0) {
      setWebRememberedReady(false);
    }
  };

  const handleRememberMeToggle = async (checked: boolean) => {
    setRememberMe(checked);
    setLocalError('');
    if (!checked && hasSavedLogin) {
      if (androidVaultMode) {
        clearAndroidKeystoreCredentials();
      } else {
        await forgetRememberedDevice();
      }
      setHasSavedLogin(false);
      setSavedEmail('');
      setWebRememberedReady(false);
      setLocalSuccess('Saved login will not be retained on this device.');
    }
  };

  const handleClearSavedLogin = async () => {
    setLocalError('');
    setLocalSuccess('');
    if (androidVaultMode) {
      clearAndroidKeystoreCredentials();
    } else {
      await forgetRememberedDevice();
    }
    setEmail('');
    setPassword('');
    setSavedEmail('');
    setRememberMe(false);
    setHasSavedLogin(false);
    setWebRememberedReady(false);
    setPasswordEdited(false);
    setLocalSuccess('Saved login credentials cleared from secure storage.');
  };

  const handlePasswordSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setLocalSuccess('');
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setLocalError('Please enter your administrator email.');
      return;
    }

    // Web/PWA remembered-device flow (no password stored in browser; requires pressing Login Now)
    const canUseWebRemembered =
      !androidVaultMode &&
      webRememberedReady &&
      rememberMe &&
      !password &&
      cleanEmail === savedEmail;

    if (!canUseWebRemembered && !password) {
      setLocalError('Please enter both your administrator email and password.');
      return;
    }

    setBusy(true);
    try {
      if (canUseWebRemembered) {
        const res = await loginAdmin2WithRememberedDevice(cleanEmail);
        if (res.ok && res.user) {
          onAdmin2PasswordLoginSuccess(res.user);
          return;
        }
      }

      // Fresh backend credential validation via Admin 2.0 RBAC (scrypt verified server-side)
      try {
        const res = await loginAdmin2WithPassword(
          cleanEmail,
          password,
          androidVaultMode ? false : rememberMe
        );
        if (res.ok && res.user) {
          if (androidVaultMode) {
            if (rememberMe) {
              saveAndroidKeystoreCredentials(cleanEmail, password);
            } else {
              clearAndroidKeystoreCredentials();
            }
          }
          onAdmin2PasswordLoginSuccess(res.user);
          return;
        }
      } catch (admin2Err) {
        const msg = admin2Err instanceof Error ? admin2Err.message : '';
        if (msg.toLowerCase().includes('suspended') || msg.toLowerCase().includes('activated')) {
          throw admin2Err;
        }
        // Fallback to existing Firebase Email/Password sign-in (exchanged for tracked server session)
        await onFirebasePasswordSignIn(cleanEmail, password, androidVaultMode ? false : rememberMe);
        if (androidVaultMode) {
          if (rememberMe) {
            saveAndroidKeystoreCredentials(cleanEmail, password);
          } else {
            clearAndroidKeystoreCredentials();
          }
        }
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to sign in right now.');
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteTokenFlow = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setLocalSuccess('');
    if (!tokenInput.trim()) {
      setLocalError('Please paste the secure token provided by your Super Admin.');
      return;
    }
    if (password.length < 10) {
      setLocalError('Password must be at least 10 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const res =
        mode === 'activate'
          ? await activateAdmin2Account(tokenInput.trim(), password)
          : await resetAdmin2Password(tokenInput.trim(), password);
      if (androidVaultMode) {
        clearAndroidKeystoreCredentials();
      } else {
        await forgetRememberedDevice();
      }
      setLocalSuccess(res.message);
      setEmail(res.email || '');
      setPassword('');
      setConfirmPassword('');
      setRememberMe(false);
      setHasSavedLogin(false);
      setSavedEmail('');
      setWebRememberedReady(false);
      setMode('signin');
      window.history.replaceState({}, '', '/admin');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not complete security request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B192C] text-slate-900 flex flex-col lg:flex-row">
      {/* Left Brand Editorial Panel */}
      <aside className="relative flex flex-col justify-between bg-gradient-to-br from-[#081221] via-[#0B192C] to-[#13294B] px-8 py-10 text-white lg:w-[44%] lg:px-14 lg:py-14">
        <div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to CoffeeNadu News Portal
          </button>

          <div className="mt-10 flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <CoffeeCupLogo className="h-9 w-9" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                Editorial Control Center
              </p>
              <h1 className="font-serif text-2xl font-bold tracking-tight text-white">
                COFFEENADU NEWS ADMIN 2.0
              </h1>
            </div>
          </div>

          <p className="mt-6 max-w-md text-sm leading-relaxed text-slate-300">
            Enterprise web administration console for Koppa Taluk&apos;s Kannada &amp; English newsroom—powered
            directly by your existing Google Sheets database, Google Drive media archive, and Google Apps Script backend.
          </p>

          <dl className="mt-10 grid grid-cols-2 gap-4 border-t border-white/10 pt-8 text-xs">
            <div>
              <dt className="text-slate-400">Editorial Engine</dt>
              <dd className="mt-1 font-semibold text-white">Drafts · Schedule · AI Studio</dd>
            </div>
            <div>
              <dt className="text-slate-400">Image Branding</dt>
              <dd className="mt-1 font-semibold text-white">Logo + 2x Overlay Preserved</dd>
            </div>
            <div>
              <dt className="text-slate-400">Storage Backend</dt>
              <dd className="mt-1 font-semibold text-white">Google Sheets &amp; Drive</dd>
            </div>
            <div>
              <dt className="text-slate-400">Access Control</dt>
              <dd className="mt-1 font-semibold text-white">Multi-Admin Role Permissions</dd>
            </div>
          </dl>
        </div>

        <div className="mt-10 flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>
            {androidVaultMode
              ? 'Protected by Android Keystore AES-256 encryption, automatic session lock & server-side audit logs.'
              : 'Protected by verified authentication, scrypt password hashing & server-side audit logs.'}
          </span>
        </div>
      </aside>

      {/* Right Sign-In Form */}
      <main className="flex flex-1 items-center justify-center bg-[#F8FAFC] px-6 py-10 lg:px-14">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              {mode === 'activate'
                ? 'Activate Administrator Account'
                : mode === 'reset'
                ? 'Set New Admin Password'
                : 'Sign in to Admin 2.0'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {mode === 'activate'
                ? 'Create a strong password (minimum 10 characters) to activate your invited newsroom account.'
                : mode === 'reset'
                ? 'Enter your secure one-time reset token and choose a new password.'
                : 'Authorized CoffeeNadu News editors and administrators only. Press Login Now to start a verified session.'}
            </p>
          </div>

          {lockNotice && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-700">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#0B192C]" />
              <span>{lockNotice}</span>
            </div>
          )}

          {verificationPendingEmail && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2.5">
              <p className="font-semibold">
                Email verification required for {verificationPendingEmail}
              </p>
              {verificationMessage && <p>{verificationMessage}</p>}
              <div className="flex flex-wrap gap-2">
                {onRefreshVerification && (
                  <button
                    type="button"
                    onClick={() => void onRefreshVerification()}
                    className="rounded-lg bg-[#0B192C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#13294B]"
                  >
                    I Verified — Refresh
                  </button>
                )}
                {onResendVerification && (
                  <button
                    type="button"
                    disabled={sendingVerification}
                    onClick={() => void onResendVerification()}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                  >
                    {sendingVerification ? 'Sending…' : 'Resend Link'}
                  </button>
                )}
                {onSignOutPending && (
                  <button
                    type="button"
                    onClick={() => void onSignOutPending()}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Switch Account
                  </button>
                )}
              </div>
            </div>
          )}

          {displayError && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          {localSuccess && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{localSuccess}</span>
            </div>
          )}

          {mode === 'signin' ? (
            <>
              <form
                onSubmit={handlePasswordSignIn}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                className="space-y-4"
              >
                {hasSavedLogin && savedEmail && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5 text-xs text-emerald-900">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="truncate font-medium">
                        {androidVaultMode
                          ? 'Saved credentials loaded from Android Keystore'
                          : 'Saved device login ready — press Login Now'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleClearSavedLogin()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear Saved Login
                    </button>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Administrator Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      name="cn_admin_identifier"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      required
                      value={email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      placeholder="editor@coffeenadunews.in"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B192C] focus:outline-none focus:ring-2 focus:ring-[#0B192C]/15"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      name="cn_admin_passphrase"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      required={!(!androidVaultMode && webRememberedReady && rememberMe && email.trim().toLowerCase() === savedEmail)}
                      value={password}
                      onChange={(e) => handlePasswordChange(e.target.value)}
                      placeholder={
                        !androidVaultMode && webRememberedReady && rememberMe
                          ? '•••••••••••• (Saved device login — press Login Now)'
                          : 'Enter your password'
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B192C] focus:outline-none focus:ring-2 focus:ring-[#0B192C]/15"
                    />
                  </div>
                </div>

                {/* App-Controlled Remember Me */}
                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      disabled={loadingSavedState || busy}
                      onChange={(e) => void handleRememberMeToggle(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#0B192C] focus:ring-[#0B192C]"
                    />
                    <span>Remember Me</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {androidVaultMode ? 'Android Keystore AES-256' : 'Manual Login Now required'}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={busy || signingInGoogle || loadingSavedState}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B192C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13294B] disabled:opacity-60 transition-colors"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Login Now
                </button>
              </form>

              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-400">
                <div className="h-px flex-1 bg-slate-200" />
                <span>or Google Administrator Account</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                disabled={signingInGoogle || busy}
                onClick={() => {
                  setLocalError('');
                  void onGoogleSignIn(androidVaultMode ? false : rememberMe);
                }}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-xs hover:bg-slate-50 disabled:opacity-60 transition-colors"
              >
                {signingInGoogle ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.29 14.3A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.3V6.6H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.4l4-3.1z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.6l4 3.1c.94-2.84 3.59-4.95 6.71-4.95z"
                    />
                  </svg>
                )}
                Continue with Google Sign-In
              </button>

              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setLocalError('');
                    setLocalSuccess('');
                    setMode('activate');
                  }}
                  className="font-medium text-slate-600 hover:text-[#0B192C]"
                >
                  Have an Activation Token?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocalError('');
                    setLocalSuccess('');
                    setMode('reset');
                  }}
                  className="font-medium text-slate-600 hover:text-[#0B192C]"
                >
                  Reset Password
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleCompleteTokenFlow} autoComplete="off" className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  {mode === 'activate' ? 'One-Time Activation Token' : 'Password Reset Token'}
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste secure token from link"
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-[#0B192C] focus:outline-none focus:ring-2 focus:ring-[#0B192C]/15"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  New Password (min 10 characters)
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#0B192C] focus:outline-none focus:ring-2 focus:ring-[#0B192C]/15"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Confirm Password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#0B192C] focus:outline-none focus:ring-2 focus:ring-[#0B192C]/15"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B192C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#13294B] disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === 'activate' ? 'Activate Account & Set Password' : 'Update Password'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setLocalError('');
                  setMode('signin');
                }}
                className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                Back to Sign In
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
