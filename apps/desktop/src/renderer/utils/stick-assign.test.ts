import { describe, it, expect } from 'vitest';
import {
  assignChannel,
  rcmapChanges,
  movedChannel,
  stickLabel,
  DEFAULT_RCMAP,
  ELEVATOR_THROTTLE_RCMAP,
} from './stick-assign';

describe('assigning a function to a channel', () => {
  // Two functions on one channel is the failure this has to prevent: the
  // vehicle then reads one stick for both and the other stick does nothing.
  it('swaps the displaced function instead of duplicating a channel', () => {
    const next = assignChannel(DEFAULT_RCMAP, 'throttle', 2);
    expect(next).toEqual({ roll: 1, pitch: 3, throttle: 2, yaw: 4 });
    expect(new Set(Object.values(next)).size).toBe(4);
  });

  it('is a no-op when the function is already there', () => {
    expect(assignChannel(DEFAULT_RCMAP, 'throttle', 3)).toBe(DEFAULT_RCMAP);
  });

  it('takes a free channel without touching anything else', () => {
    expect(assignChannel(DEFAULT_RCMAP, 'throttle', 7))
      .toEqual({ roll: 1, pitch: 2, throttle: 7, yaw: 4 });
  });

  it('refuses a channel the radio cannot carry', () => {
    expect(assignChannel(DEFAULT_RCMAP, 'roll', 0)).toBe(DEFAULT_RCMAP);
    expect(assignChannel(DEFAULT_RCMAP, 'roll', 17)).toBe(DEFAULT_RCMAP);
    expect(assignChannel(DEFAULT_RCMAP, 'roll', 2.5)).toBe(DEFAULT_RCMAP);
  });

  it('writes only the parameters that actually change', () => {
    expect(rcmapChanges(DEFAULT_RCMAP, ELEVATOR_THROTTLE_RCMAP)).toEqual([
      { param: 'RCMAP_PITCH', value: 3 },
      { param: 'RCMAP_THROTTLE', value: 2 },
    ]);
    expect(rcmapChanges(DEFAULT_RCMAP, DEFAULT_RCMAP)).toEqual([]);
  });
});

describe('learning which stick moved', () => {
  const base = [1500, 1500, 1000, 1500, 1500, 1500];

  it('picks the channel that travelled furthest', () => {
    expect(movedChannel(base, [1500, 1900, 1000, 1500, 1500, 1500])).toBe(2);
  });

  it('waits for a real movement, not receiver noise', () => {
    expect(movedChannel(base, [1505, 1512, 1003, 1498, 1500, 1500])).toBeNull();
  });

  // Aircraft sticks are two-axis: nudging one moves the other a little, and
  // taking the first thing over the threshold assigns the wrong one.
  it('refuses when two channels moved by similar amounts', () => {
    expect(movedChannel(base, [1900, 1820, 1000, 1500, 1500, 1500])).toBeNull();
  });

  it('accepts a clear winner over a small cross-axis nudge', () => {
    expect(movedChannel(base, [1900, 1560, 1000, 1500, 1500, 1500])).toBe(1);
  });

  it('ignores channels the receiver is not sending', () => {
    expect(movedChannel([0, 1500], [0, 1900])).toBe(2);
  });
});

describe('stick names', () => {
  it('calls roll steering on a ground vehicle', () => {
    expect(stickLabel('roll', true)).toBe('Steering');
    expect(stickLabel('roll', false)).toBe('Roll');
  });
});
