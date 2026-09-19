import { describe, it, expect } from 'vitest';
import { MAP_INSTRUMENTS, instrumentSuitsProfile } from './registry';
import { PRESET_INSTRUMENT_LAYOUTS } from './preset-layouts';

const byId = (id: string) => MAP_INSTRUMENTS.find((d) => d.id === id)!;

describe('instrument profiles', () => {
  it('keeps untagged instruments on every vehicle', () => {
    expect(instrumentSuitsProfile(byId('battery'), 'air')).toBe(true);
    expect(instrumentSuitsProfile(byId('battery'), 'ground')).toBe(true);
  });

  // The ball, VSI and altitude are the ones a rover driver has no use for, and
  // tilt/steer/cross-track are the ones that replace them.
  it('splits the aviation set from the ground set', () => {
    for (const id of ['attitude', 'vsi', 'altitude']) {
      expect(instrumentSuitsProfile(byId(id), 'ground')).toBe(false);
      expect(instrumentSuitsProfile(byId(id), 'air')).toBe(true);
    }
    for (const id of ['tilt', 'steer', 'xtrack']) {
      expect(instrumentSuitsProfile(byId(id), 'air')).toBe(false);
      expect(instrumentSuitsProfile(byId(id), 'ground')).toBe(true);
    }
  });

  it('ships a rover preset that places only ground-suitable instruments', () => {
    const rover = PRESET_INSTRUMENT_LAYOUTS.find((p) => p.name === 'Rover')!;
    expect(rover).toBeDefined();
    for (const [id, on] of Object.entries(rover.layout.visible)) {
      if (!on) continue;
      expect(instrumentSuitsProfile(byId(id), 'ground'), id).toBe(true);
    }
    // And every other preset stays flyable.
    for (const preset of PRESET_INSTRUMENT_LAYOUTS.filter((p) => p.name !== 'Rover')) {
      for (const [id, on] of Object.entries(preset.layout.visible)) {
        if (!on) continue;
        expect(instrumentSuitsProfile(byId(id), 'air'), `${preset.name}/${id}`).toBe(true);
      }
    }
  });

  it('gives every preset member a place to sit', () => {
    for (const preset of PRESET_INSTRUMENT_LAYOUTS) {
      for (const group of Object.values(preset.layout.groups ?? {})) {
        for (const member of group.members) {
          expect(preset.layout.visible[member], `${preset.name}/${member}`).toBe(true);
        }
      }
    }
  });
});
