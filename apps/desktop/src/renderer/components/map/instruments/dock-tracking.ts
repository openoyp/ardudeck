/** Shared drag-to-dock tracking: snap preview state, DOM measurement of dock
 * candidates, and the commit logic, used by both standalone instrument drags
 * (InstrumentsLayer) and whole-group drags (DockedGroup). */
import { create } from 'zustand';
import { useMapInstrumentsStore } from '../../../stores/map-instruments-store';
import { MAP_INSTRUMENTS, isRoundInMode } from './registry';
import { GROUP_KEY_PREFIX, groupOf, isCluster, CLUSTER_ANCHOR } from './dock-groups';
import {
  findDockCandidate,
  orientationFor,
  draggedGoesFirst,
  groupOrigin,
  memberInsertionIndex,
  snapToBallEdge,
  type DockCandidate,
  type DockRect,
  type DockSide,
} from './dock-snap';

// Snap affordance while a dragged instrument is near a dock target.
export const useDockPreviewStore = create<{
  preview: { rect: DockRect; side: DockSide; cluster: boolean } | null;
  setPreview: (p: { rect: DockRect; side: DockSide; cluster: boolean } | null) => void;
}>((set) => ({ preview: null, setPreview: (preview) => set({ preview }) }));

export interface MeasuredCandidate {
  candidate: DockCandidate;
  targetRect: DockRect;
  selfRect: DockRect;
}

export function measureDockCandidate(selfEl: HTMLElement, selfId: string): MeasuredCandidate | null {
  const container = selfEl.offsetParent as HTMLElement | null;
  if (!container) return null;
  const c = container.getBoundingClientRect();
  const rel = (el: Element): DockRect => {
    const r = el.getBoundingClientRect();
    return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
  };
  // The attitude ball never joins a boxed card: near the ball (or dragging
  // the ball near others) everything snaps by cluster proximity instead.
  const draggingBall = selfId === CLUSTER_ANCHOR;
  const groups = useMapInstrumentsStore.getState().groups;
  const targets: Array<{ key: string; rect: DockRect; cluster?: boolean; proximity?: boolean }> = [];
  for (const el of container.querySelectorAll<HTMLElement>('[data-instrument-id]')) {
    const id = el.dataset.instrumentId!;
    if (id !== selfId) targets.push({ key: id, rect: rel(el), cluster: draggingBall || id === CLUSTER_ANCHOR });
  }
  for (const el of container.querySelectorAll<HTMLElement>('[data-dock-group-id]')) {
    const gid = el.dataset.dockGroupId!;
    const g = groups[gid];
    if (!g) continue;
    // The dragged ball joins CARD groups as a member (contoured chrome); it
    // never targets a cluster (it IS every cluster's anchor). Overlap counts
    // as an approach: a 140px ball gets dropped ONTO a card, not edge-kissed.
    if (draggingBall && isCluster(g)) continue;
    targets.push({ key: GROUP_KEY_PREFIX + gid, rect: rel(el), cluster: !draggingBall && isCluster(g), proximity: draggingBall });
  }
  const selfRect = rel(selfEl);
  const candidate = findDockCandidate(selfRect, targets);
  if (!candidate) return null;
  const targetRect = targets.find((t) => t.key === candidate.targetKey)!.rect;
  return { candidate, targetRect, selfRect };
}

function instrumentIsRound(id: string): boolean {
  const def = MAP_INSTRUMENTS.find((d) => d.id === id);
  if (!def) return false;
  return isRoundInMode(def, useMapInstrumentsStore.getState().displayMode[id] ?? 'analog');
}

export function commitDock(selfId: string, m: MeasuredCandidate, dropPoint: { x: number; y: number }, container: HTMLElement): void {
  const store = useMapInstrumentsStore.getState();
  const key = m.candidate.targetKey;
  if (key.startsWith(GROUP_KEY_PREFIX)) {
    const gid = key.slice(GROUP_KEY_PREFIX.length);
    const g = store.groups[gid];
    if (!g) return;
    if (m.candidate.cluster) {
      const ballEl = container.querySelector<HTMLElement>(`[data-dock-group-id="${gid}"] [data-dock-member="${CLUSTER_ANCHOR}"]`);
      if (!ballEl) return;
      const c = container.getBoundingClientRect();
      const b = ballEl.getBoundingClientRect();
      const ball: DockRect = { x: b.left - c.left, y: b.top - c.top, w: b.width, h: b.height };
      const snapped = snapToBallEdge(ball, m.selfRect, instrumentIsRound(selfId));
      store.dockAddCluster(
        gid,
        selfId,
        { x: snapped.x - ball.x, y: snapped.y - ball.y },
        { x: Math.min(m.targetRect.x, snapped.x), y: Math.min(m.targetRect.y, snapped.y) },
      );
    } else {
      store.dockAdd(gid, selfId, memberInsertionIndex(m.targetRect, g.orientation, g.members.length, dropPoint));
    }
    return;
  }
  if (groupOf(store.groups, key)) return;
  if (m.candidate.cluster) {
    // One of the two is the ball; the offset is always relative to it.
    const ball = selfId === CLUSTER_ANCHOR ? m.selfRect : m.targetRect;
    const other = selfId === CLUSTER_ANCHOR ? m.targetRect : m.selfRect;
    const otherId = selfId === CLUSTER_ANCHOR ? key : selfId;
    const snapped = snapToBallEdge(ball, other, instrumentIsRound(otherId));
    store.dockCreateCluster(
      otherId,
      { x: snapped.x - ball.x, y: snapped.y - ball.y },
      { x: Math.min(ball.x, snapped.x), y: Math.min(ball.y, snapped.y) },
    );
    return;
  }
  store.dockCreate(
    key,
    selfId,
    orientationFor(m.candidate.side),
    draggedGoesFirst(m.candidate.side),
    groupOrigin(m.targetRect, m.selfRect, m.candidate.side),
  );
}


/** Dock targets for a dragged CARD GROUP: standalone instruments (except the
 * ball) and other card groups. Clusters never merge. */
export function measureGroupDockCandidate(selfEl: HTMLElement, selfGid: string): MeasuredCandidate | null {
  const container = selfEl.offsetParent as HTMLElement | null;
  if (!container) return null;
  const c = container.getBoundingClientRect();
  const rel = (el: Element): DockRect => {
    const r = el.getBoundingClientRect();
    return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
  };
  const groups = useMapInstrumentsStore.getState().groups;
  const targets: Array<{ key: string; rect: DockRect }> = [];
  for (const el of container.querySelectorAll<HTMLElement>('[data-instrument-id]')) {
    const id = el.dataset.instrumentId!;
    if (id !== CLUSTER_ANCHOR) targets.push({ key: id, rect: rel(el) });
  }
  for (const el of container.querySelectorAll<HTMLElement>('[data-dock-group-id]')) {
    const gid = el.dataset.dockGroupId!;
    if (gid === selfGid) continue;
    const g = groups[gid];
    if (!g || isCluster(g)) continue;
    targets.push({ key: GROUP_KEY_PREFIX + gid, rect: rel(el) });
  }
  const selfRect = rel(selfEl);
  const candidate = findDockCandidate(selfRect, targets);
  if (!candidate) return null;
  const targetRect = targets.find((t) => t.key === candidate.targetKey)!.rect;
  return { candidate, targetRect, selfRect };
}

export function commitGroupDock(selfGid: string, m: MeasuredCandidate): void {
  const store = useMapInstrumentsStore.getState();
  const key = m.candidate.targetKey;
  const atStart = draggedGoesFirst(m.candidate.side);
  if (key.startsWith(GROUP_KEY_PREFIX)) {
    store.dockMergeGroups(key.slice(GROUP_KEY_PREFIX.length), selfGid, atStart);
    return;
  }
  const g = store.groups[selfGid];
  if (!g || groupOf(store.groups, key)) return;
  // The dragged group absorbs the standalone target at the near end and
  // re-anchors so the target stays where it was.
  store.dockAdd(selfGid, key, atStart ? g.members.length : 0, groupOrigin(m.targetRect, m.selfRect, m.candidate.side));
}
