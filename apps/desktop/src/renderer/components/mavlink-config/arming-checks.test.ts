import { describe, it, expect } from 'vitest';
import {
  detectArmingModel,
  isCheckEnabled,
  toggleCheck,
  withCheckDisabled,
  allChecksValue,
  noChecksValue,
  isAllChecks,
  ARMING_CHECK_BITS,
} from './arming-checks';

const RUN = { param: 'ARMING_CHECK', sense: 'run' } as const;
const SKIP = { param: 'ARMING_SKIPCHK', sense: 'skip' } as const;
const LOGGING = 10;

describe('which parameter the board speaks', () => {
  it('prefers the 4.7 parameter when both exist', () => {
    expect(detectArmingModel((p) => ['ARMING_CHECK', 'ARMING_SKIPCHK'].includes(p)))
      .toEqual(SKIP);
  });

  it('falls back to the old one', () => {
    expect(detectArmingModel((p) => p === 'ARMING_CHECK')).toEqual(RUN);
  });

  it('reports nothing when neither is present', () => {
    expect(detectArmingModel(() => false)).toBeNull();
  });
});

describe('reading a check', () => {
  // The inversion is the whole hazard: 0 means "all checks run" on 4.7 and
  // "no checks run" before it.
  it('reads the shorthand for all checks on both', () => {
    for (const bit of [1, 10, 19]) {
      expect(isCheckEnabled(SKIP, 0, bit)).toBe(true);
      expect(isCheckEnabled(RUN, 1, bit)).toBe(true);
    }
  });

  it('reads the shorthand for no checks on both', () => {
    for (const bit of [1, 10, 19]) {
      expect(isCheckEnabled(SKIP, -1, bit)).toBe(false);
      expect(isCheckEnabled(RUN, 0, bit)).toBe(false);
    }
  });

  it('reads one skipped check as off, others on', () => {
    const value = 1 << LOGGING;
    expect(isCheckEnabled(SKIP, value, LOGGING)).toBe(false);
    expect(isCheckEnabled(SKIP, value, 2)).toBe(true);
  });

  it('reads the old mask the other way round', () => {
    const value = (1 << 2) | (1 << 3);
    expect(isCheckEnabled(RUN, value, 2)).toBe(true);
    expect(isCheckEnabled(RUN, value, LOGGING)).toBe(false);
  });
});

describe('flipping one check', () => {
  // Toggling from the shorthand must not take every other check with it.
  it('expands "all" before turning one off, on 4.7', () => {
    const next = toggleCheck(SKIP, 0, LOGGING);
    expect(isCheckEnabled(SKIP, next, LOGGING)).toBe(false);
    expect(isCheckEnabled(SKIP, next, 2)).toBe(true);
    expect(isCheckEnabled(SKIP, next, 19)).toBe(true);
  });

  it('expands "all" before turning one off, on the old parameter', () => {
    const next = toggleCheck(RUN, 1, LOGGING);
    expect(isCheckEnabled(RUN, next, LOGGING)).toBe(false);
    expect(isCheckEnabled(RUN, next, 2)).toBe(true);
  });

  it('turns a check back on', () => {
    const off = toggleCheck(SKIP, 0, LOGGING);
    expect(isCheckEnabled(SKIP, toggleCheck(SKIP, off, LOGGING), LOGGING)).toBe(true);
  });

  it('leaves a check alone when it is already off', () => {
    const off = toggleCheck(SKIP, 0, LOGGING);
    expect(withCheckDisabled(SKIP, off, LOGGING)).toBe(off);
  });
});

describe('the shorthand values', () => {
  it('knows what all and none look like per firmware', () => {
    expect(allChecksValue(SKIP)).toBe(0);
    expect(noChecksValue(SKIP)).toBe(-1);
    expect(allChecksValue(RUN)).toBe(1);
    expect(noChecksValue(RUN)).toBe(0);
    expect(isAllChecks(SKIP, 0)).toBe(true);
    expect(isAllChecks(RUN, 0)).toBe(false);
  });

  it('lists the documented bits once each', () => {
    const bits = ARMING_CHECK_BITS.map((b) => b.bit);
    expect(new Set(bits).size).toBe(bits.length);
    expect(bits).toContain(LOGGING);
    expect(bits).not.toContain(0);
  });
});
