import { describe, it, expect } from 'vitest';
import { commitValue, resolveBlur } from '../useNumericDraft';

describe('commitValue', () => {
  it('parses plain numbers', () => {
    expect(commitValue('50')).toBe(50);
    expect(commitValue('-3.5')).toBe(-3.5);
  });

  it('returns null for transients and garbage', () => {
    expect(commitValue('')).toBeNull();
    expect(commitValue('   ')).toBeNull();
    expect(commitValue('-')).toBeNull();
    expect(commitValue('12.')).toBe(12);
    expect(commitValue('abc')).toBeNull();
  });

  it('clamps on commit, not per keystroke', () => {
    expect(commitValue('500', { min: 1, max: 100 })).toBe(100);
    expect(commitValue('-500', { min: 1, max: 100 })).toBe(1);
    expect(commitValue('50', { min: 1, max: 100 })).toBe(50);
  });

  it('rounds when integer is set', () => {
    expect(commitValue('4.6', { integer: true })).toBe(5);
    expect(commitValue('4.4', { integer: true })).toBe(4);
  });
});

describe('resolveBlur', () => {
  it('commits a changed valid draft (clear-then-type-50 flow)', () => {
    expect(resolveBlur('50', 0, false, 0)).toEqual({ display: '50', commit: 50 });
  });

  it('empty draft reverts to canonical without committing', () => {
    expect(resolveBlur('', 25, false, 25)).toEqual({ display: '25', commit: null });
  });

  it('transient minus reverts without committing', () => {
    expect(resolveBlur('-', 10, false, 10)).toEqual({ display: '10', commit: null });
  });

  it('unchanged value does not re-commit', () => {
    expect(resolveBlur('25', 25, false, 25)).toEqual({ display: '25', commit: null });
  });

  it('clamps the committed value and displays the clamp', () => {
    expect(resolveBlur('999', 10, false, 10, { min: 0, max: 100 })).toEqual({
      display: '100',
      commit: 100,
    });
  });

  it('escape restores the pre-edit value without committing when nothing changed', () => {
    expect(resolveBlur('77', 25, true, 25)).toEqual({ display: '25', commit: null });
  });

  it('escape after a live commit writes the pre-edit value back', () => {
    expect(resolveBlur('77', 77, true, 25)).toEqual({ display: '25', commit: 25 });
  });
});
