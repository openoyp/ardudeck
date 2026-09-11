import { describe, it, expect } from 'vitest';
import {
  ROLE_AFFINITY,
  SECTOR_COLS,
  SECTOR_ROWS,
  computeArrangement,
  sectorIndexOf,
  sectorScore,
  semanticsOf,
  toAnchorPayload,
  type ArrangeItem,
  type Rect,
} from './auto-arrange';

const PANEL = { w: 1200, h: 800 };

function rectOf(placements: Map<string, { x: number; y: number }>, items: ArrangeItem[], id: string): Rect {
  const pos = placements.get(id)!;
  const size = items.find((i) => i.id === id)!.size;
  return { x: pos.x, y: pos.y, w: size.w, h: size.h };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const FULL_SET: ArrangeItem[] = [
  { id: 'attitude', size: { w: 160, h: 160 }, variant: 'analog' },
  { id: 'speed', size: { w: 104, h: 104 }, variant: 'analog' },
  { id: 'altitude', size: { w: 104, h: 104 }, variant: 'analog' },
  { id: 'heading', size: { w: 104, h: 104 }, variant: 'analog' },
  { id: 'vsi', size: { w: 104, h: 104 }, variant: 'analog' },
  { id: 'battery', size: { w: 104, h: 104 }, variant: 'analog' },
  { id: 'gps', size: { w: 104, h: 104 }, variant: 'analog' },
  { id: 'flight-mode', size: { w: 180, h: 44 }, variant: 'analog' },
  { id: 'link', size: { w: 150, h: 44 }, variant: 'analog' },
  { id: 'rtk', size: { w: 170, h: 44 }, variant: 'analog' },
  { id: 'mission', size: { w: 140, h: 44 }, variant: 'analog' },
  { id: 'annunciator', size: { w: 200, h: 150 }, variant: 'analog' },
  { id: 'flight-data', size: { w: 180, h: 140 }, variant: 'analog' },
  { id: 'controls', size: { w: 200, h: 130 }, variant: 'analog' },
];

describe('sector dataset', () => {
  it('sector names map to row-major indices', () => {
    expect(sectorIndexOf('A1')).toBe(0);
    expect(sectorIndexOf('F1')).toBe(5);
    expect(sectorIndexOf('A4')).toBe(18);
    expect(sectorIndexOf('F4')).toBe(23);
    expect(sectorIndexOf('G1')).toBeNull();
    expect(sectorIndexOf('A5')).toBeNull();
  });

  it('every role affinity table covers the full grid', () => {
    for (const table of Object.values(ROLE_AFFINITY)) {
      expect(table).toHaveLength(SECTOR_COLS * SECTOR_ROWS);
    }
  });

  it('scores a status rect higher on the left rail than mid-map', () => {
    const railRect: Rect = { x: 10, y: 300, w: 150, h: 60 };
    const midRect: Rect = { x: 550, y: 380, w: 150, h: 60 };
    const rail = sectorScore(PANEL, 'status', [], railRect);
    const mid = sectorScore(PANEL, 'status', [], midRect);
    expect(rail).toBeGreaterThan(mid);
  });

  it('ranked ideal sectors boost their sector', () => {
    const rect: Rect = { x: 820, y: 20, w: 100, h: 60 };
    const boosted = sectorScore(PANEL, 'power', ['E1'], rect);
    const plain = sectorScore(PANEL, 'power', [], rect);
    expect(boosted).toBeGreaterThan(plain);
  });

  it('known instruments carry the ported semantics', () => {
    expect(semanticsOf('attitude').group).toBe('basic-t');
    expect(semanticsOf('speed').formationSide).toBe('left');
    expect(semanticsOf('altitude').formationSide).toBe('right');
    expect(semanticsOf('controls').priority).toBe(100);
    expect(semanticsOf('rtk').group).toBe('rail');
    expect(semanticsOf('unknown-widget').priority).toBe(30);
  });
});

describe('computeArrangement', () => {
  const chrome: Rect[] = [
    { x: 8, y: 8, w: 130, h: 28 },
    { x: PANEL.w - 130, y: 8, w: 122, h: 320 },
  ];
  const result = computeArrangement(FULL_SET, PANEL, chrome);

  it('places every visible instrument', () => {
    for (const item of FULL_SET) {
      expect(result.placements.has(item.id)).toBe(true);
    }
    expect(result.cascaded).toHaveLength(0);
  });

  it('never overlaps two instruments', () => {
    const ids = FULL_SET.map((i) => i.id);
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const ra = rectOf(result.placements, FULL_SET, ids[a]!);
        const rb = rectOf(result.placements, FULL_SET, ids[b]!);
        expect(overlaps(ra, rb), `${ids[a]} overlaps ${ids[b]}`).toBe(false);
      }
    }
  });

  it('keeps everything fully inside the viewport', () => {
    for (const item of FULL_SET) {
      const r = rectOf(result.placements, FULL_SET, item.id);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(PANEL.w);
      expect(r.y + r.h).toBeLessThanOrEqual(PANEL.h);
    }
  });

  it('keeps the eye corner free', () => {
    const eye: Rect = { x: PANEL.w - 56, y: 0, w: 56, h: 56 };
    for (const item of FULL_SET) {
      const r = rectOf(result.placements, FULL_SET, item.id);
      expect(overlaps(r, eye), `${item.id} covers the eye corner`).toBe(false);
    }
  });

  it('pins the controls card bottom-left', () => {
    const r = rectOf(result.placements, FULL_SET, 'controls');
    expect(r.x).toBe(8);
    expect(r.y + r.h).toBeGreaterThan(PANEL.h - 40);
  });

  it('holds the basic-T formation around the attitude ball', () => {
    const ball = rectOf(result.placements, FULL_SET, 'attitude');
    const speed = rectOf(result.placements, FULL_SET, 'speed');
    const alt = rectOf(result.placements, FULL_SET, 'altitude');
    const ballCy = ball.y + ball.h / 2;
    // Speed sits on the ball's left, altitude on its right, both roughly on
    // the same horizontal line.
    expect(speed.x + speed.w).toBeLessThanOrEqual(ball.x + 8);
    expect(alt.x).toBeGreaterThanOrEqual(ball.x + ball.w - 8);
    expect(Math.abs(speed.y + speed.h / 2 - ballCy)).toBeLessThan(80);
    expect(Math.abs(alt.y + alt.h / 2 - ballCy)).toBeLessThan(80);
    // The keel lands on the bottom band near the centerline.
    expect(ball.y + ball.h).toBeGreaterThan(PANEL.h * 0.7);
    expect(Math.abs(ball.x + ball.w / 2 - PANEL.w / 2)).toBeLessThan(PANEL.w * 0.2);
  });

  it('overflow cascades instead of dropping instruments', () => {
    const tiny = { w: 300, h: 240 };
    const crowd: ArrangeItem[] = Array.from({ length: 8 }, (_, i) => ({
      id: `w${i}`,
      size: { w: 180, h: 140 },
      variant: 'analog',
    }));
    const r = computeArrangement(crowd, tiny, []);
    for (const item of crowd) expect(r.placements.has(item.id)).toBe(true);
  });
});

describe('toAnchorPayload', () => {
  const size = { w: 100, h: 60 };

  it('edge-anchors within the snap band', () => {
    expect(toAnchorPayload(PANEL, size, { x: 12, y: 700 })).toMatchObject({ ax: 'left', dx: 12, ay: 'bottom', dy: PANEL.h - 60 - 700, v: 4 });
    expect(toAnchorPayload(PANEL, size, { x: PANEL.w - 100 - 20, y: 10 })).toMatchObject({ ax: 'right', dx: 20, ay: 'top', dy: 10 });
  });

  it('center-anchors outside the snap band', () => {
    const a = toAnchorPayload(PANEL, size, { x: 500, y: 380 });
    expect(a.ax).toBe('center');
    expect(a.ay).toBe('middle');
    expect(a.dx).toBe(500 + 50 - PANEL.w / 2);
    expect(a.dy).toBe(380 + 30 - PANEL.h / 2);
  });
});
