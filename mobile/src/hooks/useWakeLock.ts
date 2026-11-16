import { useEffect, useRef } from 'react';

export function useWakeLock(enabled: boolean = true) {
  const sentinelRef = useRef<any>(null);

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) {
      return;
    }

    let isMounted = true;

    async function requestWakeLock() {
      try {
        sentinelRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        // Wake Lock may be refused if battery saver or visibility state is hidden
        console.warn('Wake Lock request error:', (err as any)?.message);
      }
    }

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMounted) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
    };
  }, [enabled]);
}
