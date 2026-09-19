/**
 * Which arming check a PreArm message belongs to.
 *
 * ArduPilot reports refusals as free text ("PreArm: Logging failed"), and the
 * pilot then has to work out which switch that maps to. Matching the text back
 * to the ARMING_CHECK bit lets the UI point at the row that is blocking the
 * arm, and offer the switch that silences it when the hardware is genuinely
 * absent.
 */

export interface PrearmFailure {
  text: string;
  /** Arming check bit INDEX (same on ARMING_CHECK and ARMING_SKIPCHK), or null
   * when nothing matched. */
  bit: number | null;
}

/** Substrings are matched lowercase, first hit wins, so order from specific to
 * general. Taken from the messages ArduPilot actually emits. */
const MATCHERS: Array<{ bit: number; needles: string[] }> = [
  { bit: 10, needles: ['logging failed', 'logging not started', 'no sd card', 'logging'] },
  { bit: 2, needles: ['compass not calibrated', 'compass calibrated', 'compass offsets', 'compass not healthy', 'inconsistent compass', 'compass'] },
  { bit: 4, needles: ['accel calibration', 'accels not healthy', 'gyros not healthy', 'accels inconsistent', 'gyros inconsistent', 'ins not calibrated'] },
  { bit: 3, needles: ['need position estimate', 'gps horizontal', 'waiting for gps', 'high gps hdop', 'gps glitch', 'need 3d fix'] },
  { bit: 12, needles: ['gps configuration', 'gps 1 failing', 'gps: '] },
  { bit: 1, needles: ['barometer', 'baro not healthy', 'altitude disparity'] },
  { bit: 8, needles: ['battery', 'low battery'] },
  { bit: 7, needles: ['board voltage', 'vcc'] },
  { bit: 6, needles: ['rc not calibrated', 'rc channel', 'radio failsafe', 'throttle below failsafe'] },
  { bit: 5, needles: ['check parameter', 'parameter'] },
  { bit: 11, needles: ['safety switch'] },
  { bit: 14, needles: ['mission'] },
  { bit: 15, needles: ['rangefinder'] },
  { bit: 9, needles: ['airspeed'] },
  { bit: 13, needles: ['system', 'ahrs', 'ekf'] },
];

/** The ARMING_CHECK bit a refusal belongs to, or null when we cannot tell. */
export function bitForPrearmText(text: string): number | null {
  const body = text.toLowerCase().replace(/^prearm:\s*/, '').trim();
  for (const { bit, needles } of MATCHERS) {
    if (needles.some((n) => body.includes(n))) return bit;
  }
  return null;
}

/** True for the messages that report why arming was refused. */
export function isPrearmMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.startsWith('prearm:') || lower.startsWith('arm:');
}

/**
 * The current refusals, newest first and deduplicated by text. Messages older
 * than `maxAgeMs` are dropped: a refusal that was fixed minutes ago should not
 * keep a row lit up red.
 */
export function currentPrearmFailures(
  messages: Array<{ text: string; timestamp?: number }>,
  now = Date.now(),
  maxAgeMs = 60_000,
): PrearmFailure[] {
  const seen = new Set<string>();
  const out: PrearmFailure[] = [];
  for (const m of messages) {
    if (!isPrearmMessage(m.text)) continue;
    if (m.timestamp !== undefined && now - m.timestamp > maxAgeMs) continue;
    const text = m.text.replace(/^PreArm:\s*/i, '').trim();
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push({ text, bit: bitForPrearmText(m.text) });
  }
  return out;
}
