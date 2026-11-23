type UpdateListener = (hasUpdate: boolean) => void;

let registrationRef: ServiceWorkerRegistration | null = null;
let updateAvailable = false;
const listeners = new Set<UpdateListener>();
let initialized = false;

function notifyListeners() {
  listeners.forEach((cb) => cb(updateAvailable));
}

export function subscribeToPwaUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(updateAvailable);
  return () => {
    listeners.delete(listener);
  };
}

export async function applyPwaUpdate(): Promise<void> {
  if (!registrationRef?.waiting) {
    window.location.reload();
    return;
  }

  const waitingWorker = registrationRef.waiting;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export function registerCoffeeNaduServiceWorker(): void {
  if (initialized || typeof window === 'undefined') {
    return;
  }

  let swContainer: ServiceWorkerContainer | null = null;
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker) {
      swContainer = navigator.serviceWorker;
    }
  } catch {
    return;
  }

  if (!swContainer) {
    return;
  }

  initialized = true;

  let refreshing = false;
  try {
    swContainer.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  } catch {
    // Ignore restricted listener contexts
  }

  const doRegister = () => {
    if (!swContainer) return;
    swContainer
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        registrationRef = registration;

        if (registration.waiting) {
          updateAvailable = true;
          notifyListeners();
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && swContainer?.controller) {
              updateAvailable = true;
              notifyListeners();
            }
          });
        });

        // Periodic update checks while admin stays open (every 30 minutes)
        window.setInterval(() => {
          registration.update().catch(() => {});
        }, 30 * 60 * 1000);
      })
      .catch(() => {
        // Ignore registration errors in restricted/embedded iframe contexts
      });
  };

  if (document.readyState === 'complete') {
    doRegister();
  } else {
    window.addEventListener('load', doRegister, { once: true });
  }
}
