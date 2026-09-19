import { describe, it, expect } from 'vitest';
import { bitForPrearmText, isPrearmMessage, currentPrearmFailures } from './prearm-status';

describe('matching a refusal to its check', () => {
  // The three from a rover with no SD card and an uncalibrated board, which is
  // the exact case this was built for.
  it('maps the common refusals', () => {
    expect(bitForPrearmText('PreArm: Logging failed')).toBe(10);
    expect(bitForPrearmText('PreArm: Compass not calibrated')).toBe(2);
    expect(bitForPrearmText('PreArm: 3D Accel calibration needed')).toBe(4);
  });

  it('prefers the specific check over a general word', () => {
    expect(bitForPrearmText('PreArm: GPS configuration failed')).toBe(12);
    expect(bitForPrearmText('PreArm: Need 3D Fix')).toBe(3);
  });

  it('returns null rather than guessing', () => {
    expect(bitForPrearmText('PreArm: Something entirely new')).toBeNull();
  });

  it('knows which messages are refusals', () => {
    expect(isPrearmMessage('PreArm: Logging failed')).toBe(true);
    expect(isPrearmMessage('Arm: Throttle too high')).toBe(true);
    expect(isPrearmMessage('EKF3 IMU0 is using GPS')).toBe(false);
  });
});

describe('the live failure list', () => {
  const now = 1_000_000;

  it('deduplicates and strips the prefix', () => {
    const out = currentPrearmFailures([
      { text: 'PreArm: Logging failed', timestamp: now },
      { text: 'PreArm: Logging failed', timestamp: now - 500 },
    ], now);
    expect(out).toEqual([{ text: 'Logging failed', bit: 10 }]);
  });

  // A refusal fixed five minutes ago must not keep a row lit red.
  it('drops refusals that have gone stale', () => {
    expect(currentPrearmFailures([
      { text: 'PreArm: Compass not calibrated', timestamp: now - 300_000 },
    ], now)).toEqual([]);
  });

  it('keeps messages with no timestamp', () => {
    expect(currentPrearmFailures([{ text: 'PreArm: Battery below minimum' }], now)).toHaveLength(1);
  });

  it('ignores ordinary telemetry chatter', () => {
    expect(currentPrearmFailures([{ text: 'EKF3 IMU0 is using GPS', timestamp: now }], now)).toEqual([]);
  });
});
