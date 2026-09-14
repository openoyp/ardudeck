import { describe, it, expect } from 'vitest';
import {
  mavlinkLinks, rateParamName, rateScheme, readRates, bandwidthCost,
  serialCapacity, RATE_GROUPS, type ParamLookup,
} from './mavlink-channels.js';

const lookup = (params: Record<string, number>): ParamLookup => (n) => params[n];

describe('MAVLink channel mapping', () => {
  it('numbers channels by port order, not by port number', () => {
    // The case that costs pilots hours: SERIAL7 is the only MAVLink port,
    // so it is channel 0 and its rates live in SR0_*.
    const links = mavlinkLinks(lookup({
      SERIAL0_PROTOCOL: -1,
      SERIAL2_PROTOCOL: 5,      // GPS
      SERIAL7_PROTOCOL: 2,
      SERIAL7_BAUD: 460,
    }));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ serial: 7, channel: 0, baud: 460800, label: 'SERIAL7' });
  });

  it('assigns later ports later channels', () => {
    const links = mavlinkLinks(lookup({
      SERIAL0_PROTOCOL: 2, SERIAL0_BAUD: 115,
      SERIAL1_PROTOCOL: 2, SERIAL1_BAUD: 57,
      SERIAL4_PROTOCOL: 2, SERIAL4_BAUD: 921,
      SERIAL5_PROTOCOL: 16,   // ESC telemetry, not a channel
    }));
    expect(links.map((l) => [l.serial, l.channel])).toEqual([[0, 0], [1, 1], [4, 2]]);
    expect(links.map((l) => l.label)).toEqual(['USB', 'TELEM1', 'GPS2']);
  });

  it('ignores ports that are not MAVLink', () => {
    expect(mavlinkLinks(lookup({ SERIAL3_PROTOCOL: 5, SERIAL4_PROTOCOL: 23 }))).toEqual([]);
  });

  it('passes through a raw baud value that is not a known code', () => {
    const links = mavlinkLinks(lookup({ SERIAL1_PROTOCOL: 2, SERIAL1_BAUD: 250000 }));
    expect(links[0]!.baud).toBe(250000);
  });
});

describe('rate parameter scheme', () => {
  it('prefers the newer MAVn_ parameters when the vehicle has them', () => {
    const get = lookup({ MAV0_EXTRA1: 4, SR0_EXTRA1: 4 });
    expect(rateScheme(get, 0)).toBe('MAV');
    expect(rateParamName(get, 0, 'EXTRA1')).toBe('MAV0_EXTRA1');
  });

  it('falls back to SRn_ on older firmware', () => {
    const get = lookup({ SR1_EXTRA1: 4 });
    expect(rateScheme(get, 1)).toBe('SR');
    expect(rateParamName(get, 1, 'EXTRA1')).toBe('SR1_EXTRA1');
  });

  it('returns null rather than a name that would fail to write', () => {
    const get = lookup({ SR0_EXTRA1: 4 });
    expect(rateParamName(get, 0, 'NOT_A_GROUP')).toBeNull();
    expect(rateScheme(get, 3)).toBeNull();
  });

  it('reads only the groups the vehicle exposes', () => {
    const rates = readRates(lookup({ SR0_EXTRA1: 10, SR0_POSITION: 3 }), 0);
    expect(rates).toEqual({ attitude: 10, position: 3 });
  });
});

describe('bandwidth', () => {
  it('costs a group at its byte size times its rate', () => {
    const attitude = RATE_GROUPS.find((g) => g.id === 'attitude')!;
    expect(bandwidthCost({ attitude: 10 })).toBe(10 * attitude.bytesPerCycle + 30);
  });

  it('ignores groups that are off', () => {
    expect(bandwidthCost({ attitude: 0, rc: 0 })).toBe(30);
  });

  it('turns a baud rate into usable bytes per second', () => {
    expect(serialCapacity(57600)).toBe(5760);
    expect(serialCapacity(null)).toBeNull();
  });

  it('shows a 57600 radio cannot carry 10Hz attitude plus 3Hz position', () => {
    const cost = bandwidthCost({ attitude: 10, position: 3, status: 2, vfr: 4 });
    expect(cost).toBeGreaterThan(1000);
    expect(cost).toBeLessThan(serialCapacity(57600)!);
  });
});
