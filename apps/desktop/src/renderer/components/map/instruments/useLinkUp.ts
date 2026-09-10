/**
 * Whether the vehicle counts as linked for instrument purposes. Fleet/swarm
 * links never set connectionState.isConnected, so a known fleet vehicle also
 * counts as a link; without any link the telemetry store holds zero-defaults
 * and gauges dash out rather than painting those as live values.
 *
 * Lives on its own so both the registry and the compact readouts share one
 * definition instead of a circular import between them.
 */
import { useEffect, useState } from 'react';
import { useConnectionStore } from '../../../stores/connection-store';
import { useActiveVehicleStore } from '../../../stores/active-vehicle-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';

export function useLinkUp(): boolean {
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const fleetVehicleCount = useActiveVehicleStore((s) => Object.keys(s.knownVehicles).length);
  return isConnected || fleetVehicleCount > 0;
}

// 1 Hz tick so staleness flips on its own when telemetry stops arriving.
export const HEARTBEAT_STALE_MS = 3000;
export const HEARTBEAT_LOST_MS = 10000;

export function useHeartbeatAgeMs(): number {
  const lastHeartbeat = useTelemetryStore((s) => s.lastHeartbeat);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return lastHeartbeat === 0 ? Infinity : Date.now() - lastHeartbeat;
}
