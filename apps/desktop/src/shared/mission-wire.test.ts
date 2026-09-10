import { describe, it, expect } from 'vitest';
import {
  buildArduPilotWireMission,
  shiftJumpTargets,
  MAV_CMD_DO_JUMP,
  MAV_CMD_NAV_WAYPOINT,
} from './mission-wire';
import { MAV_FRAME, type MissionItem } from './mission-types';

function wp(seq: number, over: Partial<MissionItem> = {}): MissionItem {
  return {
    seq,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD_NAV_WAYPOINT,
    current: false,
    autocontinue: true,
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    latitude: 53 + seq * 0.001,
    longitude: 8 + seq * 0.001,
    altitude: 30,
    ...over,
  };
}

describe('buildArduPilotWireMission', () => {
  it('prepends HOME and renumbers items from 1', () => {
    const wire = buildArduPilotWireMission([wp(0), wp(1), wp(2)], { lat: 53, lon: 8, alt: 5 });
    expect(wire).toHaveLength(4);
    expect(wire[0]).toMatchObject({ seq: 0, command: MAV_CMD_NAV_WAYPOINT, current: true, latitude: 53, longitude: 8, altitude: 5, frame: MAV_FRAME.GLOBAL });
    expect(wire.slice(1).map((it) => it.seq)).toEqual([1, 2, 3]);
    expect(wire.slice(1).every((it) => !it.current)).toBe(true);
  });

  it('array index equals wire seq (the FC requests by index)', () => {
    const wire = buildArduPilotWireMission([wp(0), wp(1)], null);
    wire.forEach((it, i) => expect(it.seq).toBe(i));
  });

  it('uses a 0,0,0 placeholder home when none is known', () => {
    const wire = buildArduPilotWireMission([wp(0)], null);
    expect(wire[0]).toMatchObject({ latitude: 0, longitude: 0, altitude: 0 });
  });

  it('shifts DO_JUMP targets +1 to stay aligned with the inserted HOME', () => {
    const jump = wp(2, { command: MAV_CMD_DO_JUMP, param1: 0, param2: 3 });
    const wire = buildArduPilotWireMission([wp(0), wp(1), jump], { lat: 1, lon: 2, alt: 0 });
    expect(wire[3]!.param1).toBe(1);
    expect(wire[3]!.param2).toBe(3);
  });

  it('leaves non-jump params untouched', () => {
    const loiter = wp(0, { param1: 12, param3: 25 });
    const wire = buildArduPilotWireMission([loiter], null);
    expect(wire[1]).toMatchObject({ param1: 12, param3: 25 });
  });
});

describe('shiftJumpTargets', () => {
  it('shifts only DO_JUMP param1 and clamps at 0', () => {
    const items = [wp(0, { param1: 7 }), wp(1, { command: MAV_CMD_DO_JUMP, param1: 1 }), wp(2, { command: MAV_CMD_DO_JUMP, param1: 0 })];
    const out = shiftJumpTargets(items, -1);
    expect(out[0]!.param1).toBe(7);
    expect(out[1]!.param1).toBe(0);
    expect(out[2]!.param1).toBe(0);
  });
});

describe('round trip', () => {
  it('download-strip then upload-build is lossless including jumps', () => {
    // Raw FC mission: HOME at 0, three WPs, a DO_JUMP back to raw seq 1.
    const raw = [
      wp(0, { current: true, frame: MAV_FRAME.GLOBAL }),
      wp(1),
      wp(2),
      wp(3, { command: MAV_CMD_DO_JUMP, param1: 1, param2: 2 }),
    ];
    // Download: strip HOME, renumber from 0, jump targets -1.
    const ui = shiftJumpTargets(raw.slice(1), -1).map((it, i) => ({ ...it, seq: i }));
    expect(ui).toHaveLength(3);
    expect(ui[2]!.param1).toBe(0);
    // Upload: rebuild the wire list.
    const wire = buildArduPilotWireMission(ui, { lat: raw[0]!.latitude, lon: raw[0]!.longitude, alt: raw[0]!.altitude });
    expect(wire).toHaveLength(raw.length);
    wire.forEach((it, i) => {
      expect(it.seq).toBe(raw[i]!.seq);
      expect(it.command).toBe(raw[i]!.command);
      expect(it.param1).toBe(raw[i]!.param1);
      expect(it.latitude).toBe(raw[i]!.latitude);
    });
  });
});
