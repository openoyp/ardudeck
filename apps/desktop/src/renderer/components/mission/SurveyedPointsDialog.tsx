/**
 * Paste-in dialog for surveyed RTK points: a surveyor walks the site with an
 * RTK pole and hands over a coordinate list; this turns it into map markers
 * or a connected polygon guide (which can then seed a survey / mission plan).
 * Parsing is live so mistakes are visible before anything lands on the map.
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, X, Check } from 'lucide-react';
import { parseSurveyedPoints } from './rtk-points';
import { useGuideStore } from '../../stores/guide-store';

const PLACEHOLDER = `每行一个点 - 标签可选,支持十进制逗号:

53.397635, 8.136100
P2; 53,397841; 8,136433
corner_ne  53.398012  8.137020`;

export function SurveyedPointsDialog({
  onClose,
  showToast,
}: {
  onClose: () => void;
  showToast?: (msg: string, kind: 'success' | 'error') => void;
}): JSX.Element {
  const addSurveyedPoints = useGuideStore((s) => s.addSurveyedPoints);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [connect, setConnect] = useState(false);

  const parsed = useMemo(() => parseSurveyedPoints(text), [text]);

  const add = () => {
    const res = addSurveyedPoints(parsed.points, { connect, name });
    if (!res.ok) {
      showToast?.(res.error ?? '无法添加点', 'error');
      return;
    }
    showToast?.(
      connect
        ? `已从 ${parsed.points.length} 个测量点生成多边形`
        : `已添加 ${parsed.points.length} 个测量点`,
      'success',
    );
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[min(92vw,560px)] flex flex-col rounded-2xl border border-default bg-surface-solid shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-content">测量点</h3>
            <p className="text-[11px] text-content-tertiary">
              粘贴 RTK 测量数据 - 每行一个点,纬度在前。
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
            data-tip="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            autoFocus
            spellCheck={false}
            rows={9}
            className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-xs font-mono text-content leading-relaxed resize-y focus:outline-none focus:border-teal-500 placeholder:text-content-tertiary/60"
          />

          <div className="flex items-center justify-between text-[11px]">
            <span className={parsed.points.length > 0 ? 'text-teal-400 font-medium' : 'text-content-tertiary'}>
              已识别 {parsed.points.length} 个点
            </span>
            {parsed.skipped.length > 0 && (
              <span className="text-amber-500" data-tip="有内容但未生成坐标的行(表头、备注、格式错误的行)">
                {parsed.skipped.length} 行被跳过
                {parsed.skipped.length <= 6 ? `: ${parsed.skipped.join(', ')}` : ''}
              </span>
            )}
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名称(可选,如:北侧田地边界)"
            className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-xs text-content focus:outline-none focus:border-teal-500"
          />

          <div className="flex gap-2">
            <button
              onClick={() => setConnect(false)}
              className={`flex-1 px-3 py-2 rounded-lg border text-xs transition-colors ${
                !connect
                  ? 'border-teal-500/60 bg-teal-500/10 text-teal-400 font-medium'
                  : 'border-subtle bg-surface text-content-secondary hover:text-content'
              }`}
            >
              标记
              <span className="block text-[10px] opacity-70 font-normal">地图上的编号图钉</span>
            </button>
            <button
              onClick={() => setConnect(true)}
              className={`flex-1 px-3 py-2 rounded-lg border text-xs transition-colors ${
                connect
                  ? 'border-teal-500/60 bg-teal-500/10 text-teal-400 font-medium'
                  : 'border-subtle bg-surface text-content-secondary hover:text-content'
              }`}
            >
              连接多边形
              <span className="block text-[10px] opacity-70 font-normal">按测量顺序连接的轮廓,可据此规划勘测</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
          >
            取消
          </button>
          <button
            onClick={add}
            disabled={parsed.points.length === 0 || (connect && parsed.points.length < 3)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            {connect ? '添加多边形' : '添加标记'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
