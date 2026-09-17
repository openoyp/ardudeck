import { describe, it, expect } from 'vitest';
import {
  angleDelta,
  eulerRatesFromBody,
  predictAngle,
  predictPosition,
  estimateDelayMs,
  interpolateAt,
  lerpAngle,
  pushSample,
  type Sample,
} from './svt-pose-buffer';

const num = (a: number, b: number, u: number) => a + (b - a) * u;

function buffer(times: number[]): Array<Sample<number>> {
  const buf: Array<Sample<number>> = [];
  times.forEach((t, i) => pushSample(buf, t, i));
  return buf;
}

describe('pushSample', () => {
  it('keeps only the newest samples', () => {
    const buf: Array<Sample<number>> = [];
    for (let i = 0; i < 20; i++) pushSample(buf, i * 100, i, 5);
    expect(buf).toHaveLength(5);
    expect(buf[buf.length - 1]!.v).toBe(19);
  });
});

describe('estimateDelayMs', () => {
  it('sits just over one sample interval', () => {
    const delay = estimateDelayMs(buffer([0, 200, 400, 600, 800]));
    expect(delay).toBeGreaterThan(200);
    expect(delay).toBeLessThan(300);
  });

  it('clamps a starved or flooded stream', () => {
    expect(estimateDelayMs(buffer([0, 5, 10, 15]), 60, 400)).toBe(60);
    expect(estimateDelayMs(buffer([0, 5_000, 10_000, 15_000]), 60, 400)).toBe(400);
  });
});

describe('interpolateAt', () => {
  const buf = buffer([0, 100, 200]); // values 0, 1, 2

  it('walks between the bracketing samples', () => {
    expect(interpolateAt(buf, 50, num)).toBeCloseTo(0.5, 6);
    expect(interpolateAt(buf, 150, num)).toBeCloseTo(1.5, 6);
  });

  // Constant speed inside a segment is the whole point: easing toward the
  // newest sample is what made the aircraft surge once per telemetry tick.
  it('advances at a constant rate across a segment', () => {
    const a = interpolateAt(buf, 110, num)!;
    const b = interpolateAt(buf, 120, num)!;
    const c = interpolateAt(buf, 130, num)!;
    expect(b - a).toBeCloseTo(c - b, 9);
  });

  it('holds instead of extrapolating past the ends', () => {
    expect(interpolateAt(buf, -500, num)).toBe(0);
    expect(interpolateAt(buf, 5_000, num)).toBe(2);
  });

  it('returns null with no history', () => {
    expect(interpolateAt([], 10, num)).toBeNull();
  });
});

describe('angles', () => {
  it('takes the short way over the 0/360 seam', () => {
    expect(angleDelta(10, 350)).toBe(20);
    expect(angleDelta(350, 10)).toBe(-20);
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(360, 6);
  });
});

describe('predictAngle', () => {
  it('carries the angle forward at the body rate', () => {
    expect(predictAngle(10, 30, 0.1)).toBeCloseTo(13, 6);
    expect(predictAngle(10, -30, 0.1)).toBeCloseTo(7, 6);
  });

  // A stalled stream must not keep rotating the world forever.
  it('caps how far it will predict', () => {
    expect(predictAngle(0, 60, 10, 0.25)).toBeCloseTo(15, 6);
    expect(predictAngle(0, 60, -1)).toBe(0);
  });
});

describe('predictPosition', () => {
  const at = { lat: 45, lon: 20, altMsl: 100, agl: 50, vN: 10, vE: 0, vD: -2 };

  it('carries the fix forward along the velocity', () => {
    const next = predictPosition(at, 1, 111_320, 78_700);
    expect(next.lat).toBeCloseTo(45 + 10 / 111_320, 9);
    expect(next.lon).toBeCloseTo(20, 9);
    // vD is down-positive, so a negative vD climbs.
    expect(next.altMsl).toBeCloseTo(102, 6);
    expect(next.agl).toBeCloseTo(52, 6);
  });

  it('moves at a constant rate', () => {
    const a = predictPosition(at, 0.2, 111_320, 78_700).lat;
    const b = predictPosition(at, 0.4, 111_320, 78_700).lat;
    const c = predictPosition(at, 0.6, 111_320, 78_700).lat;
    expect(b - a).toBeCloseTo(c - b, 12);
  });

  // A dead link must not fly the camera away.
  it('stops predicting past the cap', () => {
    const far = predictPosition(at, 30, 111_320, 78_700, 1.5);
    expect(far.altMsl).toBeCloseTo(103, 6);
  });
});

describe('eulerRatesFromBody', () => {
  it('passes body rates straight through when level', () => {
    const e = eulerRatesFromBody(0, 0, { p: 10, q: 5, r: 3 });
    expect(e.rollRate).toBeCloseTo(10, 9);
    expect(e.pitchRate).toBeCloseTo(5, 9);
    expect(e.yawRate).toBeCloseTo(3, 9);
  });

  // The whole point: in a bank the heading turns faster than the body yaw rate,
  // so predicting with the raw rate falls behind through the turn.
  it('turns the heading faster than the body yaw rate when banked', () => {
    const e = eulerRatesFromBody(45, 0, { p: 0, q: 0, r: 5 });
    expect(e.yawRate).toBeCloseTo(5 * Math.cos(Math.PI / 4), 6);
    const banked = eulerRatesFromBody(45, 0, { p: 0, q: 5, r: 5 });
    expect(banked.yawRate).toBeGreaterThan(5);
  });

  it('stays finite pointing straight up', () => {
    const e = eulerRatesFromBody(0, 90, { p: 1, q: 1, r: 1 });
    expect(Number.isFinite(e.yawRate)).toBe(true);
    expect(Number.isFinite(e.rollRate)).toBe(true);
  });
});
