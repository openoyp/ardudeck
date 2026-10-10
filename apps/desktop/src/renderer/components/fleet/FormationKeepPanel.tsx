/**
 * Native shape-keeping control loop panel (integration option A).
 *
 * Drives the main-process formation controller restored from the reversed
 * LGCFormationFlightController. Unlike the orchestrator-backed controls, this needs
 * no engine: the leader is the active vehicle, the wingmen are the rest of the fleet,
 * and main steers each one by key. Shows live per-member gap error and commanded speed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { useFleetVehicles } from '../../hooks/useFleet';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import type { FormationKeepConfigIpc, FormationKeepStatusIpc } from '../../../shared/ipc-channels';
import { tacButton } from './tactical';

const SHAPES: Array<{ value: FormationKeepConfigIpc['shape']; labelKey: string }> = [
  { value: 'triangle', labelKey: 'fleet:formationKeep.shapeTriangle' },
  { value: 'circle', labelKey: 'fleet:formationKeep.shapeCircle' },
  { value: 'line', labelKey: 'fleet:formationKeep.shapeLine' },
];

export function FormationKeepPanel(): JSX.Element | null {
  const { t } = useTranslation();
  const vehicles = useFleetVehicles();
  const activeKey = useActiveVehicleStore((s) => s.activeVehicleKey);

  const [shape, setShape] = useState<FormationKeepConfigIpc['shape']>('triangle');
  const [spacing, setSpacing] = useState(30);
  const [rowSpacing, setRowSpacing] = useState(30);
  const [centerOffset, setCenterOffset] = useState(0);
  const [status, setStatus] = useState<FormationKeepStatusIpc | null>(null);
  const runningRef = useRef(false);

  const leader = vehicles.find((v) => v.key === activeKey) ?? vehicles[0];
  const members = useMemo(() => {
    if (!leader) return [];
    return [leader, ...vehicles.filter((v) => v.key !== leader.key)];
  }, [leader, vehicles]);

  const cfg = useMemo<FormationKeepConfigIpc | null>(() => {
    if (members.length < 2) return null;
    return {
      shape,
      spacing,
      rowSpacing,
      centerOffset,
      members: members.map((m) => ({ vehicleKey: m.key, sysid: m.sysid })),
    };
  }, [members, shape, spacing, rowSpacing, centerOffset]);

  // Poll the loop snapshot while the panel is mounted (cheap: one invoke / 500 ms).
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await window.electronAPI?.formationKeepStatus?.();
        if (alive && s) {
          runningRef.current = s.running;
          setStatus(s);
        }
      } catch {
        /* a missing bridge (test env) just leaves the panel empty */
      }
    };
    void poll();
    const id = setInterval(poll, 500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Push geometry changes to main live while the loop is running.
  useEffect(() => {
    if (!runningRef.current || !cfg) return;
    void window.electronAPI?.formationKeepConfigure?.(cfg);
  }, [cfg]);

  const start = useCallback(async () => {
    if (!cfg) return;
    await window.electronAPI?.formationKeepConfigure?.(cfg);
    await window.electronAPI?.formationKeepStart?.();
  }, [cfg]);

  const stop = useCallback(async () => {
    await window.electronAPI?.formationKeepStop?.();
  }, []);

  if (vehicles.length < 2) return null;

  const running = status?.running ?? false;
  const startBtn = 'flex-1 px-2 py-1.5 text-[11px] font-medium rounded border border-cyan-500/30 bg-cyan-500/10 text-content hover:bg-cyan-500/20 transition-colors disabled:opacity-50';
  const stopBtn = 'flex-1 px-2 py-1.5 text-[11px] font-medium rounded border border-red-500/40 bg-red-500/10 text-content hover:bg-red-500/20 transition-colors disabled:opacity-50';

  const skipLabel = (reason: string | null): string => {
    if (!reason) return t('fleet:formationKeep.skipSent');
    if (reason === 'telemetry stale') return t('fleet:formationKeep.skipStale');
    if (reason === 'not armed') return t('fleet:formationKeep.skipNotArmed');
    if (reason === 'within threshold') return t('fleet:formationKeep.skipThreshold');
    return reason;
  };

  return (
    <div className="border-t border-subtle px-2 py-2 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-500/90">
          {t('fleet:formationKeep.title')}
        </span>
        <span className={`ml-auto text-[10px] font-mono ${running ? 'text-emerald-400' : 'text-content-tertiary'}`}>
          {running ? t('fleet:formationKeep.running') : t('fleet:formationKeep.stopped')}
        </span>
      </div>
      <div className="text-[10px] text-content-tertiary leading-snug" data-tip={t('fleet:formationKeep.hintTip')}>
        {t('fleet:formationKeep.hint', { leader: leader?.label ?? '-' })}
      </div>

      <div className="grid grid-cols-3 gap-1">
        {SHAPES.map((o) => {
          const lit = shape === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={lit}
              onClick={() => setShape(o.value)}
              className={`px-1.5 py-1 text-[10px] font-medium rounded border transition-colors disabled:opacity-60 ${tacButton(lit)}`}
            >
              {t(o.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-content-tertiary">
        <label className="flex items-center gap-1" data-tip={t('fleet:formationKeep.spacingTip')}>
          {t('fleet:formationKeep.spacing')}
          <DraftNumberInput min={5} max={500} integer value={spacing} onCommit={setSpacing} className="w-12 px-1 py-0.5 text-[11px] text-center rounded bg-surface-input border border-subtle text-content" />
        </label>
        {shape === 'triangle' && (
          <label className="flex items-center gap-1" data-tip={t('fleet:formationKeep.rowSpacingTip')}>
            {t('fleet:formationKeep.rowSpacing')}
            <DraftNumberInput min={5} max={500} integer value={rowSpacing} onCommit={setRowSpacing} className="w-12 px-1 py-0.5 text-[11px] text-center rounded bg-surface-input border border-subtle text-content" />
          </label>
        )}
        {shape === 'circle' && (
          <label className="flex items-center gap-1" data-tip={t('fleet:formationKeep.centerOffsetTip')}>
            {t('fleet:formationKeep.centerOffset')}
            <DraftNumberInput min={-500} max={500} integer value={centerOffset} onCommit={setCenterOffset} className="w-12 px-1 py-0.5 text-[11px] text-center rounded bg-surface-input border border-subtle text-content" />
          </label>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button onClick={() => { void start(); }} disabled={running || !cfg} className={startBtn}>
          {t('fleet:formationKeep.start')}
        </button>
        <button onClick={() => { void stop(); }} disabled={!running} className={stopBtn}>
          {t('fleet:formationKeep.stop')}
        </button>
      </div>

      {status && status.members.length > 0 && (
        <div className="rounded-md border border-subtle bg-surface p-1.5 flex flex-col gap-1">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-1.5 text-[9px] uppercase tracking-wide text-content-tertiary">
            <span />
            <span>{t('fleet:formationKeep.vehicle')}</span>
            <span className="text-right">{t('fleet:formationKeep.gapError')}</span>
            <span className="text-right">{t('fleet:formationKeep.targetSpeed')}</span>
          </div>
          {status.members.map((m) => {
            const veh = vehicles.find((v) => v.key === m.vehicleKey);
            const role = m.role === 'leader' ? t('fleet:formationKeep.roleLeader') : t('fleet:formationKeep.roleWingman');
            return (
              <div key={m.vehicleKey} className="grid grid-cols-[auto_1fr_auto_auto] gap-1.5 items-center text-[10px] font-mono">
                <span className={m.online ? 'text-emerald-400' : 'text-content-tertiary'}>{m.online ? '\u25CF' : '\u25CB'}</span>
                <span className="truncate text-content-secondary" data-tip={skipLabel(m.skipReason)}>
                  {veh?.label ?? `SYS ${m.sysid}`}
                  <span className="ml-1 text-content-tertiary">{role}</span>
                </span>
                <span className="text-right text-content-tertiary">
                  {m.actualGapM === null || m.desiredGapM === null
                    ? '-'
                    : `${(m.actualGapM - m.desiredGapM) >= 0 ? '+' : ''}${(m.actualGapM - m.desiredGapM).toFixed(1)}m`}
                </span>
                <span className="text-right text-content">
                  {m.targetSpeed === null ? '-' : `${m.targetSpeed.toFixed(1)}`}
                </span>
              </div>
            );
          })}
          {status.lastError && (
            <div className="text-[10px] font-mono text-red-400 break-words">
              {t('fleet:formationKeep.errorPrefix')}: {status.lastError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
