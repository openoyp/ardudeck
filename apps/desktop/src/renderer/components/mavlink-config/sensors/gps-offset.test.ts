import { describe, it, expect } from 'vitest';
import {
  clampOffset,
  roundCm,
  offsetsEqual,
  offsetDistance,
  niceHalfRange,
  topViewToOffsets,
  offsetsToTopView,
  sideViewToOffsets,
  offsetsToSideView,
  offsetParamIds,
  resolveOffsetScheme,
  dirtyParams,
  formatMeters,
  OFFSET_LIMIT_M,
} from './gps-offset';

describe('clampOffset / roundCm', () => {
  it('rounds to centimeters without -0', () => {
    expect(roundCm(0.123456)).toBe(0.12);
    expect(roundCm(-0.006)).toBe(-0.01);
    expect(Object.is(roundCm(-0.001), 0)).toBe(true);
  });

  it('clamps to the +-5 m limit', () => {
    expect(clampOffset(7.3)).toBe(OFFSET_LIMIT_M);
    expect(clampOffset(-99)).toBe(-OFFSET_LIMIT_M);
    expect(clampOffset(0.337)).toBe(0.34);
  });

  it('maps non-finite input to 0', () => {
    expect(clampOffset(NaN)).toBe(0);
    expect(clampOffset(Infinity)).toBe(0);
  });
});

describe('offsetsEqual', () => {
  it('treats float32 noise as equal', () => {
    expect(offsetsEqual(0.18, 0.18000000715255737)).toBe(true);
  });

  it('distinguishes a real centimeter change', () => {
    expect(offsetsEqual(0.18, 0.19)).toBe(false);
  });
});

describe('top view mapping', () => {
  const SCALE = 100; // px per meter

  it('drag up means +X (forward), drag right means +Y', () => {
    expect(topViewToOffsets(0, -50, SCALE)).toEqual({ x: 0.5, y: 0 });
    expect(topViewToOffsets(30, 0, SCALE)).toEqual({ x: 0, y: 0.3 });
  });

  it('round-trips through offsetsToTopView', () => {
    const { dx, dy } = offsetsToTopView(0.25, -0.4, SCALE);
    expect(topViewToOffsets(dx, dy, SCALE)).toEqual({ x: 0.25, y: -0.4 });
  });
});

describe('side view mapping', () => {
  const SCALE = 100;

  it('drag UP on screen yields negative Z (antenna above the FC)', () => {
    expect(sideViewToOffsets(0, -40, SCALE).z).toBe(-0.4);
  });

  it('drag right yields +X, round-trips', () => {
    const { dx, dy } = offsetsToSideView(0.1, -0.12, SCALE);
    expect(sideViewToOffsets(dx, dy, SCALE)).toEqual({ x: 0.1, z: -0.12 });
  });
});

describe('niceHalfRange', () => {
  it('grows in friendly steps with headroom', () => {
    expect(niceHalfRange(0)).toBe(0.5);
    expect(niceHalfRange(0.4)).toBe(0.5);
    expect(niceHalfRange(0.48)).toBe(1);
    expect(niceHalfRange(2)).toBe(2.5);
    expect(niceHalfRange(4.9)).toBe(5);
  });
});

describe('scheme resolution', () => {
  it('prefers the modern GPS1_POS_X naming (ArduPilot 4.6+)', () => {
    const has = (id: string) => id === 'GPS1_POS_X';
    expect(resolveOffsetScheme(has)).toBe('modern');
  });

  it('falls back to the legacy GPS_POS1_X naming', () => {
    const has = (id: string) => id === 'GPS_POS1_X';
    expect(resolveOffsetScheme(has)).toBe('legacy');
  });

  it('returns null when neither generation exists (PX4)', () => {
    expect(resolveOffsetScheme(() => false)).toBe(null);
  });

  it('builds ids per scheme and instance', () => {
    expect(offsetParamIds('modern', 1)).toEqual({ x: 'GPS1_POS_X', y: 'GPS1_POS_Y', z: 'GPS1_POS_Z' });
    expect(offsetParamIds('modern', 2).z).toBe('GPS2_POS_Z');
    expect(offsetParamIds('legacy', 1)).toEqual({ x: 'GPS_POS1_X', y: 'GPS_POS1_Y', z: 'GPS_POS1_Z' });
    expect(offsetParamIds('legacy', 2).z).toBe('GPS_POS2_Z');
  });
});

describe('dirtyParams', () => {
  const ids = offsetParamIds('legacy', 1);

  it('lists only the axes that actually changed', () => {
    const out = dirtyParams(ids, { x: 0, y: 0.1, z: -0.2 }, { x: 0, y: 0.15, z: -0.2 });
    expect(out).toEqual([{ id: 'GPS_POS1_Y', value: 0.15 }]);
  });

  it('ignores float32 noise on unchanged axes', () => {
    const out = dirtyParams(
      ids,
      { x: 0.18000000715255737, y: 0, z: 0 },
      { x: 0.18, y: 0, z: 0 },
    );
    expect(out).toEqual([]);
  });

});

describe('misc', () => {
  it('offsetDistance is euclidean', () => {
    expect(offsetDistance({ x: 3, y: 0, z: 4 })).toBe(5);
  });

  it('formatMeters never prints -0.00', () => {
    expect(formatMeters(-0)).toBe('0.00');
    expect(formatMeters(-0.001)).toBe('0.00');
    expect(formatMeters(0.5)).toBe('0.50');
  });
});
