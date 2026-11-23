import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    let timer: number | undefined;

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
      if (timer) window.clearTimeout(timer);
    };

    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setJustReconnected(false), 4000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return { isOnline, justReconnected };
}
