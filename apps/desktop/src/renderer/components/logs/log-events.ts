// Decodes ArduPilot dataflash ERR / EV / MSG / MODE / CMD records into a
// human-readable, severity-graded event timeline. Pure (no DOM/store imports)
// so it is unit-testable and shareable between the events panel and the chart.

import { COPTER_MODE_NAMES, PLANE_MODE_NAMES, ROVER_MODE_NAMES } from '@ardudeck/dataflash-parser';
import { logRows, type LogColumns } from '../../utils/log-columns';

export const COPTER_MODES = COPTER_MODE_NAMES;

/**
 * Mode number -> name, using the log's vehicle type to pick the right table.
 * The same number means different modes per vehicle (10 = plane/rover AUTO,
 * 11 = copter DRIFT but plane/rover RTL), so defaulting to the copter table
 * mislabels plane and rover logs.
 */
export function getModeName(modeNum: number, vehicleType?: string): string {
  const map = vehicleType === 'plane' ? PLANE_MODE_NAMES
    : vehicleType === 'rover' ? ROVER_MODE_NAMES
    : COPTER_MODE_NAMES;
  return map[modeNum] ?? `MODE_${modeNum}`;
}

export const MODE_COLORS: Record<string, string> = {
  STABILIZE: '#6b7280', ALT_HOLD: '#3b82f6', LOITER: '#10b981', AUTO: '#8b5cf6',
  RTL: '#f59e0b', LAND: '#ef4444', GUIDED: '#ec4899', POSHOLD: '#06b6d4',
  ACRO: '#f97316', CIRCLE: '#84cc16', BRAKE: '#6366f1', SMART_RTL: '#fbbf24',
  MANUAL: '#6b7280', CRUISE: '#06b6d4', FBWA: '#3b82f6', FBWB: '#0ea5e9',
  STEERING: '#3b82f6', HOLD: '#6366f1', TAKEOFF: '#84cc16', QLOITER: '#10b981',
};

/** ArduPilot LogErrorSubsystem ids (AP_Logger). */
const ERR_SUBSYSTEMS: Record<number, string> = {
  1: '主系统', 2: '无线电', 3: '罗盘', 4: '光流',
  5: '无线电失控保护', 6: '电池失控保护', 8: '地面站失控保护',
  9: '围栏失控保护', 10: '飞行模式', 11: 'GPS', 12: '坠机检查',
  13: '翻转', 15: '降落伞', 16: 'EKF 检查', 17: 'EKF 失控保护',
  18: '气压计', 19: 'CPU 负载', 20: 'ADSB 失控保护', 21: '地形',
  22: '导航', 23: '地形失控保护', 24: 'EKF 主源',
  25: '推力损失检查', 26: '传感器失控保护', 27: '进水失控保护',
  28: '飞手输入', 29: '振动失控保护', 30: '内部错误',
  31: '航位推算失控保护',
};

/** Per-subsystem error-code meanings; generic fallbacks below. */
const ERR_CODES_BY_SUBSYS: Record<number, Record<number, string>> = {
  2: { 2: '数据帧延迟' },
  11: { 2: 'GPS 故障', 0: '故障已清除' },
  12: { 1: '检测到坠机', 2: '失控' },
  16: { 2: '方差过大', 0: '方差已恢复' },
  18: { 2: '气压计故障', 0: '故障已清除' },
  25: { 1: '推力损失' },
};

const ERR_CODES_GENERIC: Record<number, string> = {
  0: '已解决',
  1: '已触发',
  4: '状态异常',
};

/** ArduPilot LogEvent ids (AP_Logger LogEvent enum). */
const EV_NAMES: Record<number, string> = {
  10: '已解锁', 11: '已上锁', 15: '自动模式已解锁',
  17: '降落可能已完成', 18: '降落完成', 19: 'GPS 丢失',
  21: '翻转开始', 22: '翻转结束', 25: '已设置 Home 点',
  26: '简单模式开启', 27: '简单模式关闭', 28: '尚未降落',
  29: '超级简单模式开启',
  30: 'AutoTune 已初始化', 31: 'AutoTune 已关闭', 32: 'AutoTune 重启',
  33: 'AutoTune 成功', 34: 'AutoTune 失败', 35: 'AutoTune 达到限制',
  36: 'AutoTune 飞手测试', 37: 'AutoTune 参数已保存',
  38: '微调已保存', 39: '航点已保存',
  41: '围栏已启用', 42: '围栏已禁用',
  43: 'Acro 教练关闭', 44: 'Acro 教练自动回平', 45: 'Acro 教练受限',
  46: '夹爪抓取', 47: '夹爪释放',
  49: '降落伞已禁用', 50: '降落伞已启用', 51: '降落伞已开伞',
  52: '起落架已放下', 53: '起落架已收起',
  54: '电机紧急停止', 55: '电机紧急停止已解除',
  56: '电机互锁已禁用', 57: '电机互锁已启用',
  58: '旋翼加速完成', 59: '旋翼转速低于临界值',
  60: 'EKF 高度重置', 61: '降落被飞手取消', 62: 'EKF 偏航重置',
  63: 'ADSB 避让已启用', 64: 'ADSB 避让已禁用',
  65: '近距避让已启用', 66: '近距避让已禁用',
  67: 'GPS 主源已切换',
  71: 'ZigZag A 点已存储', 72: 'ZigZag B 点已存储',
  73: '降落重定位已激活', 74: '待机已启用', 75: '待机已禁用',
};

/** ArduPilot ModeReason enum: why the vehicle changed flight mode. */
const MODE_REASONS: Record<number, string> = {
  0: '未知', 1: 'RC 指令', 2: '地面站指令', 3: '无线电失控保护',
  4: '电池失控保护', 5: '地面站失控保护', 6: 'EKF 失控保护', 7: 'GPS 故障',
  8: '任务结束', 9: '油门降落脱离', 10: '越出围栏',
  11: '地形失控保护', 12: '刹车超时', 13: '翻转完成',
  14: '避让', 15: '避让恢复', 16: '抛飞完成',
  17: '终止', 18: '玩具模式', 19: '坠机失控保护', 20: '翱翔 FBW-B',
  21: '翱翔检测到热气流', 22: '翱翔进入热气流', 23: '不可用',
  24: '自转开始', 25: '自转改出',
  26: '翱翔漂移超限', 27: 'RTL 完成后切换到 VTOL 降落',
  28: 'RTL 完成后切换到固定翼自动降落', 29: '任务指令',
  30: 'FrSky 指令', 31: '围栏返回上一模式',
  32: '以 QRTL 代替 RTL', 33: '自动 RTL 退出', 34: '悬停高度达到后 QLand',
  35: 'VTOL 降落中的悬停高度', 36: '无线电失控保护恢复',
  37: '以 QLand 代替 RTL', 38: '航位推算失控保护',
  39: '模式起飞失控保护', 40: 'DDS 指令', 41: '辅助功能',
  42: 'Lua 指令', 43: '自动降落航线', 44: 'RC 紧急停止',
  45: 'Crow 模式切换',
};

/** Event ids that deserve attention even though they are "events" not errors. */
const EV_WARN_IDS = new Set([19, 51, 54, 59, 60, 62]);

/** MSG text that indicates a problem rather than chatter. */
const MSG_WARN_RE = /prearm|pre-arm|failsafe|fail|error|crash|glitch|variance|unhealthy|leak|lost|timeout|emergency/i;

export type LogEventKind = 'ERR' | 'EV' | 'MSG' | 'MODE' | 'CMD';
export type LogEventSeverity = 'error' | 'warn' | 'info';

export interface LogEventEntry {
  timeS: number;
  kind: LogEventKind;
  severity: LogEventSeverity;
  label: string;
  detail?: string;
}

type LogMessages = Record<string, LogColumns>;

export function decodeErr(subsys: number, ecode: number, vehicleType?: string): { label: string; detail: string; severity: LogEventSeverity } {
  const label = ERR_SUBSYSTEMS[subsys] ?? `子系统 ${subsys}`;
  let detail: string;
  if (subsys === 10) {
    // Flight mode subsystem: the code is the mode number that was refused.
    detail = `无法进入 ${getModeName(ecode, vehicleType)}`;
  } else {
    detail = ERR_CODES_BY_SUBSYS[subsys]?.[ecode] ?? ERR_CODES_GENERIC[ecode] ?? `代码 ${ecode}`;
  }
  return { label, detail, severity: ecode === 0 ? 'info' : 'error' };
}

export function decodeEv(id: number): { label: string; severity: LogEventSeverity } {
  return { label: EV_NAMES[id] ?? `事件 ${id}`, severity: EV_WARN_IDS.has(id) ? 'warn' : 'info' };
}

/**
 * Flattens ERR/EV/MSG/MODE/CMD records into one chronological event list.
 * MP buries these in separate raw tabs; here they are one severity-graded
 * timeline the user can filter and click to jump the charts to.
 */
export function extractLogEvents(log: { messages: LogMessages; metadata?: { vehicleType?: string } }): LogEventEntry[] {
  const out: LogEventEntry[] = [];
  const vehicleType = log.metadata?.vehicleType;

  for (const m of logRows(log, 'ERR')) {
    const subsys = typeof m.fields['Subsys'] === 'number' ? m.fields['Subsys'] : -1;
    const ecode = typeof m.fields['ECode'] === 'number' ? m.fields['ECode'] : -1;
    const d = decodeErr(subsys, ecode, vehicleType);
    out.push({ timeS: m.timeUs / 1_000_000, kind: 'ERR', severity: d.severity, label: d.label, detail: d.detail });
  }

  for (const m of logRows(log, 'EV')) {
    const id = typeof m.fields['Id'] === 'number' ? m.fields['Id'] : -1;
    const d = decodeEv(id);
    out.push({ timeS: m.timeUs / 1_000_000, kind: 'EV', severity: d.severity, label: d.label });
  }

  for (const m of logRows(log, 'MSG')) {
    const text = typeof m.fields['Message'] === 'string' ? m.fields['Message'] : '';
    if (!text) continue;
    out.push({
      timeS: m.timeUs / 1_000_000,
      kind: 'MSG',
      severity: MSG_WARN_RE.test(text) ? 'warn' : 'info',
      label: text,
    });
  }

  for (const m of logRows(log, 'MODE')) {
    const modeNum = (typeof m.fields['ModeNum'] === 'number' ? m.fields['ModeNum'] : m.fields['Mode']);
    const name = typeof modeNum === 'number' ? getModeName(modeNum, vehicleType) : String(m.fields['Mode'] ?? '?');
    const rsn = m.fields['Rsn'];
    out.push({
      timeS: m.timeUs / 1_000_000,
      kind: 'MODE',
      severity: 'info',
      label: `模式: ${name}`,
      detail: typeof rsn === 'number' ? `原因: ${MODE_REASONS[rsn] ?? rsn}` : undefined,
    });
  }

  for (const m of logRows(log, 'CMD')) {
    const num = m.fields['CNum'];
    const name = typeof m.fields['CName'] === 'string' ? m.fields['CName'] : `命令 ${m.fields['CId'] ?? '?'}`;
    out.push({
      timeS: m.timeUs / 1_000_000,
      kind: 'CMD',
      severity: 'info',
      label: typeof num === 'number' ? `航点 ${num}: ${name}` : String(name),
    });
  }

  out.sort((a, b) => a.timeS - b.timeS);
  return out;
}

/** mm:ss.s for event timestamps (logs run minutes to hours). */
export function fmtEventTime(timeS: number): string {
  const mm = Math.floor(timeS / 60);
  const ss = timeS - mm * 60;
  return `${mm}:${ss < 10 ? '0' : ''}${ss.toFixed(1)}`;
}
