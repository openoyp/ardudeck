import { describe, it, expect } from 'vitest';
import {
  AXIS_ALL,
  AXIS_PITCH,
  AXIS_ROLL,
  AXIS_YAW,
  aggrMatches,
  autotuneModeNumber,
  axisNames,
  normalizeAxes,
  toggleAxis,
} from './autotune';

describe('normalizeAxes', () => {
  it('defaults unknown to all three axes', () => {
    expect(normalizeAxes(undefined)).toBe(AXIS_ALL);
  });

  it('rounds the float32 value the vehicle returns', () => {
    expect(normalizeAxes(6.9999999)).toBe(7);
    expect(normalizeAxes(3.0000001)).toBe(3);
  });

  it('clamps out-of-range values back to all', () => {
    expect(normalizeAxes(0)).toBe(AXIS_ALL);
    expect(normalizeAxes(9)).toBe(AXIS_ALL);
    expect(normalizeAxes(-2)).toBe(AXIS_ALL);
  });
});

describe('toggleAxis', () => {
  it('round-trips a bit', () => {
    const off = toggleAxis(AXIS_ALL, AXIS_YAW);
    expect(off).toBe(AXIS_ROLL | AXIS_PITCH);
    expect(toggleAxis(off, AXIS_YAW)).toBe(AXIS_ALL);
  });

  it('refuses to clear the last axis', () => {
    expect(toggleAxis(AXIS_PITCH, AXIS_PITCH)).toBe(AXIS_PITCH);
  });
});

describe('axisNames', () => {
  it('names selected axes in order', () => {
    expect(axisNames(AXIS_ALL)).toBe('roll, pitch, yaw');
    expect(axisNames(AXIS_ROLL | AXIS_YAW)).toBe('roll, yaw');
    expect(axisNames(0)).toBe('nothing');
  });
});

describe('aggrMatches', () => {
  it('matches the float32 noise the vehicle returns', () => {
    expect(aggrMatches(0.07499999832, 0.075)).toBe(true);
    expect(aggrMatches(0.10000000149, 0.1)).toBe(true);
    expect(aggrMatches(0.05000000075, 0.05)).toBe(true);
  });

  it('distinguishes the presets from each other and from custom values', () => {
    expect(aggrMatches(0.075, 0.05)).toBe(false);
    expect(aggrMatches(0.08, 0.075)).toBe(false);
    expect(aggrMatches(undefined, 0.075)).toBe(false);
  });
});

describe('autotuneModeNumber', () => {
  it('maps vehicle classes to ArduPilot mode numbers', () => {
    expect(autotuneModeNumber('copter')).toBe(15);
    expect(autotuneModeNumber('plane')).toBe(8);
    expect(autotuneModeNumber('rover')).toBeNull();
  });
});
