import { describe, it, expect } from 'vitest';
import { expoStick, commandedRate, rateCurve, secondsPerTurn, rateAtHalfStick } from './rate-response';

describe('stick expo', () => {
  it('is a straight line at zero expo', () => {
    expect(expoStick(50, 0)).toBeCloseTo(50, 6);
    expect(expoStick(-25, 0)).toBeCloseTo(-25, 6);
  });

  // The whole reason expo exists: gentler around centre, unchanged at the ends.
  it('softens the middle without changing full stick', () => {
    expect(expoStick(50, 0.5)).toBeLessThan(50);
    expect(expoStick(100, 0.5)).toBeCloseTo(100, 6);
    expect(expoStick(0, 0.5)).toBeCloseTo(0, 6);
  });

  // Matches ArduPilot's input_expo exactly: (1-e)x / (1 - e|x|).
  it('matches the firmware formula at the halfway stick', () => {
    expect(expoStick(50, 0.5)).toBeCloseTo(33.333, 3);
    expect(expoStick(50, -0.5)).toBeCloseTo(60, 3);
  });

  it('sharpens the centre for negative expo', () => {
    expect(expoStick(25, -0.5)).toBeGreaterThan(25);
  });

  it('passes the stick through above the firmware cap', () => {
    expect(expoStick(50, 0.95)).toBeCloseTo(50, 6);
  });

  it('stays symmetric', () => {
    expect(expoStick(-60, 0.4)).toBeCloseTo(-expoStick(60, 0.4), 6);
  });

  it('clamps a stick beyond its travel', () => {
    expect(expoStick(150, 0)).toBeCloseTo(100, 6);
  });
});

describe('commanded rate', () => {
  it('reaches the configured maximum at full stick', () => {
    expect(commandedRate(100, 200, 0.3)).toBeCloseTo(200, 6);
  });

  it('gives less than half the rate at half stick with expo', () => {
    expect(rateAtHalfStick(200, 0.5)).toBeLessThan(100);
    expect(rateAtHalfStick(200, 0)).toBeCloseTo(100, 6);
  });
});

describe('the pilot-facing numbers', () => {
  it('turns a rate into the time for a full turn', () => {
    expect(secondsPerTurn(180)).toBeCloseTo(2, 6);
    expect(secondsPerTurn(0)).toBeNull();
  });

  it('draws a curve across the whole stick travel', () => {
    const pts = rateCurve(200, 0.2);
    expect(pts[0]!.x).toBe(-100);
    expect(pts[pts.length - 1]!.y).toBeCloseTo(200, 6);
  });
});
