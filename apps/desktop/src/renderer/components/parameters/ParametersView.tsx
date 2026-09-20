/**
 * Parameters View - Full parameter management
 * Routes to protocol-specific config views:
 * - MSP: Betaflight/iNav config (MspConfigView)
 * - MAVLink: ArduPilot config (MavlinkConfigView)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, RotateCw, Loader2, Star, Check } from 'lucide-react';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore, type SortColumn, type FileParamDiff } from '../../stores/parameter-store';
import { useQuickSetupStore } from '../../stores/quick-setup-store';
import { useSettingsStore } from '../../stores/settings-store';
import { NON_DEFAULT_COLORS, getNonDefaultColor } from './non-default-palette';
import { getParamTypeName, formatParamValue } from '../../../shared/parameter-types';
import { PARAMETER_GROUPS } from '../../../shared/parameter-groups';
import { MspConfigView } from './MspConfigView';
import MavlinkConfigView from '../mavlink-config/MavlinkConfigView';
import { LegacyConfigView } from '../legacy-config';

// Simple toast notification state
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  message: string;
  type: ToastType;
}

// Sort indicator component
function SortIndicator({ column, currentColumn, direction }: {
  column: SortColumn;
  currentColumn: SortColumn;
  direction: 'asc' | 'desc';
}) {
  const isActive = column === currentColumn;
  return (
    <span className={`ml-1 inline-block transition-transform ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
      {direction === 'asc' || !isActive ? (
        <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </span>
  );
}

// Static Tailwind color map - dynamic class names get purged so we map them explicitly
const GROUP_COLOR_CLASSES: Record<string, { active: string; badge: string; icon: string }> = {
  blue:    { active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',       badge: 'bg-blue-500/30 text-blue-300',    icon: 'text-blue-400' },
  green:   { active: 'bg-green-500/20 text-green-400 border-green-500/30',     badge: 'bg-green-500/30 text-green-300',   icon: 'text-green-400' },
  orange:  { active: 'bg-orange-500/20 text-orange-400 border-orange-500/30',   badge: 'bg-orange-500/30 text-orange-300',  icon: 'text-orange-400' },
  red:     { active: 'bg-red-500/20 text-red-400 border-red-500/30',       badge: 'bg-red-500/30 text-red-300',    icon: 'text-red-400' },
  purple:  { active: 'bg-purple-500/20 text-purple-400 border-purple-500/30',   badge: 'bg-purple-500/30 text-purple-300',  icon: 'text-purple-400' },
  cyan:    { active: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',      badge: 'bg-cyan-500/30 text-cyan-300',    icon: 'text-cyan-400' },
  emerald: { active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', badge: 'bg-emerald-500/30 text-emerald-300', icon: 'text-emerald-400' },
  indigo:  { active: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',   badge: 'bg-indigo-500/30 text-indigo-300',  icon: 'text-indigo-400' },
  teal:    { active: 'bg-teal-500/20 text-teal-400 border-teal-500/30',      badge: 'bg-teal-500/30 text-teal-300',    icon: 'text-teal-400' },
  yellow:  { active: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',   badge: 'bg-yellow-500/30 text-yellow-300',  icon: 'text-yellow-400' },
  sky:     { active: 'bg-sky-500/20 text-sky-400 border-sky-500/30',       badge: 'bg-sky-500/30 text-sky-300',    icon: 'text-sky-400' },
  amber:   { active: 'bg-amber-500/20 text-amber-400 border-amber-500/30',    badge: 'bg-amber-500/30 text-amber-300',   icon: 'text-amber-400' },
};

export function ParametersView() {
  const { connectionState, platformChangeInProgress } = useConnectionStore();
  const { isOpen: quickSetupOpen, isApplying: quickSetupApplying } = useQuickSetupStore();

  // Keep view mounted during any operation that causes temporary disconnection
  const keepViewMounted = platformChangeInProgress || quickSetupOpen || quickSetupApplying;
  const {
    parameters,
    isLoading,
    progress,
    error,
    lastRefresh,
    searchQuery,
    selectedGroup,
    showOnlyModified,
    sortColumn,
    sortDirection,
    filteredParameters,
    fetchParameters,
    setParameter,
    setSearchQuery,
    setSelectedGroup,
    toggleShowOnlyModified,
    toggleSort,
    revertParameter,
    modifiedCount,
    modifiedParameters,
    markAllAsSaved,
    commitStagedParams,
    groupCounts,
    getDescription,
    hasOfficialDescription,
    validateParameter,
    getParameterMetadata,
    isRebootRequired,
    isFavourite,
    toggleFavourite,
    showOnlyFavourites,
    toggleShowOnlyFavourites,
    favouriteCount,
    showOnlyNonDefault,
    toggleShowOnlyNonDefault,
    nonDefaultCount: nonDefaultCountFn,
    hasDefaults: hasDefaultsFn,
    // File compare
    showCompareModal,
    fileParamDiffs,
    fileSkippedCount,
    fileTotalCount,
    fileVehicleType,
    isApplyingFileParams,
    applyProgress,
    loadFileForCompare,
    closeCompareModal,
    toggleDiffSelection,
    selectAllDiffs,
    deselectAllDiffs,
    applySelectedFileParams,
    // Offline mode
    offlineMode,
    offlineFilePath,
    offlineVehicleType,
    offlineHasUnsavedChanges,
    loadOfflineFile,
    saveOfflineFile,
    saveOfflineFileAs,
    setOfflineVehicleType,
    closeOfflineMode,
  } = useParameterStore();

  const nonDefaultColorKey = useSettingsStore((s) => s.nonDefaultHighlightColor);
  const setNonDefaultHighlightColor = useSettingsStore((s) => s.setNonDefaultHighlightColor);
  const nonDefaultColor = getNonDefaultColor(nonDefaultColorKey);

  const [editingParam, setEditingParam] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editWarning, setEditWarning] = useState<string | null>(null);

  const [isWritingFlash, setIsWritingFlash] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [showWriteConfirm, setShowWriteConfirm] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rebootRequiredParams, setRebootRequiredParams] = useState<string[]>([]);
  const [rebooting, setRebooting] = useState(false);
  const pendingParamRefresh = useRef(false);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
  const saveDropdownRef = useRef<HTMLDivElement>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Close save dropdown on outside click
  useEffect(() => {
    if (!saveDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (saveDropdownRef.current && !saveDropdownRef.current.contains(e.target as Node)) {
        setSaveDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [saveDropdownOpen]);

  // Close color picker on outside click
  useEffect(() => {
    if (!colorPickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [colorPickerOpen]);

  // Auto-hide toast after 3 seconds
  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchParameters();
  }, [fetchParameters]);

  const handleWriteToFlashClick = useCallback(() => {
    // Show confirmation dialog
    setShowWriteConfirm(true);
  }, []);

  const handleWriteToFlashConfirm = useCallback(async () => {
    setShowWriteConfirm(false);
    setIsWritingFlash(true);
    try {
      // Auto-checkpoint before writing to flash
      const modified = modifiedParameters();
      if (modified.length > 0) {
        const boardUid = connectionState.boardUid || `mavlink-${connectionState.systemId ?? 0}`;
        const boardName = connectionState.vehicleType || 'Unknown';
        const vehicleType = connectionState.vehicleType || connectionState.fcVariant;
        await window.electronAPI?.saveParamCheckpoint(boardUid, boardName,
          modified.map(p => ({ paramId: p.id, oldValue: p.originalValue ?? p.value, newValue: p.value })),
          vehicleType
        );
      }

      // PX4 persists PARAM_SET immediately, so the staged edits are sent here
      // (post-confirm) instead of asking the FC to flush RAM to flash.
      const result = connectionState.firmware === 'px4'
        ? await commitStagedParams().then(r => r.failed.length === 0
            ? { success: true as const }
            : { success: false as const, error: `写入 ${r.failed.join(', ')} 失败` })
        : await window.electronAPI?.writeParamsToFlash();
      if (result?.success) {
        // Check if any written params require a reboot
        const rebootParams = modified.filter(p => isRebootRequired(p.id)).map(p => p.id);
        if (rebootParams.length > 0) {
          setRebootRequiredParams(rebootParams);
        }

        markAllAsSaved();
        showToast('参数已成功保存到闪存', 'success');
      } else {
        showToast(result?.error ?? '写入闪存失败', 'error');
      }
    } catch {
      showToast('写入闪存失败', 'error');
    } finally {
      setIsWritingFlash(false);
    }
  }, [markAllAsSaved, showToast, modifiedParameters, connectionState, isRebootRequired, commitStagedParams]);

  const handleReboot = useCallback(async () => {
    setRebooting(true);
    try {
      const success = await window.electronAPI?.mavlinkReboot();
      if (success) {
        if (rebootRequiredParams.length > 0) {
          pendingParamRefresh.current = true;
        } else {
          showToast('正在重启飞行控制器...', 'info');
        }
      } else {
        setRebooting(false);
        showToast('发送重启命令失败', 'error');
      }
    } catch {
      setRebooting(false);
      showToast('重启飞行控制器失败', 'error');
    }
  }, [showToast, rebootRequiredParams]);

  // Watch for reconnection completion after a reboot we initiated
  useEffect(() => {
    if (!pendingParamRefresh.current) return;
    if (connectionState.isConnected && !connectionState.isReconnecting) {
      pendingParamRefresh.current = false;
      setRebooting(false);
      setRebootRequiredParams([]);
      showToast('重启完成', 'success');
    }
  }, [connectionState.isConnected, connectionState.isReconnecting, showToast]);

  const handleSaveToFile = useCallback(async (mode: 'all' | 'changed' | 'nondefault') => {
    setIsSavingFile(true);
    setSaveDropdownOpen(false);
    try {
      const allParams = Array.from(parameters.values());
      let filtered;
      if (mode === 'changed') {
        filtered = allParams.filter(p => !p.isReadOnly && p.isModified);
      } else if (mode === 'nondefault') {
        filtered = allParams.filter(p => !p.isReadOnly && p.defaultValue !== undefined && Math.fround(p.value) !== Math.fround(p.defaultValue));
      } else {
        filtered = allParams.filter(p => !p.isReadOnly);
      }

      const params = filtered
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(p => ({ id: p.id, value: p.value }));

      if (params.length === 0) {
        const labels = { all: '没有可保存的参数', changed: '没有已修改的参数可保存', nondefault: '没有非默认参数可保存' };
        showToast(labels[mode], 'info');
        return;
      }

      const vehicleType = connectionState.vehicleType || connectionState.fcVariant;
      const result = await window.electronAPI?.saveParamsToFile(params, vehicleType);
      if (result?.success) {
        showToast(`已保存 ${params.length} 个参数到文件`, 'success');
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast(result.error, 'error');
      }
    } finally {
      setIsSavingFile(false);
    }
  }, [parameters, connectionState.vehicleType, connectionState.fcVariant, showToast]);

  const handleLoadFromFile = useCallback(async () => {
    setIsLoadingFile(true);
    try {
      const result = await window.electronAPI?.loadParamsFromFile();
      if (result?.success && result.params) {
        // Load file params for comparison - do NOT auto-set on vehicle
        loadFileForCompare(result.params, result.vehicleType);
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast(result.error, 'error');
      }
    } finally {
      setIsLoadingFile(false);
    }
  }, [loadFileForCompare, showToast]);

  const handleApplySelectedParams = useCallback(async () => {
    const result = await applySelectedFileParams();
    if (result.applied > 0) {
      showToast(`已应用 ${result.applied} 个参数到飞行器${result.failed > 0 ? `（${result.failed} 个失败）` : ''}${result.applied > 0 ? ' — 请执行"写入闪存"以在重启后保留更改' : ''}`, result.failed > 0 ? 'info' : 'success');
    } else if (result.failed > 0) {
      showToast(`应用 ${result.failed} 个参数失败`, 'error');
    }
  }, [applySelectedFileParams, showToast]);

  // Offline mode handlers
  const handleOpenOfflineFile = useCallback(async () => {
    const success = await loadOfflineFile();
    if (!success) {
      // Cancelled or failed - no toast needed for cancel
    }
  }, [loadOfflineFile]);

  const handleOfflineSave = useCallback(async () => {
    const success = await saveOfflineFile();
    if (success) {
      showToast('参数已保存到文件', 'success');
    }
  }, [saveOfflineFile, showToast]);

  const handleOfflineSaveAs = useCallback(async () => {
    const success = await saveOfflineFileAs();
    if (success) {
      showToast('参数已保存到文件', 'success');
    }
  }, [saveOfflineFileAs, showToast]);

  const handleOfflineCompare = useCallback(async () => {
    const result = await window.electronAPI?.loadParamsFromFile();
    if (result?.success && result.params) {
      loadFileForCompare(result.params, result.vehicleType);
    }
  }, [loadFileForCompare]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, [setSearchQuery]);

  const startEdit = useCallback((paramId: string, currentValue: number) => {
    setEditingParam(paramId);
    setEditValue(String(currentValue));
    setEditError(null);
    setEditWarning(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingParam(null);
    setEditValue('');
    setEditError(null);
    setEditWarning(null);
  }, []);

  // Strict number validation - rejects "0c", "1.2.3", etc.
  const isValidNumberString = useCallback((str: string): boolean => {
    const trimmed = str.trim();
    if (trimmed === '') return false;
    // Use Number() which is stricter than parseFloat()
    // parseFloat("0c") = 0, but Number("0c") = NaN
    return !isNaN(Number(trimmed)) && isFinite(Number(trimmed));
  }, []);

  const handleEditChange = useCallback((paramId: string, value: string) => {
    setEditValue(value);
    if (!isValidNumberString(value)) {
      setEditError('无效的数字');
      setEditWarning(null);
    } else {
      const numValue = Number(value.trim());
      const result = validateParameter(paramId, numValue);
      setEditError(result.error ?? null);
      setEditWarning(result.warning ?? null);
    }
  }, [validateParameter, isValidNumberString]);

  const saveEdit = useCallback(async (paramId: string) => {
    if (!isValidNumberString(editValue)) {
      setEditError('无效的数字');
      return;
    }
    const newValue = Number(editValue.trim());
    // Validate before saving
    const result = validateParameter(paramId, newValue);
    if (!result.valid) {
      setEditError(result.error ?? '无效的值');
      return;
    }
    await setParameter(paramId, newValue);
    cancelEdit();
  }, [editValue, setParameter, cancelEdit, validateParameter]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, paramId: string) => {
    if (e.key === 'Enter') {
      saveEdit(paramId);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }, [saveEdit, cancelEdit]);

  // Show Legacy CLI config for F3 boards (iNav < 2.1, Betaflight < 4.0)
  if (connectionState.isConnected && connectionState.protocol === 'msp' && connectionState.isLegacyBoard) {
    return <LegacyConfigView />;
  }

  // Show MSP config for modern Betaflight/iNav boards
  // Keep showing during any operation that causes temp disconnection (platform change, quick setup, etc.)
  if ((connectionState.isConnected && connectionState.protocol === 'msp') || keepViewMounted) {
    return <MspConfigView />;
  }

  // Show MAVLink config for ArduPilot/PX4 boards
  if (connectionState.isConnected && connectionState.protocol === 'mavlink') {
    return <MavlinkConfigView />;
  }

  if (!connectionState.isConnected && !keepViewMounted && !offlineMode) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-subtle flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>

          <h2 className="text-2xl font-semibold text-content mb-3">
            配置
          </h2>
          <p className="text-content-secondary mb-6 leading-relaxed">
            连接飞行控制器以配置你的飞行器，
            或打开参数文件离线查看和编辑。
          </p>

          <button
            onClick={handleOpenOfflineFile}
            className="w-full mb-4 px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 border-blue-500/20 hover:border-blue-500/30"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
            打开参数文件
          </button>

          <div className="p-4 rounded-xl bg-surface border-subtle text-left">
            <h3 className="text-sm font-medium text-content mb-2">你可以：</h3>
            <ul className="text-xs text-content-secondary space-y-1">
              <li>- <span className="text-content-secondary">ArduPilot/PX4：</span> 完整的参数管理</li>
              <li>- <span className="text-content-secondary">Betaflight/iNav：</span> PID 调参、角速率、飞行模式</li>
              <li>- <span className="text-content-secondary">离线：</span> 查看、编辑和比较 .param 文件</li>
              <li>- 搜索、筛选并校验编辑</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const displayParams = filteredParameters();
  const paramCount = parameters.size;
  const modified = modifiedCount();
  const nonDefaultCount = nonDefaultCountFn();
  const hasDefaults = hasDefaultsFn();

  return (
    <div className="h-full flex flex-col">
      {/* Offline mode banner */}
      {offlineMode && (
        <div className="shrink-0 px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 flex items-center gap-3">
          <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm text-blue-300 truncate flex-1" title={offlineFilePath ?? undefined}>
            {offlineFilePath ? offlineFilePath.split('/').pop()?.split('\\').pop() : '未命名'}
            {offlineHasUnsavedChanges && <span className="text-yellow-400 ml-1">*</span>}
          </span>
          <select
            value={offlineVehicleType ?? ''}
            onChange={(e) => setOfflineVehicleType(e.target.value)}
            className="text-xs text-content bg-surface border-subtle px-2 py-1 rounded cursor-pointer focus:outline-none focus:border-blue-500/50"
            title="机型（用于参数描述与校验）"
          >
            <option value="">机型</option>
            <option value="Copter">多旋翼（Copter）</option>
            <option value="Plane">固定翼（Plane）</option>
            <option value="Rover">地面车（Rover）</option>
            <option value="Sub">潜航器（Sub）</option>
            <option value="Tracker">天线跟踪（Tracker）</option>
          </select>
          <button
            onClick={closeOfflineMode}
            className="text-xs text-content-secondary hover:text-content transition-colors"
            title="关闭文件"
          >
            关闭
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="shrink-0 px-4 py-3 border-b border-subtle bg-surface">
        <div className="flex items-center gap-2">
          {offlineMode ? (<>
            {/* Offline toolbar: Save, Save As, Open, Compare */}
            <button
              onClick={handleOfflineSave}
              disabled={!offlineHasUnsavedChanges}
              className="px-3 py-2 bg-green-500/20 hover:bg-green-500/30 disabled:bg-surface-raised text-green-400 disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title="保存到当前文件"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              保存
            </button>

            <button
              onClick={handleOfflineSaveAs}
              className="px-3 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title="保存到新文件"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              另存为
            </button>

            <div className="w-px h-6 bg-surface-raised mx-1" />

            <button
              onClick={handleOpenOfflineFile}
              className="px-3 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title="打开另一个参数文件"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
              </svg>
              打开
            </button>

            <button
              onClick={handleOfflineCompare}
              disabled={paramCount === 0}
              className="px-3 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title="与另一个参数文件比较"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              比较
            </button>
          </>) : (<>
            {/* Connected toolbar */}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-surface-raised text-blue-400 disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title="从飞行控制器下载参数"
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isLoading ? '下载中...' : '刷新'}
            </button>

            {/* Write to Flash button - only show if there are modified params */}
            {modified > 0 && (
              <button
                onClick={handleWriteToFlashClick}
                disabled={isWritingFlash}
                className="px-3 py-2 bg-green-500/20 hover:bg-green-500/30 disabled:bg-surface-raised text-green-400 disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                title="将参数保存到飞行控制器的永久存储（EEPROM）"
              >
                <svg className={`w-4 h-4 ${isWritingFlash ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {isWritingFlash ? '写入中...' : '写入闪存'}
              </button>
            )}

            <div className="w-px h-6 bg-surface-raised mx-1" />

            {/* File operations - split Save button with dropdown */}
            <div className="relative" ref={saveDropdownRef}>
              <div className="flex">
                <button
                  onClick={() => handleSaveToFile('all')}
                  disabled={isSavingFile || paramCount === 0}
                  className="px-3 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-l-lg text-sm font-medium transition-colors flex items-center gap-2"
                  title="保存所有参数到文件"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {isSavingFile ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => setSaveDropdownOpen(prev => !prev)}
                  disabled={isSavingFile || paramCount === 0}
                  className="px-1.5 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-r-lg border-l border/30 text-sm transition-colors"
                  title="保存选项"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {saveDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-surface-solid border-subtle rounded-lg shadow-xl z-50 py-1">
                  <button
                    onClick={() => handleSaveToFile('all')}
                    className="w-full px-3 py-2 text-left text-sm text-content hover:bg-surface-raised transition-colors"
                  >
                    保存所有参数
                  </button>
                  <button
                    onClick={() => handleSaveToFile('changed')}
                    disabled={modified === 0}
                    className="w-full px-3 py-2 text-left text-sm text-content hover:bg-surface-raised disabled:text-content-tertiary disabled:hover:bg-transparent transition-colors"
                  >
                    仅保存已修改
                    {modified > 0 && <span className="ml-1 text-xs text-yellow-400">({modified})</span>}
                  </button>
                  <button
                    onClick={() => handleSaveToFile('nondefault')}
                    disabled={!hasDefaults}
                    className="w-full px-3 py-2 text-left text-sm text-content hover:bg-surface-raised disabled:text-content-tertiary disabled:hover:bg-transparent transition-colors"
                    title={!hasDefaults ? '默认值不可用 — 需要 MAVLink FTP' : undefined}
                  >
                    仅保存非默认
                    {hasDefaults && nonDefaultCount > 0 && <span className="ml-1 text-xs text-purple-400">({nonDefaultCount})</span>}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleLoadFromFile}
              disabled={isLoadingFile}
              className="px-3 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title="从文件加载参数"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {isLoadingFile ? '加载中...' : '加载'}
            </button>
          </>)}

          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="搜索参数...（支持正则）"
              className="w-full max-w-md px-4 py-2 pl-10 bg-surface border-subtle rounded-lg text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500/50"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {favouriteCount() > 0 && (
            <button
              onClick={toggleShowOnlyFavourites}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showOnlyFavourites
                  ? 'bg-yellow-500/30 text-yellow-300 ring-1 ring-yellow-500/50'
                  : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
              }`}
              title={showOnlyFavourites ? '显示所有参数' : '仅显示收藏的参数'}
            >
              <Star className={`w-3 h-3 ${showOnlyFavourites ? 'fill-yellow-300' : ''}`} />
              {favouriteCount()} 个收藏
            </button>
          )}

          {modified > 0 && (
            <button
              onClick={toggleShowOnlyModified}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showOnlyModified
                  ? 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50'
                  : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              }`}
              title={showOnlyModified ? '显示所有参数' : '仅显示已修改的参数'}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {modified} 个已修改
            </button>
          )}

          {hasDefaults && nonDefaultCount > 0 && (
            <div ref={colorPickerRef} className="relative flex items-center rounded-full bg-surface-overlay-subtle ring-1 ring-subtle">
              <button
                onClick={toggleShowOnlyNonDefault}
                className={`pl-3 pr-2 py-1 rounded-l-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  showOnlyNonDefault
                    ? 'bg-surface-raised text-content ring-1 ring-subtle'
                    : 'text-content-secondary hover:bg-surface-raised hover:text-content'
                }`}
                title={showOnlyNonDefault ? '显示所有参数' : '仅显示非默认参数'}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${nonDefaultColor.swatchClass}`} />
                {nonDefaultCount} 个非默认
              </button>
              <button
                onClick={() => setColorPickerOpen((o) => !o)}
                className="pl-1.5 pr-2 py-1 rounded-r-full text-content-secondary hover:text-content hover:bg-surface-raised transition-colors flex items-center gap-1 border-l border-subtle/60"
                title="选择高亮颜色"
                aria-haspopup="menu"
                aria-expanded={colorPickerOpen}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {colorPickerOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1.5 z-30 w-44 rounded-lg bg-surface-solid border border-strong shadow-lg p-2"
                >
                  <div className="px-1.5 pb-1.5 text-[10px] uppercase tracking-wider text-content-tertiary">高亮颜色</div>
                  <div className="grid grid-cols-4 gap-1">
                    {NON_DEFAULT_COLORS.map((c) => {
                      const active = c.key === nonDefaultColorKey;
                      return (
                        <button
                          key={c.key}
                          onClick={() => { setNonDefaultHighlightColor(c.key); setColorPickerOpen(false); }}
                          className={`relative h-7 rounded-md ${c.swatchClass} transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-surface-solid focus:ring-white/40 ${active ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-surface-solid' : ''}`}
                          title={c.label}
                          aria-label={c.label}
                        >
                          {active && <Check className="w-3.5 h-3.5 text-white absolute inset-0 m-auto drop-shadow" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {isLoading && progress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-content-secondary mb-1">
              <span>正在下载参数...</span>
              <span>{progress.received} / {progress.total} ({progress.percentage}%)</span>
            </div>
            <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-150"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-3 px-3 py-2 bg-red-500/10 border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Group tabs */}
      {paramCount > 0 && (
        <div className="shrink-0 px-4 py-2 border-b border-subtle bg-surface-overlay-subtle overflow-x-auto">
          <div className="flex gap-1">
            {PARAMETER_GROUPS.map((group) => {
              const count = groupCounts().get(group.id) ?? 0;
              const isActive = selectedGroup === group.id;
              // Don't show groups with 0 parameters (except 'all')
              if (group.id !== 'all' && count === 0) return null;

              const colors = GROUP_COLOR_CLASSES[group.color] ?? GROUP_COLOR_CLASSES.blue!;
              return (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? colors.active
                      : 'text-content-secondary hover:text-content hover:bg-surface'
                  }`}
                  title={group.description}
                >
                  <svg className={`w-3.5 h-3.5 ${colors.icon}${isActive ? '' : ' opacity-50'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={group.icon} />
                  </svg>
                  {group.name}
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive ? colors.badge : 'bg-surface-raised text-content-secondary'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Reboot Required Banner - only when connected to FC */}
      {!offlineMode && rebootRequiredParams.length > 0 && (
        <div className={`shrink-0 px-4 py-2.5 border-b flex items-center justify-between ${
          rebooting
            ? 'bg-blue-500/10 border-blue-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-2.5">
            {rebooting ? (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            {rebooting ? (
              <span className="text-sm text-blue-300">
                {connectionState.isReconnecting
                  ? '正在重新连接飞行控制器...'
                  : '正在重启飞行控制器...'}
                {connectionState.isReconnecting && connectionState.reconnectAttempt != null && (
                  <span className="text-blue-400/70 ml-2">
                    尝试 {connectionState.reconnectAttempt}{connectionState.reconnectMaxAttempts ? ` / ${connectionState.reconnectMaxAttempts}` : ''}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-sm text-amber-300">
                {rebootRequiredParams.length} 个参数需要重启才能生效：
                {' '}<span className="font-mono text-xs text-amber-400/70">{rebootRequiredParams.join(', ')}</span>
              </span>
            )}
          </div>
          {!rebooting && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setRebootRequiredParams([])}
                className="px-2.5 py-1 text-xs text-content-secondary hover:text-content transition-colors"
              >
                忽略
              </button>
              <button
                onClick={handleReboot}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/30 transition-colors flex items-center gap-1.5"
              >
                <RotateCw className="w-3 h-3" />
                立即重启
              </button>
            </div>
          )}
        </div>
      )}

      {/* Parameter table */}
      <div className="flex-1 overflow-auto">
        {paramCount === 0 && !isLoading ? (
          <div className="h-full flex items-center justify-center text-content-secondary">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <p className="text-lg mb-2">正在加载参数...</p>
              <p className="text-sm text-content-tertiary">连接后将自动下载参数</p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface backdrop-blur border-b border-subtle">
              <tr className="text-left text-xs text-content-secondary uppercase tracking-wider">
                <th className="px-4 py-3 font-medium w-[220px]">
                  <button
                    onClick={() => toggleSort('name')}
                    className="group flex items-center hover:text-content transition-colors"
                  >
                    名称
                    <SortIndicator column="name" currentColumn={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium w-[200px]">
                  <button
                    onClick={() => toggleSort('status')}
                    className="group flex items-center hover:text-content transition-colors"
                  >
                    值
                    <SortIndicator column="status" currentColumn={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium w-[80px]">类型</th>
                <th className="px-4 py-3 font-medium">描述</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle/30">
              {displayParams.map((param) => {
                const isNonDefault = !param.isReadOnly && (
                  param.defaultValue !== undefined
                    ? Math.fround(param.value) !== Math.fround(param.defaultValue)
                    : param.isModified
                );
                return (
                <tr
                  key={param.id}
                  className="hover:bg-surface-overlay-subtle transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavourite(param.id); }}
                        className="shrink-0 p-0.5 rounded transition-colors hover:bg-surface-raised"
                        title={isFavourite(param.id) ? '取消收藏' : '添加收藏'}
                      >
                        <Star className={`w-3.5 h-3.5 ${isFavourite(param.id) ? 'fill-yellow-400 text-yellow-400' : 'text-content-tertiary hover:text-content-secondary'}`} />
                      </button>
                      <span className="font-mono text-sm text-content">{param.id}</span>
                      {isRebootRequired(param.id) && (
                        <span className="px-1 py-0.5 text-[9px] leading-none bg-amber-500/15 text-amber-500/70 rounded border-amber-500/20" title="需要重启才能生效">
                          需重启
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {param.isReadOnly ? (
                        <span className="font-mono text-sm text-content-secondary tabular-nums" title="只读参数">
                          {formatParamValue(param.value)}
                        </span>
                      ) : editingParam === param.id ? (
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => handleEditChange(param.id, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, param.id)}
                            onBlur={() => !editError && saveEdit(param.id)}
                            autoFocus
                            className={`w-full px-2 py-1 bg-surface-raised border rounded text-sm font-mono text-content focus:outline-none ${
                              editError ? 'border-red-500/50' : editWarning ? 'border-amber-500/50' : 'border-blue-500/50'
                            }`}
                          />
                          {(editError || editWarning) && (
                            <div className={`absolute left-0 top-full mt-1 px-2 py-1 text-xs rounded shadow-lg z-10 max-w-xs ${
                              editError ? 'bg-red-900/90 text-red-300' : 'bg-amber-900/90 text-amber-300'
                            }`}>
                              {editError || editWarning}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(param.id, param.value)}
                          className={`font-mono text-sm ${isNonDefault ? nonDefaultColor.textClass : 'text-content'} hover:text-blue-400 transition-colors tabular-nums`}
                          title={(() => {
                            const meta = getParameterMetadata(param.id);
                            const hints: string[] = [];
                            if (isNonDefault && param.defaultValue !== undefined) {
                              hints.push(`默认：${formatParamValue(param.defaultValue)}`);
                            }
                            if (meta?.range) hints.push(`范围：${meta.range.min} 至 ${meta.range.max}`);
                            if (meta?.values) hints.push(`取值：${Object.entries(meta.values).map(([k,v]) => `${k}=${v}`).join(', ')}`);
                            if (meta?.units) hints.push(`单位：${meta.units}`);
                            return hints.length > 0 ? hints.join('\n') : undefined;
                          })()}
                        >
                          {formatParamValue(param.value)}
                        </button>
                      )}
                      {param.isReadOnly ? (
                        <span className="px-1.5 py-0.5 bg-surface-raised text-content-secondary rounded text-[10px] shrink-0">
                          只读
                        </span>
                      ) : param.isModified ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px]">
                            已修改
                          </span>
                          <button
                            onClick={() => revertParameter(param.id)}
                            className="text-[10px] text-content-secondary hover:text-content"
                            title={`恢复为 ${formatParamValue(param.originalValue ?? param.value)}`}
                          >
                            (恢复)
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-content-secondary">{getParamTypeName(param.type)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-sm line-clamp-2 ${
                        hasOfficialDescription(param.id)
                          ? 'text-content-secondary'
                          : 'text-content-secondary italic'
                      }`}
                      title={hasOfficialDescription(param.id) ? undefined : '自动生成的描述'}
                    >
                      {getDescription(param.id)}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 px-4 py-2 border-t border-subtle bg-surface text-xs text-content-secondary flex items-center gap-4">
        <span>{paramCount} 个参数</span>
        {(searchQuery || selectedGroup !== 'all' || showOnlyModified || showOnlyNonDefault || showOnlyFavourites) && displayParams.length !== paramCount && (
          <>
            <span className="text-content-tertiary">|</span>
            <span>显示 {displayParams.length} 个</span>
          </>
        )}
        {showOnlyFavourites && (
          <>
            <span className="text-content-tertiary">|</span>
            <span className="text-yellow-400">仅收藏</span>
          </>
        )}
        {showOnlyModified && (
          <>
            <span className="text-content-tertiary">|</span>
            <span className="text-amber-400">仅已修改</span>
          </>
        )}
        {showOnlyNonDefault && (
          <>
            <span className="text-content-tertiary">|</span>
            <span className={nonDefaultColor.textClass}>仅非默认</span>
          </>
        )}
        {selectedGroup !== 'all' && (
          <>
            <span className="text-content-tertiary">|</span>
            <span>分组：{PARAMETER_GROUPS.find(g => g.id === selectedGroup)?.name}</span>
          </>
        )}
        {offlineMode ? (<>
          <span className="text-content-tertiary">|</span>
          <span className="text-blue-400">离线</span>
        </>) : (<>
          <span className="text-content-tertiary">|</span>
          <span>系统 ID：{connectionState.systemId ?? '-'}</span>
          {lastRefresh > 0 && (
            <>
              <span className="text-content-tertiary">|</span>
              <span>上次刷新：{new Date(lastRefresh).toLocaleTimeString()}</span>
            </>
          )}
        </>)}
      </div>

      {/* Write to Flash Confirmation Modal */}
      {showWriteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-solid border rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="text-lg font-semibold text-content">将参数写入闪存</h3>
              <p className="text-sm text-content-secondary mt-1">
                以下 {modifiedParameters().length} 个参数将永久保存到飞行控制器。
              </p>
              {modifiedParameters().some(p => isRebootRequired(p.id)) && (
                <p className="text-sm text-amber-400 mt-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  部分参数需要重启才能生效。
                </p>
              )}
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-content-secondary uppercase">
                    <th className="pb-2">参数</th>
                    <th className="pb-2 text-right">原值</th>
                    <th className="pb-2 text-center px-2">→</th>
                    <th className="pb-2">新值</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {modifiedParameters().map(param => (
                    <tr key={param.id}>
                      <td className="py-2 font-mono text-content">
                        {param.id}
                        {isRebootRequired(param.id) && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">
                            需重启
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-content-secondary">{formatParamValue(param.originalValue ?? param.value)}</td>
                      <td className="py-2 text-center text-content-tertiary">→</td>
                      <td className="py-2 font-mono text-amber-400">{formatParamValue(param.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
              <button
                onClick={() => setShowWriteConfirm(false)}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleWriteToFlashConfirm}
                className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
              >
                写入闪存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Compare Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-solid border rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="text-lg font-semibold text-content">比较参数</h3>
              <p className="text-sm text-content-secondary mt-1">
                {fileParamDiffs.length === 0
                  ? `未发现差异 — 文件中的所有参数与${offlineMode ? '当前文件' : '飞行器'}一致。`
                  : `${fileParamDiffs.length} 个参数存在差异，请选择要应用的参数。`
                }
              </p>
              {(() => {
                const currentVehicle = offlineMode ? offlineVehicleType : (connectionState.vehicleType || connectionState.fcVariant);
                return fileVehicleType && currentVehicle && fileVehicleType !== currentVehicle ? (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-amber-500/30 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs text-amber-300">
                      文件保存自 <span className="font-semibold">{fileVehicleType}</span>，但当前机型为 <span className="font-semibold">{currentVehicle}</span>
                    </span>
                  </div>
                ) : null;
              })()}
              {fileSkippedCount > 0 && (
                <p className="text-xs text-content-secondary mt-2">
                  文件中共 {fileTotalCount} 个参数：{fileTotalCount - fileSkippedCount} 个与飞行器匹配，{fileSkippedCount} 个已跳过（此固件中不存在）
                </p>
              )}
            </div>

            {fileParamDiffs.length > 0 && (
              <>
                {/* Select all / Deselect all */}
                <div className="px-6 py-2 border-b border-subtle flex items-center gap-3">
                  <button
                    onClick={selectAllDiffs}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    全选
                  </button>
                  <span className="text-content-tertiary">|</span>
                  <button
                    onClick={deselectAllDiffs}
                    className="text-xs text-content-secondary hover:text-content transition-colors"
                  >
                    取消全选
                  </button>
                  <span className="ml-auto text-xs text-content-secondary">
                    已选 {fileParamDiffs.filter(d => d.selected).length} / {fileParamDiffs.length}
                  </span>
                </div>

                <div className="flex-1 overflow-auto px-6 py-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-content-secondary uppercase">
                        <th className="pb-2 w-8"></th>
                        <th className="pb-2">参数</th>
                        <th className="pb-2 text-right">{offlineMode ? '当前' : '飞行器'}</th>
                        <th className="pb-2 text-center w-8"></th>
                        <th className="pb-2">比较</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                      {fileParamDiffs.map(diff => (
                        <tr
                          key={diff.paramId}
                          className={`cursor-pointer transition-colors ${diff.selected ? 'hover:bg-surface' : 'opacity-50 hover:opacity-75'}`}
                          onClick={() => toggleDiffSelection(diff.paramId)}
                        >
                          <td className="py-2 pr-2">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                              diff.selected
                                ? 'bg-blue-500/30 border-blue-500/50'
                                : 'border bg-surface'
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
                            {diff.note && (
                              <div className="text-xs text-content-tertiary font-sans mt-0.5">{diff.note}</div>
                            )}
                          </td>
                          <td className="py-2 text-right font-mono text-content-secondary">{formatParamValue(diff.currentValue)}</td>
                          <td className="py-2 text-center text-content-tertiary">
                            <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </td>
                          <td className="py-2 font-mono text-amber-400">{formatParamValue(diff.fileValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Progress bar while applying */}
            {isApplyingFileParams && applyProgress && (
              <div className="px-6 py-2 border-t border-subtle">
                <div className="flex items-center justify-between text-xs text-content-secondary mb-1">
                  <span>正在应用参数...</span>
                  <span>{applyProgress.applied} / {applyProgress.total}</span>
                </div>
                <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-150"
                    style={{ width: `${(applyProgress.applied / applyProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
              <button
                onClick={closeCompareModal}
                disabled={isApplyingFileParams}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content disabled:text-content-tertiary transition-colors"
              >
                {fileParamDiffs.length === 0 ? '关闭' : '取消'}
              </button>
              {fileParamDiffs.length > 0 && (
                <button
                  onClick={handleApplySelectedParams}
                  disabled={isApplyingFileParams || fileParamDiffs.filter(d => d.selected).length === 0}
                  className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-surface-raised text-blue-400 disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors"
                >
                  {isApplyingFileParams
                    ? '应用中...'
                    : `应用 ${fileParamDiffs.filter(d => d.selected).length} 个参数`
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${
          toast.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-400' :
          toast.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
          'bg-blue-500/20 border-blue-500/30 text-blue-400'
        }`}>
          {toast.type === 'success' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast.type === 'error' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span className="text-sm">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
