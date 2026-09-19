export type NonDefaultColorKey =
  | 'orange'
  | 'cyan'
  | 'amber'
  | 'violet'
  | 'pink'
  | 'red'
  | 'green'
  | 'blue';

export interface NonDefaultColor {
  key: NonDefaultColorKey;
  label: string;
  /** Tailwind class for the colored value text (light + dark variants tuned for contrast). */
  textClass: string;
  /** Solid swatch background, used in the picker chips and the toolbar swatch dot. */
  swatchClass: string;
}

export const NON_DEFAULT_COLORS: readonly NonDefaultColor[] = [
  { key: 'orange', label: '橙色 (QGC)', textClass: 'text-orange-600 dark:text-orange-400', swatchClass: 'bg-orange-500' },
  { key: 'cyan',   label: '青色 (AMC)', textClass: 'text-cyan-700 dark:text-cyan-300',     swatchClass: 'bg-cyan-500'   },
  { key: 'amber',  label: '琥珀色',     textClass: 'text-amber-600 dark:text-amber-400',   swatchClass: 'bg-amber-500'  },
  { key: 'violet', label: '紫罗兰色',   textClass: 'text-violet-700 dark:text-violet-300', swatchClass: 'bg-violet-500' },
  { key: 'pink',   label: '粉色',       textClass: 'text-pink-600 dark:text-pink-400',     swatchClass: 'bg-pink-500'   },
  { key: 'red',    label: '红色',       textClass: 'text-red-600 dark:text-red-400',       swatchClass: 'bg-red-500'    },
  { key: 'green',  label: '绿色',       textClass: 'text-green-600 dark:text-green-400',   swatchClass: 'bg-green-500'  },
  { key: 'blue',   label: '蓝色',       textClass: 'text-blue-600 dark:text-blue-400',     swatchClass: 'bg-blue-500'   },
] as const;

export const DEFAULT_NON_DEFAULT_COLOR: NonDefaultColorKey = 'orange';

export function getNonDefaultColor(key: NonDefaultColorKey | undefined): NonDefaultColor {
  return NON_DEFAULT_COLORS.find(c => c.key === key) ?? NON_DEFAULT_COLORS[0]!;
}
