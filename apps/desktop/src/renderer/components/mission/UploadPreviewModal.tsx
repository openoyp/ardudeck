/**
 * Upload Preview Modal
 *
 * Pre-upload summary of what will be sent to the vehicle: included groups,
 * excluded groups, total WP count, distance, ETA, WP ceiling check,
 * DO_JUMP cross-group target validation. User confirms or cancels before
 * the flattened list goes to the FC.
 *
 * Spec: docs/superpowers/specs/2026-05-28-mission-groups-design.md
 */
import { useMemo } from 'react';
import { useMissionStore } from '../../stores/mission-store';
import { useSettingsStore } from '../../stores/settings-store';
import { formatDistanceFromMeters } from '../../../shared/user-units.js';
import {
  calculateMissionDistance,
  estimateMissionTime,
  MAV_CMD,
} from '../../../shared/mission-types';
import type { MissionItem } from '../../../shared/mission-types';

// ArduPilot's default mission item ceiling. The actual value is set by the
// vehicle's storage config; treat as a soft warning, not a hard cap, until
// PR 6 / PR 10 reads the live param. 724 is the conservative default.
const DEFAULT_AP_MISSION_CEILING = 724;

interface UploadPreviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function UploadPreviewModal({ open, onClose, onConfirm }: UploadPreviewModalProps) {
  const groups = useMissionStore((s) => s.groups);
  const missionItems = useMissionStore((s) => s.missionItems);
  const getUploadItems = useMissionStore((s) => s.getUploadItems);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);

  const summary = useMemo(() => {
    const uploadItems = getUploadItems();
    const distance = calculateMissionDistance(uploadItems);
    const eta = estimateMissionTime(distance);
    // The toolbar upload is only reachable with at most one group, so every
    // group present is uploaded — there is no "excluded" set anymore.
    const includedGroups = [...groups].sort((a, b) => a.order - b.order);

    // DO_JUMP validation: flag jumps whose target WP no longer exists.
    const jumpIssues: Array<{ jumpSeq: number; targetSeq: number }> = [];
    for (const it of uploadItems) {
      if (it.command !== MAV_CMD.DO_JUMP) continue;
      const targetSeq = Math.round(it.param1);
      const target = missionItems.find((m) => m.seq === targetSeq);
      if (!target) {
        jumpIssues.push({ jumpSeq: it.seq, targetSeq });
      }
    }

    return {
      uploadItems,
      distance,
      eta,
      includedGroups,
      jumpIssues,
      overCeiling: uploadItems.length > DEFAULT_AP_MISSION_CEILING,
    };
  }, [groups, missionItems, getUploadItems]);

  if (!open) return null;

  const wpCount = summary.uploadItems.length;
  const distanceLabel = formatDistanceFromMeters(summary.distance, distanceUnit);
  const etaMin = (summary.eta / 60).toFixed(1);
  const blocked = summary.jumpIssues.length > 0 || summary.overCeiling;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-surface-solid rounded-xl border border-subtle w-full max-w-lg mx-4 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-subtle">
          <h2 className="text-lg font-semibold text-content">上传到无人机</h2>
          <p className="text-xs text-content-secondary mt-1">
            这将替换无人机上的现有任务。
          </p>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Top-line summary */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="航点" value={String(wpCount)} />
            <Stat label="距离" value={distanceLabel} />
            <Stat label="预计时间(按计划速度)" value={`${etaMin} 分钟`} />
          </div>

          {/* WP ceiling warning */}
          {summary.overCeiling && (
            <Warning>
              {wpCount} 个航点超过 ArduPilot 典型上限{' '}
              {DEFAULT_AP_MISSION_CEILING}。请取消选择某个分组或分割任务。
            </Warning>
          )}

          {/* DO_JUMP target issues */}
          {summary.jumpIssues.length > 0 && (
            <Warning>
              {summary.jumpIssues.length}{' '}
              个 DO_JUMP 跳转的目标航点已不存在:
              <ul className="list-disc list-inside mt-1 text-[11px] text-red-300">
                {summary.jumpIssues.slice(0, 4).map((j, i) => (
                  <li key={i}>
                    第 {j.jumpSeq + 1} 个航点跳转到第 {j.targetSeq + 1} 个航点(已缺失)
                  </li>
                ))}
                {summary.jumpIssues.length > 4 && (
                  <li>...还有 {summary.jumpIssues.length - 4} 个</li>
                )}
              </ul>
            </Warning>
          )}

          {/* Included groups */}
          {summary.includedGroups.length > 0 && (
            <Section title="已包含">
              {summary.includedGroups.map((g) => {
                const count = missionItems.filter((it) => it.groupId === g.id).length;
                return (
                  <GroupRow key={g.id} color={g.color} name={g.name} kind={g.kind} count={count} />
                );
              })}
            </Section>
          )}

          {/* No groups but items exist (legacy, pre-migration) */}
          {groups.length === 0 && missionItems.length > 0 && (
            <p className="text-xs text-content-secondary italic">
              任务没有分组;全部 {missionItems.length} 个航点将被上传。
            </p>
          )}
        </div>

        <div className="px-6 py-3 border-t border-subtle flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-content-secondary hover:text-content rounded transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={blocked || wpCount === 0}
            className={`px-4 py-1.5 text-sm rounded transition-colors font-medium ${
              blocked || wpCount === 0
                ? 'bg-surface-input text-content-tertiary cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-400'
            }`}
            title={
              wpCount === 0
                ? '未选择航点'
                : blocked
                ? '请先解决上方警告再上传'
                : '上传到无人机'
            }
          >
            上传 {wpCount} 个航点
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface p-3 rounded-lg border border-subtle">
      <div className="text-[10px] text-content-secondary uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold text-content mt-0.5">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-content-secondary uppercase tracking-wide mb-1.5">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function GroupRow({
  color,
  name,
  kind,
  count,
  dimmed,
}: {
  color: string;
  name: string;
  kind: string;
  count: number;
  dimmed?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 text-xs ${dimmed ? 'opacity-60' : ''}`}>
      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
      <span className="font-medium text-content truncate">{name}</span>
      <span className="text-[10px] uppercase text-content-tertiary">{kind}</span>
      <span className="ml-auto text-content-secondary">
        {count} 个航点
      </span>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
      {children}
    </div>
  );
}

// Unused export prevented when this module is tree-shaken in tests.
export type { MissionItem };
