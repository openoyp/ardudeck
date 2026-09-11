// Store wipes are for endings, not gaps: an auto-reconnect to the same
// vehicle must keep parameters, calibration and flight state intact.

export interface ResetDecisionState {
  isConnected: boolean;
  isWaitingForHeartbeat?: boolean;
  isReconnecting?: boolean;
  systemId?: number;
  vehicleType?: string;
  fcVariant?: string;
  boardUid?: string;
}

export function shouldResetStoresOnDisconnect(
  state: ResetDecisionState,
  platformChangeInProgress: boolean,
): boolean {
  if (state.isConnected || state.isWaitingForHeartbeat) return false;
  if (platformChangeInProgress) return false;
  if (state.isReconnecting) return false;
  return true;
}

// boardUid wins; sysid/type/variant is the fallback when AUTOPILOT_VERSION never came.
export function vehicleIdentityOf(state: ResetDecisionState): string | null {
  if (!state.isConnected) return null;
  if (state.boardUid) return `uid:${state.boardUid}`;
  if (state.systemId === undefined) return null;
  return `sys:${state.systemId}:${state.vehicleType ?? ''}:${state.fcVariant ?? ''}`;
}

/** A different vehicle appeared: stores describing the old one must reset. */
export function isNewVehicleIdentity(prev: string | null, next: string | null): boolean {
  return prev !== null && next !== null && prev !== next;
}
