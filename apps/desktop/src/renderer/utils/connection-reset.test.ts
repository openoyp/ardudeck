import { describe, it, expect } from 'vitest';
import {
  shouldResetStoresOnDisconnect,
  vehicleIdentityOf,
  isNewVehicleIdentity,
} from './connection-reset';

describe('shouldResetStoresOnDisconnect', () => {
  it('auto-reconnect drop keeps the stores', () => {
    expect(
      shouldResetStoresOnDisconnect({ isConnected: false, isReconnecting: true }, false),
    ).toBe(false);
  });

  it('manual disconnect wipes', () => {
    expect(
      shouldResetStoresOnDisconnect({ isConnected: false, isReconnecting: false }, false),
    ).toBe(true);
  });

  it('platform change in progress keeps the stores', () => {
    expect(shouldResetStoresOnDisconnect({ isConnected: false }, true)).toBe(false);
  });

  it('still connected or waiting never wipes', () => {
    expect(shouldResetStoresOnDisconnect({ isConnected: true }, false)).toBe(false);
    expect(
      shouldResetStoresOnDisconnect({ isConnected: false, isWaitingForHeartbeat: true }, false),
    ).toBe(false);
  });
});

describe('vehicle identity', () => {
  const base = { isConnected: true, systemId: 1, vehicleType: 'Quadrotor', fcVariant: 'ArduPilot' };

  it('same vehicle across a reconnect is not new', () => {
    const prev = vehicleIdentityOf(base);
    const next = vehicleIdentityOf({ ...base });
    expect(isNewVehicleIdentity(prev, next)).toBe(false);
  });

  it('a different sysid is a new vehicle', () => {
    const prev = vehicleIdentityOf(base);
    const next = vehicleIdentityOf({ ...base, systemId: 2 });
    expect(isNewVehicleIdentity(prev, next)).toBe(true);
  });

  it('boardUid dominates the tuple', () => {
    const prev = vehicleIdentityOf({ ...base, boardUid: 'aa11' });
    const same = vehicleIdentityOf({ ...base, systemId: 9, boardUid: 'aa11' });
    const other = vehicleIdentityOf({ ...base, boardUid: 'bb22' });
    expect(isNewVehicleIdentity(prev, same)).toBe(false);
    expect(isNewVehicleIdentity(prev, other)).toBe(true);
  });

  it('unknown identity never triggers a wipe', () => {
    expect(isNewVehicleIdentity(null, 'sys:1::')).toBe(false);
    expect(isNewVehicleIdentity('sys:1::', null)).toBe(false);
    expect(vehicleIdentityOf({ isConnected: false, systemId: 1 })).toBe(null);
    expect(vehicleIdentityOf({ isConnected: true })).toBe(null);
  });
});
