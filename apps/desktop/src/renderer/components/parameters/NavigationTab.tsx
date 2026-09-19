/**
 * NavigationTab
 *
 * iNav Navigation configuration for autonomous flight.
 * RTH settings, waypoint navigation, GPS config.
 */

import { useState, useEffect, useCallback } from 'react';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { Compass, Home, PlaneLanding, MapPin, Satellite, AlertTriangle } from 'lucide-react';

// Types matching msp-ts
interface MSPNavConfig {
  userControlMode: number;
  maxNavigationSpeed: number;
  maxClimbRate: number;
  maxManualSpeed: number;
  maxManualClimbRate: number;
  landDescendRate: number;
  landSlowdownMinAlt: number;
  landSlowdownMaxAlt: number;
  emergencyDescentRate: number;
  rthAltControlMode: number;
  rthAbortThreshold: number;
  rthAltitude: number;
  waypointRadius: number;
  waypointSafeAlt: number;
  maxBankAngle: number;
  useThrottleMidForAlthold: boolean;
  hoverThrottle: number;
}

interface MSPGpsConfig {
  provider: number;
  sbasMode: number;
  autoConfig: boolean;
  autoBaud: boolean;
  homePointOnce: boolean;
  ubloxUseGalileo: boolean;
}

const NAV_RTH_ALT_MODE = {
  CURRENT: 0,
  EXTRA: 1,
  FIXED: 2,
  MAX: 3,
  AT_LEAST: 4,
} as const;

const NAV_RTH_ALT_MODE_NAMES: Record<number, { name: string; description: string }> = {
  0: { name: '当前高度', description: '保持当前高度，可能撞上障碍物！' },
  1: { name: '额外高度', description: '返航前先爬升返航高度再加高' },
  2: { name: '固定高度', description: '始终以设定的返航高度返航' },
  3: { name: '最高高度', description: '取当前高度与返航高度中的较高值' },
  4: { name: '至少（推荐）', description: '低于返航高度则爬升到该高度，否则保持' },
};

const GPS_PROVIDER_NAMES: Record<number, string> = {
  0: 'NMEA',
  1: 'u-blox',
  2: 'MSP',
  3: '模拟（测试）',
};

const GPS_SBAS_NAMES: Record<number, string> = {
  0: '自动',
  1: 'EGNOS（欧洲）',
  2: 'WAAS（美国）',
  3: 'MSAS（日本）',
  4: 'GAGAN（印度）',
  5: '无',
};

// Default nav config (iNav defaults)
const DEFAULT_NAV_CONFIG: Partial<MSPNavConfig> = {
  maxNavigationSpeed: 300,     // 3 m/s
  maxClimbRate: 500,           // 5 m/s
  waypointRadius: 100,         // 1 m
  waypointSafeAlt: 2000,       // 20 m
  rthAltControlMode: NAV_RTH_ALT_MODE.AT_LEAST,
  rthAltitude: 3000,           // 30 m
  landDescendRate: 200,        // 2 m/s
  emergencyDescentRate: 500,   // 5 m/s
};

// Extended waypoint settings (CLI parameters via MSP2 COMMON_SETTING)
interface WaypointSettings {
  nav_wp_load_on_boot: string; // ON/OFF
  nav_wp_max_safe_distance: number; // 0-1500 (meters)
  nav_wp_mission_restart: string; // START/RESUME/SWITCH
  nav_mc_wp_slowdown: string; // ON/OFF (multicopter)
  nav_fw_wp_turn_smoothing: string; // OFF/ON/ON-CUT (fixed-wing)
}

const DEFAULT_WP_SETTINGS: WaypointSettings = {
  nav_wp_load_on_boot: 'OFF',
  nav_wp_max_safe_distance: 100,
  nav_wp_mission_restart: 'RESUME',
  nav_mc_wp_slowdown: 'ON',
  nav_fw_wp_turn_smoothing: 'OFF',
};

interface Props {
  modified: boolean;
  setModified: (v: boolean) => void;
}

export default function NavigationTab({ modified, setModified }: Props) {
  const [navConfig, setNavConfig] = useState<Partial<MSPNavConfig>>(DEFAULT_NAV_CONFIG);
  const [gpsConfig, setGpsConfig] = useState<MSPGpsConfig | null>(null);
  const [wpSettings, setWpSettings] = useState<WaypointSettings>(DEFAULT_WP_SETTINGS);
  const [wpSettingsSupported, setWpSettingsSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load navigation configuration
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nav = await window.electronAPI.mspGetNavConfig();
      if (nav) {
        setNavConfig((prev) => ({ ...prev, ...nav }));
      }

      const gps = await window.electronAPI.mspGetGpsConfig();
      if (gps) {
        setGpsConfig(gps as MSPGpsConfig);
      }

      // Load extended waypoint settings via generic settings API
      try {
        const wpSettingNames = [
          'nav_wp_load_on_boot',
          'nav_wp_max_safe_distance',
          'nav_wp_mission_restart',
          'nav_mc_wp_slowdown',
          'nav_fw_wp_turn_smoothing',
        ];
        const settings = await window.electronAPI.mspGetSettings(wpSettingNames);

        // Check if we got any valid settings back
        const hasValidSettings = Object.values(settings).some(v => v !== null);
        setWpSettingsSupported(hasValidSettings);

        if (hasValidSettings) {
          setWpSettings({
            nav_wp_load_on_boot: String(settings.nav_wp_load_on_boot ?? 'OFF'),
            nav_wp_max_safe_distance: Number(settings.nav_wp_max_safe_distance ?? 100),
            nav_wp_mission_restart: String(settings.nav_wp_mission_restart ?? 'RESUME'),
            nav_mc_wp_slowdown: String(settings.nav_mc_wp_slowdown ?? 'ON'),
            nav_fw_wp_turn_smoothing: String(settings.nav_fw_wp_turn_smoothing ?? 'OFF'),
          });
          console.log('[Navigation] Loaded waypoint settings:', settings);
        }
      } catch (wpErr) {
        console.log('[Navigation] Extended waypoint settings not available:', wpErr);
        setWpSettingsSupported(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载导航配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Update nav config
  const updateNavConfig = (updates: Partial<MSPNavConfig>) => {
    setNavConfig((prev) => ({ ...prev, ...updates }));
    setModified(true);
  };

  // Update GPS config
  const updateGpsConfig = (updates: Partial<MSPGpsConfig>) => {
    if (gpsConfig) {
      setGpsConfig({ ...gpsConfig, ...updates });
      setModified(true);
    }
  };

  // Update waypoint settings
  const updateWpSettings = (updates: Partial<WaypointSettings>) => {
    setWpSettings((prev) => ({ ...prev, ...updates }));
    setModified(true);
  };

  // Save all changes
  const saveAll = async () => {
    setError(null);
    try {
      console.log('[Navigation] Saving nav config...');
      const navSuccess = await window.electronAPI.mspSetNavConfig(navConfig);
      if (!navSuccess) {
        // MSP2 might not be supported on old iNav - try GPS config only
        console.log('[Navigation] Nav config save failed (may not be supported on old iNav)');
      }

      if (gpsConfig) {
        console.log('[Navigation] Saving GPS config...');
        const gpsSuccess = await window.electronAPI.mspSetGpsConfig(gpsConfig);
        if (!gpsSuccess) {
          setError('设置 GPS 配置失败');
          return;
        }
      }

      // Save extended waypoint settings via generic settings API
      if (wpSettingsSupported) {
        console.log('[Navigation] Saving waypoint settings...');
        const wpSuccess = await window.electronAPI.mspSetSettings({
          nav_wp_load_on_boot: wpSettings.nav_wp_load_on_boot,
          nav_wp_max_safe_distance: wpSettings.nav_wp_max_safe_distance,
          nav_wp_mission_restart: wpSettings.nav_wp_mission_restart,
          nav_mc_wp_slowdown: wpSettings.nav_mc_wp_slowdown,
          nav_fw_wp_turn_smoothing: wpSettings.nav_fw_wp_turn_smoothing,
        });
        if (!wpSuccess) {
          console.log('[Navigation] Some waypoint settings failed to save');
        }
      }

      // Save to EEPROM
      console.log('[Navigation] Saving to EEPROM...');
      const eepromSuccess = await window.electronAPI.mspSaveEeprom();
      if (!eepromSuccess) {
        setError('配置已发送但 EEPROM 保存失败 — 更改可能不会保留');
        return;
      }

      console.log('[Navigation] Saved successfully');
      setModified(false);
    } catch (err) {
      console.error('[Navigation] Save error:', err);
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // Convert cm/s to m/s for display
  const toMs = (cms: number) => (cms / 100).toFixed(1);
  const fromMs = (ms: number) => Math.round(ms * 100);

  // Convert cm to m for display
  const toM = (cm: number) => (cm / 100).toFixed(0);
  const fromM = (m: number) => Math.round(m * 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-2 mx-auto" />
          <p className="text-content-secondary">正在加载导航配置...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-blue-500/10 rounded-xl border-blue-500/30 p-4 flex items-start gap-4">
        <Compass className="w-6 h-6 text-blue-400" />
        <div>
          <p className="text-blue-400 font-medium">导航设置（iNav）：自主飞行</p>
          <p className="text-sm text-content-secondary mt-1">
            这些设置控制飞机在<strong className="text-content">无人工输入</strong>时的行为，
            例如自动返航或执行任务。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-content-secondary">
            <p><span className="text-green-400 inline-flex items-center gap-1"><Home className="w-3.5 h-3.5" /> 返航</span>："Return To Home" 自动飞回起飞点</p>
            <p><span className="text-purple-400 inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> 航点</span>：预先规划的 GPS 点，飞机将依次飞往</p>
            <p><span className="text-amber-400 inline-flex items-center gap-1"><PlaneLanding className="w-3.5 h-3.5" /> 降落</span>：返航后下降的快慢</p>
            <p><span className="text-blue-400 inline-flex items-center gap-1"><Satellite className="w-3.5 h-3.5" /> GPS</span>：卫星设置（通常保持自动）</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            ×
          </button>
        </div>
      )}

      {/* RTH Settings */}
      <div className="bg-surface rounded-xl border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <Home className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">返航（RTH）</h3>
            <p className="text-xs text-content-secondary">触发返航时的行为</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* RTH Altitude Mode */}
          <div className="space-y-3">
            <label className="text-xs text-content-secondary block">返航高度模式</label>
            <div className="space-y-2">
              {Object.entries(NAV_RTH_ALT_MODE_NAMES).map(([value, info]) => (
                <label
                  key={value}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                    navConfig.rthAltControlMode === Number(value)
                      ? 'bg-green-500/20 border-green-500/50'
                      : 'bg-surface border hover:border'
                  }`}
                >
                  <input
                    type="radio"
                    name="rthAltMode"
                    value={value}
                    checked={navConfig.rthAltControlMode === Number(value)}
                    onChange={() => updateNavConfig({ rthAltControlMode: Number(value) })}
                    className="w-4 h-4 text-green-500"
                  />
                  <div>
                    <div className="text-sm text-content">{info.name}</div>
                    <div className="text-xs text-content-secondary">{info.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* RTH Altitude & Speeds */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-content-secondary block mb-1.5">返航高度（m）</label>
              <DraftNumberInput
                value={Number(toM(navConfig.rthAltitude ?? 3000))}
                onCommit={(v) => updateNavConfig({ rthAltitude: fromM(v) })}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                min={5}
                max={300}
              />
              <p className="text-[10px] text-content-tertiary mt-1">用于固定/最高/至少模式</p>
            </div>

            <div>
              <label className="text-xs text-content-secondary block mb-1.5">最大导航速度（m/s）</label>
              <DraftNumberInput
                value={Number(toMs(navConfig.maxNavigationSpeed ?? 300))}
                onCommit={(v) => updateNavConfig({ maxNavigationSpeed: fromMs(v) })}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                min={0.5}
                max={20}
                step={0.5}
              />
            </div>

            <div>
              <label className="text-xs text-content-secondary block mb-1.5">最大爬升速率（m/s）</label>
              <DraftNumberInput
                value={Number(toMs(navConfig.maxClimbRate ?? 500))}
                onCommit={(v) => updateNavConfig({ maxClimbRate: fromMs(v) })}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                min={0.5}
                max={10}
                step={0.5}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Landing Settings */}
      <div className="bg-surface rounded-xl border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <PlaneLanding className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">降落配置</h3>
            <p className="text-xs text-content-secondary">返航后飞机如何降落</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-content-secondary block mb-1.5">下降速率（m/s）</label>
            <DraftNumberInput
              value={Number(toMs(navConfig.landDescendRate ?? 200))}
              onCommit={(v) => updateNavConfig({ landDescendRate: fromMs(v) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              min={0.2}
              max={5}
              step={0.1}
            />
            <p className="text-[10px] text-content-tertiary mt-1">越慢降落越柔和</p>
          </div>

          <div>
            <label className="text-xs text-content-secondary block mb-1.5">减速起始高度（m）</label>
            <DraftNumberInput
              value={Number(toM(navConfig.landSlowdownMinAlt ?? 500))}
              onCommit={(v) => updateNavConfig({ landSlowdownMinAlt: fromM(v) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              min={1}
              max={50}
            />
            <p className="text-[10px] text-content-tertiary mt-1">在此高度开始减速</p>
          </div>

          <div>
            <label className="text-xs text-content-secondary block mb-1.5">紧急下降（m/s）</label>
            <DraftNumberInput
              value={Number(toMs(navConfig.emergencyDescentRate ?? 500))}
              onCommit={(v) => updateNavConfig({ emergencyDescentRate: fromMs(v) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              min={1}
              max={10}
              step={0.5}
            />
            <p className="text-[10px] text-content-tertiary mt-1">GPS 丢失时的下降速率</p>
          </div>
        </div>
      </div>

      {/* Waypoint Settings */}
      <div className="bg-surface rounded-xl border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">航点导航</h3>
            <p className="text-xs text-content-secondary">任务航点设置</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-content-secondary block mb-1.5">航点半径（m）</label>
            <DraftNumberInput
              value={Number(toM(navConfig.waypointRadius ?? 100))}
              onCommit={(v) => updateNavConfig({ waypointRadius: fromM(v) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              min={0.5}
              max={20}
              step={0.5}
            />
            <p className="text-[10px] text-content-tertiary mt-1">进入此半径即视为到达航点</p>
          </div>

          <div>
            <label className="text-xs text-content-secondary block mb-1.5">安全高度（m）</label>
            <DraftNumberInput
              value={Number(toM(navConfig.waypointSafeAlt ?? 2000))}
              onCommit={(v) => updateNavConfig({ waypointSafeAlt: fromM(v) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              min={5}
              max={200}
            />
            <p className="text-[10px] text-content-tertiary mt-1">任务的最低安全高度</p>
          </div>
        </div>

        {/* Extended waypoint settings (via generic settings API) */}
        {wpSettingsSupported && (
          <>
            <div className="border-t border-subtle pt-4 mt-4">
              <p className="text-xs text-content-secondary mb-3">高级任务设置</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-content-secondary block mb-1.5">最大安全距离（m）</label>
                  <DraftNumberInput
                    value={wpSettings.nav_wp_max_safe_distance}
                    onCommit={(v) => updateWpSettings({ nav_wp_max_safe_distance: v })}
                    className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                    min={0}
                    max={1500}
                    step={10}
                  />
                  <p className="text-[10px] text-content-tertiary mt-1">距返航点的最大距离（0 = 禁用）</p>
                </div>

                <div>
                  <label className="text-xs text-content-secondary block mb-1.5">任务重启模式</label>
                  <select
                    value={wpSettings.nav_wp_mission_restart}
                    onChange={(e) => updateWpSettings({ nav_wp_mission_restart: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                  >
                    <option value="START">从头开始</option>
                    <option value="RESUME">从上个航点继续</option>
                    <option value="SWITCH">切换到下一个任务</option>
                  </select>
                  <p className="text-[10px] text-content-tertiary mt-1">返航后的行为</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wpSettings.nav_wp_load_on_boot === 'ON'}
                  onChange={(e) => updateWpSettings({ nav_wp_load_on_boot: e.target.checked ? 'ON' : 'OFF' })}
                  className="w-4 h-4 rounded border bg-surface-raised text-purple-500"
                />
                <span className="text-sm text-content-secondary">开机加载任务</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wpSettings.nav_mc_wp_slowdown === 'ON'}
                  onChange={(e) => updateWpSettings({ nav_mc_wp_slowdown: e.target.checked ? 'ON' : 'OFF' })}
                  className="w-4 h-4 rounded border bg-surface-raised text-purple-500"
                />
                <span className="text-sm text-content-secondary">航点减速（多旋翼）</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <select
                  value={wpSettings.nav_fw_wp_turn_smoothing}
                  onChange={(e) => updateWpSettings({ nav_fw_wp_turn_smoothing: e.target.value })}
                  className="px-2 py-1 bg-surface-raised border rounded text-sm text-content focus:outline-none focus:border-blue-500"
                >
                  <option value="OFF">关闭</option>
                  <option value="ON">开启</option>
                  <option value="ON-CUT">开启 + 收油门</option>
                </select>
                <span className="text-sm text-content-secondary">转弯平滑（固定翼）</span>
              </label>
            </div>
          </>
        )}
      </div>

      {/* GPS Configuration */}
      {gpsConfig && (
        <div className="bg-surface rounded-xl border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Satellite className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">GPS 配置</h3>
              <p className="text-xs text-content-secondary">GPS 模块设置</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-content-secondary block mb-1.5">GPS 提供方</label>
              <select
                value={gpsConfig.provider}
                onChange={(e) => updateGpsConfig({ provider: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              >
                {Object.entries(GPS_PROVIDER_NAMES).map(([val, name]) => (
                  <option key={val} value={val}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-content-secondary block mb-1.5">SBAS 模式</label>
              <select
                value={gpsConfig.sbasMode}
                onChange={(e) => updateGpsConfig({ sbasMode: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              >
                {Object.entries(GPS_SBAS_NAMES).map(([val, name]) => (
                  <option key={val} value={val}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConfig.autoConfig}
                onChange={(e) => updateGpsConfig({ autoConfig: e.target.checked })}
                className="w-4 h-4 rounded border bg-surface-raised text-blue-500"
              />
              <span className="text-sm text-content-secondary">自动配置 GPS</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConfig.autoBaud}
                onChange={(e) => updateGpsConfig({ autoBaud: e.target.checked })}
                className="w-4 h-4 rounded border bg-surface-raised text-blue-500"
              />
              <span className="text-sm text-content-secondary">自动检测波特率</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConfig.ubloxUseGalileo}
                onChange={(e) => updateGpsConfig({ ubloxUseGalileo: e.target.checked })}
                className="w-4 h-4 rounded border bg-surface-raised text-blue-500"
              />
              <span className="text-sm text-content-secondary">启用 Galileo（u-blox）</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConfig.homePointOnce}
                onChange={(e) => updateGpsConfig({ homePointOnce: e.target.checked })}
                className="w-4 h-4 rounded border bg-surface-raised text-blue-500"
              />
              <span className="text-sm text-content-secondary">仅设置一次返航点（不更新）</span>
            </label>
          </div>
        </div>
      )}

      {/* Safety Warning */}
      <div className="bg-amber-500/10 rounded-xl border-amber-500/30 p-4 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-amber-400" />
        <div>
          <p className="text-amber-400 font-medium">重要安全提示</p>
          <ul className="text-sm text-content-secondary mt-1 space-y-1 list-disc list-inside">
            <li>在依赖返航功能前，务必先在开阔场地测试</li>
            <li>确保返航高度高于飞行区域内的所有障碍物</li>
            <li>自主飞行前检查 GPS 卫星数（8 颗以上）</li>
            <li>为安全起见，将失控保护配置为返航</li>
          </ul>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3">
        <button
          onClick={loadConfig}
          className="px-4 py-2 text-sm bg-surface-raised text-content rounded-lg hover:bg-surface-raised"
        >
          刷新
        </button>
        <button
          onClick={saveAll}
          disabled={!modified}
          className={`px-4 py-2 text-sm rounded-lg ${
            modified
              ? 'bg-blue-500 text-white hover:bg-blue-400'
              : 'bg-surface-raised text-content-secondary cursor-not-allowed'
          }`}
        >
          保存导航配置
        </button>
      </div>
    </div>
  );
}
