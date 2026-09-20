/**
 * Where the autopilot is mounted.
 *
 * Writing the orientation is one parameter, but getting it wrong is a crash,
 * so the card shows the live attitude beside the choice: pick the mounting,
 * tip the vehicle, watch the numbers agree. ArduPilot calls it
 * AHRS_ORIENTATION and PX4 SENS_BOARD_ROT; both take the same MAV rotation
 * numbering, so only the name differs.
 */

import { useMemo, useState } from 'react';
import { Compass, AlertTriangle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { BoardGlyph } from './BoardGlyph';
import {
  COMMON_ORIENTATIONS,
  ALL_ORIENTATIONS,
  orientationName,
  orientationCheck,
} from './board-orientation';

export function BoardOrientationCard(): JSX.Element {
  const { parameters, setParameterImmediate } = useParameterStore();
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const orientParam = firmware === 'px4' ? 'SENS_BOARD_ROT' : 'AHRS_ORIENTATION';
  const attitude = useTelemetryStore((s) => s.attitude);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const current = (parameters.get(orientParam)?.value as number) ?? 0;
  const supported = parameters.has(orientParam);
  const check = useMemo(
    () => orientationCheck(attitude.roll, attitude.pitch),
    [attitude.roll, attitude.pitch],
  );

  const apply = async (value: number) => {
    setBusy(true);
    setStatus(null);
    try {
      const ok = await setParameterImmediate(orientParam, value);
      setStatus(ok
        ? `Set to ${orientationName(value)}. Run the level calibration next, the accel trims belong to the old mounting.`
        : `Could not write ${orientParam}.`);
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return <></>;

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
          <Compass className="w-5 h-5 text-purple-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-content">Board orientation</h3>
          <p className="text-xs text-content-secondary">
            How the autopilot sits in the vehicle, relative to the arrow printed on it
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-content">{orientationName(current)}</div>
          <div className="text-[11px] text-content-tertiary">
            AHRS_ORIENTATION {current}
          </div>
        </div>
      </div>

      {armed && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Disarm before changing the mounting.
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* What the vehicle is doing right now, with the chosen mounting. */}
        <div className="shrink-0 rounded-xl border border-subtle bg-surface-raised p-4 flex flex-col items-center justify-center min-w-[190px]">
          <BoardGlyph value={current} size={128} roll={attitude.roll} pitch={attitude.pitch} active />
          <div className="mt-2 text-center">
            <div className="text-xs text-content">{orientationName(current)}</div>
            <div className="text-[11px] text-content-tertiary tabular-nums">
              roll {attitude.roll.toFixed(0)}° · pitch {attitude.pitch.toFixed(0)}° · yaw {attitude.yaw.toFixed(0)}°
            </div>
          </div>
          <div className={`mt-2 rounded-full px-2 py-0.5 text-[10px] ${
            check.level ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
          }`}>
            {check.level ? 'Reading level' : 'Not level'}
          </div>
        </div>

        <div className="flex-1">
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(122px,1fr))]">
            {COMMON_ORIENTATIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => apply(o.value)}
                disabled={armed || busy}
                data-tip={`${o.code} (AHRS_ORIENTATION ${o.value})`}
                className={`flex flex-col items-center rounded-lg border px-2 py-2 transition-colors disabled:opacity-40 ${
                  current === o.value
                    ? 'border-purple-500/50 bg-purple-500/10'
                    : 'border-subtle bg-surface-raised hover:bg-surface-overlay'
                }`}
              >
                <BoardGlyph value={o.value} size={52} active={current === o.value} />
                <span className={`mt-1 text-center text-[11px] leading-tight ${
                  current === o.value ? 'text-content' : 'text-content-secondary'
                }`}>
                  {o.label}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-content-tertiary">{check.note}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-[11px] text-content-tertiary hover:text-content"
        >
          {showAll ? 'Hide the full list' : 'Every orientation'}
        </button>
        {showAll && (
          <select
            value={current}
            onChange={(e) => apply(Number(e.target.value))}
            disabled={armed || busy}
            className="px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content-secondary"
          >
            {Object.entries(ALL_ORIENTATIONS).map(([value, code]) => (
              <option key={value} value={value}>{code} ({value})</option>
            ))}
          </select>
        )}
      </div>

      {status && <div className="mt-2 text-xs text-content-secondary">{status}</div>}
    </div>
  );
}
