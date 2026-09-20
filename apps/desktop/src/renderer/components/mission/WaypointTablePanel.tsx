import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, Clock, Gauge, Crosshair, RotateCw, RotateCcw,
  Repeat, Wrench, Ruler, ArrowUpDown, ChevronRight, MoreHorizontal,
  RefreshCw, Pencil, Upload, Save, Play, Copy, Check,
  type LucideIcon,
} from 'lucide-react';
import { useMissionStore } from '../../stores/mission-store';
import { useSurveyStore } from '../../stores/survey-store';
import { type Group, isSurveyGroup, type SurveyGroup, GROUP_COLOR_PALETTE, isAssignedToVehicle } from '../../../shared/mission-group-types';
import { isSurveyGroupStale } from '../survey/survey-group-signature';
import { regenerateSurveyGroup } from '../survey/survey-regen';
import { hasReplayData } from './plan-replay';
import { selectionTouchesGroups } from './bulk-edit';
import { useReplayStore } from '../../stores/replay-store';
import { distanceLatLng } from '../survey/geo-math';
import { calculateGSD } from '../survey/survey-stats';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore, type MissionFirmware } from '../../stores/settings-store';
import { effectiveMissionFirmware } from '../../utils/mission-firmware';
import {
  COMMAND_NAMES,
  COMMAND_DESCRIPTIONS,
  MAV_CMD,
  commandHasLocation,
  hasValidCoordinates,
  isNavigationCommand,
  computeGroupWaypointNumbers,
  type MissionItem
} from '../../../shared/mission-types';
import { FenceListPanel } from '../geofence/FenceListPanel';
import { RallyListPanel } from '../rally/RallyListPanel';
import { useFenceStore } from '../../stores/fence-store';
import { useRallyStore } from '../../stores/rally-store';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useFleetVehicles } from '../../hooks/useFleet';
import { useVehicleAppearanceStore, resolveVehicleColor } from '../../stores/vehicle-appearance-store';
import { computeItemColors, SEGMENT_COLORS } from '../../utils/mission-segment-colors';
import { validateMission } from '../../../shared/mission-validation';
import { MissionValidationBadge } from './MissionValidationBadge';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  formatAltitudeFromMeters,
  formatDistanceFromMeters,
  formatSpeedFromMetersPerSecond,
  formatVerticalSpeedFromMetersPerSecond,
  UNIT_LABELS,
  type AltitudeUnit,
  type DistanceUnit,
  type SpeedUnit,
  type VerticalSpeedUnit,
} from '../../../shared/user-units.js';
import {
  waypointDisplayBound,
  waypointDisplayStep,
  waypointDisplayValue,
  waypointNativeValue,
  type WaypointUnitContext,
} from './waypoint-unit-format';
import { computeRenderableIndices, renderableIndexOfSeq } from './waypoint-list-window';

// Helper to get GPS state without subscribing (avoids re-renders)
function getGpsState() {
  const gps = useTelemetryStore.getState().gps;
  return {
    hasGpsFix: gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0,
    lat: gps.lat,
    lon: gps.lon,
  };
}

// Child command icon mapping: returns a Lucide icon for non-nav commands
function getChildCommandIcon(cmd: number, wp: MissionItem): LucideIcon | null {
  switch (cmd) {
    // Yaw / Turn
    case MAV_CMD.CONDITION_YAW:
      return wp.param3 < 0 ? RotateCcw : RotateCw;

    // Wait / Delay
    case MAV_CMD.CONDITION_DELAY:
    case MAV_CMD.NAV_DELAY:
      return Clock;

    // Camera / Photo / Gimbal
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
    case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
    case MAV_CMD.DO_DIGICAM_CONTROL:
    case MAV_CMD.DO_DIGICAM_CONFIGURE:
    case MAV_CMD.DO_CONTROL_VIDEO:
    case MAV_CMD.IMAGE_START_CAPTURE:
    case MAV_CMD.IMAGE_STOP_CAPTURE:
    case MAV_CMD.VIDEO_START_CAPTURE:
    case MAV_CMD.VIDEO_STOP_CAPTURE:
    case MAV_CMD.SET_CAMERA_ZOOM:
    case MAV_CMD.SET_CAMERA_FOCUS:
    case MAV_CMD.SET_CAMERA_SOURCE:
    case MAV_CMD.DO_MOUNT_CONTROL:
    case MAV_CMD.DO_MOUNT_CONFIGURE:
    case MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW:
      return Camera;

    // Speed
    case MAV_CMD.DO_CHANGE_SPEED:
      return Gauge;

    // ROI
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
    case MAV_CMD.DO_SET_ROI_NONE:
      return Crosshair;

    // Jump
    case MAV_CMD.DO_JUMP:
    case MAV_CMD.DO_JUMP_TAG:
    case MAV_CMD.JUMP_TAG:
      return Repeat;

    // Servo / Relay
    case MAV_CMD.DO_SET_SERVO:
    case MAV_CMD.DO_REPEAT_SERVO:
    case MAV_CMD.DO_SET_RELAY:
    case MAV_CMD.DO_REPEAT_RELAY:
      return Wrench;

    // Altitude change
    case MAV_CMD.CONDITION_CHANGE_ALT:
    case MAV_CMD.DO_CHANGE_ALTITUDE:
      return ArrowUpDown;

    // Distance
    case MAV_CMD.CONDITION_DISTANCE:
      return Ruler;

    default:
      return null;
  }
}

// Color by command category for child icons
function getChildIconColor(cmd: number): string {
  switch (cmd) {
    // Camera / Gimbal - amber
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
    case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
    case MAV_CMD.DO_DIGICAM_CONTROL:
    case MAV_CMD.DO_DIGICAM_CONFIGURE:
    case MAV_CMD.DO_CONTROL_VIDEO:
    case MAV_CMD.IMAGE_START_CAPTURE:
    case MAV_CMD.IMAGE_STOP_CAPTURE:
    case MAV_CMD.VIDEO_START_CAPTURE:
    case MAV_CMD.VIDEO_STOP_CAPTURE:
    case MAV_CMD.SET_CAMERA_ZOOM:
    case MAV_CMD.SET_CAMERA_FOCUS:
    case MAV_CMD.SET_CAMERA_SOURCE:
    case MAV_CMD.DO_MOUNT_CONTROL:
    case MAV_CMD.DO_MOUNT_CONFIGURE:
    case MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW:
      return '#fbbf24';

    // Yaw / Turn - blue
    case MAV_CMD.CONDITION_YAW:
      return '#60a5fa';

    // Wait / Delay - gray
    case MAV_CMD.CONDITION_DELAY:
    case MAV_CMD.NAV_DELAY:
      return '#9ca3af';

    // Speed - cyan
    case MAV_CMD.DO_CHANGE_SPEED:
      return '#22d3ee';

    // ROI - pink
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
    case MAV_CMD.DO_SET_ROI_NONE:
      return '#f472b6';

    // Jump - orange
    case MAV_CMD.DO_JUMP:
    case MAV_CMD.DO_JUMP_TAG:
    case MAV_CMD.JUMP_TAG:
      return '#fb923c';

    // Default gray for servo/relay/alt/distance/other
    default:
      return '#9ca3af';
  }
}

// Grouped commands for the dropdown
interface CommandOption {
  value: number;
  label: string;
  desc: string;
}
interface CommandGroup {
  group: string;
  commands: CommandOption[];
}
const COMMAND_GROUPS: CommandGroup[] = [
  {
    group: '导航',
    commands: [
      { value: MAV_CMD.NAV_TAKEOFF, label: '起飞', desc: '起飞并爬升到指定高度' },
      { value: MAV_CMD.NAV_WAYPOINT, label: '航点', desc: '飞到该位置' },
      { value: MAV_CMD.NAV_SPLINE_WAYPOINT, label: '样条航点', desc: '平滑飞过' },
      { value: MAV_CMD.NAV_ARC_WAYPOINT, label: '弧线航点', desc: '弧线路径' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, label: '悬停', desc: '盘旋直至新指令' },
      { value: MAV_CMD.NAV_LOITER_TIME, label: '定时悬停', desc: '盘旋指定时长' },
      { value: MAV_CMD.NAV_LOITER_TURNS, label: '定圈悬停', desc: '盘旋 N 圈' },
      { value: MAV_CMD.NAV_LOITER_TO_ALT, label: '悬停变高', desc: '悬停并改变高度' },
      { value: MAV_CMD.NAV_ALTITUDE_WAIT, label: '高度等待', desc: '在高度处等待(固定翼)' },
      { value: MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT, label: '继续/变高', desc: '继续飞行并改变高度' },
      { value: MAV_CMD.NAV_LAND, label: '降落', desc: '在该位置降落' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, label: '返航', desc: '飞回起飞点' },
      { value: MAV_CMD.NAV_VTOL_TAKEOFF, label: 'VTOL 起飞', desc: 'VTOL 垂直起飞' },
      { value: MAV_CMD.NAV_VTOL_LAND, label: 'VTOL 降落', desc: 'VTOL 垂直降落' },
      { value: MAV_CMD.NAV_DELAY, label: '等待', desc: '暂停任务一段时间' },
      { value: MAV_CMD.NAV_PAYLOAD_PLACE, label: '载荷投放', desc: '下降并释放' },
      { value: MAV_CMD.NAV_GUIDED_ENABLE, label: '启用引导', desc: '启用引导模式' },
    ],
  },
  {
    group: '条件',
    commands: [
      { value: MAV_CMD.CONDITION_DELAY, label: '延时', desc: '等待秒数' },
      { value: MAV_CMD.CONDITION_DISTANCE, label: '距离', desc: '接近下一航点时等待' },
      { value: MAV_CMD.CONDITION_CHANGE_ALT, label: '变高', desc: '到达高度后继续' },
      { value: MAV_CMD.CONDITION_YAW, label: '偏航', desc: '到达航向后继续' },
    ],
  },
  {
    group: '相机 / 云台',
    commands: [
      { value: MAV_CMD.DO_SET_CAM_TRIGG_DIST, label: '相机触发', desc: '按距离触发' },
      { value: MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL, label: '相机间隔', desc: '按时间间隔触发' },
      { value: MAV_CMD.DO_DIGICAM_CONTROL, label: '相机控制', desc: '拍摄一张照片' },
      { value: MAV_CMD.DO_DIGICAM_CONFIGURE, label: '相机配置', desc: '配置相机' },
      { value: MAV_CMD.IMAGE_START_CAPTURE, label: '开始拍照', desc: '开始连续拍照' },
      { value: MAV_CMD.IMAGE_STOP_CAPTURE, label: '停止拍照', desc: '停止连续拍照' },
      { value: MAV_CMD.VIDEO_START_CAPTURE, label: '开始录像', desc: '开始录制' },
      { value: MAV_CMD.VIDEO_STOP_CAPTURE, label: '停止录像', desc: '停止录制' },
      { value: MAV_CMD.SET_CAMERA_ZOOM, label: '相机变焦', desc: '设置变焦倍数' },
      { value: MAV_CMD.SET_CAMERA_FOCUS, label: '相机对焦', desc: '设置对焦' },
      { value: MAV_CMD.SET_CAMERA_SOURCE, label: '相机源', desc: '设置视频源' },
      { value: MAV_CMD.DO_SET_ROI, label: '设置 ROI', desc: '相机指向该位置' },
      { value: MAV_CMD.DO_SET_ROI_LOCATION, label: 'ROI 位置', desc: '相机指向 GPS 坐标' },
      { value: MAV_CMD.DO_SET_ROI_NONE, label: '取消 ROI', desc: '停止相机跟踪' },
      { value: MAV_CMD.DO_MOUNT_CONTROL, label: '云台控制', desc: '设置云台角度' },
      { value: MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW, label: '云台俯仰/偏航', desc: '设置云台俯仰与偏航' },
    ],
  },
  {
    group: '动作',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, label: '变速', desc: '改变飞行速度' },
      { value: MAV_CMD.DO_SET_HOME, label: '设置家', desc: '设置新的家位置' },
      { value: MAV_CMD.DO_JUMP, label: '跳转', desc: '跳转到航点并重复' },
      { value: MAV_CMD.JUMP_TAG, label: '跳转标签', desc: '标记一个标签' },
      { value: MAV_CMD.DO_JUMP_TAG, label: '跳转到标签', desc: '跳转到标签' },
      { value: MAV_CMD.DO_SET_SERVO, label: '设置舵机', desc: '设置舵机 PWM' },
      { value: MAV_CMD.DO_REPEAT_SERVO, label: '重复舵机', desc: '循环舵机输出' },
      { value: MAV_CMD.DO_SET_RELAY, label: '设置继电器', desc: '设置继电器开关' },
      { value: MAV_CMD.DO_REPEAT_RELAY, label: '重复继电器', desc: '循环继电器开关' },
      { value: MAV_CMD.DO_CHANGE_ALTITUDE, label: '变高', desc: '改变高度' },
      { value: MAV_CMD.DO_FENCE_ENABLE, label: '启用围栏', desc: '启用/禁用地理围栏' },
      { value: MAV_CMD.DO_PARACHUTE, label: '降落伞', desc: '释放降落伞' },
      { value: MAV_CMD.DO_GRIPPER, label: '夹爪', desc: '打开/关闭夹爪' },
      { value: MAV_CMD.DO_SPRAYER, label: '喷洒', desc: '启用/禁用喷洒' },
      { value: MAV_CMD.DO_WINCH, label: '绞盘', desc: '控制绞盘电机' },
      { value: MAV_CMD.DO_VTOL_TRANSITION, label: 'VTOL 模式切换', desc: '切换 VTOL/固定翼模式' },
      { value: MAV_CMD.DO_LAND_START, label: '降落起点', desc: '开始降落序列' },
      { value: MAV_CMD.DO_ENGINE_CONTROL, label: '发动机控制', desc: '启动/停止发动机' },
      { value: MAV_CMD.DO_AUX_FUNCTION, label: '辅助功能', desc: '触发遥控辅助通道' },
      { value: MAV_CMD.DO_SEND_SCRIPT_MESSAGE, label: '脚本消息', desc: '发送到 Lua 脚本' },
      { value: MAV_CMD.SET_YAW_SPEED, label: '偏航速度', desc: '设置偏航速度(车艇)' },
      { value: MAV_CMD.DO_SET_RESUME_REPEAT_DIST, label: '恢复重复', desc: '返航后恢复重复距离' },
      { value: MAV_CMD.DO_AUTOTUNE_ENABLE, label: '自调参', desc: '启用/禁用自调参' },
      { value: MAV_CMD.DO_INVERTED_FLIGHT, label: '倒飞', desc: '倒飞开/关' },
    ],
  },
];

// Simple mode: only the most common commands
const SIMPLE_COMMAND_GROUPS: CommandGroup[] = [
  {
    group: '导航',
    commands: [
      { value: MAV_CMD.NAV_TAKEOFF, label: '起飞', desc: '起飞并爬升到指定高度' },
      { value: MAV_CMD.NAV_WAYPOINT, label: '航点', desc: '飞到该位置' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, label: '悬停', desc: '盘旋直至新指令' },
      { value: MAV_CMD.NAV_LOITER_TIME, label: '定时悬停', desc: '盘旋指定时长' },
      { value: MAV_CMD.NAV_LAND, label: '降落', desc: '在该位置降落' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, label: '返航', desc: '飞回起飞点' },
    ],
  },
  {
    group: '相机',
    commands: [
      { value: MAV_CMD.DO_SET_CAM_TRIGG_DIST, label: '相机触发', desc: '按距离触发' },
      { value: MAV_CMD.DO_DIGICAM_CONTROL, label: '拍照', desc: '触发相机快门' },
      { value: MAV_CMD.IMAGE_START_CAPTURE, label: '开始拍照', desc: '开始连续拍照' },
      { value: MAV_CMD.IMAGE_STOP_CAPTURE, label: '停止拍照', desc: '停止连续拍照' },
    ],
  },
  {
    group: '动作',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, label: '变速', desc: '改变飞行速度' },
      { value: MAV_CMD.DO_JUMP, label: '跳转', desc: '跳转到航点并重复' },
      { value: MAV_CMD.DO_SET_SERVO, label: '设置舵机', desc: '设置舵机 PWM' },
    ],
  },
];

// iNav MSP: only 8 waypoint types supported
const INAV_COMMAND_GROUPS: CommandGroup[] = [
  {
    group: '导航',
    commands: [
      { value: MAV_CMD.NAV_WAYPOINT, label: '航点', desc: '飞到该位置' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, label: '定点保持', desc: '无限期保持位置' },
      { value: MAV_CMD.NAV_LOITER_TIME, label: '定时定点保持', desc: '定时保持位置' },
      { value: MAV_CMD.NAV_LAND, label: '降落', desc: '在该位置降落' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, label: '返航', desc: '返回起飞点' },
    ],
  },
  {
    group: '动作',
    commands: [
      { value: MAV_CMD.DO_SET_ROI, label: '设置 POI', desc: '相机兴趣点' },
      { value: MAV_CMD.DO_JUMP, label: '跳转', desc: '跳转到航点并重复' },
      { value: MAV_CMD.CONDITION_YAW, label: '设置航向', desc: '锁定航向' },
    ],
  },
];

/**
 * PX4 mission commands. NOT a subset of the ArduPilot list: PX4 rejects a
 * mission containing commands it does not implement, so offering ArduPilot's
 * full palette on a PX4 vehicle builds a plan that only fails at upload.
 *
 * Curated from PX4FirmwarePlugin::supportedMissionCommands() in the QGC source
 * vendored at qgroundcontrol/, which is the reference GCS for PX4. Notable
 * differences from ArduPilot: no spline or arc waypoints, no NAV_LOITER_TURNS,
 * no ALTITUDE_WAIT, no relay/parachute/aux-function, DO_SET_ROI_* instead of
 * the legacy DO_SET_ROI, and DO_SET_ACTUATOR alongside DO_SET_SERVO.
 */
const PX4_COMMAND_GROUPS: CommandGroup[] = [
  {
    group: '导航',
    commands: [
      { value: MAV_CMD.NAV_TAKEOFF, label: '起飞', desc: '起飞并爬升到指定高度' },
      { value: MAV_CMD.NAV_WAYPOINT, label: '航点', desc: '飞到该位置' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, label: '悬停', desc: '盘旋直至新指令' },
      { value: MAV_CMD.NAV_LOITER_TIME, label: '定时悬停', desc: '盘旋指定时长' },
      { value: MAV_CMD.NAV_LOITER_TO_ALT, label: '悬停变高', desc: '悬停并改变高度' },
      { value: MAV_CMD.NAV_LAND, label: '降落', desc: '在该位置降落' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, label: '返航', desc: '飞回起飞点' },
      { value: MAV_CMD.NAV_DELAY, label: '延时', desc: '在下一项前等待' },
      { value: MAV_CMD.DO_LAND_START, label: '降落起点', desc: '标记降落序列' },
    ],
  },
  {
    group: 'VTOL',
    commands: [
      { value: MAV_CMD.NAV_VTOL_TAKEOFF, label: 'VTOL 起飞', desc: '垂直起飞' },
      { value: MAV_CMD.NAV_VTOL_LAND, label: 'VTOL 降落', desc: '垂直降落' },
      { value: MAV_CMD.DO_VTOL_TRANSITION, label: 'VTOL 模式切换', desc: '切换悬停/前飞' },
    ],
  },
  {
    group: '相机',
    commands: [
      { value: MAV_CMD.DO_SET_CAM_TRIGG_DIST, label: '相机触发', desc: '按距离触发' },
      { value: MAV_CMD.DO_DIGICAM_CONTROL, label: '拍照', desc: '触发相机快门' },
      { value: MAV_CMD.SET_CAMERA_MODE, label: '相机模式', desc: '拍照或录像模式' },
      { value: MAV_CMD.IMAGE_START_CAPTURE, label: '开始拍照', desc: '开始连续拍照' },
      { value: MAV_CMD.IMAGE_STOP_CAPTURE, label: '停止拍照', desc: '停止连续拍照' },
      { value: MAV_CMD.VIDEO_START_CAPTURE, label: '开始录像', desc: '开始录制' },
      { value: MAV_CMD.VIDEO_STOP_CAPTURE, label: '停止录像', desc: '停止录制' },
    ],
  },
  {
    group: '云台 / ROI',
    commands: [
      { value: MAV_CMD.DO_SET_ROI_LOCATION, label: 'ROI 位置', desc: '相机指向某位置' },
      { value: MAV_CMD.DO_SET_ROI_WPNEXT_OFFSET, label: 'ROI 下一航点', desc: '指向下一航点' },
      { value: MAV_CMD.DO_SET_ROI_NONE, label: '取消 ROI', desc: '取消兴趣区' },
      { value: MAV_CMD.DO_MOUNT_CONFIGURE, label: '云台配置', desc: '设置云台模式' },
      { value: MAV_CMD.DO_MOUNT_CONTROL, label: '云台控制', desc: '控制云台朝向' },
    ],
  },
  {
    group: '动作',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, label: '变速', desc: '改变飞行速度' },
      { value: MAV_CMD.DO_JUMP, label: '跳转', desc: '跳转到航点并重复' },
      { value: MAV_CMD.DO_SET_HOME, label: '设置家', desc: '重新定义家位置' },
      { value: MAV_CMD.DO_SET_SERVO, label: '设置舵机', desc: '设置舵机 PWM' },
      { value: MAV_CMD.DO_SET_ACTUATOR, label: '设置执行器', desc: '设置执行器输出' },
      { value: MAV_CMD.DO_GRIPPER, label: '夹爪', desc: '打开/关闭夹爪' },
      { value: MAV_CMD.CONDITION_YAW, label: '设置航向', desc: '锁定航向' },
    ],
  },
];

/** The PX4 essentials, mirroring how SIMPLE_COMMAND_GROUPS trims ArduPilot's. */
const PX4_SIMPLE_COMMAND_GROUPS: CommandGroup[] = [
  {
    group: '导航',
    commands: [
      { value: MAV_CMD.NAV_TAKEOFF, label: '起飞', desc: '起飞并爬升到指定高度' },
      { value: MAV_CMD.NAV_WAYPOINT, label: '航点', desc: '飞到该位置' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, label: '悬停', desc: '盘旋直至新指令' },
      { value: MAV_CMD.NAV_LOITER_TIME, label: '定时悬停', desc: '盘旋指定时长' },
      { value: MAV_CMD.NAV_LAND, label: '降落', desc: '在该位置降落' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, label: '返航', desc: '飞回起飞点' },
    ],
  },
  {
    group: '相机',
    commands: [
      { value: MAV_CMD.DO_SET_CAM_TRIGG_DIST, label: '相机触发', desc: '按距离触发' },
      { value: MAV_CMD.DO_DIGICAM_CONTROL, label: '拍照', desc: '触发相机快门' },
      { value: MAV_CMD.IMAGE_START_CAPTURE, label: '开始拍照', desc: '开始连续拍照' },
      { value: MAV_CMD.IMAGE_STOP_CAPTURE, label: '停止拍照', desc: '停止连续拍照' },
    ],
  },
  {
    group: '动作',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, label: '变速', desc: '改变飞行速度' },
      { value: MAV_CMD.DO_JUMP, label: '跳转', desc: '跳转到航点并重复' },
      { value: MAV_CMD.DO_SET_SERVO, label: '设置舵机', desc: '设置舵机 PWM' },
    ],
  },
];

/** Command ids PX4 accepts, for validating a plan built before/elsewhere. */
export const PX4_SUPPORTED_COMMANDS: ReadonlySet<number> = new Set(
  PX4_COMMAND_GROUPS.flatMap(g => g.commands.map(c => c.value)),
);

// Flat list of all available commands (for lookup)
const ALL_AVAILABLE_COMMANDS = [
  ...COMMAND_GROUPS.flatMap(g => g.commands),
  ...PX4_COMMAND_GROUPS.flatMap(g => g.commands),
  ...INAV_COMMAND_GROUPS.flatMap(g => g.commands),
].filter((cmd, i, arr) => arr.findIndex(c => c.value === cmd.value) === i);

// Custom command dropdown (replaces native select)
function CommandDropdown({
  value,
  onChange,
  advanced,
  firmware,
}: {
  value: number;
  onChange: (cmd: number) => void;
  advanced: boolean;
  firmware: MissionFirmware;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // iNav has only 8 commands total, no need for simple/advanced split
  const groups = firmware === 'inav'
    ? INAV_COMMAND_GROUPS
    : firmware === 'px4'
      ? (advanced ? PX4_COMMAND_GROUPS : PX4_SIMPLE_COMMAND_GROUPS)
      : advanced ? COMMAND_GROUPS : SIMPLE_COMMAND_GROUPS;

  // Current command label
  const currentCmd = ALL_AVAILABLE_COMMANDS.find(c => c.value === value);
  const currentLabel = currentCmd?.label || COMMAND_NAMES[value] || `CMD ${value}`;

  // Filter groups by search
  const filteredGroups = search.trim()
    ? groups
        .map(g => ({
          ...g,
          commands: g.commands.filter(
            c => c.label.toLowerCase().includes(search.toLowerCase())
              || c.desc.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter(g => g.commands.length > 0)
    : groups;

  // Close on click outside (check both button and popup since popup is fixed/portaled)
  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node;
    if (
      dropdownRef.current && !dropdownRef.current.contains(target) &&
      popupRef.current && !popupRef.current.contains(target)
    ) {
      setIsOpen(false);
      setSearch('');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      requestAnimationFrame(() => searchRef.current?.focus());
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleClickOutside]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => {
          if (!isOpen && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect();
            setPopupStyle({
              position: 'fixed',
              left: rect.left,
              width: rect.width,
              bottom: window.innerHeight - rect.top + 4,
              maxHeight: Math.max(200, rect.top - 12),
            });
          }
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between bg-surface-raised text-content text-sm px-2 py-1.5 rounded border border-default hover:border-default focus:border-blue-500 focus:outline-none"
      >
        <span className="truncate">{currentLabel}</span>
        <svg className={`w-4 h-4 shrink-0 ml-1 text-content-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div ref={popupRef} className="z-[9999] bg-surface-raised border border-default rounded-lg shadow-xl flex flex-col overflow-hidden" style={popupStyle}>
          {/* Search input */}
          <div className="p-1.5 border-b border-subtle shrink-0">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setSearch('');
                  }
                  // Select first match on Enter
                  if (e.key === 'Enter' && filteredGroups.length > 0) {
                    const firstCmd = filteredGroups[0]?.commands[0];
                    if (firstCmd) {
                      onChange(firstCmd.value);
                      setIsOpen(false);
                      setSearch('');
                    }
                  }
                }}
                placeholder="搜索命令..."
                className="w-full bg-surface-input text-content text-xs pl-7 pr-2 py-1.5 rounded border border-subtle focus:border-blue-500/50 focus:outline-none placeholder-content-secondary"
              />
            </div>
          </div>

          {/* Results */}
          <div className="overflow-auto flex-1 min-h-0">
            {filteredGroups.length === 0 ? (
              <div className="px-3 py-4 text-xs text-content-secondary text-center">没有匹配"{search}"的命令</div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.group}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-content-secondary uppercase tracking-wider sticky top-0 bg-surface-raised">
                    {group.group}
                  </div>
                  {group.commands.map((cmd) => (
                    <button
                      key={cmd.value}
                      onClick={() => {
                        onChange(cmd.value);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2 ${
                        cmd.value === value
                          ? 'bg-blue-600/30 text-blue-300'
                          : 'text-content hover:bg-surface-raised'
                      }`}
                    >
                      <span className="font-medium whitespace-nowrap" title={advanced ? cmd.desc : undefined}>{cmd.label}</span>
                      {!advanced && <span className="text-xs text-content-secondary truncate">{cmd.desc}</span>}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Get description for a waypoint
// advanced=false: friendly labels for beginners ("Fly here", "Circle here")
// advanced=true: standard GCS labels ("WP", "Loiter Unlim")
function getWaypointSummary(
  wp: MissionItem,
  advanced: boolean,
  distanceUnit: DistanceUnit,
  altitudeUnit: AltitudeUnit,
  speedUnit: SpeedUnit,
  verticalSpeedUnit: VerticalSpeedUnit,
): string {
  const radiusSuffix = wp.param3 > 0 ? ` (半径 ${formatDistanceFromMeters(wp.param3, distanceUnit)})` : '';

  switch (wp.command) {
    // Navigation
    case MAV_CMD.NAV_TAKEOFF:
      return `起飞到 ${formatAltitudeFromMeters(wp.altitude, altitudeUnit)}`;
    case MAV_CMD.NAV_WAYPOINT:
      if (advanced) return wp.param1 > 0 ? `WP (停留 ${wp.param1}s)` : 'WP';
      return wp.param1 > 0 ? `飞到这里,等待 ${wp.param1} 秒` : '飞到这里';
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      if (advanced) return wp.param1 > 0 ? `Spline WP (停留 ${wp.param1}s)` : 'Spline WP';
      return wp.param1 > 0 ? `平滑路径,等待 ${wp.param1} 秒` : '平滑路径';
    case MAV_CMD.NAV_LOITER_UNLIM:
      if (advanced) return `Loiter Unlim${radiusSuffix}`;
      return `在这里盘旋${radiusSuffix}`;
    case MAV_CMD.NAV_LOITER_TIME:
      if (advanced) return `Loiter ${wp.param1}s${radiusSuffix}`;
      return `盘旋 ${wp.param1} 秒${radiusSuffix}`;
    case MAV_CMD.NAV_LOITER_TURNS:
      if (advanced) return `Loiter ${wp.param1}x${radiusSuffix}`;
      return `盘旋 ${wp.param1} 圈${radiusSuffix}`;
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return `悬停变高到 ${formatAltitudeFromMeters(wp.altitude, altitudeUnit)}${radiusSuffix}`;
    case MAV_CMD.NAV_LAND:
      if (advanced) return 'Land';
      return '在这里降落';
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      if (advanced) return 'RTL';
      return '返航';
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return `VTOL 起飞到 ${formatAltitudeFromMeters(wp.altitude, altitudeUnit)}`;
    case MAV_CMD.NAV_VTOL_LAND:
      if (advanced) return 'VTOL Land';
      return 'VTOL 在这里降落';
    case MAV_CMD.NAV_DELAY:
      return `等待 ${wp.param1} 秒`;
    case MAV_CMD.NAV_PAYLOAD_PLACE:
      return wp.param1 > 0 ? `投放载荷(最多下降 ${formatAltitudeFromMeters(wp.param1, altitudeUnit)})` : '投放载荷';
    case MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT:
      return `继续飞行,变高到 ${formatAltitudeFromMeters(wp.altitude, altitudeUnit)}`;
    case MAV_CMD.NAV_ARC_WAYPOINT:
      if (advanced) return 'Arc WP';
      return '弯曲路径';
    case MAV_CMD.NAV_ALTITUDE_WAIT:
      return `在 ${formatAltitudeFromMeters(wp.altitude, altitudeUnit)} 等待`;
    case MAV_CMD.NAV_GUIDED_ENABLE:
      return wp.param1 > 0 ? '启用引导模式' : '禁用引导模式';
    case MAV_CMD.NAV_SCRIPT_TIME:
      return `执行脚本 ${wp.param1} 秒`;
    case MAV_CMD.NAV_ATTITUDE_TIME:
      return `保持姿态 ${wp.param1} 秒`;

    // Conditions
    case MAV_CMD.CONDITION_DELAY:
      return `等待 ${wp.param1} 秒`;
    case MAV_CMD.CONDITION_CHANGE_ALT:
      return `以 ${formatVerticalSpeedFromMetersPerSecond(wp.param1, verticalSpeedUnit)} 爬升/下降`;
    case MAV_CMD.CONDITION_DISTANCE:
      return `距下一航点 ${formatDistanceFromMeters(wp.param1, distanceUnit)} 时等待`;
    case MAV_CMD.CONDITION_YAW: {
      const isRelative = wp.param4 !== 0;
      return isRelative
        ? `偏转 ${wp.param1} 度`
        : `转向 ${wp.param1} 度`;
    }

    // Camera / Gimbal
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
      if (advanced) return wp.param1 > 0 ? `CAM_TRIGG_DIST ${formatDistanceFromMeters(wp.param1, distanceUnit)}` : 'CAM_TRIGG off';
      return wp.param1 > 0 ? `每 ${formatDistanceFromMeters(wp.param1, distanceUnit)} 拍照` : '关闭相机触发';
    case MAV_CMD.DO_DIGICAM_CONTROL:
      if (advanced) return 'DIGICAM_CONTROL';
      return '拍照';
    case MAV_CMD.DO_DIGICAM_CONFIGURE:
      if (advanced) return 'DIGICAM_CONFIGURE';
      return '配置相机';
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
      if (advanced) return 'SET_ROI';
      return '相机指向这里';
    case MAV_CMD.DO_SET_ROI_NONE:
      if (advanced) return 'ROI_NONE';
      return '停止相机跟踪';
    case MAV_CMD.DO_MOUNT_CONTROL:
      if (advanced) return 'MOUNT_CONTROL';
      return '设置云台角度';
    case MAV_CMD.DO_MOUNT_CONFIGURE:
      if (advanced) return 'MOUNT_CONFIGURE';
      return '配置云台';
    case MAV_CMD.DO_CONTROL_VIDEO:
      return '控制录像';
    case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
      if (advanced) return wp.param1 > 0 ? `CAM_TRIGG_INT ${wp.param1}s` : 'CAM_TRIGG_INT off';
      return wp.param1 > 0 ? `每 ${wp.param1} 秒拍照` : '关闭拍照间隔';
    case MAV_CMD.IMAGE_START_CAPTURE:
      if (advanced) return wp.param2 > 0 ? `IMG_START (${wp.param2}s int)` : 'IMG_START';
      return wp.param2 > 0 ? `每 ${wp.param2} 秒拍照` : '开始连续拍照';
    case MAV_CMD.IMAGE_STOP_CAPTURE:
      if (advanced) return 'IMG_STOP';
      return '停止拍照';
    case MAV_CMD.VIDEO_START_CAPTURE:
      if (advanced) return 'VID_START';
      return '开始录像';
    case MAV_CMD.VIDEO_STOP_CAPTURE:
      if (advanced) return 'VID_STOP';
      return '停止录像';
    case MAV_CMD.SET_CAMERA_ZOOM:
      return `相机变焦 ${wp.param2}`;
    case MAV_CMD.SET_CAMERA_FOCUS:
      return `相机对焦 ${wp.param2}`;
    case MAV_CMD.SET_CAMERA_SOURCE:
      return '设置相机源';
    case MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW:
      return `云台俯仰 ${wp.param1} 偏航 ${wp.param2}`;

    // Actions
    case MAV_CMD.DO_CHANGE_SPEED:
      return `变速到 ${formatSpeedFromMetersPerSecond(wp.param2, speedUnit)}`;
    case MAV_CMD.DO_SET_HOME:
      return wp.param1 === 1 ? '设置家(当前位置)' : '设置家(指定位置)';
    case MAV_CMD.DO_JUMP:
      return `跳转到第 ${wp.param1} 个航点` + (wp.param2 > 0 ? `(${wp.param2} 次)` : '(无限次)');
    case MAV_CMD.DO_SET_SERVO:
      return `舵机 ${wp.param1} = ${wp.param2}`;
    case MAV_CMD.DO_REPEAT_SERVO:
      return `循环舵机 ${wp.param1}`;
    case MAV_CMD.DO_SET_RELAY:
      return `继电器 ${wp.param1} ${wp.param2 > 0 ? '开' : '关'}`;
    case MAV_CMD.DO_REPEAT_RELAY:
      return `循环继电器 ${wp.param1}`;
    case MAV_CMD.DO_FENCE_ENABLE:
      return wp.param1 > 0 ? '启用地理围栏' : '禁用地理围栏';
    case MAV_CMD.DO_PARACHUTE:
      return '释放降落伞';
    case MAV_CMD.DO_GRIPPER:
      return wp.param2 === 0 ? '松开夹爪' : '夹紧夹爪';
    case MAV_CMD.DO_VTOL_TRANSITION:
      return wp.param1 === 3 ? '切换到固定翼' : '切换到多旋翼';
    case MAV_CMD.DO_LAND_START:
      return '开始降落序列';
    case MAV_CMD.DO_CHANGE_ALTITUDE:
      return `变高到 ${formatAltitudeFromMeters(wp.param1, altitudeUnit)}`;
    case MAV_CMD.DO_SET_MODE:
      return `设置模式 ${wp.param1}`;
    case MAV_CMD.DO_PAUSE_CONTINUE:
      return wp.param1 > 0 ? '继续任务' : '暂停任务';
    case MAV_CMD.DO_SET_REVERSE:
      return wp.param1 > 0 ? '倒车行驶' : '前进行驶';
    case MAV_CMD.DO_INVERTED_FLIGHT:
      return wp.param1 > 0 ? '倒飞开' : '倒飞关';
    case MAV_CMD.DO_AUTOTUNE_ENABLE:
      return wp.param1 > 0 ? '自调参开' : '自调参关';
    case MAV_CMD.DO_ENGINE_CONTROL:
      return wp.param1 > 0 ? '启动发动机' : '停止发动机';
    case MAV_CMD.DO_FLIGHTTERMINATION:
      return '飞行终止';
    case MAV_CMD.DO_SET_PARAMETER:
      return `设置参数 ${wp.param1} = ${wp.param2}`;
    case MAV_CMD.JUMP_TAG:
      return `标签 ${wp.param1}`;
    case MAV_CMD.DO_JUMP_TAG:
      return `跳转到标签 ${wp.param1}` + (wp.param2 > 0 ? `(${wp.param2} 次)` : '(无限次)');
    case MAV_CMD.DO_SPRAYER:
      return wp.param1 > 0 ? '喷洒开' : '喷洒关';
    case MAV_CMD.DO_WINCH:
      return '控制绞盘';
    case MAV_CMD.DO_SEND_SCRIPT_MESSAGE:
      return `脚本消息 ${wp.param1}`;
    case MAV_CMD.SET_YAW_SPEED:
      return `偏航 ${wp.param1},速度 ${wp.param2} 度/秒`;
    case MAV_CMD.DO_SET_RESUME_REPEAT_DIST:
      return `恢复重复 ${formatDistanceFromMeters(wp.param1, distanceUnit)}`;
    case MAV_CMD.DO_AUX_FUNCTION:
      return `辅助功能 ${wp.param1}`;

    default:
      return COMMAND_NAMES[wp.command] || `未知命令 ${wp.command}`;
  }
}

type CommandParamConfig = {
  key: keyof MissionItem;
  label: string;
  unit: string;
  unitKind?: 'distance' | 'altitude' | 'speed' | 'verticalSpeed';
  min?: number;
  max?: number;
  step?: number;
  show: boolean;
};

// Get the parameters config for each command type
export function getCommandParams(cmd: number): CommandParamConfig[] {
  const baseLocation: CommandParamConfig[] = [
    { key: 'altitude' as const, label: '高度', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
  ];

  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
      return [
        { key: 'altitude' as const, label: '目标高度', unit: 'm', unitKind: 'altitude', min: 1, step: 5, show: true },
        { key: 'param1' as const, label: '俯仰角', unit: '°', min: 0, max: 90, step: 5, show: true },
      ];
    case MAV_CMD.NAV_WAYPOINT:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: '等待时间', unit: 's', min: 0, max: 300, step: 1, show: true },
        { key: 'param2' as const, label: '到达半径', unit: 'm', unitKind: 'distance', min: 0, max: 50, step: 1, show: false },
      ];
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: '等待时间', unit: 's', min: 0, max: 300, step: 1, show: true },
      ];
    case MAV_CMD.NAV_LOITER_UNLIM:
      return [
        ...baseLocation,
        { key: 'param3' as const, label: '半径', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TIME:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: '时长', unit: 's', min: 1, max: 600, step: 5, show: true },
        { key: 'param3' as const, label: '半径', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TURNS:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: '圈数', unit: '', min: 1, max: 100, step: 1, show: true },
        { key: 'param3' as const, label: '半径', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LAND:
      return [
        { key: 'param1' as const, label: '中止高度', unit: 'm', unitKind: 'altitude', min: 0, max: 100, step: 5, show: true },
      ];
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return []; // No params needed
    case MAV_CMD.NAV_DELAY:
      return [
        { key: 'param1' as const, label: '等待时间', unit: 's', min: 1, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.DO_CHANGE_SPEED:
      return [
        { key: 'param2' as const, label: '目标速度', unit: 'm/s', unitKind: 'speed', min: 1, max: 50, step: 1, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return [
        ...baseLocation,
        { key: 'param3' as const, label: '半径', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return [
        { key: 'altitude' as const, label: '目标高度', unit: 'm', unitKind: 'altitude', min: 1, step: 5, show: true },
      ];
    case MAV_CMD.NAV_VTOL_LAND:
      return [
        { key: 'param3' as const, label: '进近高度', unit: 'm', unitKind: 'altitude', min: 0, max: 200, step: 5, show: true },
      ];
    case MAV_CMD.NAV_PAYLOAD_PLACE:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: '最大下降', unit: 'm', unitKind: 'altitude', min: 0, max: 50, step: 1, show: true },
      ];
    case MAV_CMD.CONDITION_DELAY:
      return [
        { key: 'param1' as const, label: '时间', unit: 's', min: 0, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.CONDITION_CHANGE_ALT:
      return [
        { key: 'param1' as const, label: '速率', unit: 'm/s', unitKind: 'verticalSpeed', min: 0, max: 10, step: 0.5, show: true },
        { key: 'altitude' as const, label: '目标高度', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
      ];
    case MAV_CMD.CONDITION_DISTANCE:
      return [
        { key: 'param1' as const, label: '距离', unit: 'm', unitKind: 'distance', min: 0, max: 10000, step: 10, show: true },
      ];
    case MAV_CMD.CONDITION_YAW:
      return [
        { key: 'param1' as const, label: '角度', unit: 'deg', min: 0, max: 360, step: 5, show: true },
        { key: 'param2' as const, label: '速度', unit: 'deg/s', min: 0, max: 180, step: 5, show: true },
        { key: 'param3' as const, label: '方向', unit: '-1=CCW 0=auto 1=CW', min: -1, max: 1, step: 1, show: true },
        { key: 'param4' as const, label: '相对', unit: '0=abs 1=rel', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_JUMP:
      return [
        { key: 'param1' as const, label: '航点 #', unit: '', min: 1, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: '重复次数', unit: '', min: -1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
      return [
        { key: 'param1' as const, label: '距离', unit: 'm', unitKind: 'distance', min: 0, max: 1000, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_SERVO:
      return [
        { key: 'param1' as const, label: '舵机 #', unit: '', min: 1, max: 16, step: 1, show: true },
        { key: 'param2' as const, label: 'PWM', unit: 'us', min: 500, max: 2500, step: 10, show: true },
      ];
    case MAV_CMD.DO_SET_RELAY:
      return [
        { key: 'param1' as const, label: '继电器 #', unit: '', min: 0, max: 15, step: 1, show: true },
        { key: 'param2' as const, label: '开/关', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_REPEAT_SERVO:
      return [
        { key: 'param1' as const, label: '舵机 #', unit: '', min: 1, max: 16, step: 1, show: true },
        { key: 'param2' as const, label: 'PWM', unit: 'us', min: 500, max: 2500, step: 10, show: true },
        { key: 'param3' as const, label: '次数', unit: '', min: 1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_REPEAT_RELAY:
      return [
        { key: 'param1' as const, label: '继电器 #', unit: '', min: 0, max: 15, step: 1, show: true },
        { key: 'param2' as const, label: '次数', unit: '', min: 1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
      return baseLocation;
    case MAV_CMD.DO_MOUNT_CONTROL:
      return [
        { key: 'param1' as const, label: '俯仰', unit: 'deg', min: -90, max: 90, step: 5, show: true },
        { key: 'param2' as const, label: '横滚', unit: 'deg', min: -90, max: 90, step: 5, show: true },
        { key: 'param3' as const, label: '偏航', unit: 'deg', min: -180, max: 180, step: 5, show: true },
      ];
    case MAV_CMD.DO_FENCE_ENABLE:
      return [
        { key: 'param1' as const, label: '启用', unit: '', min: 0, max: 2, step: 1, show: true },
      ];
    case MAV_CMD.DO_GRIPPER:
      return [
        { key: 'param1' as const, label: '夹爪 #', unit: '', min: 1, max: 4, step: 1, show: true },
        { key: 'param2' as const, label: '动作', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_VTOL_TRANSITION:
      return [
        { key: 'param1' as const, label: '状态', unit: '', min: 1, max: 4, step: 1, show: true },
      ];
    case MAV_CMD.DO_CHANGE_ALTITUDE:
      return [
        { key: 'param1' as const, label: '高度', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
        { key: 'param2' as const, label: '坐标系', unit: '', min: 0, max: 10, step: 1, show: false },
      ];
    // New commands
    case MAV_CMD.NAV_ARC_WAYPOINT:
      return [
        ...baseLocation,
      ];
    case MAV_CMD.NAV_ALTITUDE_WAIT:
      return [
        { key: 'altitude' as const, label: '目标高度', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
        { key: 'param1' as const, label: '爬升速率', unit: 'm/s', unitKind: 'verticalSpeed', min: 0, max: 10, step: 0.5, show: true },
      ];
    case MAV_CMD.NAV_SCRIPT_TIME:
      return [
        { key: 'param1' as const, label: '命令', unit: '', min: 0, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: '超时', unit: 's', min: 0, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.NAV_ATTITUDE_TIME:
      return [
        { key: 'param1' as const, label: '时间', unit: 's', min: 0, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
      return [
        { key: 'param1' as const, label: '间隔', unit: 's', min: 0, max: 3600, step: 1, show: true },
        { key: 'param2' as const, label: '次数', unit: '', min: 0, max: 999, step: 1, show: true },
      ];
    case MAV_CMD.IMAGE_START_CAPTURE:
      return [
        { key: 'param2' as const, label: '间隔', unit: 's', min: 0, max: 3600, step: 1, show: true },
        { key: 'param3' as const, label: '总照片数', unit: '', min: 0, max: 999, step: 1, show: true },
      ];
    case MAV_CMD.IMAGE_STOP_CAPTURE:
      return [];
    case MAV_CMD.VIDEO_START_CAPTURE:
      return [];
    case MAV_CMD.VIDEO_STOP_CAPTURE:
      return [];
    case MAV_CMD.SET_CAMERA_ZOOM:
      return [
        { key: 'param1' as const, label: '变焦类型', unit: '', min: 0, max: 2, step: 1, show: true },
        { key: 'param2' as const, label: '变焦值', unit: '', min: 0, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.SET_CAMERA_FOCUS:
      return [
        { key: 'param1' as const, label: '对焦类型', unit: '', min: 0, max: 2, step: 1, show: true },
        { key: 'param2' as const, label: '对焦值', unit: '', min: 0, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW:
      return [
        { key: 'param1' as const, label: '俯仰', unit: 'deg', min: -90, max: 90, step: 5, show: true },
        { key: 'param2' as const, label: '偏航', unit: 'deg', min: -180, max: 180, step: 5, show: true },
      ];
    case MAV_CMD.JUMP_TAG:
      return [
        { key: 'param1' as const, label: '标签 #', unit: '', min: 1, max: 999, step: 1, show: true },
      ];
    case MAV_CMD.DO_JUMP_TAG:
      return [
        { key: 'param1' as const, label: '标签 #', unit: '', min: 1, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: '重复次数', unit: '', min: -1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_SPRAYER:
      return [
        { key: 'param1' as const, label: '启用', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_WINCH:
      return [
        { key: 'param1' as const, label: '实例', unit: '', min: 1, max: 4, step: 1, show: true },
        { key: 'param2' as const, label: '动作', unit: '', min: 0, max: 2, step: 1, show: true },
      ];
    case MAV_CMD.DO_SEND_SCRIPT_MESSAGE:
      return [
        { key: 'param1' as const, label: 'ID', unit: '', min: 0, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: '参数 1', unit: '', min: -1000, max: 1000, step: 1, show: true },
        { key: 'param3' as const, label: '参数 2', unit: '', min: -1000, max: 1000, step: 1, show: true },
      ];
    case MAV_CMD.SET_YAW_SPEED:
      return [
        { key: 'param1' as const, label: '偏航角', unit: 'deg', min: -180, max: 180, step: 5, show: true },
        { key: 'param2' as const, label: '速度', unit: 'deg/s', min: 0, max: 180, step: 5, show: true },
      ];
    case MAV_CMD.DO_AUX_FUNCTION:
      return [
        { key: 'param1' as const, label: '功能', unit: '', min: 0, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: '开关位置', unit: '', min: 0, max: 2, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_RESUME_REPEAT_DIST:
      return [
        { key: 'param1' as const, label: '距离', unit: 'm', unitKind: 'distance', min: 0, max: 10000, step: 10, show: true },
      ];
    case MAV_CMD.DO_ENGINE_CONTROL:
      return [
        { key: 'param1' as const, label: '启动/停止', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_AUTOTUNE_ENABLE:
      return [
        { key: 'param1' as const, label: '启用', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_INVERTED_FLIGHT:
      return [
        { key: 'param1' as const, label: '倒飞', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT:
      return [
        { key: 'altitude' as const, label: '目标高度', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
      ];
    default:
      return baseLocation;
  }
}

interface WaypointTablePanelProps {
  readOnly?: boolean;
}

export function WaypointTablePanel({ readOnly = false }: WaypointTablePanelProps) {
  // Use shared edit mode from toolbar
  const activeMode = useEditModeStore((state) => state.activeMode);
  const prevModeRef = useRef(activeMode);

  // Get fence and rally store actions to clear edit modes when switching
  const setFenceDrawMode = useFenceStore((state) => state.setDrawMode);
  const setRallyAddMode = useRallyStore((state) => state.setAddMode);

  // Clear edit modes when switching away from a mode
  useEffect(() => {
    const prevMode = prevModeRef.current;
    if (prevMode !== activeMode) {
      // Clear fence draw mode when leaving geofence
      if (prevMode === 'geofence') {
        setFenceDrawMode('none');
      }
      // Clear rally add mode when leaving rally
      if (prevMode === 'rally') {
        setRallyAddMode(false);
      }
      prevModeRef.current = activeMode;
    }
  }, [activeMode, setFenceDrawMode, setRallyAddMode]);

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Content based on active mode - no tabs, controlled by toolbar */}
      <div className="flex-1 overflow-hidden">
        {activeMode === 'mission' && <WaypointListContent readOnly={readOnly} />}
        {activeMode === 'geofence' && <FenceListPanel readOnly={readOnly} />}
        {activeMode === 'rally' && <RallyListPanel readOnly={readOnly} />}
      </div>
    </div>
  );
}

/**
 * Group header rendered above the first WP of each group in the mission
 * table. Carries the group's color, count, collapse toggle, rename, and
 * overflow menu (delete). Selective-upload checkbox + edit-survey shortcut
 * land in later steps.
 */
function formatBlockDistance(m: number, unit: DistanceUnit): string {
  return formatDistanceFromMeters(m, unit);
}

function formatBlockDuration(s: number): string {
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function displayParamValue(
  value: number,
  param: CommandParamConfig,
  unitContext: WaypointUnitContext,
): number {
  return param.unitKind ? waypointDisplayValue(value, param.unitKind, unitContext) : value;
}

function nativeParamValue(
  value: number,
  param: CommandParamConfig,
  unitContext: WaypointUnitContext,
): number {
  return param.unitKind ? waypointNativeValue(value, param.unitKind, unitContext) : value;
}

function displayParamBound(
  value: number | undefined,
  param: CommandParamConfig,
  unitContext: WaypointUnitContext,
): number | undefined {
  if (value === undefined) return undefined;
  return param.unitKind ? waypointDisplayBound(value, param.unitKind, unitContext) : value;
}

function displayParamStep(
  value: number | undefined,
  param: CommandParamConfig,
  unitContext: WaypointUnitContext,
): number | undefined {
  if (value === undefined) return undefined;
  return param.unitKind ? waypointDisplayStep(param.unitKind, unitContext) : value;
}

function displayParamUnit(
  param: CommandParamConfig,
  distanceUnit: DistanceUnit,
  altitudeUnit: AltitudeUnit,
  speedUnit: SpeedUnit,
  verticalSpeedUnit: VerticalSpeedUnit,
): string {
  if (param.unitKind === 'distance') return UNIT_LABELS.distance[distanceUnit];
  if (param.unitKind === 'altitude') return UNIT_LABELS.altitude[altitudeUnit];
  if (param.unitKind === 'speed') return UNIT_LABELS.speed[speedUnit];
  if (param.unitKind === 'verticalSpeed') return UNIT_LABELS.verticalSpeed[verticalSpeedUnit];
  return param.unit;
}

function isValidDisplayNumber(value: number, min?: number, max?: number): boolean {
  return Number.isFinite(value) &&
    (min === undefined || value >= min) &&
    (max === undefined || value <= max);
}

function sameNativeParamValue(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function UnitParamInput({
  nativeValue,
  param,
  distanceUnit,
  altitudeUnit,
  speedUnit,
  verticalSpeedUnit,
  onCommit,
}: {
  nativeValue: number;
  param: CommandParamConfig;
  distanceUnit: DistanceUnit;
  altitudeUnit: AltitudeUnit;
  speedUnit: SpeedUnit;
  verticalSpeedUnit: VerticalSpeedUnit;
  onCommit: (nativeValue: number) => void;
}) {
  const unitContext = useMemo<WaypointUnitContext>(() => ({
    distanceUnit,
    altitudeUnit,
    speedUnit,
    verticalSpeedUnit,
  }), [altitudeUnit, distanceUnit, speedUnit, verticalSpeedUnit]);
  const displayValue = displayParamValue(nativeValue, param, unitContext);
  const min = displayParamBound(param.min, param, unitContext);
  const max = displayParamBound(param.max, param, unitContext);
  const step = displayParamStep(param.step, param, unitContext);
  const [draft, setDraft] = useState(() => String(displayValue));
  const [focused, setFocused] = useState(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(String(displayValue));
  }, [displayValue, focused]);

  const resetDraft = useCallback(() => {
    setDraft(String(displayParamValue(nativeValue, param, unitContext)));
  }, [nativeValue, param, unitContext]);

  const commitDisplayValue = useCallback((display: number) => {
    if (!isValidDisplayNumber(display, min, max)) {
      resetDraft();
      return;
    }
    const nextNative = nativeParamValue(display, param, unitContext);
    if (!sameNativeParamValue(nextNative, nativeValue)) {
      onCommit(nextNative);
    }
    setDraft(String(display));
  }, [max, min, nativeValue, onCommit, param, resetDraft, unitContext]);

  return (
    <input
      type="number"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const nextDraft = e.target.value;
        setDraft(nextDraft);
        if (nextDraft.trim() === '') return;
        const parsed = Number(nextDraft);
        if (!isValidDisplayNumber(parsed, min, max)) return;
        const nextNative = nativeParamValue(parsed, param, unitContext);
        if (!sameNativeParamValue(nextNative, nativeValue)) {
          onCommit(nextNative);
        }
      }}
      onBlur={() => {
        setFocused(false);
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          return;
        }
        const parsed = Number(draft);
        if (draft.trim() === '' || !Number.isFinite(parsed)) {
          resetDraft();
          return;
        }
        if (parsed === displayValue) {
          resetDraft();
          return;
        }
        commitDisplayValue(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          skipBlurCommitRef.current = true;
          resetDraft();
          e.currentTarget.blur();
        }
      }}
      min={min}
      max={max}
      step={step}
      className="w-full bg-surface-input text-content text-sm px-2 py-1.5 rounded border border-default focus:border-blue-500 focus:outline-none font-mono"
    />
  );
}

// Plain-number sibling of UnitParamInput: keeps a string draft while focused so
// partial input ("", "-", "1.") never commits. Without this, clearing the
// latitude field commits Number('') = 0 and teleports the waypoint to 0,0
// mid-edit. Commits on blur/Enter (plus live for in-range values when `live`),
// Escape reverts.
//
// `text` renders as type="text" inputMode="decimal": Chromium localizes
// type="number" display (comma decimals on comma-locale systems), which made
// lat/lon show "42,44" while every other coordinate in the app uses dots.
// Comma input is still accepted when typing.
function parseDecimal(s: string): number {
  return Number(s.trim().replace(',', '.'));
}

function DraftNumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  live = false,
  text = false,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  live?: boolean;
  text?: boolean;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <input
      type={text ? 'text' : 'number'}
      inputMode="decimal"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (!live || next.trim() === '') return;
        const parsed = parseDecimal(next);
        if (isValidDisplayNumber(parsed, min, max) && parsed !== value) onCommit(parsed);
      }}
      onBlur={() => {
        setFocused(false);
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          setDraft(String(value));
          return;
        }
        const parsed = parseDecimal(draft);
        if (draft.trim() === '' || !isValidDisplayNumber(parsed, min, max)) {
          setDraft(String(value));
          return;
        }
        if (parsed !== value) onCommit(parsed);
        setDraft(String(parsed));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          skipBlurCommitRef.current = true;
          e.currentTarget.blur();
        }
      }}
      min={min}
      max={max}
      step={step}
      className="w-full bg-surface-input text-content text-sm px-2 py-1.5 rounded border border-default focus:border-blue-500 focus:outline-none font-mono"
    />
  );
}

function GroupHeaderRow({
  group,
  count,
  stats,
  readOnly,
  isSelected,
  isEditing,
  onVehicleState,
  onSelect,
  onToggleCollapse,
  onToggleVisible,
  onSync,
  connected,
  onRename,
  onSetColor,
  onDelete,
  onRegenerate,
  onReplay,
  onEdit,
  distanceUnit,
  fleetVehicles,
  assignedVehicleKey,
  onAssignVehicle,
  onDistribute,
  onSelectWaypoints,
  bulkSelected,
  onToggleBulkSelected,
}: {
  group: Group;
  count: number;
  /** Per-group flight stats shown inline in the header (distance, time, GSD). */
  stats?: { distanceM: number; timeS: number; gsd: number | null };
  readOnly: boolean;
  isSelected: boolean;
  /** True when the survey panel is currently editing this group live. */
  isEditing: boolean;
  /**
   * Vehicle-sync state for this group from the last successful upload.
   * - 'none': never uploaded or no record
   * - 'on-vehicle': uploaded and unchanged since
   * - 'stale-on-vehicle': uploaded then locally edited; vehicle now lags
   */
  onVehicleState: 'none' | 'on-vehicle' | 'stale-on-vehicle';
  onSelect: () => void;
  onToggleCollapse: () => void;
  /** Toggle whether this group is shown on the map. */
  onToggleVisible: () => void;
  /** Sync this group: upload to the vehicle when connected, else save to file. */
  onSync?: () => void;
  /** Whether an FC is connected (drives the sync button's upload-vs-save mode). */
  connected?: boolean;
  onRename: (name: string) => void;
  /** Change the group's color (map + sidebar). */
  onSetColor: (color: string) => void;
  onDelete: () => void;
  onRegenerate?: () => void;
  /** Animate the coverage-planning pipeline on the map. Survey groups whose
      generatorResult carries replayable data only. Click again to stop. */
  onReplay?: () => void;
  /** Re-open the survey panel and load this group's polygon + config back
      into the draft for live editing. Survey groups only. */
  onEdit?: () => void;
  distanceUnit: DistanceUnit;
  /**
   * Fleet/swarm: vehicles available to assign this group to. When non-empty a
   * vehicle picker appears in the header and the sync button uploads to the
   * assigned vehicle. Empty / undefined in single-vehicle mode (picker hidden).
   */
  fleetVehicles?: Array<{ key: string; label: string; color: string }>;
  assignedVehicleKey?: string;
  onAssignVehicle?: (vehicleKey: string | null) => void;
  /** Split this group into one mission per fleet vehicle (swarm survey). */
  onDistribute?: () => void;
  /** Add all of this group's waypoints to the multi-selection. */
  onSelectWaypoints?: () => void;
  /** Ticked for bulk actions. Undefined hides the checkbox entirely. */
  bulkSelected?: boolean;
  onToggleBulkSelected?: (additive: boolean) => void;
}) {
  const isStaleSurvey = isSurveyGroup(group) && isSurveyGroupStale(group);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [colorPos, setColorPos] = useState<{ top: number; left: number } | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [vehicleMenuPos, setVehicleMenuPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const vehicleBtnRef = useRef<HTMLButtonElement>(null);

  const showVehiclePicker = !readOnly && !!fleetVehicles && fleetVehicles.length > 0 && !!onAssignVehicle;
  const assignedVehicle = fleetVehicles?.find((v) => v.key === assignedVehicleKey);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== group.name) onRename(next);
    else setDraft(group.name);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(group.name);
    setEditing(false);
  };

  return (
    <div
      data-tour="mission-group"
      className={`flex flex-col select-none cursor-pointer transition-colors ${
        isSelected ? 'bg-surface-raised/80' : 'bg-surface-raised/40 hover:bg-surface-raised/60'
      }`}
      style={{ borderLeft: `3px solid ${group.color}` }}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 px-2 pt-1.5 pb-0.5">
      {!readOnly && onToggleBulkSelected && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleBulkSelected(e.shiftKey);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 flex items-center justify-center w-5 h-5"
          data-tip="选中此分组进行批量操作"
        >
          <input
            type="checkbox"
            checked={!!bulkSelected}
            onChange={() => { /* handled by wrapper onClick */ }}
            className="w-3.5 h-3.5 rounded border-subtle bg-surface-raised text-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
          />
        </div>
      )}
      {!readOnly && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 flex items-center justify-center w-5 h-5"
          data-tip={group.visible ? '地图上可见(点击隐藏)' : '地图上已隐藏(点击显示)'}
        >
          <input
            type="checkbox"
            checked={group.visible}
            onChange={() => { /* handled by wrapper onClick */ }}
            className="w-3.5 h-3.5 rounded border-subtle bg-surface-raised text-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
          />
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapse();
        }}
        className="w-4 h-4 flex items-center justify-center text-content-secondary hover:text-content transition-colors shrink-0"
        data-tip={group.collapsed ? `展开(${count} 项)` : '收起分组'}
      >
        <ChevronRight
          className={`w-3 h-3 transition-transform ${group.collapsed ? '' : 'rotate-90'}`}
        />
      </button>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          ref={swatchRef}
          onClick={(e) => {
            e.stopPropagation();
            if (readOnly) return;
            if (!colorOpen) {
              const r = swatchRef.current?.getBoundingClientRect();
              // Anchor the palette to the swatch, in a body-level portal so it
              // isn't clipped by the waypoint list's overflow.
              if (r) setColorPos({ top: r.bottom + 4, left: r.left });
            }
            setColorOpen((v) => !v);
          }}
          className="w-3.5 h-3.5 rounded-sm border border-white/25 block"
          style={{ backgroundColor: group.color }}
          data-tip={readOnly ? undefined : '更改颜色'}
          aria-label="分组颜色"
        />
        {colorOpen && !readOnly && colorPos &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setColorOpen(false)} />
              <div
                className="fixed z-[9999] p-1.5 bg-surface-raised border border-subtle rounded-lg shadow-2xl grid grid-cols-4 gap-1"
                style={{ top: colorPos.top, left: colorPos.left }}
              >
                {GROUP_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      onSetColor(c);
                      setColorOpen(false);
                    }}
                    className={`w-5 h-5 rounded transition-transform hover:scale-110 ${c === group.color ? 'ring-2 ring-white' : ''}`}
                    style={{ backgroundColor: c }}
                    aria-label={`设置颜色 ${c}`}
                  />
                ))}
              </div>
            </>,
            document.body,
          )}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') cancel();
            }}
            className="text-xs font-medium bg-surface-input border border-subtle rounded px-1 py-0.5 text-content focus:outline-none focus:border-blue-500/50 max-w-[200px]"
          />
        ) : (
          <span
            className={`flex-1 min-w-0 text-xs font-medium text-content truncate ${readOnly ? '' : 'cursor-text hover:text-blue-300'}`}
            onDoubleClick={() => !readOnly && setEditing(true)}
            title={readOnly ? group.name : '双击重命名'}
          >
            {group.name}
          </span>
        )}
        <span className="text-[10px] text-content-secondary shrink-0">
          {count} 个航点
        </span>
        {isStaleSurvey && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-amber-500/15 text-amber-300 shrink-0"
            title="多边形或配置在上次生成后有改动"
          >
            已修改
          </span>
        )}
        {onVehicleState === 'on-vehicle' && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-emerald-500/15 text-emerald-300 shrink-0"
            title="该分组的航点已在无人机上(与上次上传一致)"
          >
            已上机
          </span>
        )}
        {onVehicleState === 'stale-on-vehicle' && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-yellow-500/15 text-yellow-300 shrink-0"
            title="该分组此前已上传但之后有修改,无人机上的版本已过期。"
          >
            机上过期
          </span>
        )}
        {isEditing && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-emerald-500/15 text-emerald-300 shrink-0"
            title="勘测面板正在实时编辑该分组;顶点/配置改动会同步到任务"
          >
            编辑中
          </span>
        )}
      </div>
      {showVehiclePicker && (
        <>
          <button
            ref={vehicleBtnRef}
            onClick={(e) => {
              e.stopPropagation();
              const r = vehicleBtnRef.current?.getBoundingClientRect();
              if (r) setVehicleMenuPos({ top: r.bottom + 4, left: r.left });
              setVehicleMenuOpen((o) => !o);
            }}
            className="shrink-0 flex items-center gap-1.5 px-1.5 h-6 rounded text-[11px] font-medium border border-subtle bg-surface-raised hover:bg-surface-solid text-content transition-colors max-w-[120px]"
            data-tip="将该分组分配给机群无人机(设定其颜色与上传目标)"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: assignedVehicle?.color ?? 'transparent', border: assignedVehicle ? 'none' : '1px solid var(--border-subtle, #555)' }}
            />
            <span className="truncate">{assignedVehicle ? assignedVehicle.label : '分配'}</span>
          </button>
          {vehicleMenuOpen && vehicleMenuPos &&
            createPortal(
              <>
                <div className="fixed inset-0 z-[998]" onClick={(e) => { e.stopPropagation(); setVehicleMenuOpen(false); }} />
                <div
                  className="fixed z-[999] min-w-[140px] py-1 rounded-md border border-subtle bg-surface-solid shadow-xl"
                  style={{ top: vehicleMenuPos.top, left: vehicleMenuPos.left }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => { onAssignVehicle?.(null); setVehicleMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-content hover:bg-surface-raised text-left"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-subtle" />
                    未分配
                  </button>
                  {fleetVehicles!.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => { onAssignVehicle?.(v.key); setVehicleMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-content hover:bg-surface-raised text-left ${v.key === assignedVehicleKey ? 'bg-surface-raised' : ''}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                      <span className="truncate">{v.label}</span>
                    </button>
                  ))}
                </div>
              </>,
              document.body,
            )}
        </>
      )}
      {!readOnly && onSync && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (count > 0) onSync();
          }}
          disabled={count === 0}
          className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors ${
            count === 0
              ? 'text-content-tertiary cursor-not-allowed'
              : 'text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/15'
          }`}
          data-tip={
            count === 0
              ? '该分组没有航点'
              : connected
                ? '仅上传该分组到无人机(替换其任务)'
                : '仅保存该分组到文件'
          }
        >
          {connected ? <Upload className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
        </button>
      )}
      {!readOnly && onEdit && !isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="shrink-0 flex items-center gap-1 px-1.5 h-6 rounded text-[11px] font-medium text-purple-300 bg-purple-500/15 hover:bg-purple-500/25 transition-colors"
          data-tip="编辑此勘测(将其多边形 + 配置加载回勘测面板)"
        >
          <Pencil className="w-3 h-3" />
          编辑
        </button>
      )}
      {!readOnly && onReplay && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReplay();
          }}
          className="shrink-0 w-6 h-6 flex items-center justify-center text-sky-300 hover:text-sky-200 hover:bg-sky-500/15 rounded transition-colors"
          data-tip="回放覆盖规划"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      )}
      {!readOnly && isStaleSurvey && onRegenerate && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRegenerate();
          }}
          className="shrink-0 w-6 h-6 flex items-center justify-center text-amber-300 hover:text-amber-200 hover:bg-amber-500/15 rounded transition-colors"
          data-tip="按当前多边形 + 配置重新生成此勘测"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
      {!readOnly && (
        <div className="shrink-0">
          <button
            ref={menuBtnRef}
            onClick={(e) => {
              e.stopPropagation();
              if (!menuOpen) {
                const r = menuBtnRef.current?.getBoundingClientRect();
                // Body-level portal anchored to the button so the menu isn't
                // clipped or out-stacked by the virtualized list's rows.
                if (r) setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
              }
              setMenuOpen((v) => !v);
            }}
            className="w-5 h-5 flex items-center justify-center text-content-tertiary hover:text-content transition-colors rounded hover:bg-surface"
            data-tip="分组操作"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && menuPos &&
            createPortal(
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => setMenuOpen(false)} />
                <div
                  className="fixed z-[9999] min-w-[140px] bg-surface-solid border border-subtle rounded-lg shadow-2xl py-1"
                  style={{ top: menuPos.top, right: menuPos.right }}
                >
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setEditing(true);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                  >
                    重命名
                  </button>
                  {onSelectWaypoints && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onSelectWaypoints();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                    >
                      选择航点
                    </button>
                  )}
                  {onDistribute && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDistribute();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                    >
                      分配到机群({fleetVehicles?.length})
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-surface-raised hover:text-red-300 transition-colors"
                  >
                    删除分组
                  </button>
                </div>
              </>,
              document.body,
            )}
        </div>
      )}
      </div>
      <div className="px-2 pb-1.5 pl-12 -mt-0.5 flex items-center gap-1.5 text-[10px] text-content-tertiary tabular-nums">
        <span className="uppercase tracking-wide">{group.kind}</span>
        {stats && stats.distanceM > 0 && (
          <>
            <span>· {formatBlockDistance(stats.distanceM, distanceUnit)}</span>
            {stats.timeS > 0 && <span>· {formatBlockDuration(stats.timeS)}</span>}
            {stats.gsd != null && stats.gsd > 0 && <span>· {stats.gsd.toFixed(1)} cm/px</span>}
          </>
        )}
      </div>
    </div>
  );
}

// Extracted waypoint list content (original WaypointTablePanel content)
function WaypointListContent({ readOnly = false }: { readOnly?: boolean }) {
  const {
    missionItems,
    groups,
    selectedSeq,
    selectedGroupId,
    currentSeq,
    setSelectedSeq,
    setSelectedGroupId,
    updateWaypoint,
    removeWaypoint,
    removeWaypoints,
    bulkSetAltitude,
    bulkSetSpeed,
    addWaypoint,
    reorderWaypoints,
    renameGroup,
    setGroupColor,
    setGroupVehicle,
    clearMission,
    deleteGroup,
    deleteGroups,
    toggleGroupCollapsed,
    setGroupVisible,
    focusWaypoint,
    uploadGroup,
    uploadGroupToVehicle,
    saveGroupToFile,
    distributeGroupAcrossFleet,
    lastUploadedAt,
    lastUploadedGroupIds,
  } = useMissionStore();

  const surveyEditingGroupId = useSurveyStore((s) => s.editingGroupId);
  const surveyLoadFromGroup = useSurveyStore((s) => s.loadFromGroup);

  // Fleet/swarm: vehicles available to assign groups to, each with its identity
  // colour. The per-group picker only appears when 2+ vehicles are present.
  const fleetVehicles = useFleetVehicles();
  const colorOverrides = useVehicleAppearanceStore((s) => s.overrides);
  const fleetVehicleOptions = useMemo(
    () =>
      fleetVehicles.length >= 2
        ? fleetVehicles.map((v) => ({
            key: v.key,
            label: v.label,
            color: resolveVehicleColor(colorOverrides, v.key, v.sysid),
          }))
        : undefined,
    [fleetVehicles, colorOverrides],
  );

  // Pre-compute upload state per group id. Doing this once per render keeps
  // the GroupHeaderRow props cheap and avoids each header subscribing.
  const uploadedSet = useMemo(
    () => new Set(lastUploadedGroupIds),
    [lastUploadedGroupIds],
  );
  const computeOnVehicleState = useCallback(
    (g: Group): 'none' | 'on-vehicle' | 'stale-on-vehicle' => {
      if (!lastUploadedAt || !uploadedSet.has(g.id)) return 'none';
      return g.updatedAt > lastUploadedAt ? 'stale-on-vehicle' : 'on-vehicle';
    },
    [lastUploadedAt, uploadedSet],
  );

  const advancedLabels = useSettingsStore((s) => s.missionDefaults.advancedMissionLabels);
  const settingsFirmware = useSettingsStore((s) => s.missionDefaults.missionFirmware);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const verticalSpeedUnit = useSettingsStore((s) => s.unitPreferences.verticalSpeed);
  const connectionState = useConnectionStore((s) => s.connectionState);

  const showSegmentColors = useSettingsStore((s) => s.missionDefaults.showSegmentColors);

  // Segment colors for sidebar indicators (matches map line colors)
  const itemColors = useMemo(() => computeItemColors(missionItems), [missionItems]);

  // Per-group waypoint numbers (1-based within each group), matching the map.
  const groupWaypointNumbers = useMemo(
    () => computeGroupWaypointNumbers(missionItems),
    [missionItems],
  );

  // Per-group flight stats (distance, time, GSD) shown in each group header,
  // mirroring the per-block readout pro survey planners expect.
  const groupStats = useMemo(() => {
    const itemsByGroup = new Map<string, MissionItem[]>();
    for (const it of missionItems) {
      if (!it.groupId) continue;
      const arr = itemsByGroup.get(it.groupId);
      if (arr) arr.push(it);
      else itemsByGroup.set(it.groupId, [it]);
    }
    const stats = new Map<string, { distanceM: number; timeS: number; gsd: number | null }>();
    for (const g of groups) {
      const items = itemsByGroup.get(g.id) ?? [];
      let distanceM = 0;
      let prev: { lat: number; lng: number } | null = null;
      for (const it of items) {
        if (it.latitude === 0 && it.longitude === 0) continue;
        const cur = { lat: it.latitude, lng: it.longitude };
        if (prev) distanceM += distanceLatLng(prev, cur);
        prev = cur;
      }
      // Speed: survey config first, then any DO_CHANGE_SPEED in the group.
      let speed = 0;
      let gsd: number | null = null;
      if (isSurveyGroup(g)) {
        const cfg = g.config as { speed?: number; altitude?: number; camera?: { sensorWidth: number; focalLength: number; imageWidth: number; manualCorridorWidth?: number } };
        if (typeof cfg.speed === 'number') speed = cfg.speed;
        const cam = cfg.camera;
        if (cam && !(cam.manualCorridorWidth && cam.manualCorridorWidth > 0) && typeof cfg.altitude === 'number') {
          gsd = calculateGSD(cam.sensorWidth, cam.focalLength, cam.imageWidth, cfg.altitude);
        }
      }
      if (speed <= 0) {
        const spd = items.find((it) => it.command === MAV_CMD.DO_CHANGE_SPEED && it.param2 > 0);
        if (spd) speed = spd.param2;
      }
      const timeS = speed > 0 ? distanceM / speed : 0;
      stats.set(g.id, { distanceM, timeS, gsd });
    }
    return stats;
  }, [missionItems, groups]);

  // Pre-flight validation, recomputed on any mission/group change.
  const validation = useMemo(
    () => validateMission(missionItems, groups, { isAir: true, altitudeUnit }),
    [missionItems, groups, altitudeUnit],
  );

  const effectiveFirmware = effectiveMissionFirmware(connectionState, settingsFirmware);

  const [draggedSeq, setDraggedSeq] = useState<number | null>(null);
  const [dropTargetSeq, setDropTargetSeq] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set());
  // Group-level selection, independent of the per-waypoint one: deleting three
  // survey groups meant opening three overflow menus.
  const [bulkGroups, setBulkGroups] = useState<Set<string>>(new Set());
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [lastCheckedSeq, setLastCheckedSeq] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Any structural change to missionItems (single delete, reorder, add, refresh)
  // can shift the seq numbers our checkbox set refers to. The safe thing is to
  // drop the multi-selection — better than silently selecting the wrong rows.
  // The bulk delete handler clears multiSelected itself first, so this no-ops
  // for its own changes.
  const prevMissionLengthRef = useRef(missionItems.length);
  useEffect(() => {
    if (prevMissionLengthRef.current !== missionItems.length) {
      prevMissionLengthRef.current = missionItems.length;
      if (multiSelected.size > 0) {
        setMultiSelected(new Set());
        setLastCheckedSeq(null);
      }
    }
  }, [missionItems.length, multiSelected.size]);

  // Pre-compute parent-child group structure
  const groupInfo = useMemo(() => {
    const parentOf = new Map<number, number>(); // childSeq -> parentSeq
    const childCountOf = new Map<number, number>(); // parentSeq -> number of children
    let currentParent: number | null = null;

    for (const item of missionItems) {
      const child = !isNavigationCommand(item.command) || item.command === MAV_CMD.NAV_DELAY;
      if (!child) {
        currentParent = item.seq;
        childCountOf.set(item.seq, 0);
      } else if (currentParent !== null) {
        parentOf.set(item.seq, currentParent);
        childCountOf.set(currentParent, (childCountOf.get(currentParent) ?? 0) + 1);
      }
    }

    return { parentOf, childCountOf };
  }, [missionItems]);

  // Group-level lookups for the header rows. `groupById` keeps O(1) lookup
  // from a wp's groupId; `itemCountByGroup` powers the "N WPs" header label
  // even when WPs are hidden by collapse.
  const groupById = useMemo(() => {
    const m = new Map<string, Group>();
    for (const g of groups) m.set(g.id, g);
    return m;
  }, [groups]);

  const itemCountByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const wp of missionItems) {
      if (!wp.groupId) continue;
      m.set(wp.groupId, (m.get(wp.groupId) ?? 0) + 1);
    }
    return m;
  }, [missionItems]);

  // Survey groups whose generatorResult can drive the plan-replay animation.
  // hasReplayData fully validates the opaque blob, so compute once per groups
  // change instead of per header render.
  const replayableGroupIds = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) {
      if (isSurveyGroup(g) && hasReplayData(g.generatorResult)) s.add(g.id);
    }
    return s;
  }, [groups]);

  const toggleCollapse = useCallback((parentSeq: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(parentSeq)) next.delete(parentSeq);
      else next.add(parentSeq);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    const parentSeqs = missionItems
      .filter(item => isNavigationCommand(item.command) && item.command !== MAV_CMD.NAV_DELAY)
      .map(item => item.seq);
    setCollapsedGroups(new Set(parentSeqs));
  }, [missionItems]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  // In readOnly mode, don't show selection for editing
  const selectedWaypoint = readOnly ? null : missionItems.find(wp => wp.seq === selectedSeq);

  const handleRowClick = (seq: number) => {
    setSelectedSeq(seq);
  };

  const handleCommandChange = (seq: number, newCommand: number) => {
    updateWaypoint(seq, { command: newCommand });
  };

  const handleParamChange = (seq: number, key: keyof MissionItem, value: number) => {
    updateWaypoint(seq, { [key]: value });
  };

  const handleDelete = (seq: number) => {
    removeWaypoint(seq);
  };

  // Toggle one waypoint's checkbox. Shift-click selects the range from the
  // previously checked row to the current row (inclusive), so users can
  // bulk-select large mission segments quickly.
  const handleCheckboxToggle = (seq: number, e: React.MouseEvent) => {
    const shiftKey = e.shiftKey;
    setMultiSelected(prev => {
      const next = new Set(prev);
      if (shiftKey && lastCheckedSeq !== null && lastCheckedSeq !== seq) {
        const seqs = missionItems.map(w => w.seq);
        const a = seqs.indexOf(lastCheckedSeq);
        const b = seqs.indexOf(seq);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          // Mirror the action of the anchor row: if it's currently selected,
          // shift-click extends selection; otherwise it extends deselection.
          const shouldSelect = prev.has(lastCheckedSeq);
          for (let i = lo; i <= hi; i++) {
            const s = seqs[i];
            if (s === undefined) continue;
            if (shouldSelect) next.add(s);
            else next.delete(s);
          }
        }
      } else {
        if (next.has(seq)) next.delete(seq);
        else next.add(seq);
      }
      return next;
    });
    setLastCheckedSeq(seq);
  };

  const handleDeleteSelected = () => {
    if (multiSelected.size === 0) return;
    removeWaypoints([...multiSelected]);
    setMultiSelected(new Set());
    setLastCheckedSeq(null);
  };

  const handleSelectAll = () => {
    setMultiSelected(new Set(missionItems.map(w => w.seq)));
  };

  const handleClearSelection = () => {
    setMultiSelected(new Set());
    setLastCheckedSeq(null);
  };

  const selectGroupWaypoints = (groupId: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      for (const it of missionItems) if (it.groupId === groupId) next.add(it.seq);
      return next;
    });
  };

  const [bulkPopover, setBulkPopover] = useState<'altitude' | 'speed' | null>(null);
  const [bulkAltMeters, setBulkAltMeters] = useState(50);
  const [bulkSpeedMs, setBulkSpeedMs] = useState(5);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const bulkNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBulkNotice = (text: string) => {
    setBulkNotice(text);
    if (bulkNoticeTimer.current) clearTimeout(bulkNoticeTimer.current);
    bulkNoticeTimer.current = setTimeout(() => setBulkNotice(null), 3000);
  };
  useEffect(() => () => {
    if (bulkNoticeTimer.current) clearTimeout(bulkNoticeTimer.current);
  }, []);

  // Survey regeneration rebuilds items from config, overwriting manual bulk edits.
  const selectionInSurvey = useMemo(() => {
    if (multiSelected.size === 0 || bulkPopover === null) return false;
    const surveyIds = new Set<string>();
    for (const g of groups) {
      if (!isSurveyGroup(g)) continue;
      surveyIds.add(g.id);
      for (const c of g.distribution?.chunks ?? []) surveyIds.add(c.groupId);
    }
    return selectionTouchesGroups(missionItems, multiSelected, surveyIds);
  }, [multiSelected, bulkPopover, groups, missionItems]);

  const openBulkPopover = (kind: 'altitude' | 'speed') => {
    const first = missionItems.find((it) => multiSelected.has(it.seq));
    if (kind === 'altitude' && first) setBulkAltMeters(first.altitude || 50);
    setBulkPopover(kind);
  };

  const handleBulkAltitude = () => {
    const changed = bulkSetAltitude([...multiSelected], bulkAltMeters);
    setBulkPopover(null);
    handleClearSelection();
    showBulkNotice(`${changed} 个航点已设为 ${bulkAltMeters} m`);
  };

  const handleBulkSpeed = () => {
    const changed = bulkSetSpeed([...multiSelected], bulkSpeedMs);
    setBulkPopover(null);
    handleClearSelection();
    showBulkNotice(
      bulkSpeedMs <= 0
        ? `已移除 ${changed} 条变速命令`
        : `速度已设为 ${bulkSpeedMs} m/s(${changed} 处修改)`,
    );
  };

  const [coordsCopied, setCoordsCopied] = useState(false);
  const [wpCoordCopied, setWpCoordCopied] = useState(false);
  const toggleBulkGroup = useCallback((groupId: string) => {
    setBulkGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleDeleteBulkGroups = useCallback(() => {
    if (bulkGroups.size === 0) return;
    deleteGroups([...bulkGroups]);
    setBulkGroups(new Set());
  }, [bulkGroups, deleteGroups]);

  const handleCopyCoords = () => {
    const source = multiSelected.size > 0
      ? missionItems.filter(w => multiSelected.has(w.seq))
      : missionItems;
    const lines = source
      .filter(w => commandHasLocation(w.command) && hasValidCoordinates(w.latitude, w.longitude))
      .map(w => `${w.latitude.toFixed(7)}, ${w.longitude.toFixed(7)}`);
    if (lines.length === 0) return;
    navigator.clipboard.writeText(lines.join('\n'));
    setCoordsCopied(true);
    window.setTimeout(() => setCoordsCopied(false), 1200);
  };

  const handleAddWaypoint = () => {
    const lastWp = missionItems[missionItems.length - 1];
    const gpsState = getGpsState();
    const homePosition = useMissionStore.getState().homePosition;

    // Use last waypoint, then GPS, then home position (required by addWaypoint anyway)
    const baseLat = lastWp?.latitude ?? (gpsState.hasGpsFix ? gpsState.lat : homePosition?.lat ?? 0);
    const baseLon = lastWp?.longitude ?? (gpsState.hasGpsFix ? gpsState.lon : homePosition?.lon ?? 0);
    const alt = lastWp?.altitude ?? 100;

    // Offset slightly from base position so new WP doesn't stack exactly on top
    const lat = baseLat + 0.001;
    const lon = baseLon + 0.001;

    addWaypoint(lat, lon, alt);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, seq: number) => {
    setDraggedSeq(seq);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(seq));
  };

  const handleDragOver = (e: React.DragEvent, seq: number) => {
    e.preventDefault();
    if (draggedSeq !== null && draggedSeq !== seq) {
      setDropTargetSeq(seq);
    }
  };

  const handleDragLeave = () => {
    setDropTargetSeq(null);
  };

  const handleDrop = (e: React.DragEvent, targetSeq: number) => {
    e.preventDefault();
    if (draggedSeq !== null && draggedSeq !== targetSeq) {
      reorderWaypoints(draggedSeq, targetSeq);
    }
    setDraggedSeq(null);
    setDropTargetSeq(null);
  };

  const handleDragEnd = () => {
    setDraggedSeq(null);
    setDropTargetSeq(null);
  };

  const getCommandName = (cmd: number) => COMMAND_NAMES[cmd] || `未知命令 ${cmd}`;
  const getCommandInfo = (cmd: number) => ALL_AVAILABLE_COMMANDS.find(c => c.value === cmd);

  // Virtualization for large missions. Collapsed children don't render, so we
  // virtualize over the list of ACTUALLY-rendered indices (otherwise measured
  // heights would be wrong). Below the threshold we render the list normally so
  // typical missions behave exactly as before.
  const VIRTUALIZE_THRESHOLD = 250;
  const renderableIndices = useMemo(
    () => computeRenderableIndices(missionItems, collapsedGroups),
    [missionItems, collapsedGroups],
  );
  const useVirtual = renderableIndices.length > VIRTUALIZE_THRESHOLD;
  // Rows are positioned purely from the deterministic per-row estimate - no
  // measureElement. Dynamic DOM measurement feeds measured-size deltas back
  // into the virtualizer during commit (resizeItem -> notify -> re-render ->
  // more refs measured), and that feedback crashed this panel twice with
  // "Maximum update depth exceeded" on large surveys - once via scroll
  // corrections, once via scroll-to-selected reconciliation. Row heights here
  // are uniform per kind, so measurement bought pixel-perfection we don't
  // need at the price of a loop we can't afford. Below VIRTUALIZE_THRESHOLD
  // the list renders normally and stays exact.
  const estimateRowSize = (vi: number): number => {
    const idx = renderableIndices[vi];
    const wp = idx === undefined ? undefined : missionItems[idx];
    if (!wp || idx === undefined) return 52;
    const child = !isNavigationCommand(wp.command) || wp.command === MAV_CMD.NAV_DELAY;
    const prev = idx > 0 ? missionItems[idx - 1] : undefined;
    const showHeader = !prev || prev.groupId !== wp.groupId;
    // Generous so the estimate is >= the real height: a too-small estimate would
    // overlap rows, while a slightly large one just adds a little spacing.
    // Survey rows are uniform, so cumulative drift is negligible.
    return (child ? 40 : 52) + (showHeader ? 48 : 0);
  };
  const rowVirtualizer = useVirtualizer({
    count: renderableIndices.length,
    getScrollElement: () => tableRef.current,
    estimateSize: estimateRowSize,
    overscan: 15,
  });
  // Keep the selection reachable when it comes from outside the list (map or
  // profile click): in virtual mode off-window rows do not exist in the DOM,
  // so move the window to the selected row. align 'auto' is a no-op when the
  // row is already visible, so clicking a row in the list does not jump.
  useEffect(() => {
    if (!useVirtual || selectedSeq === null) return;
    const vi = renderableIndexOfSeq(missionItems, renderableIndices, selectedSeq);
    if (vi >= 0) rowVirtualizer.scrollToIndex(vi, { align: 'auto' });
    // Only selection changes trigger a scroll; list edits and virtualizer
    // updates must not re-run this or the list would fight user scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeq, useVirtual]);
  // Canonical react-virtual rendering: render ONLY the current window from
  // getVirtualItems(). The previous approach mapped over all items and null-ed
  // the off-window ones, which re-attached measureElement refs on every commit
  // and drove an infinite measure -> resize -> setState loop ("Maximum update
  // depth exceeded") that crashed the panel on large (20k+) missions. Below the
  // virtualize threshold we render every renderable row, exactly as before.
  const rowsToRender: { idx: number; v: { key: React.Key; index: number; start: number } | null }[] =
    useVirtual
      ? rowVirtualizer.getVirtualItems().flatMap((vi) => {
          const idx = renderableIndices[vi.index];
          return idx === undefined ? [] : [{ idx, v: { key: vi.key, index: vi.index, start: vi.start } }];
        })
      : missionItems.map((_, idx) => ({ idx, v: null }));

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header: collapse/expand or, when multi-selected, bulk actions */}
      {missionItems.length > 0 && (
        <div className="relative shrink-0 px-3 py-1.5 border-b border-subtle flex items-center justify-between">
          {!readOnly && bulkGroups.size > 0 ? (
            <>
              <span className="text-[10px] text-content-secondary">
                已选中 {bulkGroups.size} 个分组
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBulkGroups(new Set(groups.map((g) => g.id)))}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title="选中所有分组"
                >
                  全选
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={() => setBulkGroups(new Set())}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title="清除分组选择"
                >
                  清除
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={handleDeleteBulkGroups}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors font-medium"
                  title={`删除 ${bulkGroups.size} 个分组及其航点`}
                >
                  删除分组
                </button>
              </div>
            </>
          ) : !readOnly && multiSelected.size > 0 ? (
            <>
              <span className="text-[10px] text-content-secondary">
                已选中 {multiSelected.size}/{missionItems.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title="选中所有航点"
                >
                  全选
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={handleClearSelection}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title="清除选择"
                >
                  清除
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={handleCopyCoords}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  data-tip="复制所选航点的纬度、经度(每行一个)"
                >
                  {coordsCopied ? '已复制' : '复制坐标'}
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={() => openBulkPopover('altitude')}
                  className={`text-[10px] font-medium transition-colors ${
                    bulkPopover === 'altitude' ? 'text-blue-400' : 'text-blue-400/80 hover:text-blue-300'
                  }`}
                  data-tip={`为选中的 ${multiSelected.size} 个航点设置高度`}
                >
                  高度
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={() => openBulkPopover('speed')}
                  className={`text-[10px] font-medium transition-colors ${
                    bulkPopover === 'speed' ? 'text-blue-400' : 'text-blue-400/80 hover:text-blue-300'
                  }`}
                  data-tip="为选中项设置飞行速度(0 表示移除其变速命令)"
                >
                  速度
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={handleDeleteSelected}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors font-medium"
                  title={`删除选中的 ${multiSelected.size} 个航点`}
                >
                  删除所选
                </button>
              </div>
            </>
          ) : (
            <>
              <span className={`text-[10px] ${bulkNotice ? 'text-emerald-400' : 'text-content-secondary'}`}>
                {bulkNotice ?? `${missionItems.length} 项`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyCoords}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  data-tip="复制所有航点的纬度、经度(每行一个)"
                >
                  {coordsCopied ? '已复制' : '复制坐标'}
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={collapseAll}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title="收起所有分组"
                >
                  全部收起
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={expandAll}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title="展开所有分组"
                >
                  全部展开
                </button>
                {!readOnly && missionItems.length > 0 && (
                  <>
                    <span className="text-content-tertiary text-[10px]">|</span>
                    {/* Two-step rather than a modal: destructive, but this bar is
                        transient and a dialog here would be heavier than the action. */}
                    <button
                      onClick={() => {
                        if (confirmDeleteAll) {
                          clearMission();
                          setConfirmDeleteAll(false);
                        } else {
                          setConfirmDeleteAll(true);
                        }
                      }}
                      onBlur={() => setConfirmDeleteAll(false)}
                      className="text-[10px] text-red-400 hover:text-red-300 transition-colors font-medium"
                      data-tip="从规划器中移除所有航点。不会影响无人机上的任务。"
                    >
                      {confirmDeleteAll
                        ? `删除全部 ${missionItems.length} 项?`
                        : '全部删除'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {!readOnly && bulkPopover && multiSelected.size > 0 && (
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setBulkPopover(null)} />
              <div className="absolute right-2 top-full mt-1 z-[9999] w-60 bg-surface-solid border border-subtle rounded-lg shadow-2xl p-3">
                <div className="text-xs font-medium text-content mb-2">
                  {bulkPopover === 'altitude'
                    ? `${multiSelected.size} 个航点的高度`
                    : `${multiSelected.size} 个航点的速度`}
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 min-w-0"
                    data-tip={
                      bulkPopover === 'speed'
                        ? '0 表示移除选中项的 DO_CHANGE_SPEED 命令'
                        : undefined
                    }
                  >
                    {bulkPopover === 'altitude' ? (
                      <DraftNumberInput value={bulkAltMeters} onCommit={setBulkAltMeters} min={-500} max={10000} step={1} />
                    ) : (
                      <DraftNumberInput value={bulkSpeedMs} onCommit={setBulkSpeedMs} min={0} max={200} step={0.5} />
                    )}
                  </div>
                  <span className="text-[10px] text-content-secondary shrink-0">
                    {bulkPopover === 'altitude' ? 'm' : 'm/s'}
                  </span>
                  <button
                    onClick={bulkPopover === 'altitude' ? handleBulkAltitude : handleBulkSpeed}
                    className="shrink-0 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
                  >
                    应用
                  </button>
                </div>
                {bulkPopover === 'altitude' && (
                  <p className="mt-1.5 text-[10px] text-content-tertiary">
                    高度坐标系保持不变。
                  </p>
                )}
                {selectionInSurvey && (
                  <p className="mt-1.5 text-[10px] text-amber-400">
                    选中项包含勘测航点。重新生成勘测时会按其配置重建并覆盖此修改;
                    如需长期生效,请优先使用勘测自身的高度设置。
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Pre-flight validation strip */}
      {!readOnly && missionItems.length > 0 && (
        <div className="border-b border-subtle shrink-0">
          <MissionValidationBadge result={validation} />
        </div>
      )}

      {/* Waypoint list */}
      <div className="flex-1 overflow-auto" ref={tableRef}>
        {missionItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-content-secondary p-4">
            <svg className="w-12 h-12 mb-3 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            {readOnly ? (
              <>
                <p className="text-sm font-medium mb-1">未加载任务</p>
                <p className="text-xs text-content-tertiary text-center">飞控上没有任务</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">还没有航点</p>
                <p className="text-xs text-content-tertiary text-center">点击下方“添加航点”、使用地图的添加航点工具,或按住 Shift 点击地图</p>
              </>
            )}
          </div>
        ) : (
          <div
            className={useVirtual ? 'relative' : 'divide-y divide-subtle'}
            style={useVirtual ? { height: rowVirtualizer.getTotalSize() } : undefined}
          >
            {rowsToRender.map(({ idx, v }) => {
              const wp = missionItems[idx]!;
              // Wrap in an absolutely-positioned, measured container when
              // virtualizing; pass through unchanged otherwise.
              const wrap = (node: React.ReactNode): React.ReactNode =>
                v
                  ? (
                    <div
                      key={v.key}
                      data-index={v.index}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
                    >
                      {node}
                    </div>
                  )
                  : node;
              const isSelected = wp.seq === selectedSeq;
              const isCurrent = wp.seq === currentSeq;
              const isDragging = wp.seq === draggedSeq;
              const isDropTarget = wp.seq === dropTargetSeq;
              const isChild = !isNavigationCommand(wp.command) || wp.command === MAV_CMD.NAV_DELAY;
              const segColor = showSegmentColors && !isCurrent && !(isSelected && !readOnly)
                ? (itemColors.get(wp.seq) ?? SEGMENT_COLORS.default)
                : undefined;
              // Add micro gap before parent nav rows (except the first item)
              const isParentWithGap = !isChild && idx > 0;

              // Collapse logic: hide children of collapsed parents
              const parentSeq = groupInfo.parentOf.get(wp.seq);
              if (isChild && parentSeq !== undefined && collapsedGroups.has(parentSeq)) {
                return null;
              }

              // Parent collapse info
              const childCount = !isChild ? (groupInfo.childCountOf.get(wp.seq) ?? 0) : 0;
              const isCollapsed = !isChild && collapsedGroups.has(wp.seq);
              const hasChildren = childCount > 0;

              // Group header detection. We show a header before the first WP
              // of each group. When the group is collapsed, only the header
              // renders for that span; subsequent items return null.
              const prevWp = idx > 0 ? missionItems[idx - 1] : null;
              const showGroupHeader = !prevWp || prevWp.groupId !== wp.groupId;
              const group = wp.groupId ? groupById.get(wp.groupId) : undefined;
              const hideByGroupCollapse = group?.collapsed === true;
              // Assignments store the vehicle key of the moment; transport ids
              // rotate on engine restart, so resolve to the LIVE vehicle key
              // (sysid fallback) for both display and upload targeting.
              const liveAssignedKey = group?.assignedVehicleKey
                ? fleetVehicles.find((v) => isAssignedToVehicle(group.assignedVehicleKey, v))?.key
                  ?? group.assignedVehicleKey
                : undefined;
              const headerNode =
                showGroupHeader && group ? (
                  <GroupHeaderRow
                    group={group}
                    count={itemCountByGroup.get(group.id) ?? 0}
                    stats={groupStats.get(group.id)}
                    readOnly={readOnly}
                    isSelected={selectedGroupId === group.id}
                    isEditing={surveyEditingGroupId === group.id}
                    onVehicleState={computeOnVehicleState(group)}
                    onSelect={() => setSelectedGroupId(group.id)}
                    onToggleCollapse={() => toggleGroupCollapsed(group.id)}
                    onToggleVisible={() =>
                      setGroupVisible(group.id, !group.visible)
                    }
                    fleetVehicles={fleetVehicleOptions}
                    assignedVehicleKey={liveAssignedKey}
                    onDistribute={
                      fleetVehicleOptions &&
                      (itemCountByGroup.get(group.id) ?? 0) >= fleetVehicleOptions.length * 2
                        ? () => distributeGroupAcrossFleet(group.id, fleetVehicleOptions)
                        : undefined
                    }
                    onSelectWaypoints={
                      (itemCountByGroup.get(group.id) ?? 0) > 0
                        ? () => selectGroupWaypoints(group.id)
                        : undefined
                    }
                    onAssignVehicle={(vehicleKey) => {
                      setGroupVehicle(group.id, vehicleKey);
                      // Assigning a vehicle colours the group by that vehicle's
                      // identity colour, so the planner + telemetry map agree.
                      if (vehicleKey) {
                        const opt = fleetVehicleOptions?.find((o) => o.key === vehicleKey);
                        if (opt) setGroupColor(group.id, opt.color);
                      }
                    }}
                    onSync={() =>
                      liveAssignedKey
                        ? uploadGroupToVehicle(group.id, liveAssignedKey)
                        : connectionState.isConnected
                          ? uploadGroup(group.id)
                          : saveGroupToFile(group.id)
                    }
                    connected={connectionState.isConnected || !!liveAssignedKey}
                    onRename={(name) => renameGroup(group.id, name)}
                    onSetColor={(color) => setGroupColor(group.id, color)}
                    onDelete={() => deleteGroup(group.id)}
                    bulkSelected={bulkGroups.has(group.id)}
                    onToggleBulkSelected={() => toggleBulkGroup(group.id)}
                    distanceUnit={distanceUnit}
                    onRegenerate={
                      isSurveyGroup(group)
                        ? () => regenerateSurveyGroup(group.id)
                        : undefined
                    }
                    onReplay={
                      replayableGroupIds.has(group.id)
                        ? () => {
                            // Toggle: replaying this group again stops it.
                            const rs = useReplayStore.getState();
                            if (rs.groupId === group.id) rs.stopReplay();
                            else rs.startReplay(group.id);
                          }
                        : undefined
                    }
                    onEdit={
                      isSurveyGroup(group)
                        ? () => {
                            const sg = group as SurveyGroup;
                            surveyLoadFromGroup({
                              id: sg.id,
                              polygon: sg.polygon,
                              config: sg.config,
                            });
                          }
                        : undefined
                    }
                  />
                ) : null;

              if (hideByGroupCollapse) {
                // Render only the header (if any) and suppress the row.
                return wrap(<Fragment key={wp.seq}>{headerNode}</Fragment>);
              }

              return wrap((
                <Fragment key={wp.seq}>
                {headerNode}
                <div
                  onClick={() => !readOnly && handleRowClick(wp.seq)}
                  draggable={!readOnly}
                  onDragStart={(e) => !readOnly && handleDragStart(e, wp.seq)}
                  onDragOver={(e) => !readOnly && handleDragOver(e, wp.seq)}
                  onDragLeave={!readOnly ? handleDragLeave : undefined}
                  onDrop={(e) => !readOnly && handleDrop(e, wp.seq)}
                  onDragEnd={!readOnly ? handleDragEnd : undefined}
                  className={`group flex items-center gap-2 py-2 transition-colors ${
                    isChild ? 'px-2 pl-8' : 'px-2'
                  } ${
                    isParentWithGap ? 'mt-1' : ''
                  } ${
                    readOnly ? '' : 'cursor-pointer'
                  } ${
                    isDropTarget ? 'border-t-2 border-t-blue-500' : ''
                  } ${
                    isDragging
                      ? 'opacity-50 bg-surface'
                      : isCurrent
                      ? 'bg-orange-500/10 border-l-2 border-l-orange-500'
                      : isSelected && !readOnly
                      ? 'bg-blue-500/20 border-l-2 border-l-blue-500'
                      : isChild
                      ? 'border-l-2 border-l-subtle ml-[14px] hover:bg-surface'
                      : readOnly
                      ? 'border-l-2 border-l-transparent'
                      : 'hover:bg-surface border-l-2 border-l-transparent'
                  }`}
                >
                  {/* Multi-select checkbox - hidden in readOnly mode */}
                  {!readOnly && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCheckboxToggle(wp.seq, e);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="shrink-0 flex items-center justify-center w-5 h-5"
                      title="Shift+点击以选择范围"
                    >
                      <input
                        type="checkbox"
                        checked={multiSelected.has(wp.seq)}
                        onChange={() => { /* handled by wrapper onClick to capture shift */ }}
                        className="w-3.5 h-3.5 rounded border-subtle bg-surface-raised text-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Drag handle - hidden in readOnly mode */}
                  {!readOnly && (
                    <div className="text-content-tertiary cursor-grab active:cursor-grabbing">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                      </svg>
                    </div>
                  )}

                  {/* Collapse chevron for parent nav items with children */}
                  {!isChild && hasChildren ? (
                    <button
                      onClick={(e) => toggleCollapse(wp.seq, e)}
                      className="w-4 h-4 flex items-center justify-center text-content-secondary hover:text-content transition-colors shrink-0"
                      title={isCollapsed ? `展开(${childCount} 项)` : '收起'}
                    >
                      <svg className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : !isChild ? (
                    <div className="w-4" />
                  ) : null}

                  {/* Badge: numbered circle for nav commands, icon or dot for child commands */}
                  {isChild ? (
                    (() => {
                      const ChildIcon = getChildCommandIcon(wp.command, wp);
                      const intrinsicColor = getChildIconColor(wp.command);
                      const iconColor = isCurrent ? '#fb923c' : isSelected && !readOnly ? '#60a5fa' : segColor || intrinsicColor;
                      return (
                        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0">
                          {ChildIcon ? (
                            <ChildIcon className="w-3.5 h-3.5" style={{ color: iconColor }} />
                          ) : (
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                isCurrent ? 'bg-orange-400' : isSelected && !readOnly ? 'bg-blue-400' : !segColor ? 'bg-content-secondary' : ''
                              }`}
                              style={segColor ? { backgroundColor: segColor } : undefined}
                            />
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isCurrent
                          ? 'bg-orange-500 text-white'
                          : isSelected && !readOnly
                          ? 'bg-blue-500 text-white'
                          : segColor
                          ? 'text-white'
                          : 'bg-surface-raised text-content'
                      }`}
                      style={segColor ? { backgroundColor: segColor } : undefined}
                    >
                      {groupWaypointNumbers.get(wp.seq) ?? wp.seq + 1}
                    </div>
                  )}

                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <div className={`flex items-center gap-1.5 ${
                      isChild ? 'text-xs text-content-secondary' : 'text-sm text-content'
                    }`}>
                      {(() => {
                        const summary = getWaypointSummary(wp, advancedLabels, distanceUnit, altitudeUnit, speedUnit, verticalSpeedUnit);
                        const altText = commandHasLocation(wp.command)
                          ? formatAltitudeFromMeters(wp.altitude, altitudeUnit)
                          : null;
                        return (
                          <>
                            <span className="truncate">{summary}</span>
                            {/* Altitude on the primary line; skipped when the
                                summary already embeds it (Takeoff, Loiter to
                                Alt, ...) so it never shows twice. */}
                            {altText && !summary.includes(altText) && (
                              <span className="shrink-0 text-content-secondary tabular-nums">{altText}</span>
                            )}
                          </>
                        );
                      })()}
                      {wp.command === MAV_CMD.CONDITION_YAW && wp.param3 !== 0 && (
                        <span className={`px-1 py-0 text-[9px] font-bold rounded shrink-0 ${
                          wp.param3 < 0
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'bg-blue-500/15 text-blue-400'
                        }`}>
                          {wp.param3 < 0 ? 'CCW' : 'CW'}
                        </span>
                      )}
                      {/* Collapsed child count badge */}
                      {isCollapsed && childCount > 0 && (
                        <span className="px-1.5 py-0 text-[9px] rounded bg-surface-raised text-content-secondary shrink-0">
                          +{childCount}
                        </span>
                      )}
                    </div>
                    {commandHasLocation(wp.command) && (
                      <div className="text-[10px] text-content-tertiary font-mono">
                        {wp.latitude.toFixed(5)}, {wp.longitude.toFixed(5)}
                      </div>
                    )}
                  </div>

                  {/* Focus button - pan/zoom the map to this WP. Located WPs only. */}
                  {!readOnly && commandHasLocation(wp.command) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        focusWaypoint(wp.seq);
                      }}
                      className={`p-1 text-content-secondary hover:text-blue-400 hover:bg-blue-500/10 rounded transition-all shrink-0 ${
                        isSelected || multiSelected.has(wp.seq) ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                      }`}
                      data-tip="将地图聚焦到此航点"
                    >
                      <Crosshair className="w-4 h-4" />
                    </button>
                  )}

                  {/* Delete button - hidden in readOnly mode */}
                  {!readOnly && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(wp.seq);
                      }}
                      className={`p-1 text-content-secondary hover:text-red-400 hover:bg-red-500/10 rounded transition-all shrink-0 ${
                        isSelected || multiSelected.has(wp.seq) ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                      }`}
                      title="删除"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
                </Fragment>
              ));
            })}
            {/* Groups with no waypoints (e.g. a survey emptied by Distribute
                to fleet) still need a header, or their polygon/config would
                be unreachable from the list. */}
            {groups
              .filter((g) => (itemCountByGroup.get(g.id) ?? 0) === 0)
              .map((group) => (
                <GroupHeaderRow
                  key={group.id}
                  group={group}
                  count={0}
                  readOnly={readOnly}
                  isSelected={selectedGroupId === group.id}
                  isEditing={surveyEditingGroupId === group.id}
                  onVehicleState="none"
                  onSelect={() => setSelectedGroupId(group.id)}
                  onToggleCollapse={() => toggleGroupCollapsed(group.id)}
                  onToggleVisible={() => setGroupVisible(group.id, !group.visible)}
                  connected={connectionState.isConnected}
                  onRename={(name) => renameGroup(group.id, name)}
                  onSetColor={(color) => setGroupColor(group.id, color)}
                  onDelete={() => deleteGroup(group.id)}
                  bulkSelected={bulkGroups.has(group.id)}
                  onToggleBulkSelected={() => toggleBulkGroup(group.id)}
                  distanceUnit={distanceUnit}
                  onRegenerate={
                    isSurveyGroup(group) ? () => regenerateSurveyGroup(group.id) : undefined
                  }
                  onEdit={
                    isSurveyGroup(group)
                      ? () => {
                          const sg = group as SurveyGroup;
                          surveyLoadFromGroup({
                            id: sg.id,
                            polygon: sg.polygon,
                            config: sg.config,
                          });
                        }
                      : undefined
                  }
                />
              ))}
          </div>
        )}
      </div>

      {/* Details panel for selected waypoint */}
      {selectedWaypoint && (
        <div className="border-t border-subtle bg-surface p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-content-secondary">
              正在编辑航点 {groupWaypointNumbers.get(selectedWaypoint.seq) ?? selectedWaypoint.seq + 1}
            </span>
            <div className="flex items-center gap-2">
              {commandHasLocation(selectedWaypoint.command) && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${selectedWaypoint.latitude}, ${selectedWaypoint.longitude}`);
                    setWpCoordCopied(true);
                    window.setTimeout(() => setWpCoordCopied(false), 1200);
                  }}
                  className="text-content-secondary hover:text-content"
                  data-tip="复制此航点的纬度、经度"
                >
                  {wpCoordCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            <button
              onClick={() => setSelectedSeq(null)}
              className="text-content-secondary hover:text-content"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            </div>
          </div>

          {/* Command selector */}
          <div className="mb-3">
            <label className="block text-[11px] text-content-secondary mb-1">命令</label>
            <CommandDropdown
              value={selectedWaypoint.command}
              onChange={(cmd) => handleCommandChange(selectedWaypoint.seq, cmd)}
              advanced={advancedLabels}
              firmware={effectiveFirmware}
            />
          </div>

          {/* Dynamic parameters */}
          <div className="grid grid-cols-2 gap-2">
            {getCommandParams(selectedWaypoint.command)
              .filter(p => p.show)
              .map((param) => {
                const displayUnit = displayParamUnit(param, distanceUnit, altitudeUnit, speedUnit, verticalSpeedUnit);
                return (
                  <div key={param.key}>
                    <label className="block text-[11px] text-content-secondary mb-1">
                      {param.label} {displayUnit && <span className="text-content-tertiary">({displayUnit})</span>}
                    </label>
                    {param.unitKind === 'distance' || param.unitKind === 'altitude' || param.unitKind === 'speed' || param.unitKind === 'verticalSpeed' ? (
                      <UnitParamInput
                        nativeValue={selectedWaypoint[param.key] as number}
                        param={param}
                        distanceUnit={distanceUnit}
                        altitudeUnit={altitudeUnit}
                        speedUnit={speedUnit}
                        verticalSpeedUnit={verticalSpeedUnit}
                        onCommit={(nativeValue) => handleParamChange(selectedWaypoint.seq, param.key, nativeValue)}
                      />
                    ) : (
                      <DraftNumberInput
                        value={selectedWaypoint[param.key] as number}
                        onCommit={(v) => handleParamChange(selectedWaypoint.seq, param.key, v)}
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        live
                      />
                    )}
                  </div>
                );
              })}

            {/* Location fields for commands that have them */}
            {commandHasLocation(selectedWaypoint.command) && (
              <>
                <div>
                  <label className="block text-[11px] text-content-secondary mb-1">纬度</label>
                  <DraftNumberInput
                    value={selectedWaypoint.latitude}
                    onCommit={(v) => handleParamChange(selectedWaypoint.seq, 'latitude', v)}
                    min={-90}
                    max={90}
                    text
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-content-secondary mb-1">经度</label>
                  <DraftNumberInput
                    value={selectedWaypoint.longitude}
                    onCommit={(v) => handleParamChange(selectedWaypoint.seq, 'longitude', v)}
                    min={-180}
                    max={180}
                    text
                  />
                </div>
              </>
            )}
          </div>

          {/* Help text */}
          {COMMAND_DESCRIPTIONS[selectedWaypoint.command] && (
            <p className="mt-3 text-[11px] text-content-secondary italic">
              {COMMAND_DESCRIPTIONS[selectedWaypoint.command]}
            </p>
          )}
        </div>
      )}

      {/* Add waypoint button - hidden in readOnly mode */}
      {!readOnly && (
        <div className="p-2 border-t border-subtle">
          <button
            onClick={handleAddWaypoint}
            className="w-full py-2 text-sm text-content hover:text-content bg-surface-raised hover:bg-surface-raised rounded transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加航点
          </button>
        </div>
      )}
    </div>
  );
}
