import { describe, it, expect } from 'vitest';
import { resolveHudHome, computeHomeReadout } from './home-readout';

describe('resolveHudHome', () => {
  it('prefers the map home when set', () => {
    expect(resolveHudHome([53.1, 8.3], { lat: 53.2, lon: 8.4 })).toEqual([53.1, 8.3]);
  });

  it('falls back to mission home when map home is null', () => {
    expect(resolveHudHome(null, { lat: 53.2, lon: 8.4 })).toEqual([53.2, 8.4]);
  });

  it('rejects (0,0) placeholders from either source', () => {
    expect(resolveHudHome([0, 0], null)).toBeNull();
    expect(resolveHudHome(null, { lat: 0, lon: 0 })).toBeNull();
    expect(resolveHudHome([0, 0], { lat: 53.2, lon: 8.4 })).toEqual([53.2, 8.4]);
  });

  it('is null when nothing knows home', () => {
    expect(resolveHudHome(null, null)).toBeNull();
  });
});

describe('computeHomeReadout', () => {
  const home: [number, number] = [53.067053, 8.310513];

  it('is null without a home', () => {
    expect(computeHomeReadout(53.07, 8.31, 90, null)).toBeNull();
  });

  it('is null without a vehicle fix', () => {
    expect(computeHomeReadout(0, 0, 90, home)).toBeNull();
  });

  it('computes distance and nose-relative direction', () => {
    const r = computeHomeReadout(53.068053, 8.310513, 0, home);
    expect(r).not.toBeNull();
    // ~1 milli-degree of latitude is ~111 m, due south of the vehicle.
    expect(r!.distance).toBeGreaterThan(100);
    expect(r!.distance).toBeLessThan(125);
    expect(Math.abs(Math.abs(r!.direction) - 180)).toBeLessThan(1);
  });

  it('direction tracks vehicle heading', () => {
    const north = computeHomeReadout(53.066053, 8.310513, 0, home)!;
    const east = computeHomeReadout(53.066053, 8.310513, 90, home)!;
    expect(Math.abs(north.direction)).toBeLessThan(1);
    expect(Math.abs(east.direction + 90)).toBeLessThan(1);
  });

  it('updates as the vehicle moves', () => {
    const near = computeHomeReadout(53.0675, 8.3105, 0, home)!;
    const far = computeHomeReadout(53.08, 8.3105, 0, home)!;
    expect(far.distance).toBeGreaterThan(near.distance);
  });
});
