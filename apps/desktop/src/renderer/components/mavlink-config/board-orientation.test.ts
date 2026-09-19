import { describe, it, expect } from 'vitest';
import {
  COMMON_ORIENTATIONS,
  ALL_ORIENTATIONS,
  orientationName,
  orientationCheck,
  orientationRotation,
  isInverted,
} from './board-orientation';

describe('board orientation choices', () => {
  // The whole point of the card: an upside-down board is value 8, and nobody
  // should have to know that "Roll180" is what that means.
  it('names the upside-down mounting in plain words', () => {
    expect(orientationName(8)).toBe('Upside down, arrow forward');
    expect(orientationName(0)).toBe('Upright, arrow forward');
  });

  it('falls back to the ArduPilot name for the rare ones', () => {
    expect(orientationName(38)).toBe('Yaw293Pitch68Roll180');
    expect(orientationName(999)).toBe('Value 999');
  });

  it('offers only values ArduPilot accepts', () => {
    for (const o of COMMON_ORIENTATIONS) {
      expect(ALL_ORIENTATIONS[o.value], `${o.label} (${o.value})`).toBe(o.code);
    }
  });

  it('has no duplicate values in the shortlist', () => {
    const values = COMMON_ORIENTATIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('the bench check', () => {
  it('calls a level vehicle level and says what to try next', () => {
    const { level, note } = orientationCheck(0.4, -1.2);
    expect(level).toBe(true);
    expect(note).toContain('nose up');
  });

  it('reports the angles when it is not level', () => {
    const { level, note } = orientationCheck(178, 2);
    expect(level).toBe(false);
    expect(note).toContain('178');
  });
});

describe('drawing an orientation', () => {
  // The glyph is transformed by these numbers, so a wrong parse shows the
  // board sitting a way it never sits.
  it('reads the rotations out of the ArduPilot name', () => {
    expect(orientationRotation(0)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
    expect(orientationRotation(8)).toEqual({ yaw: 0, pitch: 0, roll: 180 });
    expect(orientationRotation(14)).toEqual({ yaw: 270, pitch: 0, roll: 180 });
    expect(orientationRotation(29)).toEqual({ yaw: 0, pitch: 90, roll: 180 });
  });

  it('knows which mountings end up top-down', () => {
    expect(isInverted(0)).toBe(false);
    expect(isInverted(8)).toBe(true);
    expect(isInverted(12)).toBe(true);
    expect(isInverted(2)).toBe(false);
  });

  it('survives a value with no name', () => {
    expect(orientationRotation(999)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
  });
});
