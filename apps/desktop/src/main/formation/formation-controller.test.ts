import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FormationController, type FormationConfig } from './formation-controller';

const DEG = Math.PI / 180;
const EARTH_R = 6371000;
/** Latitude delta for a northward offset in metres. */
const northDeg = (m: number) => (m / EARTH_R) / DEG;

function heartbeatPayload(mavType: number, armed: boolean): Uint8Array {
  const p = new Uint8Array(9);
  p[4] = mavType;
  p[6] = armed ? 0x80 : 0;
  p[7] = 4;
  return p;
}

function gpiPayload(lat: number, lon: number): Uint8Array {
  const p = new Uint8Array(28);
  const dv = new DataView(p.buffer);
  dv.setInt32(4, Math.round(lat * 1e7), true);
  dv.setInt32(8, Math.round(lon * 1e7), true);
  dv.setUint16(26, 0xffff, true);
  return p;
}

function vfrPayload(groundspeed: number, heading: number): Uint8Array {
  const p = new Uint8Array(20);
  const dv = new DataView(p.buffer);
  dv.setFloat32(4, groundspeed, true);
  dv.setInt16(16, heading, true);
  return p;
}

interface Sent {
  vehicleKey: string;
  command: number;
  params: Record<string, number>;
}

const CONFIG: FormationConfig = {
  shape: 'triangle',
  spacing: 30,
  rowSpacing: 30,
  centerOffset: 0,
  members: [
    { vehicleKey: 't:1:1', sysid: 1 },
    { vehicleKey: 't:2:1', sysid: 2 },
  ],
};

let ctrl: FormationController;
let sent: Sent[];
let lookup: Record<string, number>;

/** Leader at (0,0) heading north at `leaderSpeed`; follower `behindM` metres south. */
function feedFleet(opts: { leaderSpeed?: number; behindM: number; followerSpeed?: number; followerArmed?: boolean; followerType?: number; feedLeader?: boolean }) {
  const { leaderSpeed = 24, behindM, followerSpeed = 24, followerArmed = true, followerType = 2, feedLeader = true } = opts;
  if (feedLeader) {
    ctrl.noteFrame({ msgid: 0, sysid: 1, compid: 1, payload: heartbeatPayload(2, true) });
    ctrl.noteFrame({ msgid: 33, sysid: 1, compid: 1, payload: gpiPayload(0, 0) });
    ctrl.noteFrame({ msgid: 74, sysid: 1, compid: 1, payload: vfrPayload(leaderSpeed, 0) });
  }
  ctrl.noteFrame({ msgid: 0, sysid: 2, compid: 1, payload: heartbeatPayload(followerType, followerArmed) });
  ctrl.noteFrame({ msgid: 33, sysid: 2, compid: 1, payload: gpiPayload(northDeg(-behindM), 0) });
  ctrl.noteFrame({ msgid: 74, sysid: 2, compid: 1, payload: vfrPayload(followerSpeed, 0) });
}

async function runTick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(200);
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(1000));
  sent = [];
  lookup = {};
  ctrl = new FormationController();
  ctrl.setDeps({
    send: async (vehicleKey, command, params) => {
      sent.push({ vehicleKey, command, params });
      return true;
    },
    lookupParam: (name) => lookup[name],
  });
  ctrl.configure(CONFIG);
});

afterEach(() => {
  ctrl.stop();
  vi.useRealTimers();
});

describe('FormationController', () => {
  it('saturates to the +6 m/s ceiling when the wingman is far behind', async () => {
    feedFleet({ behindM: 200 });
    ctrl.start();
    await runTick();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.vehicleKey).toBe('t:2:1');
    expect(sent[0]!.command).toBe(178);
    expect(sent[0]!.params.param2).toBeCloseTo(30, 6);
    expect(sent[0]!.params.param3).toBe(-1);
  });

  it('issues no meaningful correction when the wingman is already on station', async () => {
    // The 1e-7 deg GPS quantization leaves a few mm of residual, which the 1e-4
    // threshold still forwards - so assert the command stays at the base speed.
    feedFleet({ behindM: 30 });
    ctrl.start();
    await runTick();
    const cmd = sent[0]?.params.param2 ?? 24;
    expect(cmd).toBeGreaterThan(23.9);
    expect(cmd).toBeLessThan(24.1);
  });

  it('clamps the target to WPNAV_SPEED on a multirotor', async () => {
    lookup = { WPNAV_SPEED: 1200 }; // 12 m/s
    feedFleet({ behindM: 200 });
    ctrl.start();
    await runTick();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.params.param2).toBeCloseTo(12, 6);
  });

  it('skips a wingman that is not armed', async () => {
    feedFleet({ behindM: 200, followerArmed: false });
    ctrl.start();
    await runTick();
    expect(sent).toHaveLength(0);
    expect(ctrl.status().members[1]!.skipReason).toBe('not armed');
  });

  it('reports a stale leader and commands nothing', async () => {
    feedFleet({ behindM: 200, feedLeader: false });
    ctrl.start();
    await runTick();
    expect(sent).toHaveLength(0);
    expect(ctrl.status().lastError).toBe('leader telemetry is stale');
  });

  it('stops cleanly', async () => {
    feedFleet({ behindM: 200 });
    ctrl.start();
    await runTick();
    ctrl.stop();
    await runTick();
    expect(sent).toHaveLength(1);
    expect(ctrl.status().running).toBe(false);
  });
});
