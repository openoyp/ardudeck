import { describe, it, expect } from 'vitest';
import {
  bestZoom,
  capSpan,
  ringRect,
  recenterDistanceM,
  INNER_RING_TILES,
  MAX_OUTER_RING_TILES,
  RING_SPANS_M,
  WIDE_RING_SPANS_M,
  type Bounds,
} from './svt-satellite';
import { SVT_QUALITY, metersPerDegLon, type ElevationGrid } from './svt-terrain';

const CENTER_LAT = 44;
const CENTER_LON = 20;

function boundsAround(spanM: number): Bounds {
  const halfLat = spanM / 2 / 111_320;
  const halfLon = spanM / 2 / metersPerDegLon(CENTER_LAT);
  return {
    south: CENTER_LAT - halfLat,
    north: CENTER_LAT + halfLat,
    west: CENTER_LON - halfLon,
    east: CENTER_LON + halfLon,
  };
}

const grid: ElevationGrid = {
  centerLat: CENTER_LAT,
  centerLon: CENTER_LON,
  halfSizeM: 25_000,
  res: 4,
  elev: new Float32Array(16),
  mPerDegLon: metersPerDegLon(CENTER_LAT),
};

describe('bestZoom', () => {
  it('buys more zoom for a smaller patch at the same tile budget', () => {
    expect(bestZoom(boundsAround(2_000), 16)).toBeGreaterThan(bestZoom(boundsAround(50_000), 16));
  });

  it('stays inside the tile budget', () => {
    for (const span of [2_000, 10_000, 50_000]) {
      const b = boundsAround(span);
      const z = bestZoom(b, 8);
      const tilesX = Math.floor(((b.east + 180) / 360) * 2 ** z) - Math.floor(((b.west + 180) / 360) * 2 ** z) + 1;
      expect(tilesX).toBeLessThanOrEqual(8);
    }
  });
});

describe('capSpan', () => {
  it('shrinks a wide patch to the requested span about its centre', () => {
    const capped = capSpan(boundsAround(50_000), 2_000, CENTER_LAT);
    const spanLatM = (capped.north - capped.south) * 111_320;
    expect(spanLatM).toBeCloseTo(2_000, -1);
    expect((capped.north + capped.south) / 2).toBeCloseTo(CENTER_LAT, 6);
  });

  it('never grows a patch that is already smaller', () => {
    const small = boundsAround(1_000);
    const capped = capSpan(small, 10_000, CENTER_LAT);
    expect(capped.north).toBeCloseTo(small.north, 9);
    expect(capped.south).toBeCloseTo(small.south, 9);
  });
});

describe('ringRect', () => {
  // z = -north: getting this backwards flips the imagery north/south, which
  // reads as plausible terrain, just mirrored.
  it('puts the northern edge at the smaller z and the east at the larger x', () => {
    const rect = ringRect(grid, boundsAround(10_000));
    expect(rect.minZ).toBeLessThan(rect.maxZ);
    expect(rect.minX).toBeLessThan(rect.maxX);
    const north = ringRect(grid, { ...boundsAround(10_000), north: CENTER_LAT + 0.1, south: CENTER_LAT });
    expect(north.minZ).toBeCloseTo(-0.1 * 111_320, 0);
    expect(north.maxZ).toBeCloseTo(0, 6);
  });
});

describe('quality levels', () => {
  it('raises terrain detail from low to high', () => {
    expect(SVT_QUALITY.high.res).toBeGreaterThan(SVT_QUALITY.medium.res);
    expect(SVT_QUALITY.medium.res).toBeGreaterThan(SVT_QUALITY.low.res);
    expect(SVT_QUALITY.high.demZoomMax).toBeGreaterThan(SVT_QUALITY.low.demZoomMax);
  });

  it('never lets a quality level touch the innermost imagery ring', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      expect(Math.min(SVT_QUALITY[q].outerRingTiles, MAX_OUTER_RING_TILES))
        .toBeLessThanOrEqual(INNER_RING_TILES);
    }
  });

  // These mosaics are RGBA textures with mipmaps, rebuilt as the aircraft
  // moves: an unbounded tile budget is how the renderer runs out of GPU memory.
  it('bounds every ring to a mosaic the GPU can hold', () => {
    // 16 per side is a 4096 px RGBA mosaic with mipmaps, about 90 MB; past
    // that a set of rings no longer fits comfortably in GPU memory.
    expect(INNER_RING_TILES).toBeLessThanOrEqual(16);
    expect(MAX_OUTER_RING_TILES).toBeLessThanOrEqual(INNER_RING_TILES);
  });
});

describe('ring spans', () => {
  it('reaches a sharper zoom for the nose-on inner ring than the pulled-back one', () => {
    const near = bestZoom(boundsAround(RING_SPANS_M[0]!), INNER_RING_TILES);
    const wide = bestZoom(boundsAround(WIDE_RING_SPANS_M[0]!), INNER_RING_TILES);
    expect(near).toBeGreaterThan(wide);
  });

  // The rings have to be re-fetched before the vehicle leaves the sharp one.
  it('follows more closely the tighter the inner ring', () => {
    expect(recenterDistanceM(RING_SPANS_M)).toBeLessThan(RING_SPANS_M[0]! / 2);
    expect(recenterDistanceM(WIDE_RING_SPANS_M)).toBeGreaterThan(recenterDistanceM(RING_SPANS_M));
  });
});
