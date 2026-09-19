/**
 * What the motors do with a given stick position, in numbers a picture can be
 * drawn from.
 *
 * The three parameters that shape throttle feel are not understandable as
 * numbers: expo is a curve constant, slew is a rate in percent per second, and
 * the top limit rescales everything. Drawn as one curve with the live stick on
 * it, they stop needing explanation.
 */

/** ArduPilot's thrust curve, from AP_MotorsUGV::get_scaled_throttle. Positive
 * expo lifts the low end, negative softens it; zero is a straight line. */
export function shapedThrottle(stickPct: number, expo: number): number {
  const sign = stickPct < 0 ? -1 : 1;
  const pct = Math.min(1, Math.abs(stickPct) / 100);
  if (expo === 0 || expo > 1 || expo < -1) return sign * pct * 100;
  const shaped = ((expo - 1) + Math.sqrt((1 - expo) ** 2 + 4 * expo * pct)) / (2 * expo);
  return sign * shaped * 100;
}

/** Output for a stick position, after the curve and the top-throttle clamp. */
export function throttleOutput(stickPct: number, expo: number, thrMaxPct: number): number {
  return shapedThrottle(stickPct, expo) * (Math.max(0, Math.min(100, thrMaxPct)) / 100);
}

/** Points for the response curve, stick -100..100. */
export function responseCurve(expo: number, thrMaxPct: number, steps = 41): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < steps; i++) {
    const x = -100 + (200 * i) / (steps - 1);
    out.push({ x, y: throttleOutput(x, expo, thrMaxPct) });
  }
  return out;
}

/** Seconds for the output to cross the full range at this slew rate; null when
 * the rate is unlimited. */
export function fullTravelSeconds(slewPctPerSecond: number): number | null {
  if (!slewPctPerSecond || slewPctPerSecond <= 0) return null;
  return 100 / slewPctPerSecond;
}

/**
 * How far the output actually gets during a blip: the case that reads as "the
 * stick did nothing". A one second stab at full throttle with a 30 %/s limit
 * reaches 30 percent and then ramps back down.
 */
export function blipPeak(slewPctPerSecond: number, holdSeconds: number, thrMaxPct: number): number {
  const ceiling = Math.max(0, Math.min(100, thrMaxPct));
  if (!slewPctPerSecond || slewPctPerSecond <= 0) return ceiling;
  return Math.min(ceiling, slewPctPerSecond * holdSeconds);
}

/** Stick percentage from a raw RC pulse and that channel's calibration. */
export function stickPercent(
  pwm: number | undefined,
  min = 1000,
  max = 2000,
  trim = 1500,
): number | null {
  if (pwm === undefined || pwm < 800 || pwm > 2200) return null;
  if (pwm >= trim) {
    const span = Math.max(1, max - trim);
    return Math.min(100, ((pwm - trim) / span) * 100);
  }
  const span = Math.max(1, trim - min);
  return Math.max(-100, ((pwm - trim) / span) * 100);
}
