/**
 * Formation geometry + the shape-keeping speed control law, restored from the
 * reversed LGCFormationFlightController (see rea_out/formation_*.cpp). Pure math,
 * no Electron / MAVLink imports, so it is unit-testable in isolation and is the
 * single source of truth shared by the main-process controller.
 *
 * Faithful to the disassembly:
 *   geometry: FUN_140034820 (triangle) / FUN_1400253a0 (circle) /
 *             FUN_14003c730 (polyline miter) / FUN_14003dde0 (min node spacing)
 *   control:  FUN_14001e4e0 (speed increment, single-sided clamp) /
 *             FUN_14001c340 (velocityProfile, sqrt(2ad) brake curve) /
 *             FUN_14001e330 (per-type speed limits)
 *   dispatch: FUN_14001df90 -> MAV_CMD_DO_CHANGE_SPEED(178)
 */

export const DEG = Math.PI / 180;
export const EARTH_R = 6371000;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Local east/north offset in metres from a reference point. */
export interface Enu {
  east: number;
  north: number;
}

/** Advance a coordinate `distM` metres along `azDeg` (QGeoCoordinate::atDistanceAndAzimuth). */
export function atDistanceAndAzimuth(lat: number, lng: number, distM: number, azDeg: number): LatLng {
  const az = azDeg * DEG;
  const d = distM / EARTH_R;
  const lat1 = lat * DEG;
  const lng1 = lng * DEG;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(az));
  const lng2 =
    lng1 +
    Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / DEG, lng: lng2 / DEG };
}

/** Great-circle distance in metres. */
export function distanceTo(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLat = lat2 - lat1;
  const dLng = (b.lng - a.lng) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing a -> b in degrees (0..360). */
export function azimuthTo(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Equirectangular projection of (lat,lng) into metres east/north of (lat0,lng0). */
export function toEnu(lat: number, lng: number, lat0: number, lng0: number): Enu {
  return {
    east: (lng - lng0) * DEG * EARTH_R * Math.cos(lat0 * DEG),
    north: (lat - lat0) * DEG * EARTH_R,
  };
}

// ---------------------------------------------------------------------------
// Triangle  FUN_140034820
//   Row r holds r+1 slots (r from 0), capacity T(n)=n(n+1)/2. Row 0 is the apex
//   at the origin; each further row falls back r*rowSpacing along the reversed
//   heading and is centred on the axis; slots step columnSpacing along heading+90.
// ---------------------------------------------------------------------------
export interface FormationSlot extends Enu {
  row: number;
  col: number;
}

export function triangleOffsets(opts: {
  count: number;
  heading: number;
  rowSpacing: number;
  columnSpacing: number;
}): FormationSlot[] {
  const { count, heading, rowSpacing, columnSpacing } = opts;
  if (count <= 0) return [];
  const out: FormationSlot[] = [{ east: 0, north: 0, row: 0, col: 0 }];

  let idx = 1;
  let r = 1;
  while (idx < count) {
    const rowBase = atDistanceAndAzimuth(0, 0, -r * rowSpacing, heading);
    const latOffset = (Math.floor(r / 2) + (r % 2 ? 0.5 : 0)) * columnSpacing;
    let cur = atDistanceAndAzimuth(rowBase.lat, rowBase.lng, latOffset, heading - 90);
    for (let c = 0; c <= r; c++) {
      if (idx >= count) break;
      out.push({ east: eastOf(cur), north: northOf(cur), row: r, col: c });
      idx++;
      cur = atDistanceAndAzimuth(cur.lat, cur.lng, columnSpacing, heading + 90);
    }
    r++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Circle  FUN_1400253a0
//   Circumradius R = (spacing/2)/sin(pi/n); centre offset from the origin along
//   heading by centerOffset; slot i sits at heading - (n-i)*(360/n) + startOffset.
// ---------------------------------------------------------------------------
export function circleOffsets(opts: {
  count: number;
  heading: number;
  spacing: number;
  centerOffset?: number;
  startOffset?: number;
}): FormationSlot[] {
  const { count, heading, spacing, centerOffset = 0, startOffset = 0 } = opts;
  if (count <= 0) return [];
  const R = spacing / 2 / Math.sin(Math.PI / count);
  const center = atDistanceAndAzimuth(0, 0, centerOffset, heading);
  const out: FormationSlot[] = [];
  for (let i = 0; i < count; i++) {
    const az = heading - (count - i) * (360 / count) + startOffset;
    const p = atDistanceAndAzimuth(center.lat, center.lng, R, az);
    out.push({ east: eastOf(p), north: northOf(p), row: 0, col: i });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Line abreast ("lateral spread"): slots spread along heading+90, centred on the
// axis. Slot 0 (the leader) stays at the origin.
// ---------------------------------------------------------------------------
export function lineOffsets(opts: { count: number; heading: number; spacing: number }): FormationSlot[] {
  const { count, heading, spacing } = opts;
  if (count <= 0) return [];
  const out: FormationSlot[] = [];
  const mid = (count - 1) / 2;
  for (let i = 0; i < count; i++) {
    const lateral = (i - mid) * spacing;
    const p = atDistanceAndAzimuth(0, 0, lateral, heading + 90);
    out.push({ east: eastOf(p), north: northOf(p), row: 0, col: i });
  }
  return out;
}

/**
 * Desired along-track separation (metres behind the leader) for each slot, given
 * the leader's heading. A slot offset is projected onto the course unit vector;
 * the sign is flipped so "behind the leader" is positive.
 */
export function alongTrackGaps(slots: Enu[], headingDeg: number): number[] {
  const u = { east: Math.sin(headingDeg * DEG), north: Math.cos(headingDeg * DEG) };
  return slots.map((s) => -(s.east * u.east + s.north * u.north));
}

// ---------------------------------------------------------------------------
// Polyline miter offset  FUN_14003c730
// ---------------------------------------------------------------------------
export interface MiterResult {
  normals: Array<{ x: number; y: number }>;
  scales: number[];
  turns: number[];
}

export function miterNormals(points: Array<{ x: number; y: number }>): MiterResult {
  const n = points.length;
  const normals = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  const scales = new Array<number>(n).fill(1);
  const turns = new Array<number>(n).fill(0);
  if (n === 0) return { normals, scales, turns };

  for (let i = 0; i < n; i++) {
    const cur = points[i]!;
    const prev = points[(i - 1 + n) % n]!;
    const next = points[(i + 1) % n]!;
    const vIn = norm(sub(prev, cur));
    const vOut = norm(sub(next, cur));
    const cross = vOut.x * vIn.y - vOut.y * vIn.x;
    const dot = clamp(vIn.x * vOut.x + vIn.y * vOut.y, -1, 1);
    const ang = Math.acos(dot);

    if (Math.PI - ang <= 0.008726646259971648) {
      normals[i] = { x: -vIn.y, y: vIn.x };
      scales[i] = 1;
    } else {
      const scale = 1 / Math.sin(ang / 2);
      const bis = norm({ x: vIn.x + vOut.x, y: vIn.y + vOut.y });
      normals[i] = { x: bis.x * scale, y: bis.y * scale };
      scales[i] = scale;
    }
    turns[i] = cross > 0 ? 1 : cross < 0 ? -1 : 0;
  }
  return { normals, scales, turns };
}

export const MIN_NODE_SPACING = 30.0;

/** Base node list  FUN_14003dde0: enforce the 30 m minimum spacing between nodes. */
export function baseFormationSpacing(
  points: Array<{ x: number; y: number }>,
  spacing: number,
): Array<{ x: number; y: number }> {
  if (points.length === 0) return [];
  const out = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const prev = out[i - 1]!;
    const cur = points[i]!;
    const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (d <= MIN_NODE_SPACING) {
      out.push(cur);
    } else {
      const az = Math.atan2(cur.x - prev.x, cur.y - prev.y);
      const step = Math.max(spacing, MIN_NODE_SPACING);
      out.push({ x: prev.x + Math.sin(az) * step, y: prev.y + Math.cos(az) * step });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shape-keeping control law
// ---------------------------------------------------------------------------

export interface ControlParams {
  /** Baseline ground speed, the clamp centre (default 24 m/s). */
  baseSpeed: number;
  /** Up increment limit (+6 -> 30 m/s). */
  limUp: number;
  /** Down increment limit (-6 -> 18 m/s). */
  limDown: number;
  /** Speed-change threshold: below this a command is skipped. */
  changeThreshold: number;
  /** Speed-loop gain. */
  K: number;
  /** Acceleration ceiling (m/s^2). */
  accel: number;
}

export const DEFAULT_PARAMS: ControlParams = {
  baseSpeed: 24.0,
  limUp: 6.0,
  limDown: 6.0,
  changeThreshold: 1e-4,
  K: 1.0,
  accel: 0.2,
};

export const CONTROL_PERIOD_MS = 200;
export const SPEED_BAND: readonly [number, number] = [18, 30];

/**
 * velocityProfile  FUN_14001c340: trapezoidal / brake speed curve. Near the
 * target it decelerates along v = sqrt(2*a*d) to avoid overshoot; the K-proportional
 * term is the one-step-to-target equivalent speed. Returns a signed increment.
 */
export function velocityProfile(err: number, K: number, a: number, dt: number): number {
  const d = Math.abs(err);
  const vBrake = Math.sqrt(2 * a * d);
  const vReach = (K * d) / dt;
  const v = Math.min(vBrake, vReach);
  return err >= 0 ? v : -v;
}

/**
 * Speed increment control law  FUN_14001e4e0 (core). err = along-track error +
 * position bias; the increment is single-sided clamped (asymmetric), then added
 * to the baseline speed. Returns the new target ground speed (m/s).
 */
export function speedIncrement(opts: {
  err: number;
  params?: ControlParams;
  baseSpeed?: number;
  dt?: number;
}): number {
  const params = opts.params ?? DEFAULT_PARAMS;
  const baseSpeed = opts.baseSpeed ?? params.baseSpeed;
  const dt = opts.dt ?? CONTROL_PERIOD_MS / 1000;
  let inc = velocityProfile(opts.err, params.K, params.accel, dt);
  inc = opts.err > 0 ? Math.min(inc, params.limUp) : Math.max(inc, -params.limDown);
  return inc + baseSpeed;
}

/** Along-track dead-reckoning  FUN_14001fb70: mileage = |v2D| * dt. */
export function alongTrackDistance(v2d: number, dtSeconds: number): number {
  return v2d * dtSeconds;
}

/** Per-type speed limits  FUN_14001e330. type 2 = multirotor, 1/0x14 = fixed wing. */
export function typeSpeedLimits(
  firmwareClass: number,
  lookupParam: (name: string) => number | undefined,
): [number, number] {
  const p = (n: string, d: number) => lookupParam(n) ?? d;
  switch (firmwareClass) {
    case 2:
      return [0.0, p('WPNAV_SPEED', 0) / 100];
    case 1:
    case 0x14:
      return [p('ARSPD_FBW_MIN', 0) + 0.5, p('ARSPD_FBW_MAX', 0) - 0.5];
    default:
      return [0.0, 0.0];
  }
}

/** Target-speed multi-clamp: [18,30] band, then intersect with the type limits. */
export function clampTargetSpeed(tgt: number, lim: readonly [number, number], band = SPEED_BAND): number {
  let v = Math.min(Math.max(tgt, band[0]), band[1]);
  v = Math.min(Math.max(v, lim[0]), lim[1]);
  return v;
}

/** Send gate: skip when the target barely differs from the current speed. */
export function shouldSend(tgt: number, curSpeed: number, threshold = DEFAULT_PARAMS.changeThreshold): boolean {
  return Math.abs(tgt - curSpeed) > threshold;
}

/** MAV_CMD_DO_CHANGE_SPEED payload (param2 = ground speed, throttle = -1 unchanged). */
export function doChangeSpeedParams(speed: number): { command: number; param1: number; param2: number; param3: number } {
  return { command: 178, param1: 1, param2: speed, param3: -1 };
}

/** MAVLink vehicle class -> the firmware class FUN_1401eae20 keys off. */
export function firmwareClassOf(mavType: number): number {
  // 2 = multirotor, 1 = fixed wing, 0x14 = VTOL (treated as fixed wing here).
  if (mavType === 1 || (mavType >= 19 && mavType <= 25)) return 1;
  if (mavType === 2 || mavType === 3 || mavType === 4 || (mavType >= 13 && mavType <= 15) || mavType === 29 || mavType === 35) {
    return 2;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function eastOf(p: LatLng): number {
  return p.lng * DEG * EARTH_R;
}
function northOf(p: LatLng): number {
  return p.lat * DEG * EARTH_R;
}
function sub(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: a.x - b.x, y: a.y - b.y };
}
function norm(v: { x: number; y: number }) {
  const m = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / m, y: v.y / m };
}
function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}
