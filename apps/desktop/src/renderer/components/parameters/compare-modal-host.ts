import { useEffect } from 'react';
import { create } from 'zustand';

interface HostState {
  hosts: number;
}

export const useCompareModalHostStore = create<HostState>(() => ({ hosts: 0 }));

/** Claim the compare modal while mounted so the App-root copy stands down. */
export function useOwnsCompareModal(): void {
  useEffect(() => {
    useCompareModalHostStore.setState((s) => ({ hosts: s.hosts + 1 }));
    return () => useCompareModalHostStore.setState((s) => ({ hosts: Math.max(0, s.hosts - 1) }));
  }, []);
}
