import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';

const UPDATE_THROTTLE = 100;
let lastUpdateTime = 0;

export const useCrossTabSync = () => {
  const isActiveRef = useRef(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) {
      return;
    }

    isActiveRef.current = true;
    const channel = new BroadcastChannel('hft-app-sync');

    const handleMessage = (event: MessageEvent) => {
      if (!isActiveRef.current) return;
      
      const now = Date.now();
      if (now - lastUpdateTime < UPDATE_THROTTLE) return;
      
      if (event.data?.type === 'sync-request') {
        lastUpdateTime = now;
        console.log('[CrossTabSync] Received sync signal from another tab');
        useAppStore.getState().syncFromDatabase();
      }
    };

    channel.addEventListener('message', handleMessage);

    // Broadcast sync after local updates
    const originalSync = useAppStore.getState().syncFromDatabase;
    const wrappedSync = async () => {
      await originalSync();
      if (isActiveRef.current) {
        channel.postMessage({ type: 'sync-request', timestamp: Date.now() });
      }
    };

    // Store the wrapped function for use
    (window as any).__broadcastSync = () => {
      channel.postMessage({ type: 'sync-request', timestamp: Date.now() });
    };

    return () => {
      isActiveRef.current = false;
      channel.removeEventListener('message', handleMessage);
      channel.close();
      delete (window as any).__broadcastSync;
    };
  }, []);
};
