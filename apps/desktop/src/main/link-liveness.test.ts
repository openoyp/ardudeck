import { describe, it, expect } from 'vitest';
import {
  evaluateLinkLiveness,
  LINK_STALE_MS,
  LINK_DEAD_MS,
  HEARTBEAT_QUIET_MS,
} from './link-liveness';

const base = 1_000_000;

describe('evaluateLinkLiveness', () => {
  it('frames flowing with no heartbeat stays alive, flags heartbeatQuiet', () => {
    const v = evaluateLinkLiveness({
      nowMs: base + HEARTBEAT_QUIET_MS + 1000,
      lastTrafficMs: base + HEARTBEAT_QUIET_MS + 500,
      lastHeartbeatMs: base,
    });
    expect(v.stale).toBe(false);
    expect(v.dead).toBe(false);
    expect(v.heartbeatQuiet).toBe(true);
  });

  it('fresh heartbeat and traffic is fully alive', () => {
    const v = evaluateLinkLiveness({ nowMs: base + 500, lastTrafficMs: base, lastHeartbeatMs: base });
    expect(v).toMatchObject({ stale: false, dead: false, heartbeatQuiet: false });
  });

  it('total silence past the stale window marks stale but not dead', () => {
    const v = evaluateLinkLiveness({
      nowMs: base + LINK_STALE_MS,
      lastTrafficMs: base,
      lastHeartbeatMs: base,
    });
    expect(v.stale).toBe(true);
    expect(v.dead).toBe(false);
  });

  it('stale suppresses the heartbeatQuiet diagnostic', () => {
    const v = evaluateLinkLiveness({
      nowMs: base + LINK_STALE_MS + 1,
      lastTrafficMs: base,
      lastHeartbeatMs: base - HEARTBEAT_QUIET_MS,
    });
    expect(v.stale).toBe(true);
    expect(v.heartbeatQuiet).toBe(false);
  });

  it('total silence past the dead window disconnects', () => {
    const v = evaluateLinkLiveness({
      nowMs: base + LINK_DEAD_MS,
      lastTrafficMs: base,
      lastHeartbeatMs: base,
    });
    expect(v.dead).toBe(true);
  });

  it('a single fresh frame rescues a link one tick from death', () => {
    const v = evaluateLinkLiveness({
      nowMs: base + LINK_DEAD_MS,
      lastTrafficMs: base + LINK_DEAD_MS - 100,
      lastHeartbeatMs: base,
    });
    expect(v.stale).toBe(false);
    expect(v.dead).toBe(false);
  });

  it('silence is clamped at zero for clock skew', () => {
    const v = evaluateLinkLiveness({ nowMs: base, lastTrafficMs: base + 500, lastHeartbeatMs: base + 500 });
    expect(v.silenceMs).toBe(0);
  });
});
