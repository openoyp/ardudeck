import { useCallback, useEffect, useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info, Cpu } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store.js';
import { useConnectionStore } from '../../stores/connection-store.js';
import { useNavigationStore } from '../../stores/navigation-store.js';
import { classifySitlUnsafeParam } from '../../../shared/sitl-unsafe-params.js';
import { formatParamValue } from '../../../shared/parameter-types.js';

/**
 * Global parameter compare/apply modal. Mounted once at App root so it's
 * visible regardless of current view — critical because several flows drive
 * it (manual file load in Parameters view, Vehicle Profile apply in Settings,
 * assistant MCP `propose_parameters`, etc.) and the user would otherwise need
 * to manually navigate to Parameters view just to see the dialog.
 *
 * ParameterTable suppresses its own copy when this root instance exists,
 * except for the reboot-cycle flow which remains Parameters-view-only
 * (power feature, not needed for SITL).
 */
export function ParameterCompareModalRoot() {
  const currentView = useNavigationStore(s => s.currentView);
  // ParameterTable renders its own modal when on Parameters view so we don't
  // duplicate. This root instance covers every other view.
  if (currentView === 'parameters') return null;
  return <CompareModal />;
}

function CompareModal() {
  const showCompareModal = useParameterStore(s => s.showCompareModal);
  const fileParamDiffs = useParameterStore(s => s.fileParamDiffs);
  const fileApplyResult = useParameterStore(s => s.fileApplyResult);
  const fileSkippedCount = useParameterStore(s => s.fileSkippedCount);
  const fileTotalCount = useParameterStore(s => s.fileTotalCount);
  const fileVehicleType = useParameterStore(s => s.fileVehicleType);
  const isApplyingFileParams = useParameterStore(s => s.isApplyingFileParams);
  const applyProgress = useParameterStore(s => s.applyProgress);
  const closeCompareModal = useParameterStore(s => s.closeCompareModal);
  const toggleDiffSelection = useParameterStore(s => s.toggleDiffSelection);
  const selectAllDiffs = useParameterStore(s => s.selectAllDiffs);
  const deselectAllDiffs = useParameterStore(s => s.deselectAllDiffs);
  const applySelectedFileParams = useParameterStore(s => s.applySelectedFileParams);
  const clearFileApplyResult = useParameterStore(s => s.clearFileApplyResult);
  const connectionState = useConnectionStore(s => s.connectionState);

  const handleApply = useCallback(async () => {
    await applySelectedFileParams();
  }, [applySelectedFileParams]);

  const handleSummaryClose = useCallback(() => {
    clearFileApplyResult();
    closeCompareModal();
  }, [clearFileApplyResult, closeCompareModal]);

  const jumpToParameters = useCallback(() => {
    useNavigationStore.getState().setView('parameters');
  }, []);

  if (!showCompareModal) return null;

  return (
    <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-[120]">
      <div className="bg-surface-solid border border-subtle rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[640px] h-[640px] flex flex-col overflow-hidden">
        {fileApplyResult ? (
          <SummaryView
            result={fileApplyResult}
            onClose={handleSummaryClose}
            onGoToParameters={jumpToParameters}
          />
        ) : (
          <CompareView
            diffs={fileParamDiffs}
            skippedCount={fileSkippedCount}
            totalCount={fileTotalCount}
            fileVehicleType={fileVehicleType}
            currentVehicleType={connectionState.vehicleType || connectionState.fcVariant}
            isSitl={!!connectionState.isSitl}
            isApplying={isApplyingFileParams}
            progress={applyProgress}
            onToggle={toggleDiffSelection}
            onSelectAll={selectAllDiffs}
            onDeselectAll={deselectAllDiffs}
            onApply={handleApply}
            onCancel={closeCompareModal}
          />
        )}
      </div>
    </div>
  );
}

interface CompareViewProps {
  diffs: ReturnType<typeof useParameterStore.getState>['fileParamDiffs'];
  skippedCount: number;
  totalCount: number;
  fileVehicleType: string | null;
  currentVehicleType: string | undefined;
  isSitl: boolean;
  isApplying: boolean;
  progress: { applied: number; total: number } | null;
  onToggle: (paramId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onApply: () => void;
  onCancel: () => void;
}

function CompareView({
  diffs, skippedCount, totalCount, fileVehicleType, currentVehicleType, isSitl,
  isApplying, progress, onToggle, onSelectAll, onDeselectAll, onApply, onCancel,
}: CompareViewProps) {
  // SITL-safe mode: filter out hardware-identity / hardware-bus params that
  // would crash a simulated FC (HAL panic on unmodeled peripheral registers).
  // Defaults ON when the active connection is a SITL target. User can disable
  // it to override and show / select all params anyway.
  const [safeMode, setSafeMode] = useState(isSitl);
  // Sync defaults when the modal is reopened against a different connection.
  useEffect(() => { setSafeMode(isSitl); }, [isSitl]);

  // Classify each diff once. paramId+fileValue uniquely determine the verdict.
  const unsafeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of diffs) {
      const verdict = classifySitlUnsafeParam(d.paramId, d.fileValue);
      if (verdict) m.set(d.paramId, verdict.reason);
    }
    return m;
  }, [diffs]);

  // When SITL-safe mode is on, deselect any unsafe rows that may already be
  // selected (e.g., from a prior pass with safe mode off, or from the store's
  // default-everything-selected state). Runs whenever the diff set changes
  // or safe mode flips on.
  useEffect(() => {
    if (!safeMode) return;
    for (const d of diffs) {
      if (d.selected && unsafeMap.has(d.paramId)) {
        onToggle(d.paramId);
      }
    }
  }, [safeMode, diffs, unsafeMap, onToggle]);

  const visibleDiffs = safeMode ? diffs.filter(d => !unsafeMap.has(d.paramId)) : diffs;
  const hiddenUnsafeCount = diffs.length - visibleDiffs.length;
  const selectedCount = visibleDiffs.filter(d => d.selected).length;
  return (
    <>
      <div className="px-6 py-4 border-b border-subtle">
        <h3 className="text-lg font-semibold text-content">确认参数更改</h3>
        <p className="text-sm text-content-secondary mt-1">
          {diffs.length === 0
            ? '未发现差异：所有参数已与飞行器一致。'
            : `${diffs.length} 个参数将被更改，请选择要应用的参数。`}
        </p>
        {fileVehicleType && currentVehicleType && fileVehicleType !== currentVehicleType && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs text-amber-300">
              来源机型 <span className="font-semibold">{fileVehicleType}</span> 与当前连接的机型 <span className="font-semibold">{currentVehicleType}</span> 不一致
            </span>
          </div>
        )}
        {skippedCount > 0 && (
          <p className="text-xs text-content-secondary mt-2">
            共 {totalCount} 个：{totalCount - skippedCount} 个与飞行器匹配，{skippedCount} 个已跳过（此固件中不存在）
          </p>
        )}
        {isSitl && unsafeMap.size > 0 && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <Cpu className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <div className="text-blue-300">
                {safeMode
                  ? `SITL 安全模式隐藏了 ${unsafeMap.size} 个可能导致模拟器崩溃的硬件标识参数。`
                  : `下方 ${unsafeMap.size} 个参数被标记为仅硬件参数，重启后可能导致 SITL 崩溃。`}
              </div>
              <button
                onClick={() => setSafeMode(v => !v)}
                className="mt-1 text-blue-400 hover:text-blue-300 underline transition-colors"
              >
                {safeMode ? '显示全部（忽略警告）' : '重新启用 SITL 安全模式'}
              </button>
            </div>
          </div>
        )}
      </div>

      {diffs.length > 0 && (
        <>
          <div className="px-6 py-2 border-b border-subtle flex items-center gap-3">
            <button onClick={onSelectAll} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">全选</button>
            <span className="text-content-tertiary">|</span>
            <button onClick={onDeselectAll} className="text-xs text-content-secondary hover:text-content transition-colors">取消全选</button>
            <span className="ml-auto text-xs text-content-secondary">
              已选 {selectedCount} / {visibleDiffs.length}{hiddenUnsafeCount > 0 ? `（已隐藏 ${hiddenUnsafeCount} 个仅硬件参数）` : ''}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-auto px-6 py-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-content-secondary uppercase">
                  <th className="pb-2 w-8"></th>
                  <th className="pb-2">参数</th>
                  <th className="pb-2 text-right">当前</th>
                  <th className="pb-2 text-center w-8"></th>
                  <th className="pb-2">目标</th>
                  <th className="pb-2 pl-3">原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {visibleDiffs.map(diff => {
                  const unsafeReason = unsafeMap.get(diff.paramId);
                  return (
                    <tr
                      key={diff.paramId}
                      onClick={() => onToggle(diff.paramId)}
                      className={`cursor-pointer transition-colors ${diff.selected ? 'hover:bg-surface-overlay-subtle' : 'opacity-50 hover:opacity-75'}`}
                    >
                      <td className="py-2 pr-2">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          diff.selected ? 'bg-blue-500/30 border-blue-500/50' : 'border-subtle bg-surface'
                        }`}>
                          {diff.selected && (
                            <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td className="py-2 font-mono text-content">
                        {diff.paramId}
                        {unsafeReason && (
                          <span
                            className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide font-medium bg-red-500/15 text-red-400 border border-red-500/30"
                            title={`SITL 不安全：${unsafeReason}。应用后可能导致模拟器崩溃。`}
                          >
                            仅硬件
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-content-secondary">{formatParamValue(diff.currentValue)}</td>
                      <td className="py-2 text-center text-content-tertiary">
                        <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </td>
                      <td className="py-2 font-mono text-amber-400">{formatParamValue(diff.fileValue)}</td>
                      <td className="py-2 pl-3 text-xs text-content-secondary truncate max-w-[200px]" title={unsafeReason ?? diff.note}>
                        {unsafeReason ?? diff.note ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {isApplying && progress && (
        <div className="px-6 py-2 border-t border-subtle">
          <div className="flex items-center justify-between text-xs text-content-secondary mb-1">
            <span>正在写入参数...</span>
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
          onClick={onCancel}
          disabled={isApplying}
          className="px-4 py-2 text-sm text-content-secondary hover:text-content disabled:text-content-tertiary transition-colors"
        >
          {diffs.length === 0 ? '关闭' : '取消'}
        </button>
        {diffs.length > 0 && (
          <button
            onClick={onApply}
            disabled={isApplying || selectedCount === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-surface-raised text-white disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors"
          >
            {isApplying ? '写入中...' : `应用 ${selectedCount} 个参数`}
          </button>
        )}
      </div>
    </>
  );
}

interface SummaryViewProps {
  result: NonNullable<ReturnType<typeof useParameterStore.getState>['fileApplyResult']>;
  onClose: () => void;
  onGoToParameters: () => void;
}

function SummaryView({ result, onClose, onGoToParameters }: SummaryViewProps) {
  return (
    <>
      <div className="px-6 py-4 border-b border-subtle">
        <h3 className="text-lg font-semibold text-content">应用结果</h3>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-300">
            {result.applied} 个参数已应用
          </span>
        </div>
        {result.failed > 0 && (
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="text-sm text-red-300">
              {result.failed} 个参数失败
            </span>
          </div>
        )}
        {/* Applied means sent and acknowledged, not yet committed to the FC's
            permanent storage. Without saying so the values look final here and
            then quietly revert on the next power cycle. */}
        {result.applied > 0 && (
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-sm text-amber-300">
                尚未永久保存
              </span>
              <p className="text-xs text-content-secondary mt-1">
                飞行器当前已在使用{result.applied === 1 ? '该值' : '这些值'}，但在你于参数页面
                按下 <span className="text-content font-medium">写入闪存</span> 之前，
                下次重启后将回退。
              </p>
              <button
                onClick={onGoToParameters}
                className="mt-2 text-xs text-amber-300 underline hover:text-amber-200"
              >
                前往参数页面保存
              </button>
            </div>
          </div>
        )}
        {result.rebootRequired.length > 0 && (
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-sm text-amber-300">
                {result.rebootRequired.length} 个参数需要重启才能生效：
              </span>
              <p className="font-mono text-xs text-amber-400/70 mt-1 break-words">
                {result.rebootRequired.join(', ')}
              </p>
              <button
                onClick={onGoToParameters}
                className="mt-2 text-xs text-amber-300 underline hover:text-amber-200"
              >
                前往参数页面写入并重启
              </button>
            </div>
          </div>
        )}
        {result.skippedParams.length > 0 && (
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-sm text-blue-300">
                {result.skippedParams.length} 个参数在此固件中不存在：
              </span>
              <p className="font-mono text-xs text-blue-400/70 mt-1 break-words">
                {result.skippedParams.map(p => p.id).join(', ')}
              </p>
              <p className="text-xs text-content-secondary mt-1">
                重启后这些参数可能会变为可用
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          完成
        </button>
      </div>
    </>
  );
}

