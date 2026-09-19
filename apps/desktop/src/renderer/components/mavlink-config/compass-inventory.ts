/**
 * What compasses this board actually has.
 *
 * ArduPilot publishes each detected compass as a packed device id
 * (COMPASS_DEV_ID..3). Zero means nothing was found in that slot, and the
 * packed value says where it was found, which is how you tell a chip on the
 * autopilot from the one inside the GPS module. Without this the only honest
 * answer to "does my board have a compass" is to read a hex number.
 *
 * Layout from AP_HAL::Device::DeviceStructure: bus_type 3 bits, bus 5 bits,
 * address 8 bits, devtype 8 bits.
 */

export type CompassBus = 'I2C' | 'SPI' | 'DroneCAN' | 'SITL' | 'MSP' | 'Serial' | 'QSPI' | 'unknown';

export interface CompassSlot {
  /** 1-based, matching the parameter names. */
  index: number;
  devId: number;
  detected: boolean;
  bus: CompassBus;
  busNumber: number;
  address: number;
  devType: number;
  /** True when it is not on the autopilot's own internal bus. */
  external: boolean;
  /** COMPASS_USE / USE2 / USE3. */
  used: boolean;
  /** Offsets away from zero: the board has a calibration for this one. */
  calibrated: boolean;
  /** Position in COMPASS_PRIO1_ID..3, or null when it is not listed. */
  priority: number | null;
}

const BUS_NAMES: Record<number, CompassBus> = {
  0: 'unknown', 1: 'I2C', 2: 'SPI', 3: 'DroneCAN', 4: 'SITL', 5: 'MSP', 6: 'Serial', 7: 'QSPI',
};

export function decodeDeviceId(devId: number): {
  bus: CompassBus; busNumber: number; address: number; devType: number;
} {
  return {
    bus: BUS_NAMES[devId & 0x7] ?? 'unknown',
    busNumber: (devId >> 3) & 0x1f,
    address: (devId >> 8) & 0xff,
    devType: (devId >> 16) & 0xff,
  };
}

function suffix(index: number): string {
  return index === 1 ? '' : String(index);
}

export function readCompassSlots(get: (name: string) => number | undefined): CompassSlot[] {
  const priorities = [1, 2, 3].map((i) => get(`COMPASS_PRIO${i}_ID`) ?? 0);

  return [1, 2, 3].map((index) => {
    const s = suffix(index);
    const devId = get(`COMPASS_DEV_ID${s}`) ?? 0;
    const decoded = decodeDeviceId(devId);
    const offsets = ['X', 'Y', 'Z'].map((axis) => get(`COMPASS_OFS${s}_${axis}`) ?? 0);
    const priorityIndex = priorities.findIndex((p) => p !== 0 && p === devId);

    // ArduPilot states this outright in COMPASS_EXTERNAL/EXTERN2/3; guessing
    // from the bus number gets it wrong on boards that wire the external I2C
    // port to bus 0, which then reports a GPS compass as onboard.
    const flagged = get(index === 1 ? 'COMPASS_EXTERNAL' : `COMPASS_EXTERN${index}`);

    return {
      index,
      devId,
      detected: devId !== 0,
      ...decoded,
      external: flagged !== undefined
        ? flagged !== 0
        : decoded.bus === 'DroneCAN' || (decoded.bus === 'I2C' && decoded.busNumber > 0),
      used: (get(`COMPASS_USE${s}`) ?? 1) !== 0,
      calibrated: offsets.some((v) => v !== 0),
      priority: priorityIndex >= 0 ? priorityIndex + 1 : null,
    };
  });
}

export interface CompassSummary {
  /** Slots with a device in them. */
  present: CompassSlot[];
  /** True once the parameters have arrived, so "none" means none. */
  known: boolean;
  /** No compass at all: the board has none and no GPS module brought one. */
  none: boolean;
  /** A compass exists but every one of them is switched off. */
  allDisabled: boolean;
  /** Detected but never calibrated, which is what blocks arming. */
  uncalibrated: CompassSlot[];
}

export function summariseCompasses(
  slots: CompassSlot[],
  known: boolean,
): CompassSummary {
  const present = slots.filter((s) => s.detected);
  return {
    present,
    known,
    none: known && present.length === 0,
    allDisabled: present.length > 0 && present.every((s) => !s.used),
    uncalibrated: present.filter((s) => s.used && !s.calibrated),
  };
}
