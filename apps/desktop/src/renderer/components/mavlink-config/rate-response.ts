/**
 * What the aircraft does with a stick deflection, in rotation rate.
 *
 * Rate and expo are two numbers that describe one feeling, and the feeling is
 * only legible as a curve: how fast it spins at full stick, and how much of the
 * stick around centre is soft.
 */

/**
 * ArduPilot's input_expo (AP_Math/control.cpp), not the cubic most firmwares
 * use: (1 - expo) * x / (1 - expo * |x|). Positive expo softens around centre,
 * negative sharpens it, and both reach full at full stick. Above 0.95 the
 * firmware returns the stick unchanged.
 */
export function expoStick(stick: number, expo: number): number {
  const x = Math.max(-1, Math.min(1, stick / 100));
  if (expo >= 0.95) return x * 100;
  return (((1 - expo) * x) / (1 - expo * Math.abs(x))) * 100;
}

/** Commanded rotation rate for a stick position, in the scheme's own units. */
export function commandedRate(stick: number, maxRate: number, expo: number): number {
  return (expoStick(stick, expo) / 100) * maxRate;
}

/** Points for the stick-to-rate curve, stick -100..100. */
export function rateCurve(maxRate: number, expo: number, steps = 41): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < steps; i++) {
    const x = -100 + (200 * i) / (steps - 1);
    out.push({ x, y: commandedRate(x, maxRate, expo) });
  }
  return out;
}

/**
 * How long a full rotation takes at full stick. A number in degrees per second
 * means little; "a full turn in 2.0 s" is something a pilot can picture.
 */
export function secondsPerTurn(maxRate: number): number | null {
  if (!maxRate || maxRate <= 0) return null;
  return 360 / maxRate;
}

/** Rate at the stick position where most flying happens. */
export function rateAtHalfStick(maxRate: number, expo: number): number {
  return commandedRate(50, maxRate, expo);
}
