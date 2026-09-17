import { useEffect, useState } from 'react';
import { useTelemetryStore } from '../stores/telemetry-store';
import { usePseudoTxStore } from '../stores/pseudo-tx-store';

export type RcSignalStatus = 'none' | 'stale' | 'active';

/** Live / stale / none for the RC link. State is read inside the tick and the
 * effect keeps NO deps: RC frames land faster than the 250ms tick, so a dep on
 * lastRcChannels rebuilds the interval before it can fire and the status sticks
 * at 'none'. A USB handset standing in for a receiver counts as live. */
export function useRcSignalStatus(): RcSignalStatus {
  const [status, setStatus] = useState<RcSignalStatus>('none');

  useEffect(() => {
    const tick = () => {
      const tx = usePseudoTxStore.getState();
      if (tx.enabled && tx.connected) {
        setStatus('active');
        return;
      }
      const { lastRcChannels, rcChannels } = useTelemetryStore.getState();
      if (lastRcChannels === 0 || rcChannels.chancount === 0) {
        setStatus('none');
      } else if (Date.now() - lastRcChannels > 2000) {
        setStatus('stale');
      } else {
        setStatus('active');
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, []);

  return status;
}
