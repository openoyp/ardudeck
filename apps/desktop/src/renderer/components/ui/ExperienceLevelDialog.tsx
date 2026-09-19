import { BookOpen, Zap } from 'lucide-react';
import type { ExperienceLevel } from '../../stores/settings-store';

interface ExperienceLevelDialogProps {
  onSelect: (level: ExperienceLevel) => void;
}

export function ExperienceLevelDialog({ onSelect }: ExperienceLevelDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface-solid rounded-2xl border border-subtle w-full max-w-lg mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-2 text-center">
          <h2 className="text-lg font-semibold text-content">欢迎使用 ArduDeck</h2>
          <p className="text-sm text-content-secondary mt-1">
            选择你的经验等级,以定制界面
          </p>
        </div>

        {/* Cards */}
        <div className="p-6 grid grid-cols-2 gap-4">
          {/* Beginner */}
          <button
            onClick={() => onSelect('beginner')}
            className="group text-left p-5 rounded-xl border border-subtle bg-surface hover:border-blue-500/50 hover:bg-blue-500/5 transition-all duration-200 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
              <BookOpen className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-sm font-semibold text-content mb-1">新手</div>
            <p className="text-xs text-content-secondary leading-relaxed">
              在界面各处显示提示、说明和指南,帮助你学习。
            </p>
          </button>

          {/* Advanced */}
          <button
            onClick={() => onSelect('advanced')}
            className="group text-left p-5 rounded-xl border border-subtle bg-surface hover:border-purple-500/50 hover:bg-purple-500/5 transition-all duration-200 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-sm font-semibold text-content mb-1">高级</div>
            <p className="text-xs text-content-secondary leading-relaxed">
              界面简洁,不显示教学卡片和内联提示。
            </p>
          </button>
        </div>

        {/* Footer hint */}
        <div className="px-6 pb-5 text-center">
          <p className="text-[11px] text-content-tertiary">
            你可以随时在设置中更改
          </p>
        </div>
      </div>
    </div>
  );
}
