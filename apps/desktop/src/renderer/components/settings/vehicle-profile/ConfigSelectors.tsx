import type { VehicleProfile, WingShape, VtolStyle, MotorArrangement } from '../../../stores/settings-store.js';

interface ConfigSelectorsProps {
  vehicle: VehicleProfile;
  onUpdate: (updates: Partial<VehicleProfile>) => void;
}

const WING_SHAPES: Array<{ value: WingShape; label: string; hint: string }> = [
  { value: 'standard',     label: '常规布局',      hint: '传统机身，升降舵/方向舵/副翼独立' },
  { value: 'delta',        label: '三角翼',         hint: '三角形机翼，升降副翼兼顾俯仰与横滚' },
  { value: 'flying-wing',  label: '飞翼',   hint: '无尾翼，仅机翼：用升降副翼控制' },
  { value: 'v-tail',       label: 'V 尾',        hint: '两个翼面混合控制俯仰与偏航' },
  { value: 'biplane',      label: '双翼机',       hint: '上下双层机翼：少见、复古' },
  { value: 'inverted-v',   label: '倒 V 尾',    hint: '倒 V 形尾翼' },
];

const VTOL_STYLES: Array<{ value: VtolStyle; label: string; hint: string }> = [
  { value: 'quadplane',   label: '四旋翼复合翼',    hint: '固定翼 + 独立垂直升力电机' },
  { value: 'tailsitter',  label: '尾座式',   hint: '以尾着地，倾转进入前飞' },
  { value: 'tiltrotor',   label: '倾转旋翼',    hint: '电机从垂直倾转到水平' },
  { value: 'tiltwing',    label: '倾转机翼',     hint: '整个机翼随电机一起倾转' },
];

const MOTOR_ARRANGEMENTS: Array<{ value: MotorArrangement; label: string; hint: string }> = [
  { value: 'quad-x',       label: '四轴 X',       hint: '4 个电机呈 X 形布局' },
  { value: 'quad-plus',    label: '四轴 +',       hint: '4 个电机呈 + 形布局' },
  { value: 'quad-h',       label: '四轴 H',       hint: '4 个电机呈 H 形布局' },
  { value: 'hex-x',        label: '六轴 X',        hint: '6 个电机呈 X 形布局' },
  { value: 'hex-plus',     label: '六轴 +',       hint: '6 个电机呈 + 形布局' },
  { value: 'octo-x',       label: '八轴 X',       hint: '8 个电机呈 X 形布局' },
  { value: 'octo-plus',    label: '八轴 +',      hint: '8 个电机呈 + 形布局' },
  { value: 'y6',           label: 'Y6',           hint: '3 个机臂，每臂 2 个同轴电机' },
  { value: 'tri',          label: '三旋翼',    hint: '3 个电机 + 偏航舵机' },
  { value: 'coaxial',      label: '同轴 X8',   hint: '4 组上下叠置的同轴电机' },
  { value: 'inline-2',     label: '双电机并排',     hint: '2 个电机并排布置' },
  { value: 'twin-tractor', label: '双拉力桨', hint: '2 个电机在机翼前缘拉动' },
  { value: 'twin-pusher',  label: '双推力桨',  hint: '2 个电机在机翼后缘推动' },
];

/**
 * The three orthogonal configuration selectors + live param-hint row.
 * Only renders what's relevant for the vehicle type.
 */
export function ConfigSelectors({ vehicle, onUpdate }: ConfigSelectorsProps) {
  const showWing = vehicle.type === 'plane' || vehicle.type === 'vtol';
  const showVtol = vehicle.type === 'vtol';
  const showMotor = vehicle.type === 'copter' || vehicle.type === 'vtol';

  if (!showWing && !showVtol && !showMotor) return null;

  return (
    <div className="grid grid-cols-2 gap-4">
      {showWing && (
        <Selector
          label="机翼构型"
          value={vehicle.wingShape}
          options={WING_SHAPES}
          onChange={v => onUpdate({ wingShape: v as WingShape })}
        />
      )}
      {showVtol && (
        <Selector
          label="VTOL 形式"
          value={vehicle.vtolStyle}
          options={VTOL_STYLES}
          onChange={v => onUpdate({ vtolStyle: v as VtolStyle })}
        />
      )}
      {showMotor && (
        <Selector
          label="电机布局"
          value={vehicle.motorArrangement}
          options={MOTOR_ARRANGEMENTS}
          onChange={v => onUpdate({ motorArrangement: v as MotorArrangement })}
        />
      )}
    </div>
  );
}

interface SelectorProps<T extends string> {
  label: string;
  value: T | undefined;
  options: Array<{ value: T; label: string; hint: string }>;
  onChange: (value: T) => void;
}

function Selector<T extends string>({ label, value, options, onChange }: SelectorProps<T>) {
  const current = options.find(o => o.value === value);
  return (
    <div>
      <label className="block text-sm font-medium text-content mb-1.5">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value as T)}
        className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-content focus:outline-none focus:border-blue-500"
      >
        <option value="">— 请选择 —</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {current && (
        <div className="text-[10px] text-content-secondary mt-1">{current.hint}</div>
      )}
    </div>
  );
}

