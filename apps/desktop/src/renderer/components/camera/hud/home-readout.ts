import { bearingDeg, haversineMeters } from '../../../utils/osd/live-telemetry';
import { wrap180 } from './hud-geometry';

export interface HomeReadout {
  /** Meters from vehicle to home. */
  distance: number;
  /** Bearing to home relative to the nose, -180..180. */
  direction: number;
}

// Mission home only exists after a mission download, so it can only ever be the fallback.
export function resolveHudHome(
  mapHome: [number, number] | null,
  missionHome: { lat: number; lon: number } | null,
): [number, number] | null {
  if (mapHome && (mapHome[0] !== 0 || mapHome[1] !== 0)) return mapHome;
  if (missionHome && (missionHome.lat !== 0 || missionHome.lon !== 0)) {
    return [missionHome.lat, missionHome.lon];
  }
  return null;
}

/** Null when home or the vehicle fix is unknown: the HUD shows dashes, not 0 m. */
export function computeHomeReadout(
  lat: number,
  lon: number,
  heading: number,
  home: [number, number] | null,
): HomeReadout | null {
  if (!home) return null;
  if (lat === 0 && lon === 0) return null;
  return {
    distance: haversineMeters(lat, lon, home[0], home[1]),
    direction: wrap180(bearingDeg(lat, lon, home[0], home[1]) - heading),
  };
}
