import { describe, it, expect } from 'vitest';
import {
  readApGpsSetup,
  readPx4GpsSetup,
  apSerialGpsWrites,
  apCanGpsWrites,
  px4SerialGpsWrites,
  portLabel,
  apSerialPorts,
  apProtocolName,
  apSocketHint,
  PX4_GPS_PORTS,
} from './gps-setup';

const from = (values: Record<string, number>) => (name: string) => values[name];

describe('readApGpsSetup', () => {
  it('reports a working serial GPS on GPS1', () => {
    const s = readApGpsSetup(from({ GPS_TYPE: 1, SERIAL3_PROTOCOL: 5, SERIAL3_BAUD: 230 }));
    expect(s.bus).toBe('serial');
    expect(s.gpsPorts).toEqual([3]);
    expect(s.problem).toBeNull();
  });

  it('names the fault when no serial port carries the GPS protocol', () => {
    const s = readApGpsSetup(from({ GPS_TYPE: 1, SERIAL3_PROTOCOL: 2 }));
    expect(s.bus).toBe('none');
    expect(s.problem).toMatch(/No serial port/);
  });

  it('names the fault when the type is explicitly None', () => {
    const s = readApGpsSetup(from({ GPS_TYPE: 0, SERIAL3_PROTOCOL: 5 }));
    expect(s.problem).toMatch(/not looking for a GPS/);
  });

  it('says nothing when the board exposes no type parameter at all', () => {
    const s = readApGpsSetup(from({ SERIAL3_PROTOCOL: 5 }));
    expect(s.type).toBeNull();
    expect(s.bus).toBe('serial');
    expect(s.problem).toBeNull();
  });

  it('prefers GPS1_TYPE over the pre-subgroup GPS_TYPE', () => {
    const s = readApGpsSetup(from({ GPS1_TYPE: 2, GPS_TYPE: 0, SERIAL3_PROTOCOL: 5 }));
    expect(s.type).toBe(2);
    expect(s.problem).toBeNull();
  });

  it('catches DroneCAN selected with CAN switched off', () => {
    const s = readApGpsSetup(from({ GPS_TYPE: 9, CAN_P1_DRIVER: 0 }));
    expect(s.wantsCan).toBe(true);
    expect(s.canReady).toBe(false);
    expect(s.problem).toMatch(/CAN port is not enabled/);
  });

  it('accepts DroneCAN when the CAN port is set up', () => {
    const s = readApGpsSetup(from({ GPS_TYPE: 9, CAN_P1_DRIVER: 1, CAN_D1_PROTOCOL: 1 }));
    expect(s.bus).toBe('can');
    expect(s.problem).toBeNull();
  });

  it('reads GPS1_TYPE on firmware that uses the subgroup', () => {
    const s = readApGpsSetup(from({ GPS1_TYPE: 2, SERIAL3_PROTOCOL: 5 }));
    expect(s.type).toBe(2);
    expect(s.bus).toBe('serial');
  });

  it('lists every serial port set to GPS', () => {
    const s = readApGpsSetup(from({ GPS_TYPE: 1, SERIAL3_PROTOCOL: 5, SERIAL4_PROTOCOL: 5 }));
    expect(s.gpsPorts).toEqual([3, 4]);
  });
});

describe('write sets', () => {
  it('serial setup targets the chosen SERIALn and both type parameter names', () => {
    expect(apSerialGpsWrites(3)).toEqual([
      { name: 'SERIAL3_PROTOCOL', value: 5 },
      { name: 'SERIAL3_BAUD', value: 230 },
      { name: 'GPS1_TYPE', value: 1 },
      { name: 'GPS_TYPE', value: 1 },
    ]);
  });

  it('CAN setup enables the driver, the protocol and the type together', () => {
    const names = apCanGpsWrites().map((w) => w.name);
    expect(names).toEqual(['CAN_P1_DRIVER', 'CAN_D1_PROTOCOL', 'CAN_P1_BITRATE', 'GPS1_TYPE', 'GPS_TYPE']);
    expect(apCanGpsWrites().at(-1)).toEqual({ name: 'GPS_TYPE', value: 9 });
  });

  it('PX4 serial setup assigns the port and leaves baud on auto', () => {
    expect(px4SerialGpsWrites(201)).toEqual([
      { name: 'GPS_1_CONFIG', value: 201 },
      { name: 'SER_GPS1_BAUD', value: 0 },
    ]);
  });
});

describe('readPx4GpsSetup', () => {
  it('reads a GPS assigned to the GPS1 port', () => {
    const s = readPx4GpsSetup(from({ GPS_1_CONFIG: 201, SER_GPS1_BAUD: 0 }));
    expect(s.bus).toBe('serial');
    expect(s.problem).toBeNull();
  });

  it('flags a disabled GPS with no DroneCAN', () => {
    const s = readPx4GpsSetup(from({ GPS_1_CONFIG: 0, UAVCAN_ENABLE: 0 }));
    expect(s.bus).toBe('none');
    expect(s.problem).toMatch(/Disabled/);
  });

  it('treats DroneCAN as a valid bus with no serial port', () => {
    const s = readPx4GpsSetup(from({ GPS_1_CONFIG: 0, UAVCAN_ENABLE: 2 }));
    expect(s.bus).toBe('can');
    expect(s.problem).toBeNull();
  });
});

describe('portLabel', () => {
  it('names PX4 ports, which the firmware defines', () => {
    expect(portLabel(PX4_GPS_PORTS, 201)).toBe('GPS1');
  });

  it('falls back for a value it does not know', () => {
    expect(portLabel(PX4_GPS_PORTS, 777)).toBe('Port 777');
  });
});

describe('serial ports are read from the board, not assumed', () => {
  it('lists only the SERIALn the board exposes, with what each carries', () => {
    const ports = apSerialPorts(from({
      SERIAL0_PROTOCOL: 0,
      SERIAL1_PROTOCOL: 2,
      SERIAL3_PROTOCOL: 5,
    }));
    expect(ports).toEqual([
      { index: 0, protocol: 0 },
      { index: 1, protocol: 2 },
      { index: 3, protocol: 5 },
    ]);
  });

  it('names protocols a pilot has to recognise on a spare port', () => {
    expect(apProtocolName(5)).toBe('GPS');
    expect(apProtocolName(2)).toBe('MAVLink2');
    expect(apProtocolName(-1)).toBe('unused');
    expect(apProtocolName(123)).toBe('protocol 123');
  });

  it('offers the Pixhawk socket convention as a hint, not a label', () => {
    expect(apSocketHint(3)).toMatch(/GPS1 on Pixhawk/);
    expect(apSocketHint(6)).toBeNull();
  });
});
