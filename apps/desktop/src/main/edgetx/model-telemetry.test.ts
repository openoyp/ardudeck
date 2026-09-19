import { describe, it, expect } from 'vitest';
import { __test, isModelFile } from './model-telemetry.js';

const { addToModel, removeFromModel, modelName } = __test;

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

describe('telling models from the other yml files in MODELS', () => {
  // labels.yml is a list of label names, and an older card carries a models.yml
  // index. Both matched the plain ".yml" filter, so each one showed up in the
  // model picker under whatever name it happened to hold first.
  it('rejects the label list and the model index', () => {
    expect(isModelFile('labels.yml')).toBe(false);
    expect(isModelFile('models.yml')).toBe(false);
    expect(isModelFile('._model1.yml')).toBe(false);
    expect(isModelFile('README.txt')).toBe(false);
  });

  it('accepts model files whatever they are called', () => {
    expect(isModelFile('model1.yml')).toBe(true);
    expect(isModelFile('eugene-biene.yml')).toBe(true);
  });

  it('reads the name out of the header block only', () => {
    expect(modelName(crlf([
      'semver: 3.0.0',
      'header: ',
      '   name: "MODEL04"',
      '   bitmap: ""',
      'telemetryProtocol: 0',
      'logicalSw:',
      '   0:',
      '      name: "not the model"',
    ]))).toBe('MODEL04');
  });

  it('finds no name in a file that has no header block', () => {
    expect(modelName(crlf([
      'labels:',
      '   0:',
      '      name: "Racers"',
    ]))).toBe('');
  });
});
