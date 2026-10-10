/**
 * Native formation shape-keeping controller (integration option A).
 *
 * Runs the restored LGCFormationFlightController loop in the main process: one
 * 200 ms tick that reads live per-vehicle telemetry, computes the along-track
 * speed command for every wingman from the shape-keeping control law, and pushes
 * MAV_CMD_DO_CHANGE_SPEED(178) to each follower's own link.
 *
 * Unlike the module-sdk path, this addresses vehicles by key, so it can steer a
 * whole fleet instead of only the pilot's selected aircraft. It reuses the
 * existing main-process seams: the caller injects `send` (sendCommandLongToVehicle)
 * and `lookupParam` (the primary vehicle's parameter cache).
 */

import {
  DEFAULT_PARAMS,
  CONTROL_PERIOD_MS,
  alongTrackGaps,
  circleOffsets,
  clampTargetSpeed,
  doChangeSpeedParams,
  firmwareClassOf,
  lineOffsets,
  shouldSend,
  speedIncrement,
  toEnu,
  triangleOffsets,
  typeSpeedLimits,
  type Enu,
  type FormationSlot,
} from './formation-math.js';

export type FormationShape = 'triangle' | 'circle' | 'line';

export interface FormationMemberConfig {
  vehicleKey: string;
  sysid: number;
}

export interface FormationConfig {
  shape: FormationShape;
  /** Metres between vehicles (column spacing / circle chord / line spread). */
  spacing: number;
  /** Triangle row fall-back (m). */
  rowSpacing: number;
  /** Circle centre offset ahead of the leader (m). */
  centerOffset: number;
  /** members[0] is the leader; the rest are wingmen, in slot order. */
  members: FormationMemberConfig[];
}

export interface FormationMemberStatus {
  vehicleKey: string;
  sysid: number;
  role: 'leader' | 'follower';
  online: boolean;
  armed: boolean;
  lat: number | null;
  lon: number | null;
  heading: number | null;
  groundspeed: number | null;
  /** Desired along-track separation behind the leader (m). */
  desiredGapM: number | null;
  /** Live along-track separation behind the leader (m). */
  actualGapM: number | null;
  /** Commanded ground speed (m/s), or null when nothing was sent this tick. */
  targetSpeed: number | null;
  lastSentAt: number | null;
  /** Why this member was skipped this tick, or null when it was commanded. */
  skipReason: string | null;
}

export interface FormationStatus {
  running: boolean;
  shape: FormationShape | null;
  leaderKey: string | null;
  memberCount: number;
  members: FormationMemberStatus[];
  lastTickAt: number | null;
  lastError: string | null;
}

type CommandParams = Partial<Record<'param1' | 'param2' | 'param3' | 'param4' | 'param5' | 'param6' | 'param7', number>>;

export interface FormationControllerDeps {
  /** Send a COMMAND_LONG to a specific vehicle. Returns false when it did not go out. */
  send: (vehicleKey: string, command: number, params: CommandParams) => Promise<boolean>;
  /** Look up a parameter of the primary vehicle (e.g. WPNAV_SPEED). */
  lookupParam: (name: string) => number | undefined;
}

const STALE_MS = 3000;
const HEARTBEAT = 0;
const GLOBAL_POSITION_INT = 33;
const VFR_HUD = 74;

interface VehicleState {
  lat: number;
  lon: number;
  heading: number;
  groundspeed: number;
  mavType: number;
  armed: boolean;
  at: number;
}

/** MAVLink v2 truncates trailing zero bytes; zero-pad back to the wire length. */
function padTo(payload: Uint8Array, len: number): Uint8Array {
  if (payload.length >= len) return payload;
  const out = new Uint8Array(len);
  out.set(payload);
  return out;
}

export class FormationController {
  private deps: FormationControllerDeps | null = null;
  private cfg: FormationConfig | null = null;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private states = new Map<number, VehicleState>();
  private lastTarget = new Map<string, number>();
  private lastSentAt = new Map<string, number>();
  private lastSkip = new Map<string, string>();
  private lastGap = new Map<string, { desired: number; actual: number }>();
  private lastTickAt: number | null = null;
  private lastError: string | null = null;

  setDeps(deps: FormationControllerDeps): void {
    this.deps = deps;
  }

  /** Apply a new geometry/member set. A null config stops the loop. */
  configure(cfg: FormationConfig | null): void {
    if (!cfg || cfg.members.length < 2) {
      this.cfg = null;
      this.stop();
      return;
    }
    this.cfg = cfg;
    // Drop telemetry for vehicles no longer in the fleet.
    const keep = new Set(cfg.members.map((m) => m.sysid));
    for (const sysid of [...this.states.keys()]) if (!keep.has(sysid)) this.states.delete(sysid);
  }

  start(): void {
    if (!this.cfg || this.timer) return;
    this.running = true;
    this.lastError = null;
    this.timer = setInterval(() => this.tick(), CONTROL_PERIOD_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastTarget.clear();
    this.lastSentAt.clear();
    this.lastSkip.clear();
    this.lastGap.clear();
  }

  /** Feed one parsed MAVLink frame; only frames from configured members are kept. */
  noteFrame(frame: { msgid: number; sysid: number; compid: number; payload: Uint8Array }): void {
    if (!this.cfg) return;
    const member = this.cfg.members.find((m) => m.sysid === frame.sysid);
    if (!member) return;
    const prev = this.states.get(frame.sysid);
    const st: VehicleState = prev ?? {
      lat: 0,
      lon: 0,
      heading: 0,
      groundspeed: 0,
      mavType: 0,
      armed: false,
      at: 0,
    };

    if (frame.msgid === GLOBAL_POSITION_INT) {
      const p = padTo(frame.payload, 28);
      const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
      st.lat = dv.getInt32(4, true) / 1e7;
      st.lon = dv.getInt32(8, true) / 1e7;
      const hdg = dv.getUint16(26, true);
      if (hdg !== 0xffff) st.heading = hdg / 100;
      st.at = Date.now();
    } else if (frame.msgid === VFR_HUD) {
      const p = padTo(frame.payload, 20);
      const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
      st.groundspeed = dv.getFloat32(4, true);
      st.heading = dv.getInt16(16, true);
      st.at = Date.now();
    } else if (frame.msgid === HEARTBEAT) {
      const p = padTo(frame.payload, 9);
      st.mavType = p[4]!;
      st.armed = (p[6]! & 0x80) !== 0 && p[7]! >= 3;
      if (!st.at) st.at = Date.now();
    } else {
      return;
    }
    this.states.set(frame.sysid, st);
  }

  status(): FormationStatus {
    const cfg = this.cfg;
    if (!cfg) {
      return { running: false, shape: null, leaderKey: null, memberCount: 0, members: [], lastTickAt: null, lastError: this.lastError };
    }
    const now = Date.now();
    const members = cfg.members.map((m, i): FormationMemberStatus => {
      const st = this.states.get(m.sysid);
      const online = !!st && now - st.at <= STALE_MS;
      const gap = this.lastGap.get(m.vehicleKey);
      return {
        vehicleKey: m.vehicleKey,
        sysid: m.sysid,
        role: i === 0 ? 'leader' : 'follower',
        online,
        armed: st?.armed ?? false,
        lat: online ? st!.lat : null,
        lon: online ? st!.lon : null,
        heading: online ? st!.heading : null,
        groundspeed: online ? st!.groundspeed : null,
        desiredGapM: gap?.desired ?? null,
        actualGapM: gap?.actual ?? null,
        targetSpeed: this.lastTarget.get(m.vehicleKey) ?? null,
        lastSentAt: this.lastSentAt.get(m.vehicleKey) ?? null,
        skipReason: this.lastSkip.get(m.vehicleKey) ?? null,
      };
    });
    return {
      running: this.running,
      shape: cfg.shape,
      leaderKey: cfg.members[0]!.vehicleKey,
      memberCount: cfg.members.length,
      members,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
    };
  }

  private slotsFor(shape: FormationShape, count: number, heading: number): FormationSlot[] {
    const cfg = this.cfg!;
    switch (shape) {
      case 'triangle':
        return triangleOffsets({ count, heading, rowSpacing: cfg.rowSpacing, columnSpacing: cfg.spacing });
      case 'circle':
        return circleOffsets({ count, heading, spacing: cfg.spacing, centerOffset: cfg.centerOffset });
      case 'line':
        return lineOffsets({ count, heading, spacing: cfg.spacing });
    }
  }

  private tick(): void {
    const cfg = this.cfg;
    const deps = this.deps;
    if (!cfg || !deps || !this.running) return;
    this.lastTickAt = Date.now();
    const now = this.lastTickAt;

    const leaderCfg = cfg.members[0]!;
    const leader = this.states.get(leaderCfg.sysid);
    if (!leader || now - leader.at > STALE_MS) {
      this.lastError = 'leader telemetry is stale';
      return;
    }
    this.lastError = null;

    const heading = leader.heading;
    const slots = this.slotsFor(cfg.shape, cfg.members.length, heading);
    const gaps = alongTrackGaps(slots, heading);
    this.lastGap.set(leaderCfg.vehicleKey, { desired: 0, actual: 0 });
    const unit: Enu = { east: Math.sin((heading * Math.PI) / 180), north: Math.cos((heading * Math.PI) / 180) };
    const baseSpeed = leader.groundspeed > 0.5 ? leader.groundspeed : DEFAULT_PARAMS.baseSpeed;

    for (let i = 1; i < cfg.members.length; i++) {
      const m = cfg.members[i]!;
      const st = this.states.get(m.sysid);
      if (!st || now - st.at > STALE_MS) {
        this.lastSkip.set(m.vehicleKey, 'telemetry stale');
        this.lastGap.delete(m.vehicleKey);
        continue;
      }
      if (!st.armed) {
        this.lastSkip.set(m.vehicleKey, 'not armed');
        this.lastGap.delete(m.vehicleKey);
        continue;
      }

      const rel = toEnu(st.lat, st.lon, leader.lat, leader.lon);
      const actualGap = -(rel.east * unit.east + rel.north * unit.north);
      const err = actualGap - gaps[i]!;
      this.lastGap.set(m.vehicleKey, { desired: gaps[i]!, actual: actualGap });

      const params = DEFAULT_PARAMS;
      let tgt = speedIncrement({ err, baseSpeed, params });
      const lim = typeSpeedLimits(firmwareClassOf(st.mavType), deps.lookupParam);
      if (lim[1] > 0) tgt = clampTargetSpeed(tgt, lim);

      if (!shouldSend(tgt, st.groundspeed, params.changeThreshold)) {
        this.lastSkip.set(m.vehicleKey, 'within threshold');
        continue;
      }

      this.lastSkip.delete(m.vehicleKey);
      this.lastTarget.set(m.vehicleKey, tgt);
      this.lastSentAt.set(m.vehicleKey, now);
      const payload = doChangeSpeedParams(tgt);
      void deps
        .send(m.vehicleKey, payload.command, { param1: payload.param1, param2: payload.param2, param3: payload.param3 })
        .then((ok) => {
          if (!ok) this.lastError = `command rejected for ${m.vehicleKey}`;
        })
        .catch((e: unknown) => {
          this.lastError = e instanceof Error ? e.message : String(e);
        });
    }
  }
}

export const formationController = new FormationController();
