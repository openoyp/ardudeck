import { describe, it, expect, beforeEach } from 'vitest';
import {
  claimRcOverride,
  releaseRcOverride,
  rcOverrideOwner,
  setTrainerActive,
  isTrainerActive,
  onTrainerActive,
  resetRcArbiterForTest,
  TRAINER_OWNS_STICKS,
} from './rc-source-arbiter';

describe('rc source arbiter', () => {
  beforeEach(() => resetRcArbiterForTest());

  it('sliders and joystick are mutually exclusive, both directions', () => {
    expect(claimRcOverride('sliders').ok).toBe(true);
    expect(claimRcOverride('joystick').ok).toBe(false);
    releaseRcOverride('sliders');
    expect(claimRcOverride('joystick').ok).toBe(true);
    expect(claimRcOverride('sliders').ok).toBe(false);
  });

  it('re-claiming your own ownership is fine', () => {
    expect(claimRcOverride('joystick').ok).toBe(true);
    expect(claimRcOverride('joystick').ok).toBe(true);
  });

  it('release by a non-owner does nothing', () => {
    expect(claimRcOverride('sliders').ok).toBe(true);
    releaseRcOverride('joystick');
    expect(rcOverrideOwner()).toBe('sliders');
  });

  it('an active trainer refuses every claim with a plain reason', () => {
    setTrainerActive(true);
    expect(isTrainerActive()).toBe(true);
    expect(claimRcOverride('sliders')).toEqual({ ok: false, reason: TRAINER_OWNS_STICKS });
    expect(claimRcOverride('joystick')).toEqual({ ok: false, reason: TRAINER_OWNS_STICKS });
  });

  it('trainer start preempts the current owner and notifies listeners', () => {
    const events: boolean[] = [];
    onTrainerActive((a) => events.push(a));
    expect(claimRcOverride('joystick').ok).toBe(true);
    setTrainerActive(true);
    expect(rcOverrideOwner()).toBe(null);
    expect(events).toEqual([true]);
    setTrainerActive(false);
    expect(events).toEqual([true, false]);
    expect(rcOverrideOwner()).toBe(null);
    expect(claimRcOverride('sliders').ok).toBe(true);
  });

  it('duplicate trainer state changes do not re-notify', () => {
    const events: boolean[] = [];
    onTrainerActive((a) => events.push(a));
    setTrainerActive(true);
    setTrainerActive(true);
    expect(events).toEqual([true]);
  });
});
