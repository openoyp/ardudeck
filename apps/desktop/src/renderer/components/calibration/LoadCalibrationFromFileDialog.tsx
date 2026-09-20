/**
 * LoadCalibrationFromFileDialog (#16) — force-accept calibration from a .param file.
 *
 * ArduPilot accepts PARAM_SET on calibration values, but the prearm path
 * still validates them against the live sensor identity — loading cal from
 * a different physical board (or a file with no real cal in it) leads to
 * the "3D calibration needed" prearm and silent rejection of the offsets.
 *
 * This dialog filters a .param file down to accel+mag cal params, validates
 * the file against the live FC (sensor IDs match? offsets are non-zero?),
 * and only enables Apply for categories that pass. The verified sensor-ID
 * params are then written along with the offsets: the saved id matching the
 * detected chip IS ArduPilot's "calibration accepted" flag, and after a
 * param wipe the detected ids exist only in RAM, so skipping the id write
 * leaves the prearm error in place forever (the Matek H743 cross-flash
 * report on #16). Gyro and lock-flag automation were removed per operator
 * feedback: gyros auto-cal at boot reliably and silently mutating
 * INS_GYR_CAL / COMPASS_LEARN was unwelcome.
 *
 * Flow:
 *   1. user clicks Open → file picker (uses existing PARAM_LOAD_FILE handler)
 *   2. dialog filters to cal params, groups by Accel / Mag, runs validation
 *   3. user toggles per-category check; categories that failed validation are
 *      forced off with an inline reason
 *   4. Apply → store batches PARAM_SET + flash, streams progress
 *   5. result screen: counts + reboot recommendation
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, FileText, RotateCw, ShieldCheck, ShieldAlert, XCircle } from 'lucide-react';
import { useCalibrationStore, type LoadedCalParam, type CategoryValidation } from '../../stores/calibration-store';
import {
  type CalibrationCategory,
} from '../../../shared/calibration-param-groups';

interface Props {
  onClose: () => void;
}

const CATEGORY_LABEL: Record<CalibrationCategory, string> = {
  accel: '加速度计',
  mag: '磁力计',
};

const CATEGORY_ACCENT: Record<CalibrationCategory, { ring: string; text: string; bg: string }> = {
  accel: { ring: 'border-blue-500/30', text: 'text-blue-300', bg: 'bg-blue-500/10' },
  mag: { ring: 'border-amber-500/30', text: 'text-amber-300', bg: 'bg-amber-500/10' },
};

function formatValue(v: number | undefined): string {
  if (v === undefined) return '-';
  if (Number.isInteger(v)) return String(v);
  return String(parseFloat(v.toPrecision(7)));
}

/** Human-readable reason a category can't be applied. Returns null if it can. */
function getBlockedReason(v: CategoryValidation): string | null {
  if (!v.hasCalData) return '没有校准数据：文件中所有偏移均为零';
  if (v.idStatus === 'mismatch') return '传感器 ID 与本飞行控制器不匹配';
  if (v.idStatus === 'missing') return '文件中没有传感器 ID，无法核对源板';
  return null;
}

export function LoadCalibrationFromFileDialog({ onClose }: Props) {
  const loadCalibrationFromFile = useCalibrationStore(s => s.loadCalibrationFromFile);
  const applyLoadedCalibration = useCalibrationStore(s => s.applyLoadedCalibration);
  const clearLoadedCalibration = useCalibrationStore(s => s.clearLoadedCalibration);
  const dismissLoadedCalibrationResult = useCalibrationStore(s => s.dismissLoadedCalibrationResult);
  const loadedCalibration = useCalibrationStore(s => s.loadedCalibration);
  const isApplying = useCalibrationStore(s => s.isApplyingLoadedCalibration);
  const progress = useCalibrationStore(s => s.loadedCalibrationApplyProgress);
  const result = useCalibrationStore(s => s.loadedCalibrationResult);

  // Per-category opt-in. Default to all-on; categories that failed validation
  // (no cal data, mismatched IDs, missing IDs) are forced off in the render
  // so the user can't apply a no-op or a wrong-board cal.
  const [enabled, setEnabled] = useState<Record<CalibrationCategory, boolean>>({
    accel: true, mag: true,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Open the picker once, on mount only. Reading `loadedCalibration` from
  // the dependency array would re-fire this effect when the close path
  // clears the store (handleClose → clearLoadedCalibration), reopening the
  // file picker an instant before the dialog unmounts. Empty deps + a
  // one-shot store read keep this strictly tied to mount.
  useEffect(() => {
    if (useCalibrationStore.getState().loadedCalibration) return;
    let cancelled = false;
    (async () => {
      setIsLoadingFile(true);
      const r = await loadCalibrationFromFile();
      if (cancelled) return;
      setIsLoadingFile(false);
      if (!r.ok) {
        setLoadError(r.error ?? '加载文件失败');
      } else if ((r.calCount ?? 0) === 0) {
        setLoadError('所选文件中未找到加速度计或磁力计校准参数。');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group params by category so each section shows its own count + diffs.
  const grouped = useMemo<Record<CalibrationCategory, LoadedCalParam[]>>(() => {
    const buckets: Record<CalibrationCategory, LoadedCalParam[]> = { accel: [], mag: [] };
    if (!loadedCalibration) return buckets;
    for (const p of loadedCalibration.params) {
      buckets[p.info.category].push(p);
    }
    return buckets;
  }, [loadedCalibration]);

  const handleApply = async () => {
    if (!loadedCalibration) return;
    const categories = new Set<CalibrationCategory>();
    for (const c of ['accel', 'mag'] as const) {
      if (!enabled[c]) continue;
      if (grouped[c].length === 0) continue;
      if (getBlockedReason(loadedCalibration.validation[c]) !== null) continue;
      categories.add(c);
    }
    if (categories.size === 0) return;
    await applyLoadedCalibration({ categories });
  };

  const handleClose = () => {
    clearLoadedCalibration();
    onClose();
  };

  const handleResultDone = () => {
    dismissLoadedCalibrationResult();
    handleClose();
  };

  const totalSelected = useMemo(() => {
    if (!loadedCalibration) return 0;
    let n = 0;
    for (const p of loadedCalibration.params) {
      if (!enabled[p.info.category]) continue;
      const v = loadedCalibration.validation[p.info.category];
      if (getBlockedReason(v) !== null) continue;
      if (p.currentValue === undefined) continue;
      n++;
    }
    return n;
  }, [loadedCalibration, enabled]);

  return (
    <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-[120] p-4">
      <div className="bg-surface-solid border border-subtle rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
        {result ? (
          <ResultView
            result={result}
            onDone={handleResultDone}
          />
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="text-lg font-semibold text-content">从文件加载校准</h3>
              <p className="text-sm text-content-secondary mt-1">
                从 .param 文件恢复加速度计/磁力计校准。写入任何数值前都会对照本飞控的
                传感器 ID 校验文件，且已校验的 ID 会与偏移一起保存，
                确保 ArduPilot 重启后接受该校准。
              </p>
              {loadedCalibration?.filePath && (
                <div className="mt-2 flex items-center gap-2 text-xs text-content-tertiary">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate" title={loadedCalibration.filePath}>{loadedCalibration.filePath}</span>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
              {isLoadingFile && (
                <div className="text-sm text-content-secondary text-center py-6">正在读取文件...</div>
              )}

              {loadError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-300">
                  {loadError}
                </div>
              )}

              {loadedCalibration && loadedCalibration.params.length > 0 && (
                <div className="space-y-3">
                  {(['accel', 'mag'] as const).map((cat) => {
                    const items = grouped[cat];
                    const accent = CATEGORY_ACCENT[cat];
                    const hasAny = items.length > 0;
                    const validation = loadedCalibration.validation[cat];
                    const blockedReason = getBlockedReason(validation);
                    const canApply = hasAny && blockedReason === null;
                    return (
                      <CategoryCard
                        key={cat}
                        title={CATEGORY_LABEL[cat]}
                        accent={accent}
                        enabled={enabled[cat] && canApply}
                        canToggle={canApply && !isApplying}
                        onToggle={() => setEnabled(prev => ({ ...prev, [cat]: !prev[cat] }))}
                        totalCount={items.length}
                        validation={validation}
                        blockedReason={blockedReason}
                        items={items}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Progress + footer */}
            {isApplying && progress && (
              <div className="px-6 py-2 border-t border-subtle">
                <div className="flex items-center justify-between text-xs text-content-secondary mb-1">
                  <span>正在写入校准...</span>
                  <span>{progress.applied} / {progress.total}</span>
                </div>
                <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-150"
                    style={{ width: `${(progress.applied / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
              <button
                onClick={handleClose}
                disabled={isApplying}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content disabled:text-content-tertiary transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleApply}
                disabled={isApplying || totalSelected === 0 || !loadedCalibration}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-surface-raised text-white disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors"
              >
                {isApplying
                  ? '应用中...'
                  : `应用 ${totalSelected} 个参数`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface CategoryCardProps {
  title: string;
  accent: { ring: string; text: string; bg: string };
  enabled: boolean;
  canToggle: boolean;
  onToggle: () => void;
  totalCount: number;
  validation: CategoryValidation;
  blockedReason: string | null;
  items: Array<{
    paramId: string;
    fileValue: number;
    currentValue: number | undefined;
    info: { kind: string };
  }>;
}

function CategoryCard({
  title, accent, enabled, canToggle, onToggle, totalCount, validation, blockedReason, items,
}: CategoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const writableCount = items.length;
  return (
    <div className={`rounded-lg border ${accent.ring} ${enabled ? accent.bg : 'bg-surface-overlay-subtle opacity-60'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          disabled={!canToggle}
        />
        <div className="flex-1">
          <div className={`text-sm font-medium ${accent.text}`}>{title}</div>
          <div className="text-xs text-content-tertiary">
            {totalCount === 0
              ? '文件中没有校准值'
              : `文件中的 ${writableCount} 个参数`}
          </div>
        </div>
        {totalCount > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs text-content-secondary hover:text-content transition-colors"
          >
            {expanded ? '隐藏' : '显示'}差异
          </button>
        )}
      </div>

      {/* Validation status row — always shown, source of truth for whether
          this category can be applied. */}
      {totalCount > 0 && (
        <ValidationBadge validation={validation} blockedReason={blockedReason} />
      )}

      {expanded && totalCount > 0 && (
        <div className="px-4 pb-3">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-content-tertiary">
                <th className="text-left font-normal pb-1">参数</th>
                <th className="text-right font-normal pb-1">当前</th>
                <th className="w-6"></th>
                <th className="text-right font-normal pb-1">文件</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.paramId} className="border-t border-subtle">
                  <td className="py-1 text-content">
                    {p.paramId}
                    {p.info.kind === 'devid' && (
                      <span className="text-content-tertiary">（传感器 ID，锁定该校准）</span>
                    )}
                  </td>
                  <td className="py-1 text-right text-content-secondary">{formatValue(p.currentValue)}</td>
                  <td className="text-center text-content-tertiary">→</td>
                  <td className="py-1 text-right text-amber-400">{formatValue(p.fileValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ValidationBadge({ validation, blockedReason }: { validation: CategoryValidation; blockedReason: string | null }) {
  if (blockedReason === null) {
    return (
      <div className="px-4 pb-3">
        <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-300">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">已验证。</span>传感器 ID 与本飞控匹配，且文件包含非零校准数据。
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="px-4 pb-3">
      <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-300">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="font-medium">无法应用。</span>{blockedReason}。
          {validation.idMismatches.length > 0 && (
            <ul className="mt-1 font-mono text-[11px] text-red-300/80 space-y-0.5">
              {validation.idMismatches.map(m => (
                <li key={m.paramId}>
                  {m.paramId}：文件 {formatValue(m.fileValue)} ≠ 飞控 {formatValue(m.liveValue)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface ResultViewProps {
  result: { applied: number; failed: number; rebootRecommended: boolean };
  onDone: () => void;
}

function ResultView({ result, onDone }: ResultViewProps) {
  const { applied, failed, rebootRecommended } = result;
  const [isRebooting, setIsRebooting] = useState(false);
  const [rebootError, setRebootError] = useState<string | null>(null);

  // Trigger MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN. On SITL the main process
  // detects the connection type and restarts the child process instead
  // (the reboot command would just exit() the simulator). Either way the
  // existing scheduleReconnect machinery brings the link back up.
  const handleReboot = async () => {
    setIsRebooting(true);
    setRebootError(null);
    try {
      const ok = await window.electronAPI?.mavlinkReboot();
      if (!ok) {
        setRebootError('重启命令失败。请检查连接后重试，或从连接面板重启。');
        setIsRebooting(false);
        return;
      }
      // Reboot+reconnect runs in the background; close the dialog so the
      // user can watch the reconnect indicator in the connection panel.
      onDone();
    } catch (err) {
      setRebootError(err instanceof Error ? err.message : '未知错误');
      setIsRebooting(false);
    }
  };

  return (
    <>
      <div className="px-6 py-4 border-b border-subtle">
        <h3 className="text-lg font-semibold text-content">应用完成</h3>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-4">
        {applied > 0 && (
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-300">
              已写入并保存到闪存 {applied} 个校准参数
            </span>
          </div>
        )}
        {failed > 0 && (
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="text-sm text-red-300">
              {failed} 个参数失败（飞控未返回 PARAM_VALUE 确认）
            </span>
          </div>
        )}
        {applied === 0 && failed === 0 && (
          <div className="text-sm text-content-secondary">
            无可应用内容：所选校准参数已与飞行器一致。
          </div>
        )}
        {rebootRecommended && (
          <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-300">
              请重启飞行控制器，确保所有校准值从 EEPROM 干净加载。部分 IMU/罗盘参数仅在启动时生效。
            </div>
          </div>
        )}
        {rebootError && (
          <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm text-red-300">{rebootError}</div>
          </div>
        )}
      </div>
      <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
        <button
          onClick={onDone}
          disabled={isRebooting}
          className="px-4 py-2 text-sm text-content-secondary hover:text-content disabled:text-content-tertiary transition-colors"
        >
          完成
        </button>
        {rebootRecommended && (
          <button
            onClick={handleReboot}
            disabled={isRebooting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-surface-raised disabled:text-content-tertiary text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RotateCw className={`w-4 h-4 ${isRebooting ? 'animate-spin' : ''}`} />
            {isRebooting ? '重启中...' : '立即重启'}
          </button>
        )}
      </div>
    </>
  );
}
