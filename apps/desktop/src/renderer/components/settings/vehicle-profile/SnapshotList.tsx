import { useMemo, useState } from 'react';
import { Clock, X, RotateCcw, Trash2 } from 'lucide-react';
import type { VehicleProfile } from '../../../stores/settings-store.js';
import { useSettingsStore } from '../../../stores/settings-store.js';
import { listSnapshots, deleteSnapshot } from '../../../lib/vehicle-templates/snapshot.js';
import { useProfileUndo } from './use-profile-undo.js';

interface SnapshotListProps {
  profile: VehicleProfile;
}

export function SnapshotList({ profile }: SnapshotListProps) {
  const updateVehicle = useSettingsStore(s => s.updateVehicle);
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const restore = useProfileUndo(profile, updateVehicle);

  const snapshots = useMemo(() => listSnapshots(profile.id), [profile.id, refresh]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-content-secondary hover:text-content hover:bg-surface-overlay-subtle"
        title="查看应用历史 / 快照"
      >
        <Clock className="w-3 h-3" />
        {snapshots.length} 个快照
      </button>

      {open && (
        <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-[75] p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-surface-solid rounded-xl border border-subtle w-full max-w-2xl max-h-[75vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
              <div>
                <h3 className="text-sm font-semibold text-content">应用历史</h3>
                <p className="text-[11px] text-content-secondary mt-0.5">
                  每次应用此配置都会保存一个快照，方便你回滚。
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-surface-overlay-subtle text-content-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {snapshots.length === 0 ? (
                <div className="text-center py-12 text-content-secondary text-sm">
                  尚无快照。应用此配置即可创建一个。
                </div>
              ) : snapshots.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-subtle bg-surface-inset">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-content">
                      {s.reason}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium tracking-wide ${
                        s.target.isSitl
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {s.target.isSitl ? 'SITL' : 'FC'}
                      </span>
                    </div>
                    <div className="text-[10px] text-content-secondary mt-0.5">
                      {new Date(s.createdAt).toLocaleString()} · {Object.keys(s.applied).length} 个参数
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { restore(s.id); setOpen(false); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      <RotateCcw className="w-3 h-3" />
                      恢复
                    </button>
                    <button
                      onClick={() => { deleteSnapshot(profile.id, s.id); setRefresh(n => n + 1); }}
                      className="p-1 rounded text-content-secondary hover:text-red-300 hover:bg-red-500/10"
                      title="删除快照"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
