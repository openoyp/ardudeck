import { describe, it, expect } from 'vitest';
import { createStallTracker, nextRetryDelayMs, STALL_AFTER_MS } from './stream-stall';

describe('createStallTracker', () => {
  it('is not stalled before any frame arrives', () => {
    const t = createStallTracker();
    expect(t.hasFrames()).toBe(false);
    expect(t.isStalled(10_000_000)).toBe(false);
  });

  it('is not stalled while frames keep arriving', () => {
    const t = createStallTracker();
    t.onFrame(1000);
    t.onFrame(1033);
    t.onFrame(1066);
    expect(t.isStalled(1066 + STALL_AFTER_MS - 1)).toBe(false);
  });

  it('stalls once frames stop for the threshold', () => {
    const t = createStallTracker();
    t.onFrame(1000);
    expect(t.isStalled(1000 + STALL_AFTER_MS - 1)).toBe(false);
    expect(t.isStalled(1000 + STALL_AFTER_MS)).toBe(true);
  });

  it('recovers when a frame arrives after a stall', () => {
    const t = createStallTracker();
    t.onFrame(1000);
    expect(t.isStalled(1000 + STALL_AFTER_MS)).toBe(true);
    t.onFrame(1000 + STALL_AFTER_MS + 50);
    expect(t.isStalled(1000 + STALL_AFTER_MS + 100)).toBe(false);
  });

  it('honors a custom threshold', () => {
    const t = createStallTracker(500);
    t.onFrame(0);
    expect(t.isStalled(499)).toBe(false);
    expect(t.isStalled(500)).toBe(true);
  });
});

describe('nextRetryDelayMs', () => {
  it('backs off 1s, 2s, 4s, then holds at 8s forever', () => {
    expect(nextRetryDelayMs(0)).toBe(1000);
    expect(nextRetryDelayMs(1)).toBe(2000);
    expect(nextRetryDelayMs(2)).toBe(4000);
    expect(nextRetryDelayMs(3)).toBe(8000);
    expect(nextRetryDelayMs(4)).toBe(8000);
    expect(nextRetryDelayMs(500)).toBe(8000);
  });
});
