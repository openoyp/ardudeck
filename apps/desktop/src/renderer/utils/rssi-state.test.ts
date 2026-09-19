import { describe, it, expect } from 'vitest';
import { rssiState, rssiText, rssiHint } from './rssi-state';

const base = { connected: true, rcRssi: 255, chancount: 0, modemRssi: null };

describe('reading RSSI', () => {
  it('reports a real receiver reading as a percentage', () => {
    expect(rssiState({ ...base, rcRssi: 254, chancount: 8 }))
      .toEqual({ kind: 'value', pct: 100, fromModem: false });
    expect(rssiState({ ...base, rcRssi: 127, chancount: 8 }).pct).toBe(50);
  });

  // The whole point: a link that is delivering 8 channels while reporting zero
  // strength is a parameter problem, not a fading radio.
  it('calls a live link with zero strength unconfigured, not 0%', () => {
    const s = rssiState({ ...base, rcRssi: 0, chancount: 8 });
    expect(s.kind).toBe('unconfigured');
    expect(rssiText(s)).toBe('--');
    expect(rssiHint(s)).toContain('RSSI_TYPE');
  });

  it('treats 255 as reporting switched off', () => {
    expect(rssiState({ ...base, rcRssi: 255, chancount: 8 }).kind).toBe('off');
  });

  it('falls back to the telemetry modem when the receiver has nothing', () => {
    const s = rssiState({ ...base, rcRssi: 0, chancount: 8, modemRssi: 200 });
    expect(s).toEqual({ kind: 'value', pct: 79, fromModem: true });
  });

  it('says no link before anything else', () => {
    expect(rssiState({ ...base, connected: false, rcRssi: 200, chancount: 8 }).kind).toBe('no-link');
  });

  it('has no hint when there is a number to show', () => {
    expect(rssiHint(rssiState({ ...base, rcRssi: 200, chancount: 8 }))).toBeNull();
  });
});
