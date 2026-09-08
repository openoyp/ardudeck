import { create } from 'zustand';
import type { TrainerStatus } from '../../shared/trainer-types';

/**
 * Whether the Trainer belongs on screen, and what it would say if asked to fly.
 *
 * The answer cannot come from `capabilities.ts` alone. That map is synchronous and knows only
 * about installed cargo, and the Trainer is also reachable through a local path override, which
 * only the main process can see. So availability is asked for once and cached, and the rail and
 * the SITL button both read the same answer instead of each deciding for themselves.
 */
interface TrainerStore {
  status: TrainerStatus | null;
  refresh: () => Promise<void>;
}

export const useTrainerStore = create<TrainerStore>((set) => ({
  status: null,
  refresh: async () => {
    try {
      set({ status: await window.electronAPI.trainerStatus() });
    } catch {
      // An older main process has no handler. Absent means the surfaces stay hidden, which is
      // the same thing a missing cargo means, so there is nothing to report.
      set({ status: null });
    }
  },
}));

/** True when the Trainer surfaces should be shown at all. */
export function useTrainerAvailable(): boolean {
  return useTrainerStore((s) => s.status?.available === true);
}
