import { describe, it, expect } from 'vitest';
import {
  shapedThrottle, throttleOutput, responseCurve, fullTravelSeconds, blipPeak, stickPercent,
} from './throttle-response';

describe('the throttle curve', () => {
  // Checked against AP_MotorsUGV::get_scaled_throttle: positive expo RAISES
  // the low end, which is the opposite of what "expo" suggests to most people.
  it('softens the low end for negative expo and lifts it for positive', () => {
    expect(shapedThrottle(25, 0)).toBeCloseTo(25, 5);
    expect(shapedThrottle(25, -0.5)).toBeLessThan(25);
    expect(shapedThrottle(25, 0.5)).toBeGreaterThan(25);
  });

  it('always reaches full at full stick', () => {
    for (const expo of [-0.8, -0.25, 0, 0.5]) {
      expect(shapedThrottle(100, expo)).toBeCloseTo(100, 4);
    }
  });

  it('is symmetric in reverse', () => {
    expect(shapedThrottle(-40, -0.5)).toBeCloseTo(-shapedThrottle(40, -0.5), 6);
  });

  it('scales everything by the top throttle', () => {
    expect(throttleOutput(100, 0, 50)).toBeCloseTo(50, 5);
    expect(throttleOutput(50, 0, 50)).toBeCloseTo(25, 5);
  });
});

describe('the curve drawn on screen', () => {
  it('runs from full reverse to full forward', () => {
    const pts = responseCurve(0, 100);
    expect(pts[0]).toEqual({ x: -100, y: -100 });
    expect(pts[pts.length - 1]!.x).toBe(100);
  });
});

describe('what a ramp costs', () => {
  it('reports the full-travel time, or nothing when unlimited', () => {
    expect(fullTravelSeconds(100)).toBeCloseTo(1, 6);
    expect(fullTravelSeconds(30)).toBeCloseTo(3.33, 2);
    expect(fullTravelSeconds(0)).toBeNull();
  });

  // The exact complaint: a stab at full throttle that the vehicle ignored.
  it('shows how little of a one second blip survives a slow ramp', () => {
    expect(blipPeak(30, 1, 100)).toBe(30);
    expect(blipPeak(100, 1, 100)).toBe(100);
    expect(blipPeak(0, 1, 100)).toBe(100);
  });

  it('never exceeds the top throttle', () => {
    expect(blipPeak(100, 1, 50)).toBe(50);
  });
});

describe('reading the stick', () => {
  it('maps a calibrated channel to percent', () => {
    expect(stickPercent(1500)).toBe(0);
    expect(stickPercent(2000)).toBe(100);
    expect(stickPercent(1000)).toBe(-100);
  });

  it('honours a trim that is not centred', () => {
    expect(stickPercent(1600, 1100, 1900, 1600)).toBe(0);
  });

  it('ignores a channel that is not being received', () => {
    expect(stickPercent(undefined)).toBeNull();
    expect(stickPercent(0)).toBeNull();
  });
});
