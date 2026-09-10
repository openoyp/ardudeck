import { describe, it, expect } from 'vitest';
import {
  RADIO_UNKNOWN,
  sikDbm,
  formatDbm,
  fadeMarginDb,
  classifyMargin,
  counterRates,
} from './link-radio';

describe('sikDbm', () => {
  it('converts the SiK scale endpoints', () => {
    expect(sikDbm(0)).toBeCloseTo(-127, 5);
    expect(sikDbm(254)).toBeCloseTo(254 / 1.9 - 127, 5);
  });

  it('returns null for the unknown sentinel and negatives', () => {
    expect(sikDbm(RADIO_UNKNOWN)).toBeNull();
    expect(sikDbm(-1)).toBeNull();
  });
});

describe('formatDbm', () => {
  it('formats known values and dashes unknown', () => {
    expect(formatDbm(190)).toBe('-27 dBm');
    expect(formatDbm(RADIO_UNKNOWN)).toBe('--');
  });
});

describe('fadeMarginDb', () => {
  it('is the rssi-noise gap on the SiK dB scale', () => {
    expect(fadeMarginDb(190, 76)).toBeCloseTo((190 - 76) / 1.9, 5);
  });

  it('is null when either side is unknown', () => {
    expect(fadeMarginDb(RADIO_UNKNOWN, 76)).toBeNull();
    expect(fadeMarginDb(190, RADIO_UNKNOWN)).toBeNull();
  });
});

describe('classifyMargin', () => {
  it('splits at the 25 and 12 dB boundaries', () => {
    expect(classifyMargin(30)).toBe('good');
    expect(classifyMargin(25)).toBe('good');
    expect(classifyMargin(24.9)).toBe('marginal');
    expect(classifyMargin(12)).toBe('marginal');
    expect(classifyMargin(11.9)).toBe('critical');
    expect(classifyMargin(0)).toBe('critical');
  });
});

describe('counterRates', () => {
  it('needs two samples', () => {
    expect(counterRates(null, 0, { rxErrors: 5, fixed: 1 }, 1000)).toBeNull();
  });

  it('refuses a non-advancing clock', () => {
    const prev = { rxErrors: 0, fixed: 0 };
    expect(counterRates(prev, 1000, { rxErrors: 5, fixed: 1 }, 1000)).toBeNull();
    expect(counterRates(prev, 2000, { rxErrors: 5, fixed: 1 }, 1000)).toBeNull();
  });

  it('computes per-second rates', () => {
    const rates = counterRates({ rxErrors: 10, fixed: 4 }, 0, { rxErrors: 30, fixed: 9 }, 2000);
    expect(rates).toEqual({ errorsPerSec: 10, fixedPerSec: 2.5 });
  });

  it('unwraps a uint16 counter wrap', () => {
    const rates = counterRates({ rxErrors: 65530, fixed: 65535 }, 0, { rxErrors: 4, fixed: 9 }, 1000);
    expect(rates).toEqual({ errorsPerSec: 10, fixedPerSec: 10 });
  });
});
