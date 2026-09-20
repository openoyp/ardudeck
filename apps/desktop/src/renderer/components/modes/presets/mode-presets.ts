/**
 * Mode Presets for the Modes Wizard
 *
 * These presets provide quick setup options for different flying styles.
 * Each preset includes sensible mode configurations for beginners.
 */

import type { MSPModeRange } from '@ardudeck/msp-ts';
import type { LucideIcon } from 'lucide-react';
import {
  Power, Square, Sunrise, Wind, ArrowUpFromLine, Home, MapPin, Map, Plane, Compass,
  Rocket, Gamepad2, Volume2, ShieldAlert, Package, Satellite, Joystick, PlaneTakeoff,
  RotateCw, RotateCcw, Waypoints, Navigation, KeyRound, Turtle, HelpCircle, Radio,
  Baby, Sparkles, Trophy, Video
} from 'lucide-react';

// iNav permanent box IDs (from fc_msp_box.c)
export const BOX_ID = {
  ARM: 0,
  ANGLE: 1,
  HORIZON: 2,
  NAV_ALTHOLD: 3,
  HEADING_HOLD: 5,
  HEADFREE: 6,
  HEADADJ: 7,
  CAMSTAB: 8,
  NAV_RTH: 10,
  NAV_POSHOLD: 11,
  MANUAL: 12,
  BEEPER: 13,
  LEDS_OFF: 15,
  LIGHTS: 16,
  OSD_OFF: 19,
  TELEMETRY: 20,
  AUTO_TUNE: 21,
  BLACKBOX: 26,
  FAILSAFE: 27,
  NAV_WP: 28,
  AIRMODE: 29,
  HOME_RESET: 30,
  GCS_NAV: 31,
  FPV_ANGLE_MIX: 32,
  SURFACE: 33,
  FLAPERON: 34,
  TURN_ASSIST: 35,
  NAV_LAUNCH: 36,
  SERVO_AUTOTRIM: 37,
  CAMERA_1: 39,
  CAMERA_2: 40,
  CAMERA_3: 41,
  OSD_ALT_1: 42,
  OSD_ALT_2: 43,
  OSD_ALT_3: 44,
  NAV_COURSE_HOLD: 45,
  MC_BRAKING: 46,
  USER1: 47,
  USER2: 48,
  LOITER_CHANGE: 49,
  MSP_RC_OVERRIDE: 50,
  PREARM: 51,
  TURTLE: 52,
  NAV_CRUISE: 53,
  AUTO_LEVEL: 54,
  WP_PLANNER: 55,
  SOARING: 56,
  USER3: 57,
  USER4: 58,
  MISSION_CHANGE: 59,
  BEEPER_MUTE: 60,
  MULTI_FUNC: 61,
  MIXER_PROFILE_2: 62,
  MIXER_TRANSITION: 63,
  ANGLE_HOLD: 64,
  GIMBAL_LEVEL_TILT: 65,
  GIMBAL_LEVEL_ROLL: 66,
  GIMBAL_CENTER: 67,
  GIMBAL_HEADTRACKER: 68,
} as const;

// Mode metadata with beginner-friendly descriptions
export const MODE_INFO: Record<
  number,
  {
    name: string;
    icon: LucideIcon;
    description: string;
    color: string;
    beginner: string;
    essential?: boolean;
    configureTab?: string; // Tab ID to configure this mode's settings
  }
> = {
  [BOX_ID.ARM]: {
    name: 'ARM',
    icon: Power,
    description: '启用电机',
    color: 'bg-red-500',
    beginner:
      '安全开关 —— 解锁/上锁飞行器。务必使用一个专用开关!解锁后,螺旋桨随时可能转动。',
    essential: true,
  },
  [BOX_ID.ANGLE]: {
    name: 'ANGLE',
    icon: Square,
    description: '自稳',
    color: 'bg-blue-500',
    beginner:
      '新手模式 —— 松杆后飞行器会自动回平,最大倾斜角受限。非常适合学习飞行!',
    essential: true,
  },
  [BOX_ID.HORIZON]: {
    name: 'HORIZON',
    icon: Sunrise,
    description: '自稳 + 特技',
    color: 'bg-purple-500',
    beginner:
      '进阶模式 —— 摇杆居中时如 ANGLE 般自稳,满杆时允许翻滚。是 ANGLE 与 ACRO 之间的过渡。',
  },
  [BOX_ID.AIRMODE]: {
    name: 'AIRMODE',
    icon: Wind,
    description: '零油门下仍保持完整控制',
    color: 'bg-cyan-500',
    beginner:
      '高级 —— 即使油门为零也保持完整的摇杆控制权限。自由式动作与翻滚必备,通常保持常开。',
  },
  [BOX_ID.NAV_ALTHOLD]: {
    name: 'NAV ALTHOLD',
    icon: ArrowUpFromLine,
    description: '锁定高度',
    color: 'bg-teal-500',
    beginner: '利用气压计/GPS 锁定当前高度。油门控制爬升/下降率。',
  },
  [BOX_ID.NAV_RTH]: {
    name: 'NAV RTH',
    icon: Home,
    description: '返航',
    color: 'bg-green-500',
    beginner: '返航 —— 飞行器将爬升至安全高度并飞回起飞点。必备安全功能!',
    essential: true,
  },
  [BOX_ID.NAV_POSHOLD]: {
    name: 'NAV POSHOLD',
    icon: MapPin,
    description: '定点悬停',
    color: 'bg-cyan-500',
    beginner: 'GPS 定点 —— 飞行器将保持位置不动。航拍或需要停下时非常有用。',
  },
  [BOX_ID.NAV_WP]: {
    name: 'NAV WP',
    icon: Map,
    description: '航点任务',
    color: 'bg-indigo-500',
    beginner: '执行已上传的航点任务。飞行器将自动飞向每个航点。',
    essential: true,
  },
  [BOX_ID.NAV_COURSE_HOLD]: {
    name: 'NAV COURSE HOLD',
    icon: Compass,
    description: '锁定航迹',
    color: 'bg-violet-500',
    beginner: '保持当前航迹,同时可控制高度。适合直线飞行。',
  },
  [BOX_ID.NAV_CRUISE]: {
    name: 'NAV CRUISE',
    icon: Plane,
    description: '巡航',
    color: 'bg-sky-500',
    beginner: '固定翼巡航模式 —— 保持航向和高度。远距离飞行的理想选择。',
  },
  [BOX_ID.NAV_LAUNCH]: {
    name: 'NAV LAUNCH',
    icon: Rocket,
    description: '自动起飞',
    color: 'bg-orange-500',
    beginner: '固定翼自动起飞程序。抛出飞机后它会自动爬升至安全高度。',
    configureTab: 'auto-launch',
  },
  [BOX_ID.GCS_NAV]: {
    name: 'GCS NAV',
    icon: Gamepad2,
    description: '地面站控制',
    color: 'bg-purple-500',
    beginner: '允许地面站发送导航指令(飞往指定点等)。',
  },
  [BOX_ID.BEEPER]: {
    name: 'BEEPER',
    icon: Volume2,
    description: '寻找飞行器',
    color: 'bg-yellow-500',
    beginner:
      '寻机 —— 让飞行器大声鸣响,炸机后帮你找到它。落进深草时特别有用!',
  },
  [BOX_ID.FAILSAFE]: {
    name: 'FAILSAFE',
    icon: ShieldAlert,
    description: '紧急降落',
    color: 'bg-orange-500',
    beginner:
      '紧急 —— 触发失控保护行为(通常为降落或上锁)。一般在信号丢失时自动触发。',
  },
  [BOX_ID.BLACKBOX]: {
    name: 'BLACKBOX',
    icon: Package,
    description: '飞行记录',
    color: 'bg-gray-500',
    beginner:
      '记录 —— 将飞行数据记录到 SD 卡以便分析。调 PID 和复盘炸机很有用。',
  },
  [BOX_ID.GIMBAL_LEVEL_TILT]: {
    name: 'GIMBAL LEVEL TILT',
    icon: Satellite,
    description: '云台俯仰自动水平',
    color: 'bg-indigo-500',
    beginner:
      '无论飞行器姿态如何,都保持云台俯仰轴水平。用于相机稳定。',
  },
  [BOX_ID.MANUAL]: {
    name: 'MANUAL',
    icon: Joystick,
    description: '直接控制',
    color: 'bg-rose-500',
    beginner: '绕过增稳直接控制舵机/电机。仅限经验丰富的飞手!',
  },
  [BOX_ID.FLAPERON]: {
    name: 'FLAPERON',
    icon: PlaneTakeoff,
    description: '襟翼模式',
    color: 'bg-amber-500',
    beginner: '启用襟副翼,降低进近速度。副翼下偏充当襟翼。',
  },
  [BOX_ID.TURN_ASSIST]: {
    name: 'TURN ASSIST',
    icon: RotateCw,
    description: '协调转弯',
    color: 'bg-lime-500',
    beginner: '自动协调方向舵与副翼,转弯更顺畅。固定翼新手的福音。',
  },
  [BOX_ID.HOME_RESET]: {
    name: 'HOME RESET',
    icon: RotateCcw,
    description: '重置 Home 点',
    color: 'bg-red-400',
    beginner: '将当前位置设为新的 Home 点。更换飞行位置时使用。',
  },
  [BOX_ID.WP_PLANNER]: {
    name: 'WP PLANNER',
    icon: Waypoints,
    description: '任务规划器',
    color: 'bg-fuchsia-500',
    beginner: '通过摇杆指令进行空中航点规划。',
  },
  [BOX_ID.HEADING_HOLD]: {
    name: 'HEADING HOLD',
    icon: Navigation,
    description: '锁定航向',
    color: 'bg-emerald-500',
    beginner: '保持当前磁航向。适合直线飞行。',
  },
  [BOX_ID.PREARM]: {
    name: 'PREARM',
    icon: KeyRound,
    description: '预解锁检查',
    color: 'bg-yellow-600',
    beginner: '安全开关 —— 解锁前必须先启用,防止误解锁。',
  },
  [BOX_ID.TURTLE]: {
    name: 'TURTLE',
    icon: Turtle,
    description: '翻机扶正',
    color: 'bg-stone-500',
    beginner: '电机反转将炸机翻正。仅适用于多旋翼。',
  },
};

// Preset configurations
export interface ModePreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  tip: string;
  gradient: string;
  modes: MSPModeRange[];
  // Which modes to configure in the wizard (in order)
  wizardModes: number[];
}

export const PRESETS: Record<string, ModePreset> = {
  beginner: {
    id: 'beginner',
    name: '新手',
    icon: 'baby',
    description: '安全简单,适合学习',
    tip: '飞行器始终保持水平。非常适合练习悬停和基本动作!',
    gradient: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    modes: [
      // ARM on AUX1 high (1800-2100)
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE always on (entire range)
      { boxId: BOX_ID.ANGLE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE],
  },

  freestyle: {
    id: 'freestyle',
    name: '自由式',
    icon: 'sparkles',
    description: '兼顾技巧与流畅',
    tip: 'AUX2 三段开关可在 ANGLE/HORIZON/ACRO 之间切换。拨动开关即可改变飞行风格!',
    gradient: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE on AUX2 low (for recovery)
      { boxId: BOX_ID.ANGLE, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // HORIZON on AUX2 mid
      { boxId: BOX_ID.HORIZON, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // AIRMODE always on
      { boxId: BOX_ID.AIRMODE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.HORIZON, BOX_ID.AIRMODE],
  },

  racing: {
    id: 'racing',
    name: '竞速',
    icon: 'trophy',
    description: '快速响应,为速度而生',
    tip: '纯 ACRO 模式,控制感最强。AUX3 上的蜂鸣器帮你在炸机后找到飞行器!',
    gradient: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // AIRMODE always on
      { boxId: BOX_ID.AIRMODE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
      // BEEPER on AUX3 high
      { boxId: BOX_ID.BEEPER, auxChannel: 2, rangeStart: 1800, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.AIRMODE, BOX_ID.BEEPER],
  },

  cinematic: {
    id: 'cinematic',
    name: '影视',
    icon: 'video',
    description: '极致顺滑,专为拍摄',
    tip: '信号丢失时 NAV RTH 自动返航(需要 GPS!)。远距离拍摄的理想选择。',
    gradient: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE always on (smooth, stable shots)
      { boxId: BOX_ID.ANGLE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
      // NAV RTH on AUX2 high
      { boxId: BOX_ID.NAV_RTH, auxChannel: 1, rangeStart: 1800, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.NAV_RTH],
  },

  fixedWing: {
    id: 'fixedWing',
    name: '固定翼',
    icon: 'plane',
    description: '带导航功能的固定翼',
    tip: '固定翼完整配置:自动起飞、返航与航点导航。',
    gradient: 'from-sky-500/20 to-blue-500/10 border-sky-500/30',
    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // NAV LAUNCH on AUX2 low (for auto-launch)
      { boxId: BOX_ID.NAV_LAUNCH, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // NAV RTH on AUX2 mid
      { boxId: BOX_ID.NAV_RTH, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // NAV WP on AUX2 high (waypoint mission)
      { boxId: BOX_ID.NAV_WP, auxChannel: 1, rangeStart: 1700, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.NAV_LAUNCH, BOX_ID.NAV_RTH, BOX_ID.NAV_WP],
  },
};

// Preset icon mapping (string key -> Lucide component)
export const PRESET_ICONS: Record<string, LucideIcon> = {
  baby: Baby,
  sparkles: Sparkles,
  trophy: Trophy,
  video: Video,
  plane: Plane,
};

// All available modes for advanced editor
export const ALL_MODES = Object.entries(MODE_INFO).map(([boxId, info]) => ({
  boxId: Number(boxId),
  ...info,
}));

// Essential modes that should always be visible
export const ESSENTIAL_MODES = ALL_MODES.filter((m) => m.essential);

// AUX channel names (iNav/Betaflight support up to 12 AUX channels)
export const AUX_CHANNELS = [
  { index: 0, name: 'AUX 1', description: '通常为两段开关' },
  { index: 1, name: 'AUX 2', description: '常为三段开关' },
  { index: 2, name: 'AUX 3', description: '附加开关' },
  { index: 3, name: 'AUX 4', description: '附加开关' },
  { index: 4, name: 'AUX 5', description: '附加通道(旋钮/滑块)' },
  { index: 5, name: 'AUX 6', description: '附加通道(旋钮/滑块)' },
  { index: 6, name: 'AUX 7', description: '附加通道' },
  { index: 7, name: 'AUX 8', description: '附加通道' },
  { index: 8, name: 'AUX 9', description: '附加通道' },
  { index: 9, name: 'AUX 10', description: '附加通道' },
  { index: 10, name: 'AUX 11', description: '附加通道' },
  { index: 11, name: 'AUX 12', description: '附加通道' },
] as const;

// PWM range constants
export const PWM = {
  MIN: 900,
  MAX: 2100,
  CENTER: 1500,
  // Common ranges for switches
  LOW: { start: 900, end: 1300 },
  MID: { start: 1300, end: 1700 },
  HIGH: { start: 1700, end: 2100 },
  // Full range (always on)
  ALWAYS: { start: 900, end: 2100 },
} as const;

// Convert PWM to step (for MSP protocol)
export function pwmToStep(pwm: number): number {
  return Math.round((pwm - 900) / 25);
}

// Convert step to PWM
export function stepToPwm(step: number): number {
  return 900 + step * 25;
}
