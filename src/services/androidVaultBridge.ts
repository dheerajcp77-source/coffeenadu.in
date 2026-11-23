/**
 * Native Android Keystore Vault & Lifecycle Bridge for CoffeeNadu Admin APK.
 *
 * When running inside the CoffeeNadu Admin Android app (AdminWebViewActivity),
 * `window.CoffeeNaduAndroidVault` exposes Android Keystore-backed AES-256-GCM
 * encrypted credential storage and lifecycle session revocation hooks.
 *
 * In desktop/mobile browsers and PWAs, this bridge is absent and all helpers
 * fail safely without ever falling back to localStorage, sessionStorage, or plaintext storage.
 */

export interface AndroidSavedCredentials {
  email: string;
  password: string;
}

interface NativeCoffeeNaduVaultBridge {
  isAvailable?: () => boolean;
  loadCredentials?: () => string;
  saveCredentials?: (email: string, password: string) => boolean;
  clearCredentials?: () => boolean;
  onSessionStarted?: (bearerToken: string) => void;
  onSessionCleared?: () => void;
  exitApp?: () => void;
}

declare global {
  interface Window {
    CoffeeNaduAndroidVault?: NativeCoffeeNaduVaultBridge;
    __coffeeNaduForceLockAndLogout?: (reason?: string) => void;
  }
}

function getNativeBridge(): NativeCoffeeNaduVaultBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.CoffeeNaduAndroidVault;
  if (!bridge || typeof bridge.isAvailable !== 'function') return null;
  try {
    return bridge.isAvailable() ? bridge : null;
  } catch {
    return null;
  }
}

export function isAndroidKeystoreVaultAvailable(): boolean {
  return getNativeBridge() !== null;
}

export function loadAndroidKeystoreCredentials(): AndroidSavedCredentials | null {
  const bridge = getNativeBridge();
  if (!bridge || typeof bridge.loadCredentials !== 'function') return null;
  try {
    const raw = bridge.loadCredentials();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AndroidSavedCredentials>;
    const email = typeof parsed.email === 'string' ? parsed.email.trim() : '';
    const password = typeof parsed.password === 'string' ? parsed.password : '';
    if (!email || !password) return null;
    return { email, password };
  } catch {
    return null;
  }
}

export function saveAndroidKeystoreCredentials(email: string, password: string): boolean {
  const bridge = getNativeBridge();
  if (!bridge || typeof bridge.saveCredentials !== 'function') return false;
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) return false;
  try {
    return Boolean(bridge.saveCredentials(cleanEmail, password));
  } catch {
    return false;
  }
}

export function clearAndroidKeystoreCredentials(): boolean {
  const bridge = getNativeBridge();
  if (!bridge || typeof bridge.clearCredentials !== 'function') return false;
  try {
    return Boolean(bridge.clearCredentials());
  } catch {
    return false;
  }
}

export function notifyAndroidSessionStarted(bearerToken: string): void {
  const bridge = getNativeBridge();
  if (!bridge || typeof bridge.onSessionStarted !== 'function') return;
  try {
    bridge.onSessionStarted(bearerToken);
  } catch {
    // Non-fatal
  }
}

export function notifyAndroidSessionCleared(): void {
  const bridge = getNativeBridge();
  if (!bridge || typeof bridge.onSessionCleared !== 'function') return;
  try {
    bridge.onSessionCleared();
  } catch {
    // Non-fatal
  }
}

export function requestAndroidAppExit(): boolean {
  const bridge = getNativeBridge();
  if (!bridge || typeof bridge.exitApp !== 'function') return false;
  try {
    bridge.exitApp();
    return true;
  } catch {
    return false;
  }
}
