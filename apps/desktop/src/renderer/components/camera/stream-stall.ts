// Stall = frame ARRIVAL stops; readyState is useless (stays HAVE_ENOUGH_DATA on a frozen track).

/** No new frame for this long after at least one frame arrived = stalled. */
export const STALL_AFTER_MS = 3000;

interface StallTracker {
  onFrame: (nowMs: number) => void;
  isStalled: (nowMs: number) => boolean;
  hasFrames: () => boolean;
}

export function createStallTracker(stallMs: number = STALL_AFTER_MS): StallTracker {
  let lastFrameMs: number | null = null;
  return {
    onFrame: (nowMs) => {
      lastFrameMs = nowMs;
    },
    isStalled: (nowMs) => lastFrameMs !== null && nowMs - lastFrameMs >= stallMs,
    hasFrames: () => lastFrameMs !== null,
  };
}

// Retries never give up: a dongle replugged minutes later must recover hands-off.
export function nextRetryDelayMs(attempt: number): number {
  const table = [1000, 2000, 4000, 8000];
  return table[Math.min(attempt, table.length - 1)] ?? 8000;
}
