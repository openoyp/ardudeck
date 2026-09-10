import type { ChannelMap } from './pseudo-tx';

/** UINT16_MAX in RC_CHANNELS_OVERRIDE = "leave this channel alone". */
export const OVERRIDE_IGNORE = 65535;

export const OVERRIDE_CHANNELS = 18;

// Unmapped channels MUST stay OVERRIDE_IGNORE: 1500 or 0 there hijacks
// FLTMODE_CH and RCx_OPTION aux functions.
export function packOverrideChannels(channels: number[], mapping: ChannelMap[]): number[] {
  const out = new Array<number>(OVERRIDE_CHANNELS).fill(OVERRIDE_IGNORE);
  for (let i = 0; i < OVERRIDE_CHANNELS; i++) {
    const map = mapping[i];
    if (!map || map.source.kind === 'none') continue;
    const pwm = channels[i];
    if (pwm === undefined) continue;
    out[i] = Math.max(800, Math.min(2200, Math.round(pwm)));
  }
  return out;
}
