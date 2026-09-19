/**
 * Which instrument set the connected vehicle wants. Same rule as the HUD's
 * air/ground profile (resolveHudProfile), so the two never disagree about what
 * is hooked up, and the same three choices: follow the vehicle, or pin one.
 */
import { create } from 'zustand';
import { useConnectionStore } from '../../../stores/connection-store';
import { getVehicleClass } from '../../../../shared/telemetry-types';
import type { InstrumentProfile } from './registry';

export type InstrumentProfileMode = 'auto' | 'air' | 'ground';

const STORAGE_KEY = 'map-instrument-profile';

function load(): InstrumentProfileMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'air' || saved === 'ground' || saved === 'auto') return saved;
  } catch {
    // storage blocked: follow the vehicle
  }
  return 'auto';
}

export const useInstrumentProfileStore = create<{
  mode: InstrumentProfileMode;
  setMode: (mode: InstrumentProfileMode) => void;
}>((set) => ({
  mode: load(),
  setMode: (mode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // storage blocked: the choice lasts for this session
    }
    set({ mode });
  },
}));

/** The profile the vehicle reports, ignoring any override. */
export function useDetectedProfile(): InstrumentProfile {
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  return getVehicleClass(mavType) === 'rover' ? 'ground' : 'air';
}

export function useInstrumentProfile(): InstrumentProfile {
  const mode = useInstrumentProfileStore((s) => s.mode);
  const detected = useDetectedProfile();
  return mode === 'auto' ? detected : mode;
}
