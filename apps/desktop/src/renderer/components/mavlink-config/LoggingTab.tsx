/**
 * What the flight controller writes to its card, and whether it writes at all.
 *
 * The bit names come from the board's own parameter metadata, so this is right
 * for whatever firmware is connected rather than a table that rots. A vehicle
 * with no card is a first-class case here: turning logging off is one switch,
 * and it offers to drop the matching arming check in the same place, because
 * that is the thing that actually stops the refusals.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HardDrive, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import Px4LoggingConfig from './Px4LoggingConfig';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';

/** LOG_BACKEND_TYPE bits. */
const BACKEND_FILE = 1;
const BACKEND_MAVLINK = 2;
const BACKEND_BLOCK = 4;

/** ARMING_CHECK bit for "logging available". */
const ARMING_CHECK_LOGGING = 1024;

const DISARMED_OPTIONS = [
  { value: 0, label: 'Only while armed', hint: 'Normal: a log per flight' },
  { value: 1, label: 'Always', hint: 'Fills the card on the bench' },
  { value: 2, label: 'Always, except on USB', hint: 'Bench work stays quiet' },
  { value: 3, label: 'Always, discard if never armed', hint: 'Keeps only real flights' },
];

export default function LoggingTab(): JSX.Element {
  const { parameters, setParameter, getParameterMetadata } = useParameterStore();
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const [busy, setBusy] = useState(false);
  // What the destinations were before they were switched off, so turning
  // logging back on restores the setup instead of guessing.
  const lastBackendRef = useRef(0);

  const backend = (parameters.get('LOG_BACKEND_TYPE')?.value as number) ?? 1;
  const bitmask = (parameters.get('LOG_BITMASK')?.value as number) ?? 0;
  const disarmed = (parameters.get('LOG_DISARMED')?.value as number) ?? 0;
  const rotateOnDisarm = (parameters.get('LOG_FILE_DSRMROT')?.value as number) ?? 0;
  const mbFree = (parameters.get('LOG_FILE_MB_FREE')?.value as number) ?? 500;
  const armingCheck = (parameters.get('ARMING_CHECK')?.value as number) ?? 1;

  const hasLogging = parameters.has('LOG_BACKEND_TYPE');
  const loggingOff = backend === 0;
  const loggingChecked = armingCheck === 1 || (armingCheck & ARMING_CHECK_LOGGING) !== 0;

  useEffect(() => {
    if (backend !== 0) lastBackendRef.current = backend;
  }, [backend]);

  // Categories straight from the firmware: every vehicle logs different things.
  const categories = useMemo(() => {
    const meta = getParameterMetadata('LOG_BITMASK');
    return Object.entries(meta?.bitmask ?? {})
      .map(([bit, label]) => ({ bit: Number(bit), label }))
      .sort((a, b) => a.bit - b.bit);
  }, [getParameterMetadata]);

  const write = useCallback(async (param: string, value: number) => {
    setBusy(true);
    try {
      await setParameter(param, value);
    } finally {
      setBusy(false);
    }
  }, [setParameter]);

  const toggleBackend = (bit: number) => write('LOG_BACKEND_TYPE', backend ^ bit);
  const toggleCategory = (bit: number) => write('LOG_BITMASK', bitmask ^ (1 << bit));

  if (firmware === 'px4') return <Px4LoggingConfig />;

  if (!hasLogging) {
    return (
      <div className="p-6">
        <InfoCard title="Logging" variant="info">
          This board does not expose the logging parameters.
        </InfoCard>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Where it writes */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <HardDrive className="w-5 h-5 text-sky-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-content">Where logs are written</h3>
            <p className="text-xs text-content-secondary">
              Turn the card off entirely when the vehicle has none
            </p>
          </div>
        </div>

        {/* The master state, because "no logging" is a choice people make, not
            three boxes to find and clear. */}
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-subtle bg-surface-raised p-1 w-fit">
          <button
            onClick={() => write('LOG_BACKEND_TYPE', lastBackendRef.current || BACKEND_FILE)}
            disabled={busy || !loggingOff}
            className={`rounded-md px-4 py-1.5 text-xs transition-colors ${
              !loggingOff ? 'bg-sky-500/20 text-sky-300' : 'text-content-secondary hover:text-content'
            }`}
          >
            Logging on
          </button>
          <button
            onClick={() => write('LOG_BACKEND_TYPE', 0)}
            disabled={busy || loggingOff}
            className={`rounded-md px-4 py-1.5 text-xs transition-colors ${
              loggingOff ? 'bg-amber-500/20 text-amber-300' : 'text-content-secondary hover:text-content'
            }`}
          >
            No logging
          </button>
        </div>

        {loggingOff ? (
          <p className="text-xs text-content-secondary">
            Nothing is recorded. Pick a destination below to turn it back on.
          </p>
        ) : null}

        <div className={`grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] ${loggingOff ? 'opacity-50' : ''}`}>
          {[
            { bit: BACKEND_FILE, name: 'SD card', hint: 'The normal dataflash log' },
            { bit: BACKEND_MAVLINK, name: 'Over MAVLink', hint: 'Streamed to the GCS, no card needed' },
            { bit: BACKEND_BLOCK, name: 'Onboard flash', hint: 'Boards with built-in storage' },
          ].map((b) => {
            const on = (backend & b.bit) !== 0;
            return (
              <button
                key={b.bit}
                onClick={() => toggleBackend(b.bit)}
                disabled={busy}
                className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                  on ? 'border-sky-500/50 bg-sky-500/10' : 'border-subtle bg-surface-raised'
                }`}
              >
                <div className="flex items-center gap-2 text-sm text-content">
                  {on ? <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" /> : <span className="w-3.5" />}
                  {b.name}
                </div>
                <div className="mt-0.5 text-[11px] text-content-tertiary">{b.hint}</div>
              </button>
            );
          })}
        </div>

        {loggingOff && loggingChecked && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="flex-1 text-xs text-amber-300">
              Logging is off but the arming check still requires it, so the vehicle will refuse to arm
              with "PreArm: Logging failed".
            </span>
            <button
              onClick={() => {
                // ARMING_CHECK 1 means "all": expand it before clearing one bit,
                // or the write would silently switch every other check off.
                const base = armingCheck === 1 ? 0xFFFF : armingCheck;
                void write('ARMING_CHECK', base & ~ARMING_CHECK_LOGGING);
              }}
              disabled={busy}
              className="shrink-0 rounded-md bg-amber-500/20 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/30 disabled:opacity-40"
            >
              Drop the logging check
            </button>
          </div>
        )}
      </div>

      {/* When it writes */}
      <div className="bg-surface rounded-xl border border-subtle p-5 space-y-4">
        <h3 className="font-medium text-content">When it writes</h3>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {DISARMED_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => write('LOG_DISARMED', o.value)}
              disabled={busy}
              className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                disarmed === o.value ? 'border-sky-500/50 bg-sky-500/10' : 'border-subtle bg-surface-raised'
              }`}
            >
              <div className="text-sm text-content">{o.label}</div>
              <div className="mt-0.5 text-[11px] text-content-tertiary">{o.hint}</div>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rotateOnDisarm === 1}
            onChange={(e) => write('LOG_FILE_DSRMROT', e.target.checked ? 1 : 0)}
            className="rounded border bg-surface-input"
          />
          <span className="text-xs text-content-secondary">
            Start a new log file each time it disarms
          </span>
        </label>

        <DraggableSlider
          label="Keep free on the card"
          value={mbFree}
          onChange={(v) => write('LOG_FILE_MB_FREE', v)}
          min={0}
          max={1000}
          step={10}
          color="#0EA5E9"
          hint="Old logs are deleted to hold this much free space (MB). Set higher than the card can offer and logging never starts."
        />
      </div>

      {/* What it writes */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium text-content">What it writes</h3>
            <p className="text-xs text-content-secondary">
              Fewer categories means smaller logs and less card traffic
            </p>
          </div>
          <div className="text-[11px] text-content-tertiary tabular-nums">LOG_BITMASK {bitmask}</div>
        </div>
        {categories.length === 0 ? (
          <p className="text-xs text-content-tertiary">
            The board has not sent its logging categories yet. Refresh the parameters.
          </p>
        ) : (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
            {categories.map((c) => {
              const on = (bitmask & (1 << c.bit)) !== 0;
              return (
                <button
                  key={c.bit}
                  onClick={() => toggleCategory(c.bit)}
                  disabled={busy}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left transition-colors disabled:opacity-40 ${
                    on ? 'bg-sky-500/10 text-sky-300' : 'bg-surface-raised text-content-secondary'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${on ? 'bg-sky-400' : 'bg-content-tertiary/40'}`} />
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
