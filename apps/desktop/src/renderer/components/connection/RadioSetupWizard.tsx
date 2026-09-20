import { useEffect, useRef, useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useMessagesStore } from '../../stores/messages-store';
import { evaluateRadioPreflight, type PreflightCheck } from '../../utils/radio-preflight';
import type { ElrsModuleInfo, ElrsProgressEvent } from '../../../shared/link-doctor-types';
import { ELRS_USB_BAUD } from '../../../shared/link-doctor-types';

type Step = 'scan' | 'noradio' | 'switch' | 'connect' | 'vehicle' | 'done';

const STEP_LABELS: Array<{ key: Step[]; label: string }> = [
  { key: ['scan', 'noradio'], label: '查找电台' },
  { key: ['switch'], label: '电台模式' },
  { key: ['connect'], label: '连接' },
  { key: ['vehicle'], label: '飞行器' },
  { key: ['done'], label: '完成' },
];

type FoundRadio =
  | { kind: 'serial'; port: string; info: ElrsModuleInfo | null } // info null = port already streams MAVLink
  | { kind: 'udp'; udpPort: number; sender: string | null }; // TX Backpack (or other bridge) over WiFi

const BACKPACK_UDP_PORT = 14550;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Connect the primary link on a specific serial port and baud. */
  connectSerial: (port: string, baud: number) => Promise<boolean>;
  /** Connect the primary link as a UDP listener (WiFi backpack path). */
  connectUdpListen: (udpPort: number) => Promise<boolean>;
}

/**
 * One guided flow for using an ExpressLRS module as the telemetry radio:
 * finds the module across serial ports, switches it to MAVLink mode
 * (walking the user through unpowering the receiver), connects, then checks
 * and fixes the vehicle-side settings - so nothing is ever hunted down
 * across tabs or parameter lists.
 */
export function RadioSetupWizard({ open, onClose, connectSerial, connectUdpListen }: Props) {
  const { connectionState, isConnecting, error: connectionError } = useConnectionStore();
  const messages = useMessagesStore((s) => s.messages);

  const [step, setStep] = useState<Step>('scan');
  const [scanStatus, setScanStatus] = useState('');
  const [scannedPorts, setScannedPorts] = useState<string[]>([]);
  const [radio, setRadio] = useState<FoundRadio | null>(null);
  const [progress, setProgress] = useState<ElrsProgressEvent | null>(null);
  const [switching, setSwitching] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [checks, setChecks] = useState<PreflightCheck[] | null>(null);
  const [paramTypes, setParamTypes] = useState<Record<string, number>>({});
  const [fixApplied, setFixApplied] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [busy, setBusy] = useState(false);

  const wasConnected = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const unsub = window.electronAPI.onElrsProgress?.((p) => setProgress(p));
    return () => {
      unsub?.();
    };
  }, []);

  // Fresh scan every time the wizard opens.
  useEffect(() => {
    if (!open) return;
    setStep('scan');
    setRadio(null);
    setFailure(null);
    setChecks(null);
    setFixApplied(false);
    setRestarting(false);
    void scanForRadio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-advance: the connect step completes when the primary link comes up;
  // a vehicle restart completes when the link drops and comes back.
  useEffect(() => {
    const connected = connectionState.isConnected ?? false;
    if (openRef.current && connected && !wasConnected.current) {
      if (step === 'connect') {
        setStep('vehicle');
        void runVehicleCheck();
      } else if (step === 'vehicle' && restarting) {
        setRestarting(false);
        void runVehicleCheck();
      }
    }
    wasConnected.current = connected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState.isConnected, step, restarting]);

  const scanForRadio = async () => {
    setScanStatus('正在检查 USB 端口…');
    const all = await window.electronAPI.listPorts();
    // USB serial devices only - skips Bluetooth and debug consoles.
    const usb = all.filter((p) => p.vendorId);
    const candidates = (usb.length > 0 ? usb : all).map((p) => p.path);
    setScannedPorts(candidates);

    for (const port of candidates) {
      if (!openRef.current) return;
      try {
        setScanStatus(`正在检查 ${port}…`);
        const info = await window.electronAPI.elrsDetect(port);
        if (info) {
          setRadio({ kind: 'serial', port, info });
          setStep(info.linkMode?.value === 'MAVLink' ? 'connect' : 'switch');
          return;
        }
        const probe = await window.electronAPI.linkDoctorProbe(port, ELRS_USB_BAUD);
        if (probe.protocol === 'mavlink2' || probe.protocol === 'mavlink1') {
          setRadio({ kind: 'serial', port, info: null });
          setStep('connect');
          return;
        }
      } catch {
        // Port busy or unopenable - not our radio, keep looking.
      }
    }

    // No USB radio - listen for a WiFi backpack broadcasting MAVLink. This is
    // the only path for internal TX modules, which have no USB port at all.
    if (!openRef.current) return;
    try {
      setScanStatus('正在监听 WiFi 电台(TX Backpack)…');
      const { diagnosis, sender } = await window.electronAPI.linkDoctorProbeUdp(BACKPACK_UDP_PORT);
      if (!openRef.current) return;
      if (diagnosis.protocol === 'mavlink2' || diagnosis.protocol === 'mavlink1') {
        setRadio({ kind: 'udp', udpPort: BACKPACK_UDP_PORT, sender });
        setStep('connect');
        return;
      }
    } catch {
      // UDP port busy - fall through to guidance.
    }
    setStep('noradio');
  };

  const startSwitch = async () => {
    if (radio?.kind !== 'serial') return;
    setSwitching(true);
    setProgress(null);
    setFailure(null);
    try {
      const result = await window.electronAPI.elrsSetLinkMode(radio.port, 'MAVLink');
      if (result.status === 'confirmed' || result.status === 'probable') {
        setStep('connect');
      } else if (result.status === 'timeout') {
        setFailure(
          '模块持续拒绝更改——接收机仍处于通电连接状态。请将飞行器完全断电(电池和 USB 线都拔掉),然后重新点击"开始"。',
        );
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : '模块停止响应。');
    } finally {
      setSwitching(false);
    }
  };

  const doConnect = async () => {
    if (!radio) return;
    setFailure(null);
    const ok =
      radio.kind === 'serial'
        ? await connectSerial(radio.port, ELRS_USB_BAUD)
        : await connectUdpListen(radio.udpPort);
    if (!ok) {
      setFailure(
        radio.kind === 'serial'
          ? '无法打开端口。是否有其他程序正在占用?'
          : '无法监听 WiFi 端口。是否有其他程序正在占用 UDP 14550?',
      );
    }
    // Success advances via the isConnected effect.
  };

  const radioLabel = radio
    ? radio.kind === 'serial'
      ? radio.port
      : `WiFi${radio.sender ? ` (${radio.sender.split(':')[0]})` : ''}`
    : '';

  const firmwareBanner = messages.find((m) => /Ardu\w+\s+V\d+\.\d+/.test(m.text))?.text ?? null;

  const runVehicleCheck = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const res = await window.electronAPI.readParameterBatch(['RC_PROTOCOLS', 'RSSI_TYPE']);
      setParamTypes(res.types ?? {});
      const result = evaluateRadioPreflight((name) => res.values[name], firmwareBanner);
      setChecks(result);
      if (result.every((c) => c.status === 'pass')) setStep('done');
    } catch (e) {
      setFailure(e instanceof Error ? e.message : '无法读取飞行器设置。');
    } finally {
      setBusy(false);
    }
  };

  const applyFixes = async () => {
    if (!checks) return;
    setBusy(true);
    setFailure(null);
    try {
      const batch = checks
        .flatMap((c) => c.fix ?? [])
        .map((f) => ({ paramId: f.param, value: f.value, type: paramTypes[f.param] ?? 6 }));
      const result = await window.electronAPI.setParameterBatch(batch);
      if ((result?.failed ?? []).length > 0) {
        setFailure(`飞行器拒绝:${result!.failed.join(', ')}`);
      } else {
        setFixApplied(true);
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : '应用设置失败。');
    } finally {
      setBusy(false);
    }
  };

  const restartVehicle = async () => {
    setRestarting(true);
    setFailure(null);
    try {
      await window.electronAPI.mavlinkReboot();
    } catch {
      setRestarting(false);
      setFailure('重启指令未被接受。');
    }
  };

  const close = () => {
    if (switching) void window.electronAPI.elrsCancel();
    onClose();
  };

  if (!open) return null;

  const failing = checks?.filter((c) => c.status === 'fail') ?? [];
  const fixable = failing.flatMap((c) => c.fix ?? []);
  const dot = (status: 'pass' | 'fail' | 'unknown') =>
    status === 'pass' ? 'bg-emerald-400' : status === 'fail' ? 'bg-red-400' : 'bg-gray-500';
  const spinner = (
    <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="card-body space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-content">无线电设置</h3>
            <button onClick={close} className="text-content-secondary hover:text-content transition-colors" aria-label="关闭">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {STEP_LABELS.map((s, i) => {
              const active = s.key.includes(step);
              const passed = STEP_LABELS.findIndex((x) => x.key.includes(step)) > i;
              return (
                <div key={s.label} className="flex items-center gap-1 flex-1">
                  <div
                    className={`h-1 rounded-full flex-1 ${
                      active ? 'bg-blue-500' : passed ? 'bg-emerald-500' : 'bg-surface-raised'
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-content-secondary -mt-2">
            {STEP_LABELS.find((s) => s.key.includes(step))?.label}
          </p>

          {failure && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-300">{failure}</p>
            </div>
          )}

          {step === 'scan' && (
            <div className="flex items-center gap-2 text-sm text-content-secondary py-4">
              {spinner}
              {scanStatus}
            </div>
          )}

          {step === 'noradio' && (
            <div className="space-y-3">
              <p className="text-sm text-content">未找到电台——两种连接方式:</p>
              <div className="p-3 bg-surface-raised rounded-lg space-y-1">
                <p className="text-xs font-medium text-content">USB 线(外置模块)</p>
                <p className="text-xs text-content-secondary">
                  用 USB 数据线将电台模块连接到本电脑。它可以留在遥控器舱内——只需再连一根线到本电脑即可。
                  {scannedPorts.length > 0
                    ? ` 已检查:${scannedPorts.join(', ')}。`
                    : ' 未发现 USB 串口设备。'}
                </p>
              </div>
              <div className="p-3 bg-surface-raised rounded-lg space-y-1">
                <p className="text-xs font-medium text-content">WiFi(TX Backpack——内置模块必需)</p>
                <p className="text-xs text-content-secondary">
                  遥控器内置的电台(如 TX16S 内置模块)没有 USB——它们通过 WiFi 传输。在遥控器的 ELRS 菜单中开启
                  Backpack WiFi,然后让本电脑加入"ExpressLRS TX Backpack"网络(密码:expresslrs),或将 Backpack
                  接入家庭 WiFi。注意:WiFi 传输仅在无线链路已处于 MAVLink 模式时可用——切换模式本身需要 USB 或遥控器菜单。
                </p>
              </div>
              <button onClick={() => { setStep('scan'); void scanForRadio(); }} className="btn btn-primary w-full text-sm">
                重新扫描(USB + WiFi)
              </button>
            </div>
          )}

          {step === 'switch' && radio?.kind === 'serial' && radio.info && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-content font-medium">{radio.info.name}</span>
                {radio.info.firmware && <span className="text-content-secondary">v{radio.info.firmware}</span>}
                <span className="px-2 py-0.5 rounded-full border text-amber-300 border-amber-500/30 bg-amber-500/10">
                  {radio.info.linkMode?.value ?? 'Normal'} 模式
                </span>
              </div>
              {radio.info.firmware?.startsWith('4.0.0') && (
                <p className="text-xs text-amber-300">
                  此模块运行 ELRS 4.0.0,该版本在 MAVLink 模式下会损坏摇杆位置。在操控前,请将其(和接收机)升级到
                  4.0.1 或更新版本。
                </p>
              )}
              <p className="text-sm text-content">
                电台需要切换到 MAVLink 模式以传输遥测数据。
              </p>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-xs text-amber-200 font-medium mb-1">第一步:关闭接收机电源</p>
                <p className="text-xs text-content-secondary">
                  接收机仍连接时,电台会拒绝此更改。请将飞行器完全断电——取出电池并拔掉 USB 线。也可以先点击"开始",
                  在 ArduDeck 持续重试期间为飞行器断电。
                </p>
              </div>
              {switching ? (
                <div className="p-3 bg-surface-raised rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-xs text-content">
                    {spinner}
                    切换中{progress ? ` - 第 ${progress.attempt} 次尝试` : ''}…
                  </div>
                  {progress?.currentMode && progress.currentMode !== 'MAVLink' && (
                    <p className="text-xs text-content-secondary">
                      模块仍报告为 {progress.currentMode}——等待接收机断电。
                    </p>
                  )}
                  <button onClick={() => window.electronAPI.elrsCancel()} className="btn btn-secondary w-full text-xs">
                    取消
                  </button>
                </div>
              ) : (
                <button onClick={startSwitch} className="btn btn-primary w-full text-sm">
                  开始
                </button>
              )}
            </div>
          )}

          {step === 'connect' && (
            <div className="space-y-3">
              <p className="text-sm text-content">
                {radioLabel} 上的电台已就绪并使用 MAVLink 通信。
              </p>
              <p className="text-xs text-content-secondary">
                重新给飞行器上电,等待几秒让链路建立,然后连接。
              </p>
              {connectionError && <p className="text-xs text-red-300">{connectionError}</p>}
              {isConnecting || connectionState.isWaitingForHeartbeat ? (
                <div className="flex items-center gap-2 text-xs text-content-secondary">
                  {spinner}
                  正在通过电台连接…
                </div>
              ) : (
                <button onClick={doConnect} className="btn btn-primary w-full text-sm">
                  通过电台连接
                </button>
              )}
            </div>
          )}

          {step === 'vehicle' && (
            <div className="space-y-3">
              <p className="text-sm text-content">已连接。正在检查飞行器的无线链路就绪状态…</p>
              {busy && (
                <div className="flex items-center gap-2 text-xs text-content-secondary">
                  {spinner}
                  正在通过电台读取飞行器设置…
                </div>
              )}
              {restarting && (
                <div className="flex items-center gap-2 text-xs text-content-secondary">
                  {spinner}
                  正在重启飞行器——链路会自动重连…
                </div>
              )}
              {checks && !busy && (
                <div className="space-y-1.5">
                  {checks.map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot(c.status)}`} />
                      <div>
                        <p className="text-xs text-content">{c.title}</p>
                        <p className="text-xs text-content-secondary">{c.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {checks && !busy && !restarting && (
                fixApplied ? (
                  <button onClick={restartVehicle} className="btn btn-primary w-full text-sm">
                    重启飞行器以完成
                  </button>
                ) : fixable.length > 0 ? (
                  <button onClick={applyFixes} className="btn btn-primary w-full text-sm">
                    帮我修复
                  </button>
                ) : failing.length > 0 ? (
                  <p className="text-xs text-content-secondary">
                    剩余项无法在此修复(见上文)。遥测功能不受影响。
                  </p>
                ) : null
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-sm text-emerald-300 font-medium">无线链路配置完成。</p>
                <p className="text-xs text-content-secondary mt-1">
                  遥测、摇杆控制和信号强度都经由该电台传输。从此以后就像使用 SiK 数传电台一样:每次飞行或驾驶时,只需连接 {radioLabel}。
                </p>
              </div>
              <button onClick={close} className="btn btn-primary w-full text-sm">
                关闭
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
