import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PARAMS,
  alongTrackGaps,
  baseFormationSpacing,
  circleOffsets,
  clampTargetSpeed,
  doChangeSpeedParams,
  firmwareClassOf,
  lineOffsets,
  miterNormals,
  shouldSend,
  speedIncrement,
  triangleOffsets,
  typeSpeedLimits,
  velocityProfile,
} from './formation-math';

describe('geometry', () => {
  it('triangle: 1/2/3 row distribution with column spacing', () => {
    const tri = triangleOffsets({ count: 6, heading: 90, rowSpacing: 30, columnSpacing: 30 });
    expect(tri).toHaveLength(6);
    const counts: Record<number, number> = {};
    for (const n of tri) counts[n.row] = (counts[n.row] ?? 0) + 1;
    expect(counts).toEqual({ 0: 1, 1: 2, 2: 3 });

    const row1 = tri.filter((n) => n.row === 1).sort((a, b) => a.north - b.north);
    expect(Math.hypot(row1[0]!.east - row1[1]!.east, row1[0]!.north - row1[1]!.north)).toBeCloseTo(30, 6);
    // heading=90 -> east is the along-track axis; row 1 falls back 30 m.
    expect(tri[0]!.east - row1[0]!.east).toBeCloseTo(30, 6);
  });

  it('circle: circumradius and chord match the spacing', () => {
    const cir = circleOffsets({ count: 6, heading: 0, spacing: 50 });
    const R = 50 / 2 / Math.sin(Math.PI / 6);
    const chord = Math.hypot(cir[0]!.east - cir[1]!.east, cir[0]!.north - cir[1]!.north);
    expect(chord).toBeCloseTo(50, 3);
    expect(Math.hypot(cir[0]!.east, cir[0]!.north)).toBeCloseTo(R, 3);
  });

  it('line abreast spreads along heading+90 and centres on the axis', () => {
    const line = lineOffsets({ count: 3, heading: 0, spacing: 20 });
    expect(line).toHaveLength(3);
    expect(line[0]!.east).toBeCloseTo(-20, 6);
    expect(line[1]!.east).toBeCloseTo(0, 6);
    expect(line[2]!.east).toBeCloseTo(20, 6);
    for (const s of line) expect(s.north).toBeCloseTo(0, 6);
  });

  it('miter: right angle scales by 1/sin(45deg), collinear by 1', () => {
    const m = miterNormals([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    expect(m.scales[1]).toBeCloseTo(Math.SQRT2, 9);
    expect(m.turns[1]).toBe(1);
    const m2 = miterNormals([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
    expect(m2.scales[1]).toBeCloseTo(1, 9);
  });

  it('base node spacing enforces the 30 m minimum', () => {
    const sp = baseFormationSpacing([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 200, y: 0 }], 30);
    expect(sp[0]!.x).toBe(0);
    expect(sp[1]!.x).toBe(10);
    expect(sp[2]!.x).toBeCloseTo(40, 9);
  });

  it('along-track gaps are positive behind the leader', () => {
    const slots = triangleOffsets({ count: 3, heading: 0, rowSpacing: 30, columnSpacing: 30 });
    const gaps = alongTrackGaps(slots, 0);
    expect(gaps[0]).toBeCloseTo(0, 6);
    expect(gaps[1]).toBeCloseTo(30, 6);
    expect(gaps[2]).toBeCloseTo(30, 6);
  });
});

describe('speed control law', () => {
  it('velocityProfile follows the sqrt(2ad) brake curve for small errors', () => {
    expect(velocityProfile(5, 1, 0.2, 0.2)).toBeGreaterThan(0);
    expect(velocityProfile(-5, 1, 0.2, 0.2)).toBeLessThan(0);
    expect(velocityProfile(0, 1, 0.2, 0.2)).toBe(0);
    expect(velocityProfile(0.5, 1, 0.2, 0.2)).toBeCloseTo(Math.sqrt(2 * 0.2 * 0.5), 12);
  });

  it('single-sided clamp: huge errors saturate to 30 / 18', () => {
    expect(speedIncrement({ err: 1000 })).toBeCloseTo(30, 9);
    expect(speedIncrement({ err: -1000 })).toBeCloseTo(18, 9);
  });

  it('type limits: multirotor uses WPNAV_SPEED, fixed wing the FBW band', () => {
    expect(typeSpeedLimits(2, (n) => (n === 'WPNAV_SPEED' ? 1200 : undefined))[1]).toBeCloseTo(12, 9);
    const fw = typeSpeedLimits(1, (n) => (n === 'ARSPD_FBW_MIN' ? 15 : 30));
    expect(fw[0]).toBeCloseTo(15.5, 9);
    expect(fw[1]).toBeCloseTo(29.5, 9);
  });

  it('multi-clamp: band first, then the type limits', () => {
    expect(clampTargetSpeed(30, [0, 12])).toBeCloseTo(12, 9);
    expect(clampTargetSpeed(18, [0, 12])).toBeCloseTo(12, 9);
  });

  it('send gate and DO_CHANGE_SPEED payload', () => {
    expect(shouldSend(24.00005, 24, DEFAULT_PARAMS.changeThreshold)).toBe(false);
    expect(shouldSend(24.5, 24, DEFAULT_PARAMS.changeThreshold)).toBe(true);
    expect(doChangeSpeedParams(25.5)).toEqual({ command: 178, param1: 1, param2: 25.5, param3: -1 });
  });

  it('firmware class mapping', () => {
    expect(firmwareClassOf(2)).toBe(2);
    expect(firmwareClassOf(1)).toBe(1);
    expect(firmwareClassOf(20)).toBe(1);
  });
});
