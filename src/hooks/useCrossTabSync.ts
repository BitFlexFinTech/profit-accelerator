import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

export const useCrossTabSync = () => {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.BroadcastChannel) {
      return;
    }

    const channel = new BroadcastChannel('hft-app-sync');

    channel.onmessage = (event) => {
      if (event.data === 'sync') {
        console.log('[CrossTabSync] Received sync signal from another tab');
        useAppStore.getState().syncFromDatabase();
      }
    };

    // Broadcast sync after local updates
    const originalSync = useAppStore.getState().syncFromDatabase;
    const wrappedSync = async () => {
      await originalSync();
      channel.postMessage('sync');
    };

    // Store the wrapped function for use
    (window as any).__broadcastSync = () => {
      channel.postMessage('sync');
    };

    return () => {
      channel.close();
      delete (window as any).__broadcastSync;
    };
  }, []);
};
