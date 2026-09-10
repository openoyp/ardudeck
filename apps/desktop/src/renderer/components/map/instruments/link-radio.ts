// RADIO_STATUS math for the Link instrument popover.

/** 255 means "unknown" for RSSI/noise fields per MAVLink. */
export const RADIO_UNKNOWN = 255;

// SiK/RFD900 calibration; other modems scale differently, UI labels it as such.
export function sikDbm(raw: number): number | null {
  if (raw === RADIO_UNKNOWN || raw < 0) return null;
  return raw / 1.9 - 127;
}

export function formatDbm(raw: number): string {
  const dbm = sikDbm(raw);
  return dbm === null ? '--' : `${dbm.toFixed(0)} dBm`;
}

export function fadeMarginDb(rssi: number, noise: number): number | null {
  if (rssi === RADIO_UNKNOWN || noise === RADIO_UNKNOWN) return null;
  return (rssi - noise) / 1.9;
}

export type MarginClass = 'good' | 'marginal' | 'critical';

export function classifyMargin(db: number): MarginClass {
  if (db >= 25) return 'good';
  if (db >= 12) return 'marginal';
  return 'critical';
}

export interface RadioCounters {
  rxErrors: number;
  fixed: number;
}

export interface RadioRates {
  errorsPerSec: number;
  fixedPerSec: number;
}

const UINT16_PERIOD = 65536;

// Counters are cumulative uint16 on the wire; a negative delta is a wrap.
export function counterRates(
  prev: RadioCounters | null,
  prevAtMs: number,
  next: RadioCounters,
  nextAtMs: number,
): RadioRates | null {
  if (!prev) return null;
  const dtMs = nextAtMs - prevAtMs;
  if (dtMs <= 0) return null;
  const unwrap = (d: number): number => (d < 0 ? d + UINT16_PERIOD : d);
  const dtSec = dtMs / 1000;
  return {
    errorsPerSec: unwrap(next.rxErrors - prev.rxErrors) / dtSec,
    fixedPerSec: unwrap(next.fixed - prev.fixed) / dtSec,
  };
}
