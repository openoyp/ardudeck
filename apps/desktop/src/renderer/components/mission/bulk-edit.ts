import type { MissionItem } from '../../../shared/mission-types';
import { MAV_CMD, commandHasLocation } from '../../../shared/mission-types';

export interface BulkResult {
  items: MissionItem[];
  /** Waypoints actually modified (mobile reports this in its snackbar). */
  changed: number;
}

const renumber = (items: MissionItem[]): MissionItem[] =>
  items.map((it, i) => (it.seq === i ? it : { ...it, seq: i }));

/** Altitude frames are deliberately untouched (mobile's contract). */
export function bulkSetAltitude(
  items: MissionItem[],
  seqs: ReadonlySet<number>,
  altMeters: number,
): BulkResult {
  let changed = 0;
  const next = items.map((it) => {
    if (!seqs.has(it.seq)) return it;
    if (!commandHasLocation(it.command)) return it;
    if (it.altitude === altMeters) return it;
    changed++;
    return { ...it, altitude: altMeters };
  });
  return { items: changed > 0 ? next : items, changed };
}

/** speedMs <= 0 removes the selection's DO_CHANGE_SPEED items ("zero clears it"). */
export function bulkSetSpeed(
  items: MissionItem[],
  seqs: ReadonlySet<number>,
  speedMs: number,
): BulkResult {
  if (seqs.size === 0) return { items, changed: 0 };

  if (speedMs <= 0) {
    const removed = items.filter(
      (it) => seqs.has(it.seq) && it.command === MAV_CMD.DO_CHANGE_SPEED,
    ).length;
    if (removed === 0) return { items, changed: 0 };
    const next = renumber(
      items.filter((it) => !(seqs.has(it.seq) && it.command === MAV_CMD.DO_CHANGE_SPEED)),
    );
    return { items: next, changed: removed };
  }

  let changed = 0;
  let sawSpeedCmd = false;
  const next: MissionItem[] = [];
  let inserted = false;

  for (const it of items) {
    if (seqs.has(it.seq) && it.command === MAV_CMD.DO_CHANGE_SPEED) {
      sawSpeedCmd = true;
      if (it.param2 !== speedMs) {
        changed++;
        next.push({ ...it, param2: speedMs });
      } else {
        next.push(it);
      }
      continue;
    }
    if (!inserted && !sawSpeedCmd && seqs.has(it.seq)) {
      inserted = true;
      changed++;
      next.push({
        seq: 0, // renumbered below
        frame: it.frame,
        command: MAV_CMD.DO_CHANGE_SPEED,
        current: false,
        autocontinue: true,
        param1: 1, // ground speed
        param2: speedMs,
        param3: -1, // throttle unchanged
        param4: 0,
        latitude: 0,
        longitude: 0,
        altitude: 0,
        groupId: it.groupId,
      });
    }
    next.push(it);
  }

  if (changed === 0) return { items, changed: 0 };
  return { items: renumber(next), changed };
}

/** Do any of the selected seqs belong to a survey-generated group? */
export function selectionTouchesGroups(
  items: MissionItem[],
  seqs: ReadonlySet<number>,
  surveyGroupIds: ReadonlySet<string>,
): boolean {
  return items.some(
    (it) => seqs.has(it.seq) && it.groupId != null && surveyGroupIds.has(it.groupId),
  );
}
