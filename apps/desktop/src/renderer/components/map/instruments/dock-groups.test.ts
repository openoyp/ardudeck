import { describe, it, expect } from 'vitest';
import {
  sanitizeGroups,
  createCluster,
  addClusterMember,
  setClusterOffset,
  dissolveGroup,
  isCluster,
  groupDisplayOptions,
  createGroup,
  addMember,
  removeMember,
  reorderMember,
  nextGroupId,
  groupOf,
  groupOverlayKey,
  type DockGroups,
} from './dock-groups';

const KNOWN = ['battery', 'gps', 'altitude', 'speed', 'link', 'mission'];

describe('sanitizeGroups', () => {
  it('drops unknown members, duplicate memberships and sub-2 groups', () => {
    const raw = {
      d1: { members: ['battery', 'gps', 'nope'], orientation: 'row' },
      d2: { members: ['gps', 'link'], orientation: 'col' },
      d3: { members: ['mission'], orientation: 'row' },
      d4: 'garbage',
    };
    const out = sanitizeGroups(raw, KNOWN);
    expect(out).toEqual({ d1: { members: ['battery', 'gps'], orientation: 'row' } });
  });

  it('defaults bad orientation to row and rejects non-objects', () => {
    expect(sanitizeGroups({ d1: { members: ['battery', 'gps'], orientation: 'diagonal' } }, KNOWN))
      .toEqual({ d1: { members: ['battery', 'gps'], orientation: 'row' } });
    expect(sanitizeGroups(null, KNOWN)).toEqual({});
    expect(sanitizeGroups('x', KNOWN)).toEqual({});
  });
});

describe('createGroup / nextGroupId', () => {
  it('orders members by approach side', () => {
    const a = createGroup({}, 'gps', 'battery', 'row', false);
    expect(a.gid).toBe('d1');
    expect(a.groups.d1!.members).toEqual(['gps', 'battery']);
    const b = createGroup({}, 'gps', 'battery', 'col', true);
    expect(b.groups.d1!.members).toEqual(['battery', 'gps']);
  });

  it('skips taken ids', () => {
    const groups: DockGroups = { d1: { members: ['battery', 'gps'], orientation: 'row' } };
    expect(nextGroupId(groups)).toBe('d2');
  });
});

describe('addMember', () => {
  const groups: DockGroups = { d1: { members: ['battery', 'gps'], orientation: 'row' } };
  it('inserts at the clamped index', () => {
    expect(addMember(groups, 'd1', 'link', 1).d1!.members).toEqual(['battery', 'link', 'gps']);
    expect(addMember(groups, 'd1', 'link', 99).d1!.members).toEqual(['battery', 'gps', 'link']);
  });
  it('ignores unknown groups and existing members', () => {
    expect(addMember(groups, 'dX', 'link', 0)).toBe(groups);
    expect(addMember(groups, 'd1', 'gps', 0)).toBe(groups);
  });
});

describe('removeMember', () => {
  it('removes and keeps a 3-member group alive', () => {
    const groups: DockGroups = { d1: { members: ['battery', 'gps', 'link'], orientation: 'row' } };
    const r = removeMember(groups, 'gps');
    expect(r.dissolved).toBeNull();
    expect(r.groups.d1!.members).toEqual(['battery', 'link']);
  });
  it('dissolves a pair and reports the remaining member', () => {
    const groups: DockGroups = { d1: { members: ['battery', 'gps'], orientation: 'row' } };
    const r = removeMember(groups, 'battery');
    expect(r.groups).toEqual({});
    expect(r.dissolved).toEqual({ gid: 'd1', remaining: 'gps' });
  });
  it('is a no-op for ungrouped ids', () => {
    const groups: DockGroups = { d1: { members: ['battery', 'gps'], orientation: 'row' } };
    expect(removeMember(groups, 'mission')).toEqual({ groups, dissolved: null });
  });
});

describe('reorderMember', () => {
  const groups: DockGroups = { d1: { members: ['battery', 'gps', 'link'], orientation: 'row' } };
  it('moves within bounds', () => {
    expect(reorderMember(groups, 'd1', 0, 2).d1!.members).toEqual(['gps', 'link', 'battery']);
    expect(reorderMember(groups, 'd1', 2, 0).d1!.members).toEqual(['link', 'battery', 'gps']);
  });
  it('ignores no-ops and bad indices', () => {
    expect(reorderMember(groups, 'd1', 1, 1)).toBe(groups);
    expect(reorderMember(groups, 'd1', 5, 0)).toBe(groups);
  });
});

describe('helpers', () => {
  it('groupOf finds membership', () => {
    const groups: DockGroups = { d1: { members: ['battery', 'gps'], orientation: 'row' } };
    expect(groupOf(groups, 'gps')).toBe('d1');
    expect(groupOf(groups, 'link')).toBeNull();
  });
  it('groupOverlayKey builds the overlay storage key', () => {
    expect(groupOverlayKey('d1')).toBe('instrument:group:d1');
  });
});

describe('clusters', () => {
  it('createCluster anchors on the attitude ball with the member offset', () => {
    const r = createCluster({}, 'battery', { x: -80, y: 20 });
    expect(r.groups[r.gid]).toEqual({
      members: ['attitude', 'battery'],
      orientation: 'row',
      offsets: { battery: { x: -80, y: 20 } },
    });
    expect(isCluster(r.groups[r.gid]!)).toBe(true);
  });

  it('addClusterMember appends with its offset; card groups refuse', () => {
    const { groups, gid } = createCluster({}, 'battery', { x: -80, y: 0 });
    const next = addClusterMember(groups, gid, 'home', { x: 120, y: 10 });
    expect(next[gid]!.members).toEqual(['attitude', 'battery', 'home']);
    expect(next[gid]!.offsets).toEqual({ battery: { x: -80, y: 0 }, home: { x: 120, y: 10 } });
    const card: DockGroups = { d9: { members: ['battery', 'gps'], orientation: 'row' } };
    expect(addClusterMember(card, 'd9', 'home', { x: 0, y: 0 })).toBe(card);
  });

  it('setClusterOffset repositions a member but never the anchor', () => {
    const { groups, gid } = createCluster({}, 'battery', { x: -80, y: 0 });
    const moved = setClusterOffset(groups, gid, 'battery', { x: 40, y: -30 });
    expect(moved[gid]!.offsets!.battery).toEqual({ x: 40, y: -30 });
    expect(setClusterOffset(groups, gid, 'attitude', { x: 1, y: 1 })).toBe(groups);
  });

  it('removeMember prunes the offset and dissolves a pair', () => {
    const base = createCluster({}, 'battery', { x: -80, y: 0 });
    const three = addClusterMember(base.groups, base.gid, 'home', { x: 120, y: 0 });
    const r = removeMember(three, 'battery');
    expect(r.dissolved).toBeNull();
    expect(r.groups[base.gid]!.offsets).toEqual({ home: { x: 120, y: 0 } });
    const pair = removeMember(base.groups, 'battery');
    expect(pair.dissolved).toEqual({ gid: base.gid, remaining: 'attitude' });
  });

  it('dissolveGroup drops the whole group', () => {
    const { groups, gid } = createCluster({}, 'battery', { x: 0, y: 0 });
    expect(dissolveGroup(groups, gid)).toEqual({});
    expect(dissolveGroup(groups, 'nope')).toBe(groups);
  });

  it('sanitizeGroups keeps valid cluster offsets and drops broken ones', () => {
    const raw = {
      d1: {
        members: ['attitude', 'battery', 'home'],
        orientation: 'row',
        offsets: { battery: { x: -80, y: 4 }, home: { x: 'bad', y: 0 }, attitude: { x: 1, y: 1 } },
      },
    };
    const out = sanitizeGroups(raw, ['attitude', 'battery', 'home']);
    expect(out.d1!.offsets).toEqual({ battery: { x: -80, y: 4 } });
  });

  it('sanitizeGroups drops a cluster whose ball got pruned', () => {
    const raw = {
      d1: { members: ['attitude', 'battery'], orientation: 'row' },
      d2: { members: ['attitude', 'gps'], orientation: 'row' },
    };
    const out = sanitizeGroups(raw, ['attitude', 'battery', 'gps']);
    expect(Object.keys(out)).toEqual(['d1']);
  });
});

describe('groupDisplayOptions', () => {
  const gauge = (id: string) => ({
    id,
    NumericComponent: () => null,
    variants: [{ id: 'strip', label: 'Strip' }, { id: 'cell', label: 'Cell' }, { id: 'inline', label: 'Inline' }],
  });
  const linkLike = { id: 'link', variants: [{ id: 'strip', label: 'Strip' }, { id: 'cell', label: 'Cell' }, { id: 'inline', label: 'Inline' }] };
  const fixed = (id: string) => ({ id });

  it('intersects modes across switchable members', () => {
    const r = groupDisplayOptions([gauge('battery'), linkLike]);
    expect(r?.ids).toEqual(['battery', 'link']);
    expect(r?.options.map((o) => o.id)).toEqual(['analog', 'strip', 'cell', 'inline']);
  });

  it('full gauge groups offer numeric too', () => {
    const r = groupDisplayOptions([gauge('battery'), gauge('gps')]);
    expect(r?.options.map((o) => o.id)).toEqual(['analog', 'numeric', 'strip', 'cell', 'inline']);
  });

  it('refuses mixed groups where a member cannot follow', () => {
    expect(groupDisplayOptions([gauge('battery'), fixed('mission')])).toBeNull();
    expect(groupDisplayOptions([linkLike, fixed('rtk')])).toBeNull();
  });

  it('exempts the ball in a constellation', () => {
    const r = groupDisplayOptions([fixed('attitude'), gauge('battery'), gauge('gps')]);
    expect(r?.ids).toEqual(['battery', 'gps']);
    expect(groupDisplayOptions([fixed('attitude'), fixed('mission')])).toBeNull();
  });

  it('returns null when nothing can switch', () => {
    expect(groupDisplayOptions([fixed('mission'), fixed('flight-mode')])).toBeNull();
    expect(groupDisplayOptions([])).toBeNull();
  });
});
