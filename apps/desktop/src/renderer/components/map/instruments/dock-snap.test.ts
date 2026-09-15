import { describe, it, expect } from 'vitest';
import {
  candidateFor,
  clusterCandidate,
  findDockCandidate,
  orientationFor,
  draggedGoesFirst,
  groupOrigin,
  memberInsertionIndex,
  snapToBallEdge,
  isOutsideUndockZone,
  DOCK_SNAP_PX,
  type DockRect,
} from './dock-snap';

const T: DockRect = { x: 200, y: 200, w: 100, h: 60 };

describe('candidateFor', () => {
  it('snaps a right-edge approach to the target left side', () => {
    const dragged: DockRect = { x: 92, y: 205, w: 100, h: 60 };
    const c = candidateFor(dragged, T, 't');
    expect(c).toEqual({ targetKey: 't', side: 'left', gap: 8 });
  });

  it('snaps to the right side', () => {
    const dragged: DockRect = { x: 306, y: 210, w: 100, h: 60 };
    expect(candidateFor(dragged, T, 't')?.side).toBe('right');
  });

  it('snaps above and below', () => {
    expect(candidateFor({ x: 210, y: 130, w: 100, h: 60 }, T, 't')?.side).toBe('top');
    expect(candidateFor({ x: 210, y: 266, w: 100, h: 60 }, T, 't')?.side).toBe('bottom');
  });

  it('does not snap beyond the threshold', () => {
    const dragged: DockRect = { x: 200 - 100 - DOCK_SNAP_PX - 1, y: 200, w: 100, h: 60 };
    expect(candidateFor(dragged, T, 't')).toBeNull();
  });

  it('requires lateral overlap (diagonal near-miss stays free)', () => {
    const dragged: DockRect = { x: 95, y: 250, w: 100, h: 60 };
    expect(candidateFor(dragged, T, 't')).toBeNull();
  });

  it('clamps a slight overshoot to gap 0', () => {
    const dragged: DockRect = { x: 106, y: 205, w: 100, h: 60 };
    const c = candidateFor(dragged, T, 't');
    expect(c?.side).toBe('left');
    expect(c?.gap).toBe(0);
  });
});

describe('findDockCandidate', () => {
  it('picks the nearest of several targets', () => {
    const dragged: DockRect = { x: 92, y: 205, w: 100, h: 60 };
    const far: DockRect = { x: 196, y: 100, w: 100, h: 60 };
    const c = findDockCandidate(dragged, [
      { key: 'far', rect: far },
      { key: 'near', rect: T },
    ]);
    expect(c?.targetKey).toBe('near');
  });

  it('returns null with no targets in range', () => {
    expect(findDockCandidate({ x: 0, y: 0, w: 50, h: 50 }, [{ key: 't', rect: T }])).toBeNull();
  });
});

describe('orientation and ordering', () => {
  it('side approaches form rows, vertical approaches form columns', () => {
    expect(orientationFor('left')).toBe('row');
    expect(orientationFor('right')).toBe('row');
    expect(orientationFor('top')).toBe('col');
    expect(orientationFor('bottom')).toBe('col');
  });

  it('left/top approaches put the dragged member first', () => {
    expect(draggedGoesFirst('left')).toBe(true);
    expect(draggedGoesFirst('top')).toBe(true);
    expect(draggedGoesFirst('right')).toBe(false);
    expect(draggedGoesFirst('bottom')).toBe(false);
  });
});

describe('groupOrigin', () => {
  const dragged: DockRect = { x: 0, y: 0, w: 80, h: 40 };
  it('keeps the target in place', () => {
    expect(groupOrigin(T, dragged, 'right')).toEqual({ x: 200, y: 200 });
    expect(groupOrigin(T, dragged, 'bottom')).toEqual({ x: 200, y: 200 });
    expect(groupOrigin(T, dragged, 'left')).toEqual({ x: 120, y: 200 });
    expect(groupOrigin(T, dragged, 'top')).toEqual({ x: 200, y: 160 });
  });
});

describe('memberInsertionIndex', () => {
  const group: DockRect = { x: 0, y: 0, w: 300, h: 60 };
  it('prepends near the start, appends past the end', () => {
    expect(memberInsertionIndex(group, 'row', 3, { x: 10, y: 30 })).toBe(0);
    expect(memberInsertionIndex(group, 'row', 3, { x: 290, y: 30 })).toBe(3);
    expect(memberInsertionIndex(group, 'row', 3, { x: 150, y: 30 })).toBe(2);
  });
  it('uses the y axis for columns and clamps outside points', () => {
    const col: DockRect = { x: 0, y: 0, w: 100, h: 300 };
    expect(memberInsertionIndex(col, 'col', 2, { x: 50, y: 20 })).toBe(0);
    expect(memberInsertionIndex(col, 'col', 2, { x: 50, y: 900 })).toBe(2);
  });
});

describe('isOutsideUndockZone', () => {
  const group: DockRect = { x: 100, y: 100, w: 200, h: 100 };
  it('inside and within the margin stays docked', () => {
    expect(isOutsideUndockZone(group, { x: 150, y: 150 })).toBe(false);
    expect(isOutsideUndockZone(group, { x: 90, y: 150 })).toBe(false);
  });
  it('past the margin undocks', () => {
    expect(isOutsideUndockZone(group, { x: 70, y: 150 })).toBe(true);
    expect(isOutsideUndockZone(group, { x: 150, y: 230 })).toBe(true);
  });
});

describe('clusterCandidate', () => {
  const ball: DockRect = { x: 500, y: 500, w: 150, h: 150 };
  it('snaps on proximity from any direction, overlap included', () => {
    expect(clusterCandidate({ x: 340, y: 510, w: 150, h: 80 }, ball, 'attitude')?.cluster).toBe(true);
    expect(clusterCandidate({ x: 560, y: 560, w: 100, h: 60 }, ball, 'attitude')?.gap).toBe(0);
  });
  it('respects the threshold diagonally', () => {
    expect(clusterCandidate({ x: 680, y: 680, w: 100, h: 60 }, ball, 'attitude')).toBeNull();
    expect(clusterCandidate({ x: 658, y: 658, w: 100, h: 60 }, ball, 'attitude')).not.toBeNull();
  });
  it('findDockCandidate routes cluster targets through proximity', () => {
    const dragged: DockRect = { x: 560, y: 560, w: 100, h: 60 };
    const c = findDockCandidate(dragged, [{ key: 'attitude', rect: ball, cluster: true }]);
    expect(c).toMatchObject({ targetKey: 'attitude', cluster: true });
    expect(findDockCandidate(dragged, [{ key: 'attitude', rect: ball }])).toBeNull();
  });
});

describe('snapToBallEdge', () => {
  const ball: DockRect = { x: 400, y: 400, w: 150, h: 150 };
  const bc = { x: 475, y: 475 };
  it('places a round satellite tangent on the drop ray', () => {
    const sat: DockRect = { x: 300, y: 430, w: 104, h: 104 };
    const p = snapToBallEdge(ball, sat, true, 0);
    const c = { x: p.x + 52, y: p.y + 52 };
    expect(Math.hypot(c.x - bc.x, c.y - bc.y)).toBeCloseTo(75 + 52, 6);
  });
  it('slides an overlapping round satellite out to the edge', () => {
    const sat: DockRect = { x: 430, y: 380, w: 104, h: 104 };
    const p = snapToBallEdge(ball, sat, true, 0);
    const c = { x: p.x + 52, y: p.y + 52 };
    expect(Math.hypot(c.x - bc.x, c.y - bc.y)).toBeCloseTo(127, 6);
  });
  it('brings a box satellite to touch the circle without overlap', () => {
    const sat: DockRect = { x: 600, y: 430, w: 208, h: 60 };
    const p = snapToBallEdge(ball, sat, false, 0);
    const nx = Math.max(p.x, Math.min(bc.x, p.x + 208));
    const ny = Math.max(p.y, Math.min(bc.y, p.y + 60));
    const gap = Math.hypot(nx - bc.x, ny - bc.y) - 75;
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(0.5);
  });
  it('honors the default visible-edge margin', () => {
    const sat: DockRect = { x: 300, y: 430, w: 104, h: 104 };
    const p = snapToBallEdge(ball, sat, true);
    const c = { x: p.x + 52, y: p.y + 52 };
    expect(Math.hypot(c.x - bc.x, c.y - bc.y)).toBeCloseTo(75 + 4 + 52, 6);
  });
  it('defaults to the right when dropped dead center', () => {
    const sat: DockRect = { x: 423, y: 423, w: 104, h: 104 };
    const p = snapToBallEdge(ball, sat, true, 0);
    expect(p.x).toBeCloseTo(bc.x + 127 - 52, 6);
    expect(p.y).toBeCloseTo(475 - 52, 6);
  });
});
