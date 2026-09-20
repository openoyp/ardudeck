/**
 * Curated catalog of common PX4 airframes for the airframe picker.
 *
 * PX4 selects an airframe with a single integer parameter, SYS_AUTOSTART (the
 * "auto-start script index"), then requires a reboot. PX4's full airframe DB is
 * large and version-dependent; this is a deliberately small, hand-checked
 * subset of well-known generic ids rather than an import of the whole DB.
 *
 * The ids below are the standard PX4 generic SYS_AUTOSTART values. They should
 * be confirmed against the PX4 airframe reference for a given firmware version:
 * https://docs.px4.io/main/en/airframes/airframe_reference.html
 */

export type Px4AirframeCategory = 'multirotor' | 'fixed-wing' | 'vtol' | 'rover';

export interface Px4Airframe {
  /** SYS_AUTOSTART id. */
  id: number;
  name: string;
  category: Px4AirframeCategory;
  description: string;
}

export const PX4_AIRFRAME_CATEGORIES: Array<{ id: Px4AirframeCategory; label: string }> = [
  { id: 'multirotor', label: '多旋翼' },
  { id: 'fixed-wing', label: '固定翼' },
  { id: 'vtol', label: 'VTOL' },
  { id: 'rover', label: '漫游车' },
];

export const PX4_AIRFRAMES: Px4Airframe[] = [
  // Multirotor (well-known generic ids)
  { id: 4001, name: '通用四旋翼（X）', category: 'multirotor', description: '标准 X 布局四旋翼。' },
  { id: 4002, name: '通用四旋翼（+）', category: 'multirotor', description: '标准 + 布局四旋翼。' },
  { id: 4008, name: '通用四旋翼（宽轴距）', category: 'multirotor', description: '加宽机臂几何的 X 布局四旋翼。' },
  { id: 6001, name: '通用六旋翼（X）', category: 'multirotor', description: '标准 X 布局六旋翼。' },
  { id: 6002, name: '通用六旋翼（+）', category: 'multirotor', description: '标准 + 布局六旋翼。' },
  { id: 8001, name: '通用八旋翼（X）', category: 'multirotor', description: '标准 X 布局八旋翼。' },
  { id: 8002, name: '通用八旋翼（+）', category: 'multirotor', description: '标准 + 布局八旋翼。' },

  // Fixed wing
  { id: 2100, name: '通用常规固定翼', category: 'fixed-wing', description: '常规布局固定翼飞机。' },
  { id: 3000, name: '通用飞翼', category: 'fixed-wing', description: '无尾飞翼 / 三角翼。' },

  // VTOL (use generic ids; confirm against the PX4 reference)
  { id: 13000, name: '通用标准 VTOL', category: 'vtol', description: '四旋翼 + 推进电机的标准 VTOL。' },
  { id: 13200, name: '通用四旋翼尾座式 VTOL', category: 'vtol', description: '四电机尾座式 VTOL。' },
  { id: 14001, name: '通用倾转旋翼 VTOL', category: 'vtol', description: '倾转旋翼 VTOL。' },

  // Rover
  { id: 50000, name: '通用地面车辆', category: 'rover', description: '差速 / 阿克曼地面漫游车。' },
];
