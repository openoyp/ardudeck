/**
 * Snapshot interpolation for the synthetic-vision camera.
 *
 * Telemetry lands in discrete ticks, so the camera has to invent the frames in
 * between. Easing toward the newest sample makes the aircraft sprint then coast
 * once per tick; instead we render slightly in the PAST and walk linearly
 * between the two samples that bracket that moment, which is constant velocity
 * inside every segment (the netcode trick).
 *
 * Position and attitude get their own buffers: they arrive at different rates,
 * and mixing them would stall position for three ticks then jump it on the
 * fourth, which is the very stutter this removes.
 */

export interface Sample<T> {
  /** performance.now() when the value arrived. */
  t: number;
  v: T;
}

/** Newest samples first is not worth the churn; append and trim the head. */
export function pushSample<T>(buf: Array<Sample<T>>, t: number, v: T, max = 8): void {
  buf.push({ t, v });
  if (buf.length > max) buf.splice(0, buf.length - max);
}

/**
 * How far behind live to render: a little over one sample interval, so there is
 * almost always a newer sample to walk toward. Falls back to `min` until the
 * buffer has enough history to measure.
 */
export function estimateDelayMs(buf: Array<Sample<unknown>>, min = 60, max = 400): number {
  if (buf.length < 3) return min;
  const gaps: number[] = [];
  for (let i = 1; i < buf.length; i++) gaps.push(buf[i]!.t - buf[i - 1]!.t);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;
  return Math.min(max, Math.max(min, median * 1.3));
}

/**
 * Value at `at` (a performance.now() instant), interpolated between the two
 * bracketing samples. Before the buffer starts it holds the oldest, after the
 * newest it holds the newest: extrapolating there would overshoot on every
 * dropped packet, which reads as a twitch.
 */
export function interpolateAt<T>(
  buf: Array<Sample<T>>,
  at: number,
  lerp: (a: T, b: T, u: number) => T,
): T | null {
  if (buf.length === 0) return null;
  const first = buf[0]!;
  const last = buf[buf.length - 1]!;
  if (at <= first.t) return first.v;
  if (at >= last.t) return last.v;
  for (let i = buf.length - 1; i > 0; i--) {
    const b = buf[i]!;
    const a = buf[i - 1]!;
    if (at >= a.t && at <= b.t) {
      const span = b.t - a.t;
      return span > 0 ? lerp(a.v, b.v, (at - a.t) / span) : b.v;
    }
  }
  return last.v;
}

/** Shortest signed difference between two headings, degrees. */
export function angleDelta(to: number, from: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Interpolate an angle the short way round, in degrees. */
export function lerpAngle(a: number, b: number, u: number): number {
  return a + angleDelta(b, a) * u;
}

/**
 * Dead-reckon an angle forward from its last sample using the body rate.
 *
 * Attitude cannot be smoothed by rendering in the past the way position is:
 * angular lag is what a pilot notices first. Predicting forward from the rate
 * costs no lag at all, and the cap keeps a dead stream from spinning the world.
 */
export function predictAngle(value: number, rateDegPerS: number, dtS: number, maxDtS = 0.25): number {
  return value + rateDegPerS * Math.min(Math.max(dtS, 0), maxDtS);
}

export interface PredictedPosition {
  lat: number;
  lon: number;
  altMsl: number;
  agl: number;
}

/**
 * Dead-reckon a position forward from its last fix using the NED velocity the
 * vehicle reports.
 *
 * Position fixes arrive at a few hertz at best, far slower than the display, so
 * interpolating between them means rendering that far in the past and holding
 * still whenever the delay is shorter than the gap (which is what made the
 * world advance in visible steps). Velocity carries it continuously instead.
 */
export function predictPosition(
  p: PredictedPosition & { vN: number; vE: number; vD: number },
  dtS: number,
  mPerDegLat: number,
  mPerDegLon: number,
  maxDtS = 1.5,
): PredictedPosition {
  const dt = Math.min(Math.max(dtS, 0), maxDtS);
  const climb = -p.vD * dt;
  return {
    lat: p.lat + (p.vN * dt) / mPerDegLat,
    lon: p.lon + (p.vE * dt) / Math.max(1, mPerDegLon),
    altMsl: p.altMsl + climb,
    agl: p.agl + climb,
  };
}

export interface BodyRates { p: number; q: number; r: number }
export interface EulerRates { rollRate: number; pitchRate: number; yawRate: number }

/**
 * Body angular rates (what ATTITUDE carries) to Euler angle rates (what the
 * camera's roll/pitch/heading actually change at).
 *
 * The two are only equal near level flight. In a bank the yaw rate the airframe
 * feels is not the rate the heading changes at (ψ̇ = (q sinφ + r cosφ)/cosθ), so
 * predicting heading with the raw body rate falls behind exactly when the
 * aircraft is turning. Pitch near vertical is clamped: the transform has a
 * singularity there and no display is worth a divide by zero.
 */
export function eulerRatesFromBody(rollDeg: number, pitchDeg: number, rates: BodyRates): EulerRates {
  const DEG = Math.PI / 180;
  const phi = rollDeg * DEG;
  const theta = Math.max(-80, Math.min(80, pitchDeg)) * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanTheta = Math.tan(theta);
  const cosTheta = Math.cos(theta);
  return {
    rollRate: rates.p + (sinPhi * rates.q + cosPhi * rates.r) * tanTheta,
    pitchRate: cosPhi * rates.q - sinPhi * rates.r,
    yawRate: (sinPhi * rates.q + cosPhi * rates.r) / cosTheta,
  };
}
