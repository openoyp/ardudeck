import { describe, it, expect } from 'vitest';
import { __test } from './model-telemetry.js';

const { addToModel, removeFromModel } = __test;

/** Shapes copied from model files a RadioMaster Pocket wrote itself. */
const crlf = (lines: string[]) => lines.join('\r\n');

const NO_SCREENS = crlf([
  'telemetrySensors: ',
  '   0:',
  '      label: "Bat%"',
  'view: 0',
  'usbJoystickExtMode: 0',
  '',
]);

const VALUES_SCREEN = crlf([
  'telemetrySensors: ',
  '   0:',
  '      label: "Bat%"',
  'screens: ',
  '   0:',
  '      type: VALUES',
  '      u: ',
  '         lines: ',
  '            0:',
  '            1:',
  '               sources: ',
  '                  0:',
  '                     val: TX_VOLTAGE',
  'view: 0',
  '',
]);

describe('telemetry screen writer', () => {
  it('creates the block before view: when a model has no screens', () => {
    const { raw, status, slot } = addToModel(NO_SCREENS, 'ArduDk');
    expect(status).toBe('added');
    expect(slot).toBe(0);
    expect(raw).toContain('\r\n'); // radio files are CRLF
    expect(raw).toBe(crlf([
      'telemetrySensors: ',
      '   0:',
      '      label: "Bat%"',
      'screens: ',
      '   0:',
      '      type: SCRIPT',
      '      u: ',
      '         script: ',
      '            file: "ArduDk"',
      'view: 0',
      'usbJoystickExtMode: 0',
      '',
    ]));
  });

  it('takes the next free slot and leaves existing screens alone', () => {
    const { raw, status, slot } = addToModel(VALUES_SCREEN, 'ArduDk');
    expect(status).toBe('added');
    expect(slot).toBe(1);
    expect(raw).toContain('      type: VALUES');
    expect(raw).toContain('                     val: TX_VOLTAGE');
    expect(raw.indexOf('   0:')).toBeLessThan(raw.indexOf('   1:'));
  });

  it('keeps slots ascending when a higher slot is already taken', () => {
    const withSlot1 = VALUES_SCREEN.replace('   0:\r\n      type: VALUES', '   1:\r\n      type: VALUES');
    const { raw, slot } = addToModel(withSlot1, 'ArduDk');
    expect(slot).toBe(0);
    expect(raw.indexOf('   0:\r\n      type: SCRIPT')).toBeLessThan(raw.indexOf('   1:'));
  });

  it('is idempotent', () => {
    const once = addToModel(NO_SCREENS, 'ArduDk').raw;
    const twice = addToModel(once, 'ArduDk');
    expect(twice.status).toBe('already');
    expect(twice.raw).toBe(once);
  });

  it('reports a full screen list instead of overwriting', () => {
    let raw = VALUES_SCREEN;
    for (const n of [1, 2, 3]) {
      raw = raw.replace('view: 0', `   ${n}:\r\n      type: VALUES\r\nview: 0`);
    }
    expect(addToModel(raw, 'ArduDk').status).toBe('full');
  });

  it('round-trips: remove restores the original bytes', () => {
    for (const original of [NO_SCREENS, VALUES_SCREEN]) {
      const added = addToModel(original, 'ArduDk');
      const removed = removeFromModel(added.raw, 'ArduDk');
      expect(removed.status).toBe('removed');
      expect(removed.raw).toBe(original);
    }
  });

  it('removes nothing when the script was never added', () => {
    const result = removeFromModel(VALUES_SCREEN, 'ArduDk');
    expect(result.status).toBe('absent');
    expect(result.raw).toBe(VALUES_SCREEN);
  });
});
