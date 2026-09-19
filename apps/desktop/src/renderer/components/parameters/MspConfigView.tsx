/**
 * MSP Configuration View
 * Beginner-friendly PID tuning, rates, and modes for Betaflight/iNav
 *
 * Philosophy: "No PhD required" - accessible for beginners, powerful for experts
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import inavLogo from '../../assets/inav-logo.png';
import betaflightLogo from '../../assets/betaflight-logo.svg';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useModesWizardStore } from '../../stores/modes-wizard-store';
import { useQuickSetupStore } from '../../stores/quick-setup-store';
import ModesWizard from '../modes/ModesWizard';
import QuickSetupWizard from '../quick-setup/QuickSetupWizard';
import ModesAdvancedEditor from '../modes/ModesAdvancedEditor';
import ServoTuningTab from './ServoTuningTab';
import ServoMixerTab from './ServoMixerTab';
import MotorMixerTab from './MotorMixerTab';
import NavigationTab from './NavigationTab';
import SafetyTab, { type SafetyTabHandle } from './SafetyTab';
import AutoLaunchTab from './AutoLaunchTab';
// GpsRescueTab removed - GPS Rescue is now integrated into SafetyTab
import FilterConfigTab from './FilterConfigTab';
import VtxConfigTab from './VtxConfigTab';
import ReceiverTab from './ReceiverTab';
import PortsTab from './PortsTab';
import ReceiverWizard from './ReceiverWizard';
import { useReceiverStore } from '../../stores/receiver-store';
import { useSettingsStore } from '../../stores/settings-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import {
  SlidersHorizontal,
  Gauge,
  Gamepad2,
  Shuffle,
  Cog,
  Compass,
  Radio,
  Cable,
  Shield,
  ChevronDown,
  Layers,
  Egg,
  Drama,
  Zap,
  Film,
  RotateCcw,
  Rocket,
  Power,
  Square,
  Sunrise,
  ArrowUpFromLine,
  Navigation,
  Move3d,
  RotateCw,
  Camera,
  Home,
  MapPin,
  Joystick,
  Volume2,
  Lightbulb,
  Flashlight,
  Monitor,
  Satellite,
  Settings2,
  Package,
  ShieldAlert,
  Map,
  Wind,
  Lock,
  PlaneTakeoff,
  Scissors,
  Plane,
  OctagonX,
  KeyRound,
  Turtle,
  Waypoints,
  CloudSun,
  Wand2,
  HelpCircle,
  Waves,
  MoveHorizontal,
  MoveVertical,
  RefreshCw,
  Info,
  Ruler,
  AlertTriangle,
  Target,
  Save,
  Check,
  type LucideIcon,
} from 'lucide-react';

// Types
interface MSPPidCoefficients {
  p: number;
  i: number;
  d: number;
}

interface MSPPid {
  roll: MSPPidCoefficients;
  pitch: MSPPidCoefficients;
  yaw: MSPPidCoefficients;
}

interface MSPRcTuning {
  rcRate: number;
  rcExpo: number;
  rollPitchRate: number;
  yawRate: number;
  dynThrPID: number;
  throttleMid: number;
  throttleExpo: number;
  tpaBreakpoint: number;
  rcYawExpo: number;
  rcYawRate: number;
  rcPitchRate: number;
  rcPitchExpo: number;
  rollRate: number;
  pitchRate: number;
  yawRateLimit: number;
  ratesType: number;
  throttleLimitType?: number;
  throttleLimitPercent?: number;
  rollRateLimit?: number;
  pitchRateLimit?: number;
}

interface MSPModeRange {
  boxId: number;
  auxChannel: number;
  rangeStart: number;
  rangeEnd: number;
}

// Default Betaflight PIDs (for reset functionality)
const DEFAULT_PIDS: MSPPid = {
  roll: { p: 42, i: 85, d: 35 },
  pitch: { p: 46, i: 90, d: 38 },
  yaw: { p: 35, i: 90, d: 0 },
};

// Default Betaflight rates (for reset functionality)
// Note: rollPitchRate is the legacy combined rate field - old iNav uses this, not separate rollRate/pitchRate
const DEFAULT_RATES: Partial<MSPRcTuning> = {
  rcRate: 100,
  rcExpo: 0,
  rcPitchRate: 100,
  rcPitchExpo: 0,
  rcYawRate: 100,
  rcYawExpo: 0,
  rollPitchRate: 70, // Legacy combined rate for old iNav
  rollRate: 70,
  pitchRate: 70,
  yawRate: 70,
  throttleLimitType: 0,
  throttleLimitPercent: 100,
  rollRateLimit: 1998,
  pitchRateLimit: 1998,
  yawRateLimit: 1998,
};

// Rate Presets - common rate configurations
// Note: rollPitchRate is legacy combined rate for old iNav - must match rollRate for compatibility
const RATE_PRESETS: Record<string, {
  name: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  color: string;
  rates: Partial<MSPRcTuning>;
}> = {
  beginner: {
    name: '新手',
    description: '缓慢且可预测 — 适合学习',
    icon: Egg,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    rates: {
      rcRate: 80, rcExpo: 20, rollPitchRate: 40, rollRate: 40,
      rcPitchRate: 80, rcPitchExpo: 20, pitchRate: 40,
      rcYawRate: 80, rcYawExpo: 20, yawRate: 40,
    },
  },
  freestyle: {
    name: '自由飞',
    description: '兼顾技巧与流畅',
    icon: Drama,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    rates: {
      rcRate: 100, rcExpo: 15, rollPitchRate: 70, rollRate: 70,
      rcPitchRate: 100, rcPitchExpo: 15, pitchRate: 70,
      rcYawRate: 100, rcYawExpo: 10, yawRate: 65,
    },
  },
  racing: {
    name: '竞速',
    description: '快速响应，适合竞速',
    icon: Zap,
    iconColor: 'text-red-400',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    rates: {
      rcRate: 120, rcExpo: 5, rollPitchRate: 80, rollRate: 80,
      rcPitchRate: 120, rcPitchExpo: 5, pitchRate: 80,
      rcYawRate: 110, rcYawExpo: 0, yawRate: 70,
    },
  },
  cinematic: {
    name: '影视',
    description: '极致顺滑，适合拍摄',
    icon: Film,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    rates: {
      rcRate: 70, rcExpo: 40, rollPitchRate: 30, rollRate: 30,
      rcPitchRate: 70, rcPitchExpo: 40, pitchRate: 30,
      rcYawRate: 60, rcYawExpo: 30, yawRate: 25,
    },
  },
};

// Custom profile storage keys
const PID_PROFILES_KEY = 'ardudeck_pid_profiles';
const RATE_PROFILES_KEY = 'ardudeck_rate_profiles';

// Load custom profiles from localStorage
function loadCustomProfiles<T>(key: string): Record<string, { name: string; data: T }> {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Save custom profiles to localStorage
function saveCustomProfiles<T>(key: string, profiles: Record<string, { name: string; data: T }>): void {
  localStorage.setItem(key, JSON.stringify(profiles));
}

// PID Presets - make tuning accessible
const PID_PRESETS: Record<string, {
  name: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  color: string;
  pids: { roll: MSPPidCoefficients; pitch: MSPPidCoefficients; yaw: MSPPidCoefficients };
}> = {
  beginner: {
    name: '新手',
    description: '平滑宽容 — 适合学习',
    icon: Egg,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    pids: {
      roll: { p: 35, i: 40, d: 20 },
      pitch: { p: 38, i: 42, d: 22 },
      yaw: { p: 45, i: 50, d: 0 },
    },
  },
  freestyle: {
    name: '自由飞',
    description: '响应灵敏且顺滑，适合技巧飞行',
    icon: Drama,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    pids: {
      roll: { p: 45, i: 45, d: 28 },
      pitch: { p: 48, i: 48, d: 30 },
      yaw: { p: 55, i: 50, d: 0 },
    },
  },
  racing: {
    name: '竞速',
    description: '干脆精准，适合竞速',
    icon: Zap,
    iconColor: 'text-red-400',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    pids: {
      roll: { p: 55, i: 50, d: 32 },
      pitch: { p: 58, i: 52, d: 34 },
      yaw: { p: 65, i: 55, d: 0 },
    },
  },
  cinematic: {
    name: '影视',
    description: '极致顺滑，适合录像',
    icon: Film,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    pids: {
      roll: { p: 30, i: 35, d: 18 },
      pitch: { p: 32, i: 38, d: 20 },
      yaw: { p: 40, i: 45, d: 0 },
    },
  },
};

// Mode definitions with beginner-friendly explanations
// iNav permanent box IDs (from fc_msp_box.c) - must match mode-presets.ts BOX_ID
const MODE_INFO: Record<number, { name: string; icon: LucideIcon; description: string; color: string; beginner: string; configureTab?: string }> = {
  0: { name: 'ARM', icon: Power, description: '解锁电机', color: 'bg-red-500', beginner: '安全开关 — 解锁/上锁你的飞行器。务必绑定到开关！' },
  1: { name: 'ANGLE', icon: Square, description: '自稳', color: 'bg-blue-500', beginner: '新手模式 — 飞行器自动保持水平，最适合学习！' },
  2: { name: 'HORIZON', icon: Sunrise, description: '混合模式', color: 'bg-cyan-500', beginner: '练习模式 — 摇杆居中时自稳，打满杆可翻滚' },
  3: { name: 'NAV ALTHOLD', icon: ArrowUpFromLine, description: '定高', color: 'bg-teal-500', beginner: '使用气压计/GPS 保持当前高度，油门控制升降速率。' },
  5: { name: 'HEADING HOLD', icon: Navigation, description: '定向', color: 'bg-emerald-500', beginner: '保持当前磁航向，适合直线飞行。' },
  6: { name: 'HEADFREE', icon: Move3d, description: '无头模式', color: 'bg-purple-500', beginner: '摇杆方向相对飞手而非机头 — 适合新手' },
  7: { name: 'HEADADJ', icon: RotateCw, description: '无头校准', color: 'bg-gray-500', beginner: '重置无头模式参考方向' },
  8: { name: 'CAMSTAB', icon: Camera, description: '相机增稳', color: 'bg-indigo-500', beginner: '稳定相机舵机输出' },
  10: { name: 'NAV RTH', icon: Home, description: '返航', color: 'bg-green-500', beginner: '自动返航 — 飞行器将爬升到安全高度并飞回起飞点。必备安全功能！' },
  11: { name: 'NAV POSHOLD', icon: MapPin, description: '定点', color: 'bg-cyan-500', beginner: 'GPS 定点 — 飞行器将保持原地悬停，适合航拍或需要停下时。' },
  12: { name: 'MANUAL', icon: Joystick, description: '手动控制', color: 'bg-rose-500', beginner: '不经增稳直接控制舵机/电机，仅限资深飞手！' },
  13: { name: 'BEEPER', icon: Volume2, description: '寻找飞行器', color: 'bg-yellow-500', beginner: '让飞行器鸣响 — 方便在草丛中寻找！' },
  15: { name: 'LEDS OFF', icon: Lightbulb, description: '关闭 LED', color: 'bg-gray-500', beginner: '关闭灯带' },
  16: { name: 'LIGHTS', icon: Flashlight, description: '导航灯', color: 'bg-amber-500', beginner: '打开导航灯' },
  19: { name: 'OSD OFF', icon: Monitor, description: '隐藏 OSD', color: 'bg-gray-500', beginner: '关闭屏幕显示' },
  20: { name: 'TELEMETRY', icon: Satellite, description: '遥测输出', color: 'bg-blue-500', beginner: '启用遥测传输' },
  21: { name: 'AUTO TUNE', icon: Settings2, description: 'PID 自整定', color: 'bg-violet-500', beginner: '飞行中自动整定 PID 值' },
  26: { name: 'BLACKBOX', icon: Package, description: '黑匣子', color: 'bg-pink-500', beginner: '记录飞行数据用于调参分析' },
  27: { name: 'FAILSAFE', icon: ShieldAlert, description: '失控保护', color: 'bg-orange-500', beginner: '紧急模式 — 触发失控保护行为，通常在失去信号时自动激活。' },
  28: { name: 'NAV WP', icon: Map, description: '航点任务', color: 'bg-indigo-500', beginner: '执行上传的航点任务，飞行器将自动飞往每个航点。' },
  29: { name: 'AIRMODE', icon: Wind, description: '零油门全权控制', color: 'bg-cyan-500', beginner: '即使在零油门也保持完整的摇杆权限，自由飞技巧和翻滚必备。' },
  30: { name: 'HOME RESET', icon: RotateCcw, description: '重置返航点', color: 'bg-red-400', beginner: '将当前位置设为新返航点，一次飞行中换场地时使用。' },
  31: { name: 'GCS NAV', icon: Gamepad2, description: '地面站控制', color: 'bg-purple-500', beginner: '允许地面站发送导航指令（飞往此处等）。' },
  34: { name: 'FLAPERON', icon: PlaneTakeoff, description: '襟翼模式', color: 'bg-amber-500', beginner: '启用襟副翼以减慢进近速度，副翼下垂充当襟翼。' },
  35: { name: 'TURN ASSIST', icon: RotateCw, description: '协调转弯', color: 'bg-lime-500', beginner: '自动协调方向舵与副翼，转弯更顺畅，适合固定翼新手。' },
  36: { name: 'NAV LAUNCH', icon: Rocket, description: '自动起飞', color: 'bg-orange-500', beginner: '固定翼自动起飞序列，出手后自动爬升到安全高度。', configureTab: 'auto-launch' },
  37: { name: 'SERVO AUTOTRIM', icon: Scissors, description: '舵机自动微调', color: 'bg-gray-500', beginner: '飞行中自动调整舵机微调' },
  45: { name: 'NAV CRUISE', icon: Plane, description: '巡航', color: 'bg-sky-500', beginner: '固定翼巡航模式 — 保持航向和高度，适合远航。' },
  46: { name: 'MC BRAKING', icon: OctagonX, description: '多旋翼刹车', color: 'bg-red-500', beginner: '多旋翼松杆时急速刹车' },
  51: { name: 'PREARM', icon: KeyRound, description: '预解锁检查', color: 'bg-yellow-600', beginner: '安全开关 — 解锁前必须先启用，防止误解锁。' },
  52: { name: 'TURTLE', icon: Turtle, description: '海龟翻正', color: 'bg-stone-500', beginner: '用电机反转让摔翻的飞行器翻回来，仅限多旋翼。' },
  53: { name: 'COURSE HOLD', icon: Compass, description: '保持航向', color: 'bg-violet-500', beginner: '保持当前航向同时可控高度，适合直线飞行。' },
  55: { name: 'WP PLANNER', icon: Waypoints, description: '任务规划', color: 'bg-fuchsia-500', beginner: '通过摇杆指令进行飞行中航点规划。' },
  56: { name: 'SOARING', icon: CloudSun, description: '热气流翱翔', color: 'bg-sky-400', beginner: '为滑翔机启用热气流探测与盘旋' },
};


// Betaflight Rate Types - different curve algorithms
const RATE_TYPES = [
  { value: 0, label: 'Betaflight', description: '经典指数 + 超级速率' },
  { value: 1, label: 'Raceflight', description: '面向竞速的多项式曲线' },
  { value: 2, label: 'KISS', description: '线性速率响应' },
  { value: 3, label: 'Actual', description: '精确的 deg/s 控制（流行）' },
  { value: 4, label: 'Quick', description: '快速响应曲线' },
];

// Quick Preset Selector Component
function PresetSelector<T extends Record<string, { name: string; description: string; icon: LucideIcon; iconColor: string; color: string }>>({
  presets,
  onApply,
  label = '快捷预设',
}: {
  presets: T;
  onApply: (key: keyof T) => void;
  label?: string;
}) {
  const showQuickPresets = useSettingsStore((s) => s.uiVisibility.showQuickPresets);
  if (!showQuickPresets) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/5 rounded-xl border-indigo-500/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-indigo-300 font-medium">{label}</p>
            <p className="text-xs text-content-secondary">点击应用一种调参风格</p>
          </div>
        </div>
        <div className="flex gap-2">
          {Object.entries(presets).map(([key, preset]) => {
            const IconComponent = preset.icon;
            return (
              <button
                key={key}
                onClick={() => onApply(key as keyof T)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-br ${preset.color} border hover:scale-105 transition-all duration-150`}
                title={preset.description}
              >
                <IconComponent className={`w-4 h-4 ${preset.iconColor}`} />
                <span className="text-sm text-content group-hover:text-content">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Calculate rate (deg/s) at a given stick position.
 * Formulas match Betaflight Configurator's RateCurve.js exactly.
 *
 * ArduDeck stores raw U8 values (0-255). BF Configurator stores decimals (divided by 100).
 * Each rate type scales these differently before applying the formula.
 *
 * @param stick - Stick position 0..1 (positive half only)
 * @param rcRate - Raw U8 RC rate value from FC
 * @param superRate - Raw U8 rate value from FC
 * @param expo - Raw U8 expo value from FC
 * @param ratesType - 0=Betaflight, 1=Raceflight, 2=KISS, 3=Actual, 4=Quick
 */
function calculateRate(stick: number, rcRate: number, superRate: number, expo: number, ratesType: number): number {
  const absStick = Math.abs(stick);

  switch (ratesType) {
    case 0: { // Betaflight — from getBetaflightRates()
      let rcRateF = rcRate / 100;
      if (rcRateF > 2) rcRateF += (rcRateF - 2) * 14.54;
      const rateF = superRate / 100;
      const expoF = expo / 100;

      let rcCommandf = stick;
      if (expoF > 0) {
        rcCommandf = stick * Math.pow(absStick, 3) * expoF + stick * (1 - expoF);
      }
      let angleRate = 200 * rcRateF * rcCommandf;
      if (rateF > 0) {
        angleRate *= 1 / Math.max(0.01, 1 - absStick * rateF);
      }
      return angleRate;
    }

    case 1: { // Raceflight — from getRaceflightRates()
      // BF scales: rate*100, rcRate*1000, expo*100
      const rateF = superRate;     // ArduDeck raw 40 = BF 0.40*100
      const rcRateF = rcRate * 10; // ArduDeck raw 80 = BF 0.80*1000
      const expoF = expo;          // ArduDeck raw 20 = BF 0.20*100

      let angularVel = (1 + 0.01 * expoF * (stick * stick - 1.0)) * stick;
      angularVel = angularVel * (rcRateF + Math.abs(angularVel) * rcRateF * rateF * 0.01);
      return angularVel;
    }

    case 2: { // KISS — from getKISSRates()
      // BF uses raw decimals (divided by 100)
      const rateF = superRate / 100;
      const rcRateF = rcRate / 100;
      const expoF = expo / 100;

      const kissRpy = 1 - absStick * rateF;
      const kissTempCurve = stick * stick;
      const rcCmd = (stick * kissTempCurve * expoF + stick * (1 - expoF)) * (rcRateF / 10);
      return 2000.0 * (1.0 / kissRpy) * rcCmd;
    }

    case 3: { // Actual — from getActualRates()
      // BF scales: rate*1000, rcRate*1000 (both are deg/s)
      const maxRate = superRate * 10;   // ArduDeck raw 40 → 400 deg/s
      const centerRate = rcRate * 10;   // ArduDeck raw 80 → 800 deg/s
      const expoF = expo / 100;

      const expof = absStick * (Math.pow(stick, 5) * expoF + stick * (1 - expoF));
      const angularVel = Math.max(0, maxRate - centerRate);
      return stick * centerRate + angularVel * expof;
    }

    case 4: { // Quick — from getQuickRates()
      // BF scales: rate*1000 only
      const rateF = superRate * 10;            // ArduDeck raw 40 → 400 deg/s
      let rcRateF = (rcRate / 100) * 200;      // ArduDeck raw 80 → 160 deg/s
      const expoF = expo / 100;
      const rateClamped = Math.max(rateF, rcRateF);

      const superExpoConfig = (rateClamped / rcRateF - 1) / (rateClamped / rcRateF);
      const curve = Math.pow(absStick, 3) * expoF + absStick * (1 - expoF);
      const angularVel = 1.0 / (1.0 - curve * superExpoConfig);
      return stick * rcRateF * angularVel;
    }

    default:
      return stick * rcRate;
  }
}

/**
 * Calculate max rate at full stick deflection.
 * Expo doesn't affect max rate at full stick for any rate type.
 */
function calculateMaxRate(rcRate: number, superRate: number, ratesType: number): number {
  return Math.round(Math.abs(calculateRate(1, rcRate, superRate, 0, ratesType)));
}

// Combined rates preview graph - centered at 0 like Betaflight Configurator
function CombinedRatesCurve({ rcTuning }: { rcTuning: MSPRcTuning }) {
  const axes = useMemo(() => [
    { label: '横滚', color: '#3B82F6', rcRate: rcTuning.rcRate, superRate: rcTuning.rollRate, expo: rcTuning.rcExpo },
    { label: '俯仰', color: '#10B981', rcRate: rcTuning.rcPitchRate, superRate: rcTuning.pitchRate, expo: rcTuning.rcPitchExpo },
    { label: '偏航', color: '#F97316', rcRate: rcTuning.rcYawRate, superRate: rcTuning.yawRate, expo: rcTuning.rcYawExpo },
  ], [rcTuning]);

  // Graph layout constants
  const gLeft = 60, gRight = 590, gTop = 20, gBottom = 280;
  const gW = gRight - gLeft, gH = gBottom - gTop;
  const gCx = gLeft + gW / 2, gCy = gTop + gH / 2;

  // Calculate the global max rate across all axes for shared Y-axis
  const globalMax = useMemo(() => {
    let max = 0;
    for (const ax of axes) {
      for (let i = 0; i <= 100; i += 2) {
        const rate = Math.abs(calculateRate(i / 100, ax.rcRate, ax.superRate, ax.expo, rcTuning.ratesType));
        if (rate > max) max = rate;
      }
    }
    return Math.max(Math.ceil(max / 50) * 50, 100);
  }, [axes, rcTuning.ratesType]);

  // Map stick (-1..+1) to x, rate (-max..+max) to y
  const stickToX = (s: number) => gCx + (s / 1) * (gW / 2);
  const rateToY = (r: number) => gCy - (r / globalMax) * (gH / 2);

  // Generate full-range points for each axis (stick from -1 to +1)
  const curves = useMemo(() => {
    return axes.map(ax => {
      const pts: string[] = [];
      for (let i = -100; i <= 100; i += 2) {
        const stick = i / 100;
        const rate = calculateRate(stick, ax.rcRate, ax.superRate, ax.expo, rcTuning.ratesType);
        pts.push(`${stickToX(stick)},${rateToY(rate)}`);
      }
      return { ...ax, points: pts.join(' '), maxRate: Math.round(Math.abs(calculateRate(1, ax.rcRate, ax.superRate, ax.expo, rcTuning.ratesType))) };
    });
  }, [axes, globalMax, rcTuning.ratesType]);

  // Y-axis tick marks (symmetric: -max to +max)
  const yTicks = useMemo(() => {
    const step = globalMax <= 200 ? 50 : globalMax <= 500 ? 100 : globalMax <= 1000 ? 200 : 500;
    const ticks: number[] = [0];
    for (let v = step; v <= globalMax; v += step) {
      ticks.push(v);
      ticks.push(-v);
    }
    return ticks;
  }, [globalMax]);

  return (
    <div className="bg-surface rounded-xl border-subtle p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-content-secondary">角速率预览</h3>
        <div className="flex items-center gap-4">
          {curves.map(c => (
            <div key={c.label} className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: c.color }} />
              <span className="text-xs text-content-secondary">{c.label}</span>
              <span className="text-xs font-medium" style={{ color: c.color }}>{c.maxRate}°/s</span>
            </div>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 620 310" className="w-full" style={{ height: 280 }}>
        {/* Background */}
        <rect x={gLeft} y={gTop} width={gW} height={gH} fill="#111827" rx="4" />

        {/* Y grid lines & labels */}
        {yTicks.map(v => {
          const y = rateToY(v);
          return (
            <g key={`y-${v}`}>
              <line x1={gLeft} y1={y} x2={gRight} y2={y} stroke={v === 0 ? '#374151' : '#1F2937'} strokeWidth={v === 0 ? '1' : '0.5'} />
              <text x={gLeft - 5} y={y + 3} fill="#6B7280" fontSize="9" textAnchor="end">{v}</text>
            </g>
          );
        })}

        {/* X grid lines & labels */}
        {[-100, -50, 0, 50, 100].map(pct => {
          const x = stickToX(pct / 100);
          return (
            <g key={`x-${pct}`}>
              <line x1={x} y1={gTop} x2={x} y2={gBottom} stroke={pct === 0 ? '#374151' : '#1F2937'} strokeWidth={pct === 0 ? '1' : '0.5'} />
              <text x={x} y={gBottom + 14} fill="#6B7280" fontSize="9" textAnchor="middle">{pct}%</text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text x={gLeft - 35} y={gCy} fill="#6B7280" fontSize="10" textAnchor="middle" transform={`rotate(-90, ${gLeft - 35}, ${gCy})`}>deg/s</text>

        {/* Curves */}
        {curves.map(c => (
          <polyline key={c.label} fill="none" stroke={c.color} strokeWidth="2" points={c.points} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* Max rate markers at full stick (right edge) */}
        {curves.map(c => {
          const y = rateToY(c.maxRate);
          return (
            <g key={`marker-${c.label}`}>
              <circle cx={gRight} cy={y} r="3" fill={c.color} />
              <text x={gRight + 6} y={y + 3} fill={c.color} fontSize="9" fontWeight="600">{c.maxRate}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Rate curve visualization with better visuals
function RateCurve({
  rcRate,
  superRate,
  expo,
  color,
  ratesType = 0,
}: {
  rcRate: number;
  superRate: number;
  expo: number;
  color: string;
  ratesType?: number;
}) {
  const points = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 100; i += 2) {
      const stick = i / 100;
      const rate = calculateRate(stick, rcRate, superRate, expo, ratesType);
      const x = 5 + (i / 100) * 90;
      // Normalize the rate for display (cap at 90% height)
      const maxRate = calculateMaxRate(rcRate, superRate, ratesType);
      const normalizedRate = maxRate > 0 ? (rate / maxRate) * 90 : 0;
      const y = 95 - Math.min(normalizedRate, 90);
      pts.push(`${x},${y}`);
    }
    return pts.join(' ');
  }, [rcRate, superRate, expo, ratesType]);

  const maxRate = useMemo(() => {
    return calculateMaxRate(rcRate, superRate, ratesType);
  }, [rcRate, superRate, ratesType]);

  return (
    <div className="bg-surface-raised rounded-lg p-3 border-subtle">
      <div className="flex items-center justify-between text-xs text-content-secondary mb-2">
        <span>响应曲线</span>
        <span className="text-content-secondary">最大：<span style={{ color }}>{maxRate}°/s</span></span>
      </div>
      <svg viewBox="0 0 100 100" className="w-full h-24">
        {/* Grid */}
        <line x1="5" y1="95" x2="95" y2="95" stroke="#374151" strokeWidth="0.5" />
        <line x1="5" y1="50" x2="95" y2="50" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
        <line x1="5" y1="5" x2="5" y2="95" stroke="#374151" strokeWidth="0.5" />
        <line x1="50" y1="5" x2="50" y2="95" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
        {/* Labels */}
        <text x="50" y="99" fill="#6B7280" fontSize="4" textAnchor="middle">摇杆</text>
        <text x="2" y="50" fill="#6B7280" fontSize="4" textAnchor="middle" transform="rotate(-90, 2, 50)">速率</text>
        {/* Curve */}
        <polyline fill="none" stroke={color} strokeWidth="2.5" points={points} strokeLinecap="round" />
      </svg>
    </div>
  );
}

// Rates Tab Component with presets, profiles, and reset
function RatesTab({
  rcTuning,
  updateRcTuning,
  setRcTuning,
  setModified,
  isLegacyInav = false,
  isInav = false,
}: {
  rcTuning: MSPRcTuning;
  updateRcTuning: (field: keyof MSPRcTuning, value: number) => void;
  setRcTuning: (rates: MSPRcTuning) => void;
  setModified: (v: boolean) => void;
  isLegacyInav?: boolean;  // Legacy iNav < 2.3.0 has no per-axis RC rates
  isInav?: boolean;  // iNav firmware (RC_RATE is fixed at 100)
}) {
  const showInfoCards = useSettingsStore((s) => s.uiVisibility.showInfoCards);
  const [customProfiles, setCustomProfiles] = useState<Record<string, { name: string; data: Partial<MSPRcTuning> }>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [profileName, setProfileName] = useState('');

  // Load custom profiles on mount
  useEffect(() => {
    setCustomProfiles(loadCustomProfiles<Partial<MSPRcTuning>>(RATE_PROFILES_KEY));
  }, []);

  // Apply a rate preset
  const applyPreset = (presetKey: keyof typeof RATE_PRESETS) => {
    const preset = RATE_PRESETS[presetKey]!;
    setRcTuning({ ...rcTuning, ...preset.rates });
    setModified(true);
  };

  // Reset to Betaflight defaults
  const resetToDefaults = () => {
    setRcTuning({ ...rcTuning, ...DEFAULT_RATES });
    setModified(true);
  };

  // Save current rates as custom profile
  const saveProfile = () => {
    if (!profileName.trim()) return;
    const id = `custom-${Date.now()}`;
    const newProfiles = {
      ...customProfiles,
      [id]: {
        name: profileName.trim(),
        data: {
          rcRate: rcTuning.rcRate,
          rcExpo: rcTuning.rcExpo,
          rcPitchRate: rcTuning.rcPitchRate,
          rcPitchExpo: rcTuning.rcPitchExpo,
          rcYawRate: rcTuning.rcYawRate,
          rcYawExpo: rcTuning.rcYawExpo,
          rollRate: rcTuning.rollRate,
          pitchRate: rcTuning.pitchRate,
          yawRate: rcTuning.yawRate,
        },
      },
    };
    setCustomProfiles(newProfiles);
    saveCustomProfiles(RATE_PROFILES_KEY, newProfiles);
    setProfileName('');
    setShowSaveDialog(false);
  };

  // Load a custom profile
  const loadProfile = (id: string) => {
    const profile = customProfiles[id];
    if (profile) {
      setRcTuning({ ...rcTuning, ...profile.data });
      setModified(true);
    }
  };

  // Delete a custom profile
  const deleteProfile = (id: string) => {
    const newProfiles = { ...customProfiles };
    delete newProfiles[id];
    setCustomProfiles(newProfiles);
    saveCustomProfiles(RATE_PROFILES_KEY, newProfiles);
  };

  return (
    <div className="max-w-full px-4 space-y-6">
      {/* Info card */}
      {showInfoCards && (
        <div className="bg-blue-500/10 rounded-xl border-blue-500/30 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Info className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-blue-400 font-medium">什么是角速率（Rates）？</p>
            <p className="text-sm text-content-secondary">角速率控制打杆时飞行器的旋转快慢，数值越高旋转越快。</p>
          </div>
        </div>
      )}

      {/* Quick Presets */}
      <PresetSelector
        presets={RATE_PRESETS}
        onApply={(key) => applyPreset(key as keyof typeof RATE_PRESETS)}
        label="快捷预设"
      />

      {/* Rate Type Selector (Betaflight only) */}
      {!isInav && (
        <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/5 rounded-xl border-orange-500/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Gauge className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-orange-300 font-medium">速率曲线类型</p>
                <p className="text-xs text-content-secondary">
                  {RATE_TYPES.find(t => t.value === rcTuning.ratesType)?.description || '选择曲线算法'}
                </p>
              </div>
            </div>
            <select
              value={rcTuning.ratesType}
              onChange={(e) => {
                updateRcTuning('ratesType', parseInt(e.target.value, 10));
              }}
              className="px-4 py-2 bg-surface-raised border rounded-lg text-content text-sm focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              {RATE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* My Custom Profiles */}
      <div className="bg-surface rounded-xl border-subtle p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-content-secondary">我的配置</h4>
            <button
              onClick={resetToDefaults}
              className="px-2 py-1 text-xs rounded bg-surface-raised hover:bg-surface-raised text-content-secondary hover:text-content transition-colors flex items-center gap-1"
              title="恢复出厂默认"
            >
              <RotateCcw className="w-3 h-3" />
              重置
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {Object.entries(customProfiles).map(([id, profile]) => (
              <div key={id} className="flex items-center gap-1 bg-surface-raised rounded-lg overflow-hidden">
                <button
                  onClick={() => loadProfile(id)}
                  className="px-3 py-1.5 text-sm text-content hover:text-content hover:bg-surface-raised transition-colors"
                >
                  {profile.name}
                </button>
                <button
                  onClick={() => deleteProfile(id)}
                  className="px-2 py-1.5 text-content-secondary hover:text-red-400 hover:bg-surface-raised transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
            {showSaveDialog ? (
              <div className="flex items-center gap-1 bg-surface-raised rounded-lg overflow-hidden">
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="名称..."
                  className="w-24 px-2 py-1.5 bg-transparent text-content text-sm focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveProfile();
                    if (e.key === 'Escape') setShowSaveDialog(false);
                  }}
                />
                <button
                  onClick={saveProfile}
                  disabled={!profileName.trim()}
                  className="px-2 py-1.5 text-emerald-400 hover:text-emerald-300 disabled:text-content-tertiary transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-2 py-1.5 text-content-secondary hover:text-content transition-colors"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveDialog(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-surface-raised hover:bg-surface-raised text-content-secondary hover:text-content transition-colors flex items-center gap-1"
                title="将当前设置保存为配置"
              >
                <span>+</span> 保存
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rate sliders */}
      <div className="grid grid-cols-3 gap-5">
        {[
          { axis: '横滚', Icon: MoveHorizontal, color: '#3B82F6', rcRate: 'rcRate' as const, superRate: 'rollRate' as const, expo: 'rcExpo' as const },
          { axis: '俯仰', Icon: MoveVertical, color: '#10B981', rcRate: 'rcPitchRate' as const, superRate: 'pitchRate' as const, expo: 'rcPitchExpo' as const },
          { axis: '偏航', Icon: RefreshCw, color: '#F97316', rcRate: 'rcYawRate' as const, superRate: 'yawRate' as const, expo: 'rcYawExpo' as const },
        ].map(({ axis, Icon, color, rcRate, superRate, expo }) => (
          <div key={axis} className="bg-surface rounded-xl border-subtle p-5">
            <h3 className="text-lg font-medium text-content mb-4 flex items-center gap-2">
              <Icon className="w-5 h-5" style={{ color }} /> {axis}
            </h3>
            <div className="space-y-4">
              {/* Center Rate - hidden for ALL iNav (RC_RATE is always fixed at 100 in iNav) */}
              {/* Only show for Betaflight which supports configurable rcRate */}
              {!isInav && (
                <DraggableSlider
                  label="中心速率"
                  value={rcTuning[rcRate] as number}
                  onChange={(v) => updateRcTuning(rcRate, v)}
                  color={color}
                  hint="中心附近灵敏度"
                />
              )}
              <DraggableSlider
                label="最大速率"
                value={rcTuning[superRate] as number}
                onChange={(v) => updateRcTuning(superRate, v)}
                color={color}
                hint="满杆速度"
                max={isLegacyInav ? 1000 : 200}
              />
              <DraggableSlider
                label={isInav && axis === '俯仰' ? '指数（联动横滚）' : '指数'}
                value={rcTuning[expo] as number}
                onChange={(v) => updateRcTuning(expo, v)}
                max={100}
                color={color}
                hint={isInav && axis === '俯仰' ? 'iNav 中与横滚共享' : '曲线柔和度'}
              />
            </div>
            <div className="mt-4">
              <RateCurve
                rcRate={rcTuning[rcRate] as number}
                superRate={rcTuning[superRate] as number}
                expo={rcTuning[expo] as number}
                color={color}
                ratesType={rcTuning.ratesType}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Combined Rates Preview Graph */}
      <CombinedRatesCurve rcTuning={rcTuning} />

    </div>
  );
}

// PID Tuning Tab Component with presets, profiles, and reset
function PidTuningTab({
  pid,
  setPid,
  updatePid,
  setModified,
}: {
  pid: MSPPid;
  setPid: (pids: MSPPid) => void;
  updatePid: (axis: 'roll' | 'pitch' | 'yaw', field: 'p' | 'i' | 'd', value: number) => void;
  setModified: (v: boolean) => void;
}) {
  const showExplanationCards = useSettingsStore((s) => s.uiVisibility.showExplanationCards);
  const [customProfiles, setCustomProfiles] = useState<Record<string, { name: string; data: MSPPid }>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [profileName, setProfileName] = useState('');

  // Load custom profiles on mount
  useEffect(() => {
    setCustomProfiles(loadCustomProfiles<MSPPid>(PID_PROFILES_KEY));
  }, []);

  // Apply a PID preset (merge with current to preserve altHold, posHold, etc.)
  const applyPreset = (presetKey: keyof typeof PID_PRESETS) => {
    const preset = PID_PRESETS[presetKey]!;
    // IMPORTANT: Merge with current pid to preserve optional PIDs (altHold, posHold, level, mag, etc.)
    // Without this, MSP_SET_PID sends 9 bytes instead of 30, causing the command to fail
    setPid({ ...pid, ...preset.pids });
    setModified(true);
  };

  // Reset to Betaflight defaults (merge to preserve optional PIDs)
  const resetToDefaults = () => {
    setPid({ ...pid, ...DEFAULT_PIDS });
    setModified(true);
  };

  // Save current PIDs as custom profile
  const saveProfile = () => {
    if (!profileName.trim()) return;
    const id = `custom-${Date.now()}`;
    const newProfiles = {
      ...customProfiles,
      [id]: {
        name: profileName.trim(),
        data: { ...pid },
      },
    };
    setCustomProfiles(newProfiles);
    saveCustomProfiles(PID_PROFILES_KEY, newProfiles);
    setProfileName('');
    setShowSaveDialog(false);
  };

  // Load a custom profile (merge to preserve optional PIDs)
  const loadProfile = (id: string) => {
    const profile = customProfiles[id];
    if (profile) {
      setPid({ ...pid, ...profile.data });
      setModified(true);
    }
  };

  // Delete a custom profile
  const deleteProfile = (id: string) => {
    const newProfiles = { ...customProfiles };
    delete newProfiles[id];
    setCustomProfiles(newProfiles);
    saveCustomProfiles(PID_PROFILES_KEY, newProfiles);
  };

  return (
    <div className="max-w-full px-4 space-y-6">
      {/* Quick Presets */}
      <PresetSelector
        presets={PID_PRESETS}
        onApply={(key) => applyPreset(key as keyof typeof PID_PRESETS)}
        label="快捷预设"
      />

      {/* My Custom Profiles */}
      <div className="bg-surface rounded-xl border-subtle p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-content-secondary">我的配置</h4>
            <button
              onClick={resetToDefaults}
              className="px-2 py-1 text-xs rounded bg-surface-raised hover:bg-surface-raised text-content-secondary hover:text-content transition-colors flex items-center gap-1"
              title="恢复出厂默认"
            >
              <RotateCcw className="w-3 h-3" />
              重置
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {Object.entries(customProfiles).map(([id, profile]) => (
              <div key={id} className="flex items-center gap-1 bg-surface-raised rounded-lg overflow-hidden">
                <button
                  onClick={() => loadProfile(id)}
                  className="px-3 py-1.5 text-sm text-content hover:text-content hover:bg-surface-raised transition-colors"
                >
                  {profile.name}
                </button>
                <button
                  onClick={() => deleteProfile(id)}
                  className="px-2 py-1.5 text-content-secondary hover:text-red-400 hover:bg-surface-raised transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
            {showSaveDialog ? (
              <div className="flex items-center gap-1 bg-surface-raised rounded-lg overflow-hidden">
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="名称..."
                  className="w-24 px-2 py-1.5 bg-transparent text-content text-sm focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveProfile();
                    if (e.key === 'Escape') setShowSaveDialog(false);
                  }}
                />
                <button
                  onClick={saveProfile}
                  disabled={!profileName.trim()}
                  className="px-2 py-1.5 text-emerald-400 hover:text-emerald-300 disabled:text-content-tertiary transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-2 py-1.5 text-content-secondary hover:text-content transition-colors"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveDialog(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-surface-raised hover:bg-surface-raised text-content-secondary hover:text-content transition-colors flex items-center gap-1"
                title="将当前设置保存为配置"
              >
                <span>+</span> 保存
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PID Sliders */}
      <div className="grid grid-cols-3 gap-5">
        {/* Roll */}
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl border-blue-500/20 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <MoveHorizontal className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-content">横滚 Roll</h3>
              <p className="text-xs text-content-secondary">左右倾斜</p>
            </div>
          </div>
          <div className="space-y-5">
            <DraggableSlider label="P - 响应" value={pid.roll.p} onChange={(v) => updatePid('roll', 'p', v)} color="#3B82F6" hint="越高越干脆" />
            <DraggableSlider label="I - 稳定性" value={pid.roll.i} onChange={(v) => updatePid('roll', 'i', v)} color="#10B981" hint="越高越稳定" />
            <DraggableSlider label="D - 平滑度" value={pid.roll.d} onChange={(v) => updatePid('roll', 'd', v)} color="#8B5CF6" hint="越高越顺滑" />
          </div>
        </div>

        {/* Pitch */}
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-xl border-emerald-500/20 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <MoveVertical className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-content">俯仰 Pitch</h3>
              <p className="text-xs text-content-secondary">前后倾斜</p>
            </div>
          </div>
          <div className="space-y-5">
            <DraggableSlider label="P - 响应" value={pid.pitch.p} onChange={(v) => updatePid('pitch', 'p', v)} color="#3B82F6" hint="越高越干脆" />
            <DraggableSlider label="I - 稳定性" value={pid.pitch.i} onChange={(v) => updatePid('pitch', 'i', v)} color="#10B981" hint="越高越稳定" />
            <DraggableSlider label="D - 平滑度" value={pid.pitch.d} onChange={(v) => updatePid('pitch', 'd', v)} color="#8B5CF6" hint="越高越顺滑" />
          </div>
        </div>

        {/* Yaw */}
        <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 rounded-xl border-orange-500/20 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-content">偏航 Yaw</h3>
              <p className="text-xs text-content-secondary">旋转</p>
            </div>
          </div>
          <div className="space-y-5">
            <DraggableSlider label="P - 响应" value={pid.yaw.p} onChange={(v) => updatePid('yaw', 'p', v)} color="#3B82F6" hint="越高越干脆" />
            <DraggableSlider label="I - 稳定性" value={pid.yaw.i} onChange={(v) => updatePid('yaw', 'i', v)} color="#10B981" hint="越高越稳定" />
            <DraggableSlider label="D - 平滑度" value={pid.yaw.d} onChange={(v) => updatePid('yaw', 'd', v)} color="#8B5CF6" hint="越高越顺滑" />
          </div>
        </div>
      </div>

      {/* Help card */}
      {showExplanationCards && (
        <div className="bg-surface rounded-xl border-subtle p-5">
          <h4 className="font-medium text-content mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-400" /> 这些数值是什么意思？
          </h4>
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <span className="text-blue-400 font-medium">P（响应）</span>
              <p className="text-content-secondary mt-1">飞行器的反应速度。过高会震荡/振动，过低则发软。</p>
            </div>
            <div>
              <span className="text-emerald-400 font-medium">I（稳定性）</span>
              <p className="text-content-secondary mt-1">让飞行器锁定姿态，抗风抗漂移。过高会缓慢晃动。</p>
            </div>
            <div>
              <span className="text-purple-400 font-medium">D（平滑度）</span>
              <p className="text-content-secondary mt-1">抑制过冲。过高会电机发热和噪声，过低则停止时回弹。</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Mode channel indicator with live RC value
function ModeChannelIndicator({
  mode,
  rcValue,
  onRangeChange,
}: {
  mode: MSPModeRange;
  rcValue: number;
  onRangeChange?: (start: number, end: number) => void;
}) {
  const info = MODE_INFO[mode.boxId] || {
    name: `模式 ${mode.boxId}`,
    icon: HelpCircle,
    description: '未知',
    color: 'bg-gray-500',
    beginner: '未知模式',
  };
  const IconComponent = info.icon;

  // Calculate positions
  const rangeStart = ((mode.rangeStart - 900) / 1200) * 100;
  const rangeWidth = ((mode.rangeEnd - mode.rangeStart) / 1200) * 100;
  const rcPosition = ((rcValue - 900) / 1200) * 100;
  const isActive = rcValue >= mode.rangeStart && rcValue <= mode.rangeEnd;

  return (
    <div className={`rounded-xl border p-4 transition-all ${
      isActive
        ? 'bg-gradient-to-r from-emerald-500/20 to-green-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
        : 'bg-surface border-subtle'
    }`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg ${info.color}/20 flex items-center justify-center`}>
          <IconComponent className={`w-5 h-5 ${info.color.replace('bg-', 'text-')}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-content">{info.name}</span>
            {isActive && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/30 text-emerald-400">
                已激活
              </span>
            )}
          </div>
          <p className="text-xs text-content-secondary">{info.beginner}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-content-secondary">AUX {mode.auxChannel + 1}</div>
          <div className={`text-xs ${isActive ? 'text-emerald-400' : 'text-content-secondary'}`}>
            {mode.rangeStart} - {mode.rangeEnd}
          </div>
        </div>
      </div>

      {/* Channel bar with live indicator */}
      <div className="relative h-6 bg-surface-inset rounded-full overflow-hidden">
        {/* Range highlight */}
        <div
          className={`absolute h-full transition-all ${isActive ? 'bg-emerald-500/40' : 'bg-blue-500/30'}`}
          style={{ left: `${rangeStart}%`, width: `${rangeWidth}%` }}
        />
        {/* Current RC position indicator */}
        <div
          className={`absolute top-0 h-full w-1 transition-all ${isActive ? 'bg-emerald-400' : 'bg-yellow-400'}`}
          style={{ left: `${Math.min(100, Math.max(0, rcPosition))}%` }}
        />
        {/* Scale markers */}
        <div className="absolute inset-0 flex justify-between px-1 items-center text-[8px] text-content-tertiary">
          <span>900</span>
          <span>1500</span>
          <span>2100</span>
        </div>
      </div>

      {/* Current value */}
      <div className="mt-2 text-center text-xs text-content-secondary">
        当前值：<span className={isActive ? 'text-emerald-400' : 'text-yellow-400'}>{rcValue}</span>
      </div>
    </div>
  );
}

// Enhanced Sensor card with live value display and optional toggle
function SensorCard({
  name,
  available,
  Icon,
  description,
  liveValue,
  unit,
  canToggle,
  isEnabled,
  onToggle,
  toggleSaving,
}: {
  name: string;
  available: boolean;
  Icon: LucideIcon;
  description: string;
  liveValue?: string | number | null;
  unit?: string;
  canToggle?: boolean;
  isEnabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  toggleSaving?: boolean;
}) {
  // Determine the effective state for clearer display
  const featureEnabled = canToggle ? isEnabled : undefined;
  const hardwareDetected = available;

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      hardwareDetected
        ? 'bg-emerald-500/10 border-emerald-500/30'
        : featureEnabled
          ? 'bg-yellow-500/10 border-yellow-500/30' // Feature ON but no hardware
          : 'bg-surface border-subtle'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          hardwareDetected ? 'bg-emerald-500/20' : featureEnabled ? 'bg-yellow-500/20' : 'bg-surface-raised'
        }`}>
          <Icon className={`w-5 h-5 ${hardwareDetected ? 'text-emerald-400' : featureEnabled ? 'text-yellow-400' : 'text-content-secondary'}`} />
        </div>
        <div className="flex-1">
          <div className={`font-medium ${hardwareDetected ? 'text-emerald-400' : featureEnabled ? 'text-yellow-400' : 'text-content-secondary'}`}>
            {name}
          </div>
          <div className="text-xs text-content-secondary">
            {!hardwareDetected && featureEnabled
              ? '功能已启用但未检测到硬件'
              : description}
          </div>
        </div>
        {/* Live value display */}
        {liveValue != null && hardwareDetected && (
          <div className="px-3 py-1.5 rounded-lg font-mono text-sm bg-surface text-content">
            {typeof liveValue === 'number' ? liveValue.toFixed(1) : liveValue}
            {unit && <span className="text-xs text-content-secondary ml-1">{unit}</span>}
          </div>
        )}
        {/* Feature toggle switch */}
        {canToggle && onToggle && (
          <button
            onClick={() => onToggle(!isEnabled)}
            disabled={toggleSaving}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              toggleSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            } ${isEnabled ? 'bg-emerald-500' : 'bg-gray-600'}`}
            title={isEnabled ? `关闭 ${name} 功能` : `开启 ${name} 功能`}
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white border border-strong shadow-sm transition-transform ${
              isEnabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        )}
        <div className={`px-2 py-1 text-xs rounded-lg ${
          hardwareDetected
            ? 'bg-emerald-500/20 text-emerald-400'
            : featureEnabled
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-surface-raised text-content-secondary'
        }`}>
          {hardwareDetected ? '正常' : featureEnabled ? '开' : '关'}
        </div>
      </div>
    </div>
  );
}

// Telemetry value card for displaying multiple live values
function TelemetryCard({
  title,
  icon: Icon,
  values,
}: {
  title: string;
  icon: LucideIcon;
  values: Array<{ label: string; value: number | string; unit?: string }>;
}) {
  return (
    <div className="p-4 rounded-xl border bg-surface border-subtle">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-cyan-400" />
        <span className="font-medium text-content">{title}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {values.map(({ label, value, unit }) => (
          <div key={label} className="text-center">
            <div className="text-lg font-mono text-cyan-400">
              {typeof value === 'number' ? value.toFixed(1) : value}
              {unit && <span className="text-xs text-content-secondary ml-1">{unit}</span>}
            </div>
            <div className="text-xs text-content-secondary">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Feature bit constants (shared between MspConfigView and MspSensorsTabContent)
const FEATURE_GPS = 7;
const FEATURE_SONAR = 9;

// Sensors Tab Content - isolated component to prevent telemetry re-renders from propagating to MspConfigView
function MspSensorsTabContent({
  sensors,
  features,
  featureSaving,
  isInav,
  onFeatureToggle,
  onHardwareSensorToggle,
}: {
  sensors: { acc: boolean; baro: boolean; mag: boolean; gps: boolean; sonar: boolean; gyro: boolean };
  features: number;
  featureSaving: boolean;
  isInav: boolean;
  onFeatureToggle: (bit: number, enabled: boolean) => void;
  onHardwareSensorToggle: (settingName: string, enabled: boolean) => void;
}) {
  // Telemetry subscriptions scoped to this component only - re-renders here don't affect MspConfigView
  const gps = useTelemetryStore((s) => s.gps);
  const attitude = useTelemetryStore((s) => s.attitude);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const battery = useTelemetryStore((s) => s.battery);

  return (
    <div className="max-w-full px-4 space-y-4">
      {/* Sensor Status Cards */}
      <div className="grid grid-cols-2 gap-4">
        <SensorCard
          name="陀螺仪"
          available={sensors.gyro}
          Icon={RefreshCw}
          description="测量旋转速度 — 飞行必备"
        />
        <SensorCard
          name="加速度计"
          available={sensors.acc}
          Icon={Ruler}
          description="测量倾角 — 自稳必需"
          liveValue={`${(attitude?.roll ?? 0).toFixed(0)}° / ${(attitude?.pitch ?? 0).toFixed(0)}°`}
        />
        <SensorCard
          name="GPS"
          available={sensors.gps}
          Icon={Satellite}
          description={sensors.gps ? `${gps?.satellites || 0} 颗卫星已锁定` : '功能已禁用或未连接'}
          liveValue={sensors.gps ? `${gps?.satellites || 0} 颗` : undefined}
          canToggle={true}
          isEnabled={(features & (1 << FEATURE_GPS)) !== 0}
          onToggle={(enabled) => onFeatureToggle(FEATURE_GPS, enabled)}
          toggleSaving={featureSaving}
        />
        <SensorCard
          name="气压计"
          available={sensors.baro}
          Icon={Gauge}
          description="通过气压测量高度"
          liveValue={sensors.baro ? (vfrHud?.alt ?? 0) : undefined}
          unit="m"
          canToggle={true}
          isEnabled={sensors.baro}
          onToggle={(enabled) => onHardwareSensorToggle('baro_hardware', enabled)}
          toggleSaving={featureSaving}
        />
        <SensorCard
          name="磁力计"
          available={sensors.mag}
          Icon={Compass}
          description="测量航向 — GPS 导航必需"
          liveValue={sensors.mag ? `${(attitude?.yaw ?? 0).toFixed(0)}°` : undefined}
          canToggle={true}
          isEnabled={sensors.mag}
          onToggle={(enabled) => onHardwareSensorToggle('mag_hardware', enabled)}
          toggleSaving={featureSaving}
        />
        <SensorCard
          name="测距仪"
          available={sensors.sonar}
          Icon={Ruler}
          description="测量对地距离 — 用于精准降落"
          canToggle={true}
          isEnabled={(features & (1 << FEATURE_SONAR)) !== 0}
          onToggle={(enabled) => onFeatureToggle(FEATURE_SONAR, enabled)}
          toggleSaving={featureSaving}
        />
      </div>

      {/* Live Telemetry Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-content-secondary uppercase tracking-wider">实时遥测</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Attitude Card */}
          <TelemetryCard
            title="姿态"
            icon={Target}
            values={[
              { label: '横滚', value: attitude?.roll ?? 0, unit: '°' },
              { label: '俯仰', value: attitude?.pitch ?? 0, unit: '°' },
              { label: '偏航', value: attitude?.yaw ?? 0, unit: '°' },
            ]}
          />

          {/* Altitude Card */}
          <TelemetryCard
            title="高度"
            icon={Ruler}
            values={[
              { label: '高度', value: vfrHud?.alt ?? 0, unit: 'm' },
              { label: '垂直速度', value: vfrHud?.climb ?? 0, unit: 'm/s' },
              { label: '电压', value: battery?.voltage ?? 0, unit: 'V' },
            ]}
          />
        </div>

        {/* GPS Data Card (only if GPS available) */}
        {sensors.gps && (
          <div className="p-4 rounded-xl border bg-blue-500/10 border-blue-500/30">
            <div className="flex items-center gap-2 mb-3">
              <Satellite className="w-5 h-5 text-blue-400" />
              <span className="font-medium text-blue-300">GPS 位置</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-lg font-mono text-cyan-400">
                  {(gps?.lat || 0).toFixed(6)}
                </div>
                <div className="text-xs text-content-secondary">纬度</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-mono text-cyan-400">
                  {(gps?.lon || 0).toFixed(6)}
                </div>
                <div className="text-xs text-content-secondary">经度</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-mono text-cyan-400">
                  {(gps?.alt || 0).toFixed(1)}
                  <span className="text-xs text-content-secondary ml-1">m</span>
                </div>
                <div className="text-xs text-content-secondary">GPS 高度</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-mono text-cyan-400">
                  {(vfrHud?.groundspeed || 0).toFixed(1)}
                  <span className="text-xs text-content-secondary ml-1">m/s</span>
                </div>
                <div className="text-xs text-content-secondary">速度</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {!sensors.gps && (
        <div className="bg-yellow-500/10 border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-400" />
            <div>
              <h4 className="font-medium text-yellow-400">GPS 未连接</h4>
              <p className="text-sm text-content-secondary">
                要使用 GPS 救援（自动返航），请为飞行控制器连接 GPS 模块。
              </p>
            </div>
          </div>
        </div>
      )}

      {isInav ? (
        <div className="bg-green-500/10 border-green-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Map className="w-6 h-6 text-green-400" />
            <div>
              <h4 className="font-medium text-green-400">iNav — 支持任务规划！</h4>
              <p className="text-sm text-content-secondary">
                你的飞控运行 iNav，支持自主航点任务。请查看导航中的任务规划。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-surface border-subtle rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Info className="w-6 h-6 text-content-secondary" />
            <div>
              <h4 className="font-medium text-content">Betaflight — FPV 竞速与自由飞</h4>
              <p className="text-sm text-content-secondary">
                Betaflight 针对手动飞行优化。如需自主任务和 GPS 导航，请考虑刷入 iNav 固件。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Modes Tab Content - Uses the new modes wizard and advanced editor
function ModesTabContent({ onNavigateToTab }: { onNavigateToTab?: (tabId: string) => void }) {
  const {
    isWizardOpen,
    viewMode,
    setViewMode,
    openWizard,
    closeWizard,
    originalModes,
    rcChannels,
    isLoading,
    loadFromFC,
    startRcPolling,
    stopRcPolling,
    lastSaveSuccess,
  } = useModesWizardStore();

  const { connectionState } = useConnectionStore();
  const showSectionDescriptions = useSettingsStore((s) => s.uiVisibility.showSectionDescriptions);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Load modes and start RC polling on mount
  useEffect(() => {
    loadFromFC();
    startRcPolling();
    return () => stopRcPolling();
  }, [loadFromFC, startRcPolling, stopRcPolling]);

  // Show success toast when lastSaveSuccess becomes true
  useEffect(() => {
    if (lastSaveSuccess) {
      setShowSuccessToast(true);
      const timer = setTimeout(() => setShowSuccessToast(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [lastSaveSuccess]);

  const getRcValue = (auxChannel: number) => rcChannels[auxChannel + 4] || 1500;

  // Mode info for display
  // Use MODE_INFO for consistency - derive simplified display from it
  const MODE_DISPLAY: Record<number, { name: string; Icon: LucideIcon; color: string }> = Object.fromEntries(
    Object.entries(MODE_INFO).map(([id, info]) => [id, { name: info.name, Icon: info.icon, color: info.color }])
  );

  const AUX_NAMES = ['AUX 1', 'AUX 2', 'AUX 3', 'AUX 4', 'AUX 5', 'AUX 6', 'AUX 7', 'AUX 8', 'AUX 9', 'AUX 10', 'AUX 11', 'AUX 12'];

  return (
    <div className="max-w-full px-4 space-y-4">
      {/* Success toast */}
      {showSuccessToast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white rounded-lg shadow-xl flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">模式已保存到飞行控制器！</span>
        </div>
      )}

      {/* Header with view toggle */}
      <div className="flex items-center justify-between">
        <div className="bg-gradient-to-br from-purple-500/15 to-fuchsia-600/10 rounded-xl border-purple-500/30 p-4 flex items-center gap-4 flex-1 mr-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Radio className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <p className="text-purple-300 font-medium">飞行模式</p>
            {showSectionDescriptions && (
              <p className="text-sm text-purple-200/60">
                配置你的{connectionState.vehicleType || '飞行器'}如何响应遥控器上的开关位置。
              </p>
            )}
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-surface-raised p-0.5">
            <button
              onClick={() => setViewMode('wizard')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                viewMode === 'wizard'
                  ? 'bg-blue-600 text-white'
                  : 'text-content-secondary hover:text-content'
              }`}
            >
              简单
            </button>
            <button
              onClick={() => setViewMode('advanced')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                viewMode === 'advanced'
                  ? 'bg-blue-600 text-white'
                  : 'text-content-secondary hover:text-content'
              }`}
            >
              高级
            </button>
          </div>
        </div>
      </div>

      {/* Simple view - shows current modes + wizard button */}
      {viewMode === 'wizard' && (
        <>
          {/* Loading state */}
          {isLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-content-secondary mt-2">正在从飞行控制器加载模式...</p>
            </div>
          ) : originalModes.length === 0 ? (
            /* No modes configured - show wizard prompt */
            <div className="text-center py-12 bg-gradient-to-br from-zinc-800/50 to-zinc-900/30 rounded-xl border-subtle">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                <Radio className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-lg font-medium text-content mb-2">尚未配置模式</h3>
              <p className="text-sm text-content-secondary max-w-md mx-auto mb-6">
                你的飞行控制器尚未设置任何模式。
                使用向导为你的飞行风格配置推荐模式。
              </p>
              <button
                onClick={openWizard}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
              >
                <Wand2 className="w-4 h-4" />
                启动设置向导
              </button>
            </div>
          ) : (
            /* Show existing modes */
            <div className="space-y-4">
              {/* Helper tip for newbies */}
              {showSectionDescriptions && (
                <div className="flex items-start gap-3 p-3 bg-blue-500/10 border-blue-500/20 rounded-lg">
                  <HelpCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-200/80">
                    <strong>工作原理：</strong>每个模式由遥控器上的开关触发。
                    拨动开关即可看到哪些模式被激活。进度条显示开关需要处于的位置。
                  </p>
                </div>
              )}

              {/* Mode cards */}
              <div className="grid gap-3">
                {originalModes.map((mode, idx) => {
                  const modeInfo = MODE_INFO[mode.boxId];
                  const info = MODE_DISPLAY[mode.boxId] || {
                    name: `模式 ${mode.boxId}`,
                    Icon: HelpCircle,
                    color: 'bg-zinc-500'
                  };
                  const IconComponent = info.Icon;
                  const rcValue = getRcValue(mode.auxChannel);
                  const isActive = rcValue >= mode.rangeStart && rcValue <= mode.rangeEnd;

                  // Calculate position percentages for the visual bar (900-2100 range)
                  const rangeMin = 900;
                  const rangeMax = 2100;
                  const totalRange = rangeMax - rangeMin;
                  const activeStartPercent = ((mode.rangeStart - rangeMin) / totalRange) * 100;
                  const activeWidthPercent = ((mode.rangeEnd - mode.rangeStart) / totalRange) * 100;
                  const currentPercent = ((rcValue - rangeMin) / totalRange) * 100;

                  // Friendly switch names
                  const switchNames = ['开关 A', '开关 B', '开关 C', '开关 D', '开关 E', '开关 F', '开关 G', '开关 H', '开关 I', '开关 J', '开关 K', '开关 L'];
                  const switchName = switchNames[mode.auxChannel] || `开关 ${mode.auxChannel + 1}`;

                  // Convert PWM range to friendly position description
                  const getPositionName = (pwm: number) => {
                    if (pwm <= 1100) return '低';
                    if (pwm <= 1400) return '中低';
                    if (pwm <= 1600) return '中';
                    if (pwm <= 1800) return '中高';
                    return '高';
                  };
                  const startPos = getPositionName(mode.rangeStart);
                  const endPos = getPositionName(mode.rangeEnd);
                  const positionDescription = startPos === endPos
                    ? `${startPos} 挡位`
                    : `${startPos}至${endPos}挡位`;

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-green-500/10 to-transparent border-green-500/50 shadow-lg shadow-green-500/10'
                          : 'bg-surface border-subtle hover:border'
                      }`}
                    >
                      {/* Top row: Icon, Name, Status */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${info.color}/20 flex items-center justify-center`}>
                            <IconComponent className={`w-5 h-5 ${info.color.replace('bg-', 'text-')}`} />
                          </div>
                          <div>
                            <div className="font-medium text-content">{info.name}</div>
                            <div className="text-xs text-content-secondary">
                              {modeInfo?.beginner || modeInfo?.description || 'Flight mode'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Configure button for modes with settings */}
                          {modeInfo?.configureTab && onNavigateToTab && (
                            <button
                              onClick={() => onNavigateToTab(modeInfo.configureTab!)}
                              className="px-2 py-1 text-xs bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-lg transition-colors flex items-center gap-1"
                              title={`配置 ${info.name} 设置`}
                            >
                              <Settings2 className="w-3 h-3" />
                              配置
                            </button>
                          )}
                          {isActive ? (
                            <span className="px-3 py-1 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
                              已激活
                            </span>
                          ) : (
                            <span className="px-3 py-1 text-xs bg-surface-raised text-content-secondary rounded-full">
                              未激活
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Visual range bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-content-secondary">
                          <span>{switchName}</span>
                          <span className={isActive ? 'text-green-400' : 'text-content-secondary'}>
                            位置：{rcValue < 1300 ? '低' : rcValue < 1700 ? '中' : '高'}
                          </span>
                        </div>
                        <div className="relative h-4 bg-surface-inset rounded-full overflow-hidden">
                          {/* Active zone highlight */}
                          <div
                            className={`absolute top-0 bottom-0 rounded-full ${isActive ? 'bg-green-500/40' : 'bg-blue-500/20'}`}
                            style={{
                              left: `${activeStartPercent}%`,
                              width: `${activeWidthPercent}%`
                            }}
                          />
                          {/* Current position marker */}
                          <div
                            className={`absolute top-0 bottom-0 w-1.5 rounded-full transition-all ${
                              isActive ? 'bg-green-400 shadow-lg shadow-green-400/50' : 'bg-yellow-400'
                            }`}
                            style={{ left: `calc(${currentPercent}% - 3px)` }}
                          />
                          {/* Low/Mid/High labels */}
                          <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] text-content-secondary pointer-events-none">
                            <span>低</span>
                            <span>中</span>
                            <span>高</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-content-tertiary text-center">
                          {switchName} 处于{positionDescription}时激活
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reconfigure button */}
              <div className="flex justify-center pt-4">
                <button
                  onClick={openWizard}
                  className="px-4 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm transition-colors flex items-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  用向导重新配置
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Advanced editor (shown in advanced mode) */}
      {viewMode === 'advanced' && <ModesAdvancedEditor />}

      {/* Wizard modal */}
      <ModesWizard isOpen={isWizardOpen} onClose={closeWizard} />
    </div>
  );
}

type TabId = 'tuning' | 'rates' | 'modes' | 'receiver' | 'ports' | 'sensors' | 'servo-tuning' | 'servo-mixer' | 'motor-mixer' | 'navigation' | 'auto-launch' | 'safety' | 'filters' | 'vtx';

export function MspConfigView() {
  const { connectionState, platformChangeInProgress, setPlatformChangeInProgress } = useConnectionStore();
  // Only subscribe to activeSensors (changes rarely) - live telemetry values are in MspSensorsTabContent
  const activeSensorsFromFlight = useTelemetryStore((state) => state.flight?.activeSensors ?? 0);
  const { hasChanges: modesHaveChanges, saveToFC: saveModesToFC, isSaving: modesSaving } = useModesWizardStore();
  const { openWizard: openQuickSetup, isOpen: quickSetupOpen, applySuccess: quickSetupSuccess } = useQuickSetupStore();
  const [activeTab, setActiveTab] = useState<TabId>('tuning');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [rebootNeeded, setRebootNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // RC channel values (simulated for now - would come from MSP_RC)
  const [rcChannels] = useState([1500, 1500, 1000, 1500, 1000, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500]);

  // Config state
  const [pid, setPid] = useState<MSPPid | null>(null);
  const [rcTuning, setRcTuning] = useState<MSPRcTuning | null>(null);
  const [modes, setModes] = useState<MSPModeRange[]>([]);
  const [features, setFeatures] = useState<number>(0);
  const [featureSaving, setFeatureSaving] = useState(false); // Saving feature toggle
  const [pidRatesModified, setPidRatesModified] = useState(false);
  const [safetyModified, setSafetyModified] = useState(false);
  const safetyRef = useRef<SafetyTabHandle>(null);
  const [currentPlatformType, setCurrentPlatformType] = useState<number>(0); // 0=multirotor, 1=airplane
  const [configActiveSensors, setConfigActiveSensors] = useState<number>(0); // Fetched once on config load

  // Feature bit constants (from MSP_FEATURE_CONFIG)
  // FEATURE_GPS and FEATURE_SONAR are defined at module level (shared with MspSensorsTabContent)
  const FEATURE_TELEMETRY = 10;
  const FEATURE_LED_STRIP = 16;
  const FEATURE_OSD = 18;

  // Receiver store change detection
  const receiverHasChanges = useReceiverStore((s) => s.hasChanges);

  // Combined modified state: PIDs/rates OR modes OR safety OR receiver have changes
  const modified = pidRatesModified || modesHaveChanges() || safetyModified || receiverHasChanges();

  // Sensors - use activeSensors from config load or telemetry
  // Betaflight sensor flags (from sensor_helpers.js):
  // bit 0: ACC, bit 1: BARO, bit 2: MAG, bit 3: GPS, bit 4: SONAR, bit 5: GYRO
  const activeSensors = configActiveSensors || activeSensorsFromFlight || 0;
  const sensors = useMemo(() => ({
    acc: (activeSensors & (1 << 0)) !== 0,   // bit 0
    baro: (activeSensors & (1 << 1)) !== 0,  // bit 1
    mag: (activeSensors & (1 << 2)) !== 0,   // bit 2
    gps: (activeSensors & (1 << 3)) !== 0,   // bit 3
    sonar: (activeSensors & (1 << 4)) !== 0, // bit 4
    gyro: (activeSensors & (1 << 5)) !== 0,  // bit 5
  }), [activeSensors]);

  const isInav = connectionState.fcVariant === 'INAV';

  // Platform change state (iNav only)
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [showMixingDropdown, setShowMixingDropdown] = useState(false);
  const [platformChangeState, setPlatformChangeState] = useState<'idle' | 'changing' | 'saving' | 'rebooting' | 'reconnecting' | 'error'>('idle');
  const [platformChangeError, setPlatformChangeError] = useState<string | null>(null);
  const [platformChangeTarget, setPlatformChangeTarget] = useState<string | null>(null);

  // Platform options for iNav
  const PLATFORM_OPTIONS = [
    { value: 0, label: 'Multirotor' },
    { value: 1, label: 'Airplane' },
    { value: 2, label: 'Helicopter' },
    { value: 3, label: 'Tricopter' },
  ];

  // Handle platform change with auto-reconnect
  const handlePlatformChange = async (platformType: number) => {
    const targetLabel = PLATFORM_OPTIONS.find(o => o.value === platformType)?.label || '未知';

    setShowPlatformDropdown(false);
    setPlatformChangeTarget(targetLabel);
    setPlatformChangeState('changing');
    setPlatformChangeError(null);
    setPlatformChangeInProgress(true);

    try {
      // 1. Set platform type
      const success = await window.electronAPI?.mspSetInavPlatformType(platformType);
      if (!success) throw new Error('更改机型失败');

      // 2. Save to EEPROM
      setPlatformChangeState('saving');
      await window.electronAPI?.mspSaveEeprom();
      await new Promise(r => setTimeout(r, 200));

      // 3. Reboot
      setPlatformChangeState('rebooting');
      window.electronAPI?.mspReboot().catch(() => {});

      // 4. Wait for reboot
      await new Promise(r => setTimeout(r, 4000));

      // 5. Auto-reconnect
      setPlatformChangeState('reconnecting');
      await window.electronAPI?.connect({ type: 'tcp', host: '127.0.0.1', tcpPort: 5760, protocol: 'msp' });

      // 6. Clear overlay - but keep platformChangeInProgress true!
      // The useEffect below will clear it once we're connected
      setPlatformChangeState('idle');
      setPlatformChangeTarget(null);

    } catch (err) {
      console.error('Platform change error:', err);
      setPlatformChangeState('error');
      setPlatformChangeError(err instanceof Error ? err.message : '未知错误');
    }
  };

  // Clear platformChangeInProgress ONLY when connected
  useEffect(() => {
    if (platformChangeInProgress && connectionState.isConnected) {
      setPlatformChangeInProgress(false);
    }
  }, [connectionState.isConnected, platformChangeInProgress, setPlatformChangeInProgress]);

  const clearPlatformChangeState = () => {
    setPlatformChangeState('idle');
    setPlatformChangeError(null);
    setPlatformChangeTarget(null);
    setPlatformChangeInProgress(false);
  };

  // Reboot the flight controller with auto-reconnect
  const handleReboot = async () => {
    setRebooting(true);
    setError(null);
    try {
      await window.electronAPI?.mspReboot();
      setRebootNeeded(false);
    } catch (err) {
      console.error('[UI] Reboot error:', err);
      setError('重启失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      // Give time for the board to disconnect before clearing state
      setTimeout(() => setRebooting(false), 3000);
    }
  };

  /**
   * Toggle a hardware sensor via CLI setting (baro_hardware, mag_hardware, etc.)
   * These are not feature flags - they control hardware enablement.
   * Uses CLI commands for Betaflight (MSP2 settings are iNav-only).
   */
  const handleHardwareSensorToggle = async (settingName: string, enabled: boolean) => {
    setFeatureSaving(true);
    try {
      const value = enabled ? 'AUTO' : 'NONE';
      console.log(`[UI] Setting ${settingName} to ${value}`);

      // Try MSP2 settings first (iNav), fall back to CLI (Betaflight)
      let success = await window.electronAPI?.mspSetSetting(settingName, value);

      if (!success) {
        // MSP2 settings failed - use CLI command for Betaflight
        console.log(`[UI] MSP2 settings not supported, using CLI for ${settingName}`);
        const cliCommand = `set ${settingName} = ${value}`;
        await window.electronAPI?.cliSendCommand(cliCommand);
        await new Promise(r => setTimeout(r, 100));
        // Save via CLI - this triggers FC reboot in Betaflight
        await window.electronAPI?.cliSendCommand('save');
        console.log(`[UI] ${settingName} set to ${value} via CLI - FC will reboot`);
        success = true;
      } else {
        // MSP2 worked - save to EEPROM, reboot needed to apply
        await window.electronAPI?.mspSaveEeprom();
        console.log(`[UI] ${settingName} set to ${value} - reboot required`);
        setRebootNeeded(true);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      setError(`硬件开关错误：${errorMsg}`);
      console.error('[UI] Hardware sensor toggle error:', err);
    } finally {
      setFeatureSaving(false);
    }
  };

  /**
   * Toggle a feature bit in the feature bitmask.
   * Updates locally and saves to EEPROM immediately.
   */
  const handleFeatureToggle = async (bit: number, enabled: boolean) => {
    setFeatureSaving(true);
    try {
      // If features is 0, try to reload first to avoid wiping out all features
      let currentFeatures = features;
      if (currentFeatures === 0) {
        console.log('[UI] Features is 0, reloading before toggle...');
        const reloaded = await window.electronAPI?.mspGetFeatures();
        if (typeof reloaded === 'number') {
          currentFeatures = reloaded;
          setFeatures(reloaded);
          console.log('[UI] Reloaded features:', reloaded.toString(2).padStart(32, '0'));
        } else {
          setError('加载功能列表失败 — 无法切换');
          return;
        }
      }

      const newFeatures = enabled
        ? currentFeatures | (1 << bit)      // Enable: set bit
        : currentFeatures & ~(1 << bit);    // Disable: clear bit

      console.log(`[UI] Toggling feature bit ${bit} to ${enabled}, features: ${currentFeatures.toString(2)} -> ${newFeatures.toString(2)}`);

      const success = await window.electronAPI?.mspSetFeatures(newFeatures);
      if (success) {
        setFeatures(newFeatures);
        // Delay before EEPROM save (Betaflight needs 100ms to process settings)
        await new Promise(r => setTimeout(r, 100));
        // Save to EEPROM
        await window.electronAPI?.mspSaveEeprom();
        console.log(`[UI] Feature bit ${bit} ${enabled ? 'enabled' : 'disabled'} and saved`);
      } else {
        setError('设置功能失败');
        console.error('[UI] Failed to set features');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      setError(`功能切换错误：${errorMsg}`);
      console.error('[UI] Feature toggle error:', err);
    } finally {
      setFeatureSaving(false);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowPlatformDropdown(false);
      setShowMixingDropdown(false);
    };
    if (showPlatformDropdown || showMixingDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showPlatformDropdown, showMixingDropdown]);

  // Start MSP telemetry polling when Sensors tab is active
  // Same pattern as OsdView - start on tab enter, stop on tab leave
  useEffect(() => {
    if (activeTab === 'sensors' && connectionState.isConnected) {
      // Small delay to ensure connection is stable
      const startTimeout = setTimeout(() => {
        console.log('[UI] Starting MSP telemetry for Sensors tab');
        window.electronAPI?.mspStartTelemetry(10); // 10Hz
      }, 100);

      return () => {
        clearTimeout(startTimeout);
        console.log('[UI] Stopping MSP telemetry (leaving Sensors tab)');
        window.electronAPI?.mspStopTelemetry();
      };
    }
  }, [activeTab, connectionState.isConnected]);

  // Check for legacy iNav (< 2.3.0) which has different CLI params and no per-axis RC rates
  const isLegacyInav = useMemo(() => {
    if (!isInav || !connectionState.fcVersion) return false;
    const version = connectionState.fcVersion; // e.g., "2.0.0" or "2.3.0"
    const parts = version.split('.').map(Number);
    if (parts.length < 2) return false;
    const [major, minor] = parts;
    // iNav < 2.3.0 is considered legacy
    return major! < 2 || (major === 2 && minor! < 3);
  }, [isInav, connectionState.fcVersion]);

  // Check if board has SERVO_TILT feature enabled (bit 5)
  // Some boards don't have servo outputs in multirotor mode
  const hasServoFeature = (features & (1 << 5)) !== 0;

  // Track if a load is already in progress (prevent duplicate calls from StrictMode or rapid triggers)
  const loadInProgressRef = useRef(false);

  // Load config
  const loadConfig = useCallback(async () => {
    // Prevent duplicate concurrent calls
    if (loadInProgressRef.current) {
      console.log('[UI] loadConfig skipped - already in progress');
      return;
    }
    loadInProgressRef.current = true;
    console.log('[UI] loadConfig called - this will reset modified state!');
    setLoading(true);
    setError(null);
    try {
      // Load rxMap early so all tabs have correct channel mapping
      useReceiverStore.getState().loadRxMap();

      // First batch: essential config (PID, rates, modes)
      const [pidData, rcData, modesData] = await Promise.all([
        window.electronAPI?.mspGetPid(),
        window.electronAPI?.mspGetRcTuning(),
        window.electronAPI?.mspGetModeRanges(),
      ]);

      // Second batch: features and status (separate to avoid MSP overload)
      const [featuresData, mixerConfig, statusData] = await Promise.all([
        window.electronAPI?.mspGetFeatures(),
        window.electronAPI?.mspGetInavMixerConfig?.(),
        window.electronAPI?.mspGetStatus?.(),
      ]);
      if (pidData) setPid(pidData as MSPPid);
      if (rcData) {
        const rc = rcData as MSPRcTuning;
        // Normalize for old iNav which uses combined fields:
        // - rollPitchRate instead of separate rollRate/pitchRate
        // - rcRate/rcExpo for both roll AND pitch (no separate rcPitchRate/rcPitchExpo)
        const isOldINav = rc.rcPitchRate === 0 && rc.rollRate === 0;
        if (isOldINav) {
          console.log(`[UI] Old iNav detected: normalizing combined fields`);
          // Max rates: use rollPitchRate for both roll and pitch
          if (rc.rollPitchRate > 0) {
            rc.rollRate = rc.rollPitchRate;
            rc.pitchRate = rc.rollPitchRate;
          }
          // Center rates: use rcRate for pitch too (old iNav has no rcPitchRate)
          rc.rcPitchRate = rc.rcRate;
          // Expo: use rcExpo for pitch too (old iNav has no rcPitchExpo)
          rc.rcPitchExpo = rc.rcExpo;
        }
        setRcTuning(rc);
      }
      if (modesData) setModes(modesData as MSPModeRange[]);
      if (typeof featuresData === 'number') {
        setFeatures(featuresData);
        console.log('[UI] Features loaded:', featuresData, 'binary:', featuresData.toString(2).padStart(32, '0'));
        console.log('[UI] GPS feature (bit 7):', (featuresData & (1 << 7)) !== 0 ? 'ENABLED' : 'DISABLED');
      } else {
        console.warn('[UI] Features not loaded - featuresData is:', featuresData);
      }
      if (mixerConfig && typeof mixerConfig.platformType === 'number') {
        setCurrentPlatformType(mixerConfig.platformType);
        console.log('[UI] Platform type:', mixerConfig.platformType === 1 ? 'Airplane' : 'Other');
      }
      if (statusData) {
        setConfigActiveSensors(statusData.activeSensors);
        console.log('[UI] Active sensors:', statusData.activeSensors.toString(2).padStart(8, '0'));
      }
      console.log('[UI] loadConfig complete, setting modified=false');
      setPidRatesModified(false);
      setRebootNeeded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载配置失败');
    } finally {
      setLoading(false);
      loadInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (connectionState.isConnected && connectionState.protocol === 'msp') {
      loadConfig();
    }
  }, [connectionState.isConnected, connectionState.protocol, loadConfig]);

  // Track previous Quick Setup open state to detect when it closes
  const prevQuickSetupOpenRef = useRef(quickSetupOpen);

  // Refresh config after Quick Setup wizard closes successfully
  useEffect(() => {
    // Only reload when wizard transitions from open (true) to closed (false) with success
    const wasOpen = prevQuickSetupOpenRef.current;
    prevQuickSetupOpenRef.current = quickSetupOpen;

    if (wasOpen && !quickSetupOpen && quickSetupSuccess) {
      console.log('[MspConfigView] Quick Setup completed successfully, refreshing config...');
      loadConfig();
    }
  }, [quickSetupOpen, quickSetupSuccess, loadConfig]);

  // Single save function that saves everything (PIDs + Rates + Modes + Safety + EEPROM)
  const saveAll = async () => {
    if (!modified) return;
    setSaving(true);
    setError(null);
    console.log('[UI] saveAll: saving PIDs, Rates, Modes, Safety, Receiver, and EEPROM');

    // Snapshot change flags before saves (saveConfig resets originals)
    const receiverModified = receiverHasChanges();

    try {
      // Save PIDs if available and modified
      if (pid && pidRatesModified) {
        console.log('[UI] Saving PIDs...');
        const pidSuccess = await window.electronAPI?.mspSetPid(pid);
        if (!pidSuccess) {
          setError('保存 PID 失败');
          return;
        }
      }

      // Save Rates if available and modified
      if (rcTuning && pidRatesModified) {
        console.log('[UI] Saving Rates...');
        const ratesSuccess = await window.electronAPI?.mspSetRcTuning(rcTuning);
        if (!ratesSuccess) {
          setError('保存角速率失败');
          return;
        }
      }

      // Save Modes if they have changes
      if (modesHaveChanges()) {
        console.log('[UI] Saving Modes...');
        const modesSuccess = await saveModesToFC();
        if (!modesSuccess) {
          setError('保存模式失败');
          return;
        }
      }

      // Save Safety settings if modified
      if (safetyModified && safetyRef.current) {
        console.log('[UI] Saving Safety...');
        const safetySuccess = await safetyRef.current.save();
        if (!safetySuccess) {
          setError('保存安全设置失败');
          return;
        }
      }

      // Save Receiver config (rxMap, deadband, serial ports) if changed
      if (receiverModified) {
        console.log('[UI] Saving Receiver config...');
        const receiverSuccess = await useReceiverStore.getState().saveConfig();
        if (!receiverSuccess) {
          setError('保存接收机配置失败');
          return;
        }
      }

      // Save to EEPROM once (modes saveToFC handles its own EEPROM)
      if (pidRatesModified || safetyModified || receiverModified) {
        console.log('[UI] Saving to EEPROM...');
        const eepromSuccess = await window.electronAPI?.mspSaveEeprom();
        if (!eepromSuccess) {
          setError('写入 EEPROM 失败');
          return;
        }
      }

      setPidRatesModified(false);
      setSafetyModified(false);
      console.log('[UI] All settings saved successfully');
    } catch (err) {
      console.error('[UI] Save error:', err);
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // Update handlers
  const updatePid = (axis: 'roll' | 'pitch' | 'yaw', field: 'p' | 'i' | 'd', value: number) => {
    if (!pid) return;
    console.log(`[UI] updatePid: ${axis}.${field} = ${value}, setting modified=true`);
    setPid({ ...pid, [axis]: { ...pid[axis], [field]: value } });
    setPidRatesModified(true);
    console.log('[UI] modified state set to true');
  };

  const updateRcTuning = (field: keyof MSPRcTuning, value: number) => {
    if (!rcTuning) return;
    const updates: Partial<MSPRcTuning> = { [field]: value };

    // iNav supports separate rollRate/pitchRate via MSP2 0x2007/0x2008
    // Only sync rollPitchRate for legacy compatibility (won't affect modern iNav)
    if (field === 'rollRate' || field === 'pitchRate') {
      updates.rollPitchRate = value;
    }

    // iNav uses same expo for Roll AND Pitch - keep them synced
    if (isInav) {
      if (field === 'rcExpo') {
        updates.rcPitchExpo = value;
      } else if (field === 'rcPitchExpo') {
        updates.rcExpo = value;
      }
    }

    setRcTuning({ ...rcTuning, ...updates });
    setPidRatesModified(true);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-base">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-content-secondary">正在加载你的设置...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface-base">
      {/* Platform Change Overlay */}
      {platformChangeState !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="bg-surface-solid border rounded-xl p-8 max-w-md mx-4 shadow-2xl text-center">
            {/* Icon based on state */}
            {platformChangeState === 'error' ? (
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Title */}
            <h3 className="text-lg font-semibold text-content mb-2">
              {platformChangeState === 'changing' && `正在切换到 ${platformChangeTarget}`}
              {platformChangeState === 'saving' && '正在保存配置'}
              {platformChangeState === 'rebooting' && '正在重启飞控'}
              {platformChangeState === 'reconnecting' && '正在重新连接'}
              {platformChangeState === 'error' && '切换失败'}
            </h3>

            {/* Message */}
            <p className="text-sm text-content-secondary mb-4">
              {platformChangeState === 'changing' && '正在发送机型切换命令...'}
              {platformChangeState === 'saving' && '正在写入 EEPROM...'}
              {platformChangeState === 'rebooting' && '等待飞控重启...'}
              {platformChangeState === 'reconnecting' && '正在连接飞控...'}
              {platformChangeState === 'error' && (platformChangeError || '发生错误')}
            </p>

            {/* Progress indicator for non-terminal states */}
            {(platformChangeState === 'changing' || platformChangeState === 'saving' || platformChangeState === 'rebooting' || platformChangeState === 'reconnecting') && (
              <div className="flex items-center justify-center gap-2 text-xs text-content-secondary">
                <div className="flex gap-1">
                  <div className={`w-2 h-2 rounded-full ${platformChangeState === 'changing' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                  <div className={`w-2 h-2 rounded-full ${platformChangeState === 'saving' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                  <div className={`w-2 h-2 rounded-full ${platformChangeState === 'rebooting' || platformChangeState === 'reconnecting' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                </div>
              </div>
            )}

            {/* Dismiss button only for errors */}
            {platformChangeState === 'error' && (
              <button
                onClick={clearPlatformChangeState}
                className="mt-4 px-6 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm transition-colors"
              >
                忽略
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-subtle bg-gradient-to-r from-surface to-surface">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg overflow-hidden ${
              connectionState.fcVariant === 'INAV'
                ? 'bg-white'
                : 'bg-gradient-to-br from-orange-500 to-red-600'
            }`}>
              <img
                src={connectionState.fcVariant === 'INAV' ? inavLogo : betaflightLogo}
                alt={connectionState.fcVariant === 'INAV' ? 'iNav' : 'Betaflight'}
                className="w-10 h-10 object-contain"
              />
            </div>
            <div>
              <h2 className="text-xl font-bold text-content">
                {connectionState.fcVariant === 'BTFL' ? 'Betaflight' : connectionState.fcVariant === 'INAV' ? 'iNav' : connectionState.fcVariant} 调参
              </h2>
              <div className="flex items-center gap-2 text-sm text-content-secondary">
                <span className="text-blue-400">{connectionState.fcVersion}</span>
                {connectionState.vehicleType && isInav && (
                  <>
                    <span>•</span>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPlatformDropdown(!showPlatformDropdown);
                        }}
                        disabled={platformChangeState !== 'idle'}
                        className="text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                        title="点击更改机型"
                      >
                        {connectionState.vehicleType}
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showPlatformDropdown && (
                        <div className="absolute top-full left-0 mt-1 bg-surface-solid border rounded-lg shadow-xl z-50 min-w-[140px]">
                          {PLATFORM_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlatformChange(opt.value);
                              }}
                              disabled={connectionState.vehicleType === opt.label}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-raised first:rounded-t-lg last:rounded-b-lg ${
                                connectionState.vehicleType === opt.label
                                  ? 'text-emerald-400 bg-emerald-500/10'
                                  : 'text-content'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
                {connectionState.vehicleType && !isInav && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400">{connectionState.vehicleType}</span>
                  </>
                )}
                <span>•</span>
                <span>{connectionState.boardId}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Setup Button */}
            <button
              onClick={() => openQuickSetup('msp', connectionState.fcVariant || undefined, connectionState.fcVersion || undefined)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all"
            >
              <Rocket className="w-4 h-4" />
              快速设置
            </button>

          {modified && (
              <span className="px-3 py-1 text-sm rounded-lg bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                未保存
              </span>
          )}
            <button
              onClick={loadConfig}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-lg bg-surface-raised hover:bg-surface-raised text-content border"
            >
              刷新
            </button>
            <button
              onClick={handleReboot}
              disabled={rebooting}
              className={`px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition-all ${
                rebootNeeded
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 animate-pulse'
                  : 'bg-surface-raised hover:bg-surface-raised text-content border'
              }`}
              title={rebootNeeded ? '设置已更改 — 重启后生效' : '重启飞行控制器'}
            >
              <RotateCw className={`w-4 h-4 ${rebooting ? 'animate-spin' : ''}`} />
              {rebooting ? '重启中...' : rebootNeeded ? '重启以生效' : '重启'}
            </button>
            <button
              onClick={saveAll}
              disabled={saving || !modified}
              className={`px-5 py-2 text-sm font-medium rounded-lg shadow-lg transition-all ${
                modified
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-500/25'
                  : 'bg-surface-raised text-content-secondary cursor-not-allowed'
              }`}
            >
              {saving ? <><Save className="w-4 h-4 inline mr-1" />保存中...</> : <><Save className="w-4 h-4 inline mr-1" />保存全部更改</>}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mt-4 flex-wrap items-center">
          {/* Main tabs */}
          {[
            { id: 'tuning', label: 'PID 调参', icon: SlidersHorizontal, color: 'text-blue-400' },
            { id: 'rates', label: '角速率', icon: Gauge, color: 'text-purple-400' },
            { id: 'modes', label: '模式', icon: Gamepad2, color: 'text-green-400' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-surface-raised text-content shadow-lg'
                    : 'text-content-secondary hover:text-content hover:bg-surface'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? tab.color : `${tab.color} opacity-50`}`} />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            );
          })}

          {/* Receiver */}
          <button
            onClick={() => setActiveTab('receiver')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'receiver'
                ? 'bg-surface-raised text-content shadow-lg'
                : 'text-content-secondary hover:text-content hover:bg-surface'
            }`}
          >
            <Radio className={`w-4 h-4 ${activeTab === 'receiver' ? 'text-teal-400' : 'text-teal-400 opacity-50'}`} />
            <span className="text-sm font-medium">接收机</span>
          </button>

          {/* Ports */}
          <button
            onClick={() => setActiveTab('ports')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'ports'
                ? 'bg-surface-raised text-content shadow-lg'
                : 'text-content-secondary hover:text-content hover:bg-surface'
            }`}
          >
            <Cable className={`w-4 h-4 ${activeTab === 'ports' ? 'text-sky-400' : 'text-sky-400 opacity-50'}`} />
            <span className="text-sm font-medium">端口</span>
          </button>

          {/* Mixing dropdown (iNav only) */}
          {isInav && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMixingDropdown(!showMixingDropdown);
                }}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                  ['servo-tuning', 'servo-mixer', 'motor-mixer'].includes(activeTab)
                    ? 'bg-surface-raised text-content shadow-lg'
                    : 'text-content-secondary hover:text-content hover:bg-surface'
                }`}
              >
                <Layers className={`w-4 h-4 ${
                  ['servo-tuning', 'servo-mixer', 'motor-mixer'].includes(activeTab)
                    ? 'text-cyan-400'
                    : 'text-cyan-400 opacity-50'
                }`} />
                <span className="text-sm font-medium">
                  {activeTab === 'servo-tuning' ? '舵机调试' :
                   activeTab === 'servo-mixer' ? '舵机混控' :
                   activeTab === 'motor-mixer' ? '电机混控' : '混控'}
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showMixingDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showMixingDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-surface-solid border rounded-lg shadow-xl z-50 min-w-[180px] py-1">
                  {[
                    { id: 'servo-tuning', label: '舵机调试', icon: SlidersHorizontal, color: 'text-orange-400', desc: '行程' },
                    { id: 'servo-mixer', label: '舵机混控', icon: Shuffle, color: 'text-cyan-400', desc: '翼面' },
                    { id: 'motor-mixer', label: '电机混控', icon: Cog, color: 'text-rose-400', desc: '电机' },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab(item.id as typeof activeTab);
                          setShowMixingDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center gap-3 hover:bg-surface-raised transition-colors ${
                          isActive ? 'bg-surface-raised' : ''
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${item.color}`} />
                        <div className="flex-1">
                          <div className={`text-sm ${isActive ? 'text-content' : 'text-content'}`}>{item.label}</div>
                          <div className="text-xs text-content-secondary">{item.desc}</div>
                        </div>
                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Navigation (iNav only) */}
          {isInav && (
            <button
              onClick={() => setActiveTab('navigation')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'navigation'
                  ? 'bg-surface-raised text-content shadow-lg'
                  : 'text-content-secondary hover:text-content hover:bg-surface'
              }`}
            >
              <Compass className={`w-4 h-4 ${activeTab === 'navigation' ? 'text-amber-400' : 'text-amber-400 opacity-50'}`} />
              <span className="text-sm font-medium">导航</span>
            </button>
          )}

          {/* Auto Launch (iNav Airplane only) */}
          {isInav && currentPlatformType === 1 && (
            <button
              onClick={() => setActiveTab('auto-launch')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'auto-launch'
                  ? 'bg-surface-raised text-content shadow-lg'
                  : 'text-content-secondary hover:text-content hover:bg-surface'
              }`}
            >
              <PlaneTakeoff className={`w-4 h-4 ${activeTab === 'auto-launch' ? 'text-orange-400' : 'text-orange-400 opacity-50'}`} />
              <span className="text-sm font-medium">自动起飞</span>
            </button>
          )}

          {/* Filters (Betaflight only) */}
          {!isInav && (
            <button
              onClick={() => setActiveTab('filters')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'filters'
                  ? 'bg-surface-raised text-content shadow-lg'
                  : 'text-content-secondary hover:text-content hover:bg-surface'
              }`}
            >
              <Waves className={`w-4 h-4 ${activeTab === 'filters' ? 'text-purple-400' : 'text-purple-400 opacity-50'}`} />
              <span className="text-sm font-medium">滤波器</span>
            </button>
          )}

          {/* VTX Config */}
          <button
            onClick={() => setActiveTab('vtx')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'vtx'
                ? 'bg-surface-raised text-content shadow-lg'
                : 'text-content-secondary hover:text-content hover:bg-surface'
            }`}
          >
            <Radio className={`w-4 h-4 ${activeTab === 'vtx' ? 'text-pink-400' : 'text-pink-400 opacity-50'}`} />
            <span className="text-sm font-medium">VTX</span>
          </button>

          {/* Launch Control (Betaflight only) - Coming Soon */}
          {!isInav && (
            <button
              disabled
              title="敬请期待 — 用于竞速起跑的起飞控制"
              className="px-3 py-2 rounded-lg flex items-center gap-2 text-content-tertiary cursor-not-allowed opacity-50"
            >
              <Rocket className="w-4 h-4 text-cyan-400 opacity-50" />
              <span className="text-sm font-medium">起飞控制</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised text-content-secondary">即将推出</span>
            </button>
          )}

          {/* Safety (Receiver/Failsafe) */}
          <button
            onClick={() => setActiveTab('safety')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'safety'
                ? 'bg-surface-raised text-content shadow-lg'
                : 'text-content-secondary hover:text-content hover:bg-surface'
            }`}
          >
            <Shield className={`w-4 h-4 ${activeTab === 'safety' ? 'text-red-400' : 'text-red-400 opacity-50'}`} />
            <span className="text-sm font-medium">安全</span>
          </button>

          {/* Sensors */}
          <button
            onClick={() => setActiveTab('sensors')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'sensors'
                ? 'bg-surface-raised text-content shadow-lg'
                : 'text-content-secondary hover:text-content hover:bg-surface'
            }`}
          >
            <Radio className={`w-4 h-4 ${activeTab === 'sensors' ? 'text-emerald-400' : 'text-emerald-400 opacity-50'}`} />
            <span className="text-sm font-medium">传感器</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-300">×</button>
        </div>
      )}

      {/* Reboot needed banner */}
      {rebootNeeded && !rebooting && (
        <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-sm flex items-center gap-2">
          <RotateCw className="w-4 h-4" />
          <span>设置已更改，需要重启才能生效。</span>
          <button
            onClick={handleReboot}
            className="ml-auto px-3 py-1 text-xs font-medium rounded bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 transition-colors"
          >
            立即重启
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* PID Tuning Tab */}
        {activeTab === 'tuning' && pid && (
          <PidTuningTab
            pid={pid}
            setPid={setPid}
            updatePid={updatePid}
            setModified={setPidRatesModified}
          />
        )}


        {/* Rates Tab */}
        {activeTab === 'rates' && rcTuning && (
          <RatesTab
            rcTuning={rcTuning}
            updateRcTuning={updateRcTuning}
            setRcTuning={setRcTuning}
            setModified={setPidRatesModified}
            isLegacyInav={isLegacyInav}
            isInav={isInav}
          />
        )}


        {/* Modes Tab */}
        {activeTab === 'modes' && <ModesTabContent onNavigateToTab={(tabId) => setActiveTab(tabId as TabId)} />}

        {/* Sensors Tab - extracted to isolate telemetry re-renders */}
        {activeTab === 'sensors' && (
          <MspSensorsTabContent
            sensors={sensors}
            features={features}
            featureSaving={featureSaving}
            isInav={isInav}
            onFeatureToggle={handleFeatureToggle}
            onHardwareSensorToggle={handleHardwareSensorToggle}
          />
        )}

        {/* Servo Tuning Tab (iNav only) */}
        {activeTab === 'servo-tuning' && isInav && (
          <ServoTuningTab />
        )}

        {/* Servo Mixer Tab (iNav only) */}
        {activeTab === 'servo-mixer' && isInav && (
          <ServoMixerTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* Motor Mixer Tab (iNav only) */}
        {activeTab === 'motor-mixer' && isInav && (
          <MotorMixerTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* Navigation Tab (iNav only) */}
        {activeTab === 'navigation' && isInav && (
          <NavigationTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* Auto Launch Tab (iNav Airplane only) */}
        {activeTab === 'auto-launch' && isInav && currentPlatformType === 1 && (
          <AutoLaunchTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* Filter Config Tab (Betaflight only) */}
        {activeTab === 'filters' && !isInav && (
          <FilterConfigTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* VTX Config Tab */}
        {activeTab === 'vtx' && (
          <VtxConfigTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* Safety Tab (Receiver/Failsafe) */}
        {/* Receiver Tab */}
        {activeTab === 'receiver' && (
          <ReceiverTab
            isInav={isInav}
            modified={modified}
            setModified={setPidRatesModified}
            onNavigateToTab={(tabId) => setActiveTab(tabId as TabId)}
          />
        )}

        {/* Ports Tab */}
        {activeTab === 'ports' && (
          <PortsTab modified={modified} setModified={setPidRatesModified} />
        )}

        {activeTab === 'safety' && (
          <SafetyTab ref={safetyRef} isInav={isInav} setModified={setSafetyModified} />
        )}
      </div>

      {/* Quick Setup Wizard Modal */}
      <QuickSetupWizard />
    </div>
  );
}
