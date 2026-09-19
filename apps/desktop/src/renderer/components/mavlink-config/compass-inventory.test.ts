import { describe, it, expect } from 'vitest';
import { decodeDeviceId, readCompassSlots, summariseCompasses } from './compass-inventory';

const from = (params: Record<string, number>) => (name: string) => params[name];

// Device ids as ArduPilot packs them: bus_type 3 bits, bus 5, address 8,
// devtype 8.
const makeId = (busType: number, bus: number, address: number, devType: number) =>
  (busType & 0x7) | ((bus & 0x1f) << 3) | ((address & 0xff) << 8) | ((devType & 0xff) << 16);

describe('decoding a compass device id', () => {
  it('unpacks bus, address and type', () => {
    expect(decodeDeviceId(makeId(1, 1, 0x0e, 0x07))).toEqual({
      bus: 'I2C', busNumber: 1, address: 0x0e, devType: 0x07,
    });
  });

  it('names a DroneCAN compass', () => {
    expect(decodeDeviceId(makeId(3, 0, 0, 5)).bus).toBe('DroneCAN');
  });

  it('calls a zero id unknown', () => {
    expect(decodeDeviceId(0).bus).toBe('unknown');
  });
});

describe('reading the board inventory', () => {
  // The case the user asked about: no chip on the autopilot, one inside the
  // GPS module on the external I2C bus.
  it('tells the GPS compass from an onboard one', () => {
    const slots = readCompassSlots(from({
      COMPASS_DEV_ID: makeId(2, 0, 0, 0x04),   // SPI, on the board
      COMPASS_DEV_ID2: makeId(1, 1, 0x0e, 0x07), // I2C bus 1, in the GPS
      COMPASS_OFS_X: 12, COMPASS_OFS_Y: -4, COMPASS_OFS_Z: 3,
      COMPASS_USE: 1, COMPASS_USE2: 1,
    }));
    expect(slots[0]!.external).toBe(false);
    expect(slots[1]!.external).toBe(true);
    expect(slots[0]!.calibrated).toBe(true);
    expect(slots[1]!.calibrated).toBe(false);
  });

  // ArduPilot says so directly, and on boards whose external port is bus 0 the
  // bus number lies: a GPS compass then reads as onboard.
  it('believes COMPASS_EXTERNAL over the bus number', () => {
    const onBus0 = makeId(1, 0, 0x0d, 0x0e);
    expect(readCompassSlots(from({ COMPASS_DEV_ID: onBus0 }))[0]!.external).toBe(false);
    expect(readCompassSlots(from({ COMPASS_DEV_ID: onBus0, COMPASS_EXTERNAL: 1 }))[0]!.external).toBe(true);
    expect(readCompassSlots(from({
      COMPASS_DEV_ID: makeId(1, 1, 0x0e, 7), COMPASS_EXTERNAL: 0,
    }))[0]!.external).toBe(false);
  });

  it('reports the priority order', () => {
    const gps = makeId(1, 1, 0x0e, 0x07);
    const slots = readCompassSlots(from({
      COMPASS_DEV_ID: gps,
      COMPASS_PRIO1_ID: gps,
    }));
    expect(slots[0]!.priority).toBe(1);
    expect(slots[1]!.priority).toBeNull();
  });

  it('treats a missing USE parameter as enabled, like ArduPilot does', () => {
    expect(readCompassSlots(from({ COMPASS_DEV_ID: 1 }))[0]!.used).toBe(true);
  });
});

describe('the summary the card shows', () => {
  it('says none only once the parameters are in', () => {
    expect(summariseCompasses(readCompassSlots(from({})), false).none).toBe(false);
    expect(summariseCompasses(readCompassSlots(from({})), true).none).toBe(true);
  });

  it('spots a board where every compass is switched off', () => {
    const s = summariseCompasses(readCompassSlots(from({
      COMPASS_DEV_ID: makeId(1, 1, 0x0e, 7), COMPASS_USE: 0,
    })), true);
    expect(s.allDisabled).toBe(true);
    expect(s.none).toBe(false);
  });

  it('lists the ones in use that were never calibrated', () => {
    const s = summariseCompasses(readCompassSlots(from({
      COMPASS_DEV_ID: makeId(1, 1, 0x0e, 7), COMPASS_USE: 1,
    })), true);
    expect(s.uncalibrated).toHaveLength(1);
  });
});
