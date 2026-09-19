/**
 * Quick Launch — a header menu that opens self-contained features in their own
 * OS window (rather than swapping the main view like the nav rail does). These
 * are surfaces you want alongside your workspace or on a second monitor.
 *
 * Area Editor keeps its existing dedicated opener; the other entries go through
 * the generic detached-window system (they are already registered there).
 */
import { useEffect, useRef, useState } from 'react';

interface LaunchItem {
  id: string;
  label: string;
  desc: string;
  iconColor: string;
  icon: React.ReactNode;
  badge?: string;
  launch: () => void;
}

const ITEMS: LaunchItem[] = [
  {
    id: 'area-editor',
    label: '区域编辑器',
    desc: '绘制任务区域:多区域、镂空、KML',
    iconColor: 'text-teal-400',
    badge: '新',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536M9 11l6.5-6.5a2 2 0 012.828 2.828L11.828 14H9v-3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17l4-4" />
      </svg>
    ),
    launch: () => { window.electronAPI?.openAreaEditor?.().catch(() => undefined); },
  },
  {
    id: 'sim-world',
    label: '3D 仿真世界',
    desc: '在持久化 3D 世界中飞行 SITL:障碍物、围栏、任务',
    iconColor: 'text-emerald-400',
    badge: '新',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
      </svg>
    ),
    launch: () => { window.electronAPI?.openDetachedWindow?.({ componentId: 'sim-world', title: '3D 仿真世界', initialBounds: { width: 1280, height: 800 } }); },
  },
  {
    id: 'inspector',
    label: 'MAVLink 检查器',
    desc: '查看实时消息与图表',
    iconColor: 'text-blue-400',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    launch: () => { window.electronAPI?.openDetachedWindow?.({ componentId: 'inspector', title: 'MAVLink 检查器', initialBounds: { width: 1200, height: 800 } }); },
  },
  {
    id: 'telemetry-dashboard',
    label: '遥测仪表盘',
    desc: '在独立窗口查看实时遥测',
    iconColor: 'text-purple-400',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    launch: () => { window.electronAPI?.openDetachedWindow?.({ componentId: 'telemetry-dashboard', title: '遥测仪表盘', initialBounds: { width: 1280, height: 800 } }); },
  },
];

export function QuickLaunchMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        data-tour="quick-launch"
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-lg bg-surface border border-subtle hover:border-teal-500/40 hover:bg-surface-raised transition-colors"
        title="快速启动:在独立窗口中打开工具"
      >
        <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h5a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
        <span className="text-sm font-medium text-content-secondary group-hover:text-content transition-colors">快速启动</span>
        <svg className={`w-3 h-3 text-content-tertiary transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-[60] w-72 bg-surface-solid border border-subtle rounded-lg shadow-xl py-1">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => { item.launch(); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-surface-raised transition-colors flex items-start gap-2.5"
            >
              <span className={`${item.iconColor} mt-0.5 shrink-0`}>{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-content">{item.label}</span>
                  {item.badge && (
                    <span className="px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-teal-300 bg-teal-500/15 border border-teal-500/30 rounded">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="block text-[10px] text-content-tertiary leading-snug">{item.desc}</span>
              </span>
              {/* opens-in-a-window affordance */}
              <svg className="w-3.5 h-3.5 text-content-tertiary mt-0.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
