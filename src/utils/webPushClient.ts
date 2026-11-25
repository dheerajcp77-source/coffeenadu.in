export interface WebPushPreferencesPayload {
  breakingNews: boolean;
  dailyDigest: boolean;
  localNews: boolean;
  agricultureUpdates: boolean;
  events: boolean;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isIosDeviceNotStandalone(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/i.test(ua);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const resp = await fetch('/api/public/push/vapid-public-key', {
      cache: 'no-store',
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      ok?: boolean;
      configured?: boolean;
      publicKey?: string;
    };
    return json.ok && json.configured && json.publicKey ? json.publicKey : null;
  } catch {
    return null;
  }
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export interface SubscribeWebPushResult {
  ok: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  reason?: 'unsupported' | 'ios_install_required' | 'denied' | 'vapid_unavailable' | 'error';
  message: string;
}

export async function subscribeVisitorToWebPush(
  preferences: WebPushPreferencesPayload,
  digestTimeLocal = '08:00'
): Promise<SubscribeWebPushResult> {
  if (!isWebPushSupported()) {
    if (isIosDeviceNotStandalone()) {
      return {
        ok: false,
        permission: 'unsupported',
        subscribed: false,
        reason: 'ios_install_required',
        message: 'On iPhone/iPad, tap Share → Add to Home Screen first to receive mobile alerts.',
      };
    }
    return {
      ok: false,
      permission: 'unsupported',
      subscribed: false,
      reason: 'unsupported',
      message: 'Web Push notifications are not supported in this browser.',
    };
  }

  try {
    const permission = await window.Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        ok: false,
        permission,
        subscribed: false,
        reason: 'denied',
        message:
          permission === 'denied'
            ? 'Notifications are blocked in your browser settings. Please allow them to receive breaking news.'
            : 'Notification permission was not granted.',
      };
    }

    const vapidKey = await fetchVapidPublicKey();
    if (!vapidKey) {
      return {
        ok: false,
        permission,
        subscribed: false,
        reason: 'vapid_unavailable',
        message: 'Push notification server key is temporarily unavailable.',
      };
    }

    await ensureServiceWorkerRegistration();
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const serialized = subscription.toJSON();
    const resp = await fetch('/api/public/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: serialized,
        preferences,
        digestTimeLocal,
      }),
    });

    const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!resp.ok || !json.ok) {
      return {
        ok: false,
        permission,
        subscribed: false,
        reason: 'error',
        message: json.error || 'Could not register push alerts with Coffeenadu server.',
      };
    }

    return {
      ok: true,
      permission,
      subscribed: true,
      message: 'ಕಾಫಿನಾಡು ನ್ಯೂಸ್ ಮೊಬೈಲ್ ನೋಟಿಫಿಕೇಶನ್ ಆನ್ ಆಗಿದೆ!',
    };
  } catch (err) {
    return {
      ok: false,
      permission: typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported',
      subscribed: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Unable to enable push notifications.',
    };
  }
}

export async function updateVisitorPushPreferences(
  preferences: WebPushPreferencesPayload,
  digestTimeLocal = '08:00'
): Promise<boolean> {
  try {
    const sub = await getExistingPushSubscription();
    if (!sub) return false;
    const resp = await fetch('/api/public/push/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        preferences,
        digestTimeLocal,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function unsubscribeVisitorFromWebPush(): Promise<boolean> {
  try {
    const sub = await getExistingPushSubscription();
    if (!sub) return true;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => false);
    const resp = await fetch('/api/public/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
