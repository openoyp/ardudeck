// Liveness = total traffic, never heartbeats alone: on narrow links heartbeats starve first.

/** Total silence before the link is marked stale (kept open). */
export const LINK_STALE_MS = 5000;
/** Total silence before the link is force-disconnected. */
export const LINK_DEAD_MS = 60000;
/** Heartbeat silence, with traffic still flowing, worth a diagnostic flag. */
export const HEARTBEAT_QUIET_MS = 10000;

export interface LivenessInput {
  nowMs: number;
  /** When ANY valid MAVLink frame last arrived from the vehicle link. */
  lastTrafficMs: number;
  /** When a vehicle HEARTBEAT last arrived. */
  lastHeartbeatMs: number;
}

export interface LivenessVerdict {
  /** Total silence has passed LINK_STALE_MS. */
  stale: boolean;
  /** Total silence has passed LINK_DEAD_MS: disconnect. */
  dead: boolean;
  /** Traffic is flowing but heartbeats are not: diagnostic only. */
  heartbeatQuiet: boolean;
  silenceMs: number;
}

export function evaluateLinkLiveness(input: LivenessInput): LivenessVerdict {
  const silenceMs = Math.max(0, input.nowMs - input.lastTrafficMs);
  const heartbeatSilenceMs = Math.max(0, input.nowMs - input.lastHeartbeatMs);
  const stale = silenceMs >= LINK_STALE_MS;
  return {
    stale,
    dead: silenceMs >= LINK_DEAD_MS,
    heartbeatQuiet: !stale && heartbeatSilenceMs >= HEARTBEAT_QUIET_MS,
    silenceMs,
  };
}
