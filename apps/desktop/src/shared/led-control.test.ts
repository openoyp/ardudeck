import { describe, it, expect } from 'vitest';
import { serializeLedControl, LED_CONTROL_ID, LED_CONTROL_CRC_EXTRA } from './led-control';

const base = { targetSystem: 1, targetComponent: 1, instance: 0, red: 0, green: 0, blue: 0, rateHz: 0 };

describe('serializeLedControl', () => {
  it('uses the documented message id and CRC extra', () => {
    expect(LED_CONTROL_ID).toBe(186);
    expect(LED_CONTROL_CRC_EXTRA).toBe(72);
  });

  it('is the full 29-byte payload the message declares', () => {
    expect(serializeLedControl(base)).toHaveLength(29);
  });

  it('puts RGB where the firmware reads it, with custom_len 3 for a solid colour', () => {
    const p = serializeLedControl({ ...base, red: 255, green: 128, blue: 7 });
    expect(p[4]).toBe(3);
    expect([p[5], p[6], p[7]]).toEqual([255, 128, 7]);
  });

  it('switches to custom_len 4 and carries the rate when blinking', () => {
    const p = serializeLedControl({ ...base, red: 10, green: 20, blue: 30, rateHz: 5 });
    expect(p[4]).toBe(4);
    expect(p[8]).toBe(5);
  });

  it('clamps values that would wrap a byte', () => {
    const p = serializeLedControl({ ...base, red: 999, green: -5, blue: 12.6 });
    expect([p[5], p[6], p[7]]).toEqual([255, 0, 13]);
  });

  it('addresses the vehicle it is given', () => {
    const p = serializeLedControl({ ...base, targetSystem: 7, targetComponent: 190 });
    expect([p[0], p[1]]).toEqual([7, 190]);
  });
});
