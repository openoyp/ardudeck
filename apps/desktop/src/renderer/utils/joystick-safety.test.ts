import { describe, it, expect } from 'vitest';
import { preflightForControl, channelValue, channelPwm } from './joystick-safety';
import { defaultChannelMap, type ChannelMap, type RawDevice } from './pseudo-tx';

function mapping(): ChannelMap[] {
  return [0, 1, 2, 3].map((i) => ({
    ...defaultChannelMap(),
    source: { kind: 'axis', index: i } as ChannelMap['source'],
  }));
}

function device(axes: number[]): RawDevice {
  return { axes, buttons: [] };
}

/** Roll, pitch, yaw centred; throttle at idle (-1). */
const SAFE = device([0, 0, -1, 0]);

describe('preflightForControl', () => {
  it('passes with the sticks centred and the throttle closed', () => {
    expect(preflightForControl(mapping(), SAFE)).toEqual({ ok: true, problems: [] });
  });

  it('refuses an open throttle', () => {
    const check = preflightForControl(mapping(), device([0, 0, 0.5, 0]));
    expect(check.ok).toBe(false);
    expect(check.problems).toContain('Close the throttle');
  });

  it('names every deflected stick', () => {
    const check = preflightForControl(mapping(), device([0.9, -0.8, -1, 0.5]));
    expect(check.ok).toBe(false);
    expect(check.problems[0]).toMatch(/roll, pitch, yaw/);
  });

  it('tolerates a resting gimbal that does not sit at exactly zero', () => {
    expect(preflightForControl(mapping(), device([0.03, -0.04, -0.98, 0.02])).ok).toBe(true);
  });

  it('refuses before the four primary channels are assigned', () => {
    const partial = mapping();
    partial[3] = { ...defaultChannelMap(), source: { kind: 'none' } };
    const check = preflightForControl(partial, SAFE);
    expect(check.ok).toBe(false);
    expect(check.problems[0]).toMatch(/Assign roll, pitch, throttle and yaw/);
  });
});

describe('channelValue / channelPwm', () => {
  it('returns null for an unmapped channel rather than a neutral lie', () => {
    expect(channelValue(mapping(), SAFE, 7)).toBeNull();
    expect(channelPwm(mapping(), SAFE, 7)).toBeNull();
  });

  it('maps stick travel onto 1000-2000', () => {
    expect(channelPwm(mapping(), device([1, 0, -1, 0]), 0)).toBe(2000);
    expect(channelPwm(mapping(), SAFE, 2)).toBe(1000);
    expect(channelPwm(mapping(), SAFE, 1)).toBe(1500);
  });
});
