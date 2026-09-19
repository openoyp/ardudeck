import { describe, it, expect } from 'vitest';
import { sanitizeLayouts, upsertLayout, removeLayout, type SavedHudLayout } from './hud-layout-library';

const tile = { id: 'batt', x: 8, y: 48, w: 144, h: 96, variant: 'default' };
const layout = (name: string): SavedHudLayout => ({
  name,
  screen: { w: 480, h: 320 },
  pages: [[tile]],
  savedAt: '2026-09-17T10:00:00.000Z',
});

describe('the saved layout library', () => {
  it('replaces a layout saved under an existing name', () => {
    const first = upsertLayout([], layout('Rover'));
    const second = upsertLayout(first, { ...layout('Rover'), pages: [[tile], [tile]] });
    expect(second).toHaveLength(1);
    expect(second[0]!.pages).toHaveLength(2);
  });

  it('keeps the list sorted so the picker is stable', () => {
    const list = upsertLayout(upsertLayout([], layout('Zulu')), layout('Alpha'));
    expect(list.map((l) => l.name)).toEqual(['Alpha', 'Zulu']);
  });

  it('ignores a blank name rather than saving an unnameable layout', () => {
    expect(upsertLayout([], layout('   '))).toEqual([]);
  });

  it('removes by name', () => {
    expect(removeLayout(upsertLayout([], layout('Rover')), 'Rover')).toEqual([]);
  });
});

describe('reading layouts back off disk', () => {
  // This is user data that survives upgrades: one damaged entry must not take
  // the rest of somebody's library with it.
  it('drops damaged entries and keeps the good ones', () => {
    const parsed = sanitizeLayouts([
      layout('Good'),
      { name: 'No pages', pages: [], screen: { w: 480, h: 320 } },
      { pages: [[tile]] },
      { name: 'Junk tiles', pages: [[{ id: 'batt' }]] },
      'nonsense',
    ]);
    expect(parsed.map((l) => l.name)).toEqual(['Good']);
  });

  it('fills in a missing screen size instead of discarding the layout', () => {
    const [first] = sanitizeLayouts([{ name: 'Old', pages: [[tile]] }]);
    expect(first!.screen).toEqual({ w: 480, h: 320 });
  });

  it('returns nothing for a file that is not a list', () => {
    expect(sanitizeLayouts({ name: 'x' })).toEqual([]);
    expect(sanitizeLayouts(null)).toEqual([]);
  });
});
