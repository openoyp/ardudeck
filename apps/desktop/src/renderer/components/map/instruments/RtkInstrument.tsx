/** RTK strip instrument with a start/stop popover; panel stays the deep surface. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_NTRIP_CONFIG,
  type NtripConfig,
  type NtripStatus,
  type RtkSource,
} from '../../../../shared/ntrip-types';
import type { SerialPortInfo } from '@ardudeck/comms';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useTelemetryLayoutStore } from '../../../stores/telemetry-layout-store';
import { GAUGE_COLORS } from './RoundGauge';
import { InstrumentStrip } from './InstrumentStrip';
import { useTelemetryFresh } from './useTelemetryFresh';
import { useRtkStatus } from './useRtkStatus';

const POPOVER_WIDTH = 232;
const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

const GPS_FIX_SHORT: Record<number, string> = { 2: '2D', 3: '3D' };

const INPUT_CLASS =
  'w-full rounded border border-default bg-surface-input px-2 py-1 text-xs text-content';

function formatRate(bps: number): string {
  return bps < 1024 ? `${bps} B/s` : `${(bps / 1024).toFixed(1)} KB/s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function Row({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="flex justify-between gap-2 text-[11px]">
      <span className="text-content-tertiary">{label}</span>
      <span className="text-content-secondary font-mono text-right truncate">{value}</span>
    </div>
  );
}

export function RtkInstrument(): JSX.Element {
  const status = useRtkStatus();
  const gpsFresh = useTelemetryFresh('gps');
  const fixType = useTelemetryStore((s) => s.gps.fixType);

  const busy = status.state === 'connecting' || status.state === 'connected' || status.state === 'reconnecting';
  const dotColor =
    status.state === 'connected' ? GAUGE_COLORS.green
    : status.state === 'connecting' || status.state === 'reconnecting' ? GAUGE_COLORS.amber
    : status.state === 'error' ? GAUGE_COLORS.red
    : GAUGE_COLORS.tickMinor;

  // DGPS/Float = amber "corrections working, not there yet"; Fixed = green.
  const fixLabel = !gpsFresh ? '--'
    : fixType === 6 ? 'RTK 固定'
    : fixType === 5 ? 'RTK 浮动'
    : fixType === 4 ? 'DGPS'
    : (GPS_FIX_SHORT[fixType] ?? '无定位');
  const fixColor = !gpsFresh ? GAUGE_COLORS.text
    : fixType === 6 ? GAUGE_COLORS.green
    : fixType >= 4 ? GAUGE_COLORS.amber
    : GAUGE_COLORS.text;

  const sourceTag = status.owner === 'orchestrator' ? 'FLEET' : status.source === 'serial' ? 'BASE' : 'NTRIP';

  // Config + password reload on every popover open: electron-store is the truth.
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [config, setConfig] = useState<NtripConfig>(DEFAULT_NTRIP_CONFIG);
  const [password, setPassword] = useState('');
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8));
    const spaceBelow = window.innerHeight - r.bottom - 16;
    const spaceAbove = r.top - 16;
    // Open toward the roomier side; the instrument usually sits near an edge.
    if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
      setPos({ top: r.bottom + 6, left, maxHeight: Math.max(160, spaceBelow) });
    } else {
      // Bottom-anchored when opening up, or a short popup strands at screen top.
      setPos({ bottom: window.innerHeight - r.top + 6, left, maxHeight: Math.max(160, spaceAbove) });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setActionError(null);
    void window.electronAPI.ntripGetConfig().then((c) => {
      if (!mounted) return;
      setConfig(c);
      if (c.source === 'serial') {
        void window.electronAPI.ntripListSerialPorts().then((p) => mounted && setSerialPorts(p));
      }
    });
    void window.electronAPI.getApiKey('ntrip').then((r) => mounted && setPassword(r.key));
    return () => { mounted = false; };
  }, [open]);

  const persist = (patch: Partial<NtripConfig>) => {
    const next = { ...configRef.current, ...patch };
    setConfig(next);
    void window.electronAPI.ntripSetConfig(next);
  };

  const refreshPorts = async () => {
    setSerialPorts(await window.electronAPI.ntripListSerialPorts());
  };

  const setSource = (source: RtkSource) => {
    persist({ source });
    if (source === 'serial') void refreshPorts();
  };

  const connect = async () => {
    setActionError(null);
    await window.electronAPI.setApiKey('ntrip', password);
    const result = await window.electronAPI.ntripConnect();
    if (!result.success && result.error) setActionError(result.error);
  };

  const disconnect = () => {
    void window.electronAPI.ntripDisconnect();
  };

  const openPanel = () => {
    setOpen(false);
    const bridge = useTelemetryLayoutStore.getState().bridge;
    if (!bridge) return;
    if (bridge.hasPanel('rtk')) bridge.activatePanel('rtk');
    else bridge.addPanel('rtk');
  };

  const isSerial = config.source === 'serial';
  const hasCasterConfig = config.host.trim() !== '' && config.mountpoint.trim() !== '';
  const errorText = actionError ?? (status.state === 'error' || status.state === 'reconnecting' ? status.error : undefined);

  const sourceToggle = (
    <div className="flex rounded overflow-hidden border border-default">
      {([
        { id: 'ntrip', label: 'NTRIP', tip: '来自网络差分服务的改正数据' },
        { id: 'serial', label: '本地基准站', tip: '来自串口基准接收机的改正数据,可完全离线使用。' },
      ] as Array<{ id: RtkSource; label: string; tip: string }>).map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => setSource(s.id)}
          data-tip={s.tip}
          className={`flex-1 px-2 py-1 text-[11px] transition-colors ${
            config.source === s.id
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-surface-input text-content-secondary hover:text-content'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );

  return (
    <InstrumentStrip label="RTK">
      {/* A button so the drag hook's interactive-child guard leaves the click alone. */}
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-tip={busy ? 'RTK 差分状态' : '配置 RTK 差分'}
        className="flex items-center gap-2 w-full text-left cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
        <span className="text-[13px] font-semibold leading-none whitespace-nowrap" style={{ color: fixColor }}>
          {fixLabel}
        </span>
        <span className="ml-auto text-[8px] leading-none whitespace-nowrap" style={{ color: GAUGE_COLORS.textDim }}>
          {status.state === 'connected' ? `${formatRate(status.dataRateBps)} ${sourceTag}`
            : status.state === 'disconnected' ? '未配置'
            : status.state.toUpperCase()}
        </span>
        <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: GAUGE_COLORS.textDim }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[9999] rounded-lg bg-surface-solid border border-subtle shadow-xl overflow-y-auto p-2.5 space-y-2"
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: POPOVER_WIDTH, maxHeight: pos.maxHeight }}
            >
              {busy ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                    <span className="text-xs text-content capitalize">{status.state}</span>
                    <span className="ml-auto text-[10px] text-content-tertiary font-mono">{sourceTag}</span>
                  </div>
                  {errorText && <div className="text-[11px] text-red-400">{errorText}</div>}
                  <div className="space-y-1">
                    <Row label="已接收" value={formatBytes(status.bytesReceived)} />
                    <Row label="速率" value={`${formatRate(status.dataRateBps)}`} />
                    <Row
                      label={status.owner === 'orchestrator' ? '发往机队' : '发往飞行器'}
                      value={status.rtcmForwarded}
                    />
                    {status.rtcmDropped > 0 && <Row label="丢包" value={status.rtcmDropped} />}
                    {status.mountpoint && <Row label="挂载点" value={status.mountpoint} />}
                    {status.basePosition && (
                      <Row
                        label="基准站"
                        value={`${status.basePosition.lat.toFixed(5)}, ${status.basePosition.lon.toFixed(5)}`}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={disconnect}
                    className="w-full py-1.5 rounded text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                  >
                    断开
                  </button>
                </>
              ) : (
                <>
                  {sourceToggle}
                  {errorText && <div className="text-[11px] text-red-400 break-words">{errorText}</div>}
                  {isSerial ? (
                    <>
                      <div className="flex gap-1.5">
                        <select
                          value={config.serialPath}
                          onChange={(e) => persist({ serialPath: e.target.value })}
                          data-tip="基准接收机的串口"
                          className={`${INPUT_CLASS} font-mono flex-1 min-w-0`}
                        >
                          <option value="">端口 ({serialPorts.length})</option>
                          {config.serialPath && !serialPorts.some((p) => p.path === config.serialPath) && (
                            <option value={config.serialPath}>{config.serialPath}(未连接)</option>
                          )}
                          {serialPorts.map((p) => (
                            <option key={p.path} value={p.path}>{p.path}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void refreshPorts()}
                          data-tip="重新扫描串口"
                          className="px-2 rounded text-xs bg-surface-raised text-content-secondary hover:text-content transition-colors"
                        >
                          ⟳
                        </button>
                      </div>
                      <select
                        value={config.serialBaud}
                        onChange={(e) => persist({ serialBaud: Number(e.target.value) })}
                        data-tip="基准接收机的波特率"
                        className={INPUT_CLASS}
                      >
                        {BAUD_RATES.map((b) => (
                          <option key={b} value={b}>{b} 波特</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void connect()}
                        disabled={!config.serialPath}
                        className="w-full py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
                      >
                        启动差分
                      </button>
                    </>
                  ) : hasCasterConfig ? (
                    <>
                      <div className="space-y-1">
                        <Row label="差分服务" value={`${config.host}:${config.port}`} />
                        <Row label="挂载点" value={config.mountpoint} />
                        {config.username && <Row label="用户名" value={config.username} />}
                      </div>
                      <button
                        type="button"
                        onClick={() => void connect()}
                        className="w-full py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                      >
                        连接
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="差分服务主机,如 rtk2go.com"
                        value={config.host}
                        onChange={(e) => setConfig({ ...config, host: e.target.value })}
                        onBlur={(e) => persist({ host: e.target.value.trim() })}
                        className={INPUT_CLASS}
                      />
                      <input
                        type="text"
                        placeholder="挂载点"
                        value={config.mountpoint}
                        onChange={(e) => setConfig({ ...config, mountpoint: e.target.value })}
                        onBlur={(e) => persist({ mountpoint: e.target.value.trim() })}
                        className={`${INPUT_CLASS} font-mono`}
                      />
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="用户名"
                          autoComplete="off"
                          value={config.username}
                          onChange={(e) => setConfig({ ...config, username: e.target.value })}
                          onBlur={(e) => persist({ username: e.target.value.trim() })}
                          className={INPUT_CLASS}
                        />
                        <input
                          type="password"
                          placeholder="密码"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void connect()}
                        disabled={!config.host.trim() || !config.mountpoint.trim()}
                        className="w-full py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
                      >
                        连接
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={openPanel}
                    data-tip="打开完整 RTK / NTRIP 面板(挂载点列表、TLS、GGA 设置)"
                    className="w-full text-center text-[11px] text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    在面板中查看完整设置
                  </button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </InstrumentStrip>
  );
}
