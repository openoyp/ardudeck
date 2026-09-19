import { useCallback, useEffect, useState } from 'react';
import { useNavigationStore } from '../../stores/navigation-store';
import { BwGuide } from '../radio-hud/BwGuide';
import type { EdgeTxScanResult, EdgeTxSdCard, EdgeTxPackageInfo, InstallProgress, InstalledPackageRecord, TelemetryScreenSummary } from '../../../shared/edgetx-types';

/**
 * Radio (EdgeTX) tab: installs curated SD-card packages (Yaapu telemetry,
 * etc.) onto an EdgeTX radio mounted in USB Storage mode. Pure file
 * management - no MAVLink connection involved.
 */
export function RadioSdView() {
  const [scan, setScan] = useState<EdgeTxScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);
  const [variantId, setVariantId] = useState('c480x320');
  const [variantTouched, setVariantTouched] = useState(false);
  const [busyPackageId, setBusyPackageId] = useState<string | null>(null);
  const [progress, setProgress] = useState<(InstallProgress & { packageId: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screens, setScreens] = useState<TelemetryScreenSummary | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const rescan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    try {
      const result = await window.electronAPI.edgetxScan();
      setScan(result);
      setSelectedVolume((prev) => {
        if (prev && result.cards.some((c) => c.volumePath === prev)) return prev;
        return result.cards[0]?.volumePath ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    rescan();
    const cleanup = window.electronAPI.onEdgetxProgress?.((p) => setProgress(p));
    return cleanup;
  }, [rescan]);

  const card: EdgeTxSdCard | null = scan?.cards.find((c) => c.volumePath === selectedVolume) ?? null;
  const installed: Record<string, InstalledPackageRecord> = (card && scan?.installed[card.volumePath]) || {};
  const isBw = variantId.startsWith('bw');

  // The card's RADIO/radio.yml names the radio, so the screen variant is a
  // detection, not a question - until the user overrides it by hand.
  const suggestedVariantId = card?.suggestedVariantId ?? null;
  useEffect(() => {
    if (variantTouched || !suggestedVariantId) return;
    setVariantId(suggestedVariantId);
  }, [suggestedVariantId, variantTouched]);

  const handleInstall = async (pkg: EdgeTxPackageInfo) => {
    if (!card) return;
    setBusyPackageId(pkg.id);
    setProgress(null);
    setError(null);
    const result = await window.electronAPI.edgetxInstall(card.volumePath, pkg.id, variantId);
    if (!result.success) setError(result.error ?? '安装失败');
    setScreens(result.screens ?? null);
    setBusyPackageId(null);
    setProgress(null);
    await rescan();
  };

  const handleRemove = async (pkg: EdgeTxPackageInfo) => {
    if (!card) return;
    setBusyPackageId(pkg.id);
    setError(null);
    const result = await window.electronAPI.edgetxRemove(card.volumePath, pkg.id);
    if (!result.success) setError(result.error ?? '移除失败');
    setBusyPackageId(null);
    await rescan();
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Detected radio card */}
        <div className="bg-surface-raised border border-subtle rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-content">遥控器 SD 卡</h3>
            <button
              onClick={rescan}
              disabled={isScanning}
              className="px-2.5 py-1 text-xs text-content-secondary hover:text-content bg-surface-input hover:bg-surface-raised border border-subtle rounded transition-colors disabled:opacity-50"
            >
              {isScanning ? '扫描中…' : '重新扫描'}
            </button>
          </div>

          {!card && (
            <div className="text-sm text-content-secondary space-y-2">
              <p>未检测到 EdgeTX SD 卡。</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>打开遥控器电源并通过 USB 连接</li>
                <li>在遥控器屏幕上选择 <span className="text-content">USB Storage (SD)</span></li>
                <li>点击重新扫描</li>
              </ol>
            </div>
          )}

          {card && (
            <div className="space-y-3">
              {scan!.cards.length > 1 && (
                <select
                  value={card.volumePath}
                  onChange={(e) => setSelectedVolume(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-surface-input border border-subtle rounded text-content"
                >
                  {scan!.cards.map((c) => (
                    <option key={c.volumePath} value={c.volumePath}>{c.volumeName}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-content font-medium">
                  {card.radioLabel ?? card.volumeName}
                  {card.radioLabel && <span className="ml-2 text-xs text-content-secondary">{card.volumeName}</span>}
                </span>
                <span className="text-content-secondary text-xs">
                  {card.firmwareVersion ? `EdgeTX ${card.firmwareVersion}` : card.sdCardVersion ? `EdgeTX SD ${card.sdCardVersion}` : '版本未知'}
                  {' · '}
                  剩余 {(card.freeBytes / 1e6).toFixed(0)} MB
                </span>
              </div>
              {card.firmwareVersion && card.sdCardVersion
                && card.firmwareVersion.slice(0, 4) !== card.sdCardVersion.slice(0, 4) && (
                <p className="text-[11px] text-amber-400">
                  SD 卡内容来自 EdgeTX {card.sdCardVersion},但遥控器运行的是 {card.firmwareVersion}。
                  在依赖声音或主题之前,请先从 EdgeTX sdcard 发行版更新卡内内容。
                </p>
              )}
              <label className="block">
                <span className="text-xs text-content-secondary">
                  遥控器屏幕
                  {suggestedVariantId && !variantTouched && ' · 从卡中检测'}
                </span>
                <select
                  value={variantId}
                  onChange={(e) => { setVariantTouched(true); setVariantId(e.target.value); }}
                  className="mt-1 w-full px-2 py-1.5 text-sm bg-surface-input border border-subtle rounded text-content"
                >
                  {(scan?.catalog[0]?.variants ?? []).map((v) => (
                    <option key={v.id} value={v.id}>{v.label} — {v.radios}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400 flex items-start justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-red-200 leading-none">×</button>
          </div>
        )}

        {/* Package catalog */}
        <div className="space-y-3">
          {(scan?.catalog ?? []).map((pkg) => {
            const record = installed[pkg.id];
            const busy = busyPackageId === pkg.id;
            const variantSupported = pkg.variants.some((v) => v.id === variantId);
            return (
              <div key={pkg.id} className="bg-surface-raised border border-subtle rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-content">{pkg.name}</h4>
                      {record && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {record.version} · {record.variantId}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-content-secondary">{pkg.description}</p>
                    <p className="mt-1 text-[10px] text-content-secondary">
                      <a href={pkg.homepage} target="_blank" rel="noreferrer" className="hover:text-content underline">{pkg.homepage.replace('https://github.com/', '')}</a>
                      {' · '}{pkg.license}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      onClick={() => handleInstall(pkg)}
                      disabled={!card || busy || !variantSupported}
                      data-tip={!variantSupported
                        ? '当前所选遥控器屏幕不可用'
                        : record ? '重新安装或更新到最新版本' : '下载软件包并复制到 SD 卡'}
                      className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-surface-input disabled:text-content-secondary text-white rounded transition-colors"
                    >
                      {busy ? '处理中…' : record ? '更新' : '安装'}
                    </button>
                    {record && !busy && (
                      <button
                        onClick={() => handleRemove(pkg)}
                        data-tip="移除此软件包安装的所有文件"
                        className="px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                      >
                        移除
                      </button>
                    )}
                  </div>
                </div>

                {pkg.id === 'ardudeck-hud' && record && (
                  <p className="mt-2 text-[11px] text-content-secondary">
                    在{' '}
                    <button
                      onClick={() => useNavigationStore.getState().setView('radio-hud')}
                      className="text-teal-400 hover:text-teal-300 underline"
                    >
                      Radio HUD
                    </button>{' '}
                    视图中配置和预览此小部件。
                  </p>
                )}

                {busy && progress?.packageId === pkg.id && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-content-secondary mb-1">
                      <span>
                        {progress.phase === 'resolve' && '正在解析最新版本…'}
                        {progress.phase === 'download' && `正在下载 ${progress.detail ?? ''}…`}
                        {progress.phase === 'extract' && '正在解压…'}
                        {progress.phase === 'copy' && '正在复制到 SD 卡…'}
                        {progress.phase === 'done' && '完成'}
                      </span>
                      {progress.percent >= 0 && <span>{progress.percent}%</span>}
                    </div>
                    <div className="h-1.5 bg-surface-input rounded overflow-hidden">
                      <div
                        className={`h-full bg-blue-500 transition-all ${progress.percent < 0 ? 'w-1/3 animate-pulse' : ''}`}
                        style={progress.percent >= 0 ? { width: `${progress.percent}%` } : undefined}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {card && (
          isBw ? (
            <div className="text-[11px] text-content-secondary space-y-1">
              {screens ? (
                <>
                  <p className="text-content">
                    在遥控器上完成设置:已有 {screens.added + screens.already} 个模型的遥测屏幕指向 HUD。
                  </p>
                  <p>弹出、拔出 USB,然后在主界面按 <span className="text-content">PAGE</span>。</p>
                  {screens.full.length > 0 && (
                    <p className="text-amber-400">
                      {screens.full.join(', ')} 上没有空闲遥测屏幕:请释放该处四个屏幕之一后重新安装。
                    </p>
                  )}
                </>
              ) : (
                <p>
                  黑白屏遥控器不支持小部件,因此安装时还会将每个模型的遥测屏幕指向该脚本。遥控器上无需
                  额外设置:弹出、拔出 USB,然后在主界面按 <span className="text-content">PAGE</span>。
                </p>
              )}
              <button
                onClick={() => setGuideOpen(true)}
                className="mt-1 text-teal-400 hover:text-teal-300 underline"
              >
                阅读黑白屏遥控器指南
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-content-secondary">
              安装完成后:弹出 SD 卷、拔出 USB,然后在遥控器上将小部件添加到模型屏幕(长按 TELE,
              全屏小部件)。软件包在安装时从其官方仓库下载。
            </p>
          )
        )}
      </div>
      {guideOpen && <BwGuide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
