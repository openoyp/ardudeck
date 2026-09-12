// Focused = free string draft; clamped parse commits on blur/Enter; Escape reverts.

import { useEffect, useRef, useState } from 'react';
import type React from 'react';

export interface NumericDraftOptions {
  min?: number;
  max?: number;
  /** Round the committed value to the nearest integer. */
  integer?: boolean;
  /** Also commit clean parses while typing (live previews); transients never commit. */
  live?: boolean;
}

export interface NumericDraftProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/** Parse and clamp a draft; null when it does not represent a number. */
export function commitValue(draft: string, opts: NumericDraftOptions = {}): number | null {
  if (draft.trim() === '') return null;
  const parsed = Number(draft);
  if (!Number.isFinite(parsed)) return null;
  let v = opts.integer ? Math.round(parsed) : parsed;
  if (opts.min !== undefined) v = Math.max(opts.min, v);
  if (opts.max !== undefined) v = Math.min(opts.max, v);
  return v;
}

/** Blur outcome: what the field should display, and what (if anything) to commit. */
export function resolveBlur(
  draft: string,
  canonical: number,
  escaped: boolean,
  preEdit: number,
  opts: NumericDraftOptions = {},
): { display: string; commit: number | null } {
  if (escaped) {
    return { display: String(preEdit), commit: preEdit !== canonical ? preEdit : null };
  }
  const v = commitValue(draft, opts);
  if (v === null) return { display: String(canonical), commit: null };
  return { display: String(v), commit: v !== canonical ? v : null };
}

export interface DraftNumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'>,
    NumericDraftOptions {
  value: number;
  onCommit: (v: number) => void;
}

/** `<input type="number">` bound through useNumericDraft; usable inside loops. */
export function DraftNumberInput({
  value,
  onCommit,
  min,
  max,
  integer,
  live,
  ...rest
}: DraftNumberInputProps): JSX.Element {
  const draft = useNumericDraft(value, onCommit, { min, max, integer, live });
  return <input type="number" min={min} max={max} {...rest} {...draft} />;
}

export function useNumericDraft(
  value: number,
  onCommit: (v: number) => void,
  opts: NumericDraftOptions = {},
): NumericDraftProps {
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);
  const escapedRef = useRef(false);
  const preEditRef = useRef(value);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return {
    value: focused ? draft : String(value),
    onFocus: () => {
      preEditRef.current = value;
      escapedRef.current = false;
      setDraft(String(value));
      setFocused(true);
    },
    onChange: (e) => {
      const next = e.target.value;
      setDraft(next);
      if (optsRef.current.live) {
        const v = commitValue(next, optsRef.current);
        if (v !== null) commitRef.current(v);
      }
    },
    onBlur: () => {
      setFocused(false);
      const escaped = escapedRef.current;
      escapedRef.current = false;
      const { display, commit } = resolveBlur(draft, value, escaped, preEditRef.current, optsRef.current);
      setDraft(display);
      if (commit !== null) commitRef.current(commit);
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        escapedRef.current = true;
        e.currentTarget.blur();
      }
    },
  };
}
