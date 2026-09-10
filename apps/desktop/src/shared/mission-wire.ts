// ArduPilot reserves raw mission seq 0 for the HOME slot: whatever is uploaded
// at seq 0 becomes home, not a waypoint. Downloads strip that slot and renumber
// from 0, so uploads MUST apply the exact inverse (home back at 0, items from 1,
// DO_JUMP targets +1) or the first real waypoint is eaten on every write.
// PX4 has no home slot; its missions must go on the wire untouched.
import { MAV_FRAME, type MissionItem } from './mission-types.js';

export const MAV_CMD_NAV_WAYPOINT = 16;
export const MAV_CMD_DO_JUMP = 177;

export interface WireHomePosition {
  lat: number;
  lon: number;
  alt: number;
}

// A null home uploads 0,0,0: ArduPilot replaces home on arm, the placeholder
// only keeps the slot from consuming a real waypoint.
export function buildArduPilotWireMission(
  items: MissionItem[],
  home: WireHomePosition | null,
): MissionItem[] {
  const homeItem: MissionItem = {
    seq: 0,
    frame: MAV_FRAME.GLOBAL,
    command: MAV_CMD_NAV_WAYPOINT,
    current: true,
    autocontinue: true,
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    latitude: home?.lat ?? 0,
    longitude: home?.lon ?? 0,
    altitude: home?.alt ?? 0,
  };
  return [
    homeItem,
    ...items.map((it, i) => ({
      ...it,
      seq: i + 1,
      current: false,
      ...(it.command === MAV_CMD_DO_JUMP ? { param1: it.param1 + 1 } : {}),
    })),
  ];
}

// Inverse of the upload +1 for DO_JUMP targets; call with -1 after stripping HOME.
export function shiftJumpTargets(items: MissionItem[], delta: number): MissionItem[] {
  return items.map((it) =>
    it.command === MAV_CMD_DO_JUMP ? { ...it, param1: Math.max(0, it.param1 + delta) } : it,
  );
}
