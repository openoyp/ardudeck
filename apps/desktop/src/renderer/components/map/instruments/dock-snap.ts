/** DOM-free snap geometry for instrument docking; the layer measures rects. */

export interface DockRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which edge of the TARGET the dragged instrument would attach to. */
export type DockSide = 'left' | 'right' | 'top' | 'bottom';

export type DockOrientation = 'row' | 'col';

export interface DockCandidate {
  /** Instrument id or group id of the target. */
  targetKey: string;
  side: DockSide;
  /** Edge-to-edge distance; smaller wins across targets. */
  gap: number;
  /** Free-form constellation around the attitude ball, not a boxed card. */
  cluster?: boolean;
}

export const DOCK_SNAP_PX = 14;

/** Released this far outside the group bounds, a dragged member undocks. */
export const UNDOCK_PX = 24;

// Lateral overlap required (fraction of the smaller extent) or diagonals dock.
const LATERAL_OVERLAP_MIN = 0.35;

// Max px the dragged rect may overshoot ONTO the target and still read as an
// edge approach; deeper overlap means it is over the target, not beside it.
const OVERSHOOT_PX = 10;

function lateralOverlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

export function candidateFor(
  dragged: DockRect,
  target: DockRect,
  targetKey: string,
  threshold = DOCK_SNAP_PX,
): DockCandidate | null {
  const xOverlap = lateralOverlap(dragged.x, dragged.x + dragged.w, target.x, target.x + target.w);
  const yOverlap = lateralOverlap(dragged.y, dragged.y + dragged.h, target.y, target.y + target.h);
  const xNeeded = Math.min(dragged.w, target.w) * LATERAL_OVERLAP_MIN;
  const yNeeded = Math.min(dragged.h, target.h) * LATERAL_OVERLAP_MIN;

  let best: DockCandidate | null = null;
  const consider = (side: DockSide, gap: number, overlapOk: boolean) => {
    if (!overlapOk || gap > threshold || gap < -OVERSHOOT_PX) return;
    // Overshoot clamps to 0 so it never beats a cleaner approach.
    const g = Math.max(0, gap);
    if (!best || g < best.gap) best = { targetKey, side, gap: g };
  };

  consider('left', target.x - (dragged.x + dragged.w), yOverlap >= yNeeded);
  consider('right', dragged.x - (target.x + target.w), yOverlap >= yNeeded);
  consider('top', target.y - (dragged.y + dragged.h), xOverlap >= xNeeded);
  consider('bottom', dragged.y - (target.y + target.h), xOverlap >= xNeeded);
  return best;
}

/** Cluster targets snap on plain proximity, overlap included; a member sits
 * wherever it is dropped, so there is no side geometry to respect. */
export function clusterCandidate(
  dragged: DockRect,
  target: DockRect,
  targetKey: string,
  threshold = DOCK_SNAP_PX,
): DockCandidate | null {
  const dx = Math.max(target.x - (dragged.x + dragged.w), dragged.x - (target.x + target.w), 0);
  const dy = Math.max(target.y - (dragged.y + dragged.h), dragged.y - (target.y + target.h), 0);
  const gap = Math.hypot(dx, dy);
  if (gap > threshold) return null;
  return { targetKey, side: 'right', gap, cluster: true };
}

export function findDockCandidate(
  dragged: DockRect,
  targets: Array<{ key: string; rect: DockRect; cluster?: boolean }>,
  threshold = DOCK_SNAP_PX,
): DockCandidate | null {
  let best: DockCandidate | null = null;
  for (const t of targets) {
    const c = t.cluster
      ? clusterCandidate(dragged, t.rect, t.key, threshold)
      : candidateFor(dragged, t.rect, t.key, threshold);
    if (c && (!best || c.gap < best.gap)) best = c;
  }
  return best;
}

export function orientationFor(side: DockSide): DockOrientation {
  return side === 'left' || side === 'right' ? 'row' : 'col';
}

export function draggedGoesFirst(side: DockSide): boolean {
  return side === 'left' || side === 'top';
}

/** Group top-left placed so the TARGET member stays where it is. */
export function groupOrigin(target: DockRect, dragged: DockRect, side: DockSide): { x: number; y: number } {
  switch (side) {
    case 'left':
      return { x: target.x - dragged.w, y: target.y };
    case 'top':
      return { x: target.x, y: target.y - dragged.h };
    default:
      return { x: target.x, y: target.y };
  }
}

/** Insertion index in an existing group from the drop point's axis fraction. */
export function memberInsertionIndex(
  group: DockRect,
  orientation: DockOrientation,
  memberCount: number,
  point: { x: number; y: number },
): number {
  const frac = orientation === 'row'
    ? (point.x - group.x) / Math.max(1, group.w)
    : (point.y - group.y) / Math.max(1, group.h);
  const idx = Math.round(frac * memberCount);
  return Math.max(0, Math.min(memberCount, idx));
}

/** The ball's visible disc (its backdrop circle) reaches this far beyond its
 * layout box; satellites snap tangent to the visible edge, not the box. */
export const BALL_EDGE_GAP = 4;

/**
 * Magnet a cluster satellite flush against the attitude ball: it lands on the
 * ray from the ball's center through where it was dropped, touching the
 * ball's circle exactly. Round satellites solve circle-to-circle; boxes
 * binary-search the tangent distance along the ray.
 */
export function snapToBallEdge(ball: DockRect, sat: DockRect, satRound: boolean, margin = BALL_EDGE_GAP): { x: number; y: number } {
  const bc = { x: ball.x + ball.w / 2, y: ball.y + ball.h / 2 };
  const r = Math.min(ball.w, ball.h) / 2 + margin;
  const sc = { x: sat.x + sat.w / 2, y: sat.y + sat.h / 2 };
  let dx = sc.x - bc.x;
  let dy = sc.y - bc.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }

  if (satRound) {
    const d = r + Math.min(sat.w, sat.h) / 2;
    return { x: bc.x + dx * d - sat.w / 2, y: bc.y + dy * d - sat.h / 2 };
  }

  const overlapsBall = (t: number): boolean => {
    const rx = bc.x + dx * t - sat.w / 2;
    const ry = bc.y + dy * t - sat.h / 2;
    const nx = Math.max(rx, Math.min(bc.x, rx + sat.w));
    const ny = Math.max(ry, Math.min(bc.y, ry + sat.h));
    return Math.hypot(nx - bc.x, ny - bc.y) < r;
  };
  let lo = 0;
  let hi = r + Math.hypot(sat.w, sat.h);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (overlapsBall(mid)) lo = mid;
    else hi = mid;
  }
  return { x: bc.x + dx * hi - sat.w / 2, y: bc.y + dy * hi - sat.h / 2 };
}

export function isOutsideUndockZone(group: DockRect, point: { x: number; y: number }, margin = UNDOCK_PX): boolean {
  return (
    point.x < group.x - margin ||
    point.x > group.x + group.w + margin ||
    point.y < group.y - margin ||
    point.y > group.y + group.h + margin
  );
}
