/**
 * Points EdgeTX models at the ArduDeck telemetry script.
 *
 * Monochrome radios have no widget system, so an installed script stays
 * invisible until a model's telemetry Display screen names it - per model,
 * not globally. EdgeTX keeps those screens in MODELS/*.yml on the card, so
 * install writes the entry itself and the radio needs no setup at all.
 *
 * The serialisation below is lifted byte-for-byte from a model file the
 * radio wrote after the screen was set by hand (CRLF, 3-space indent, a
 * trailing space after every key that opens a map) - never invented.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

/** Monochrome EdgeTX targets expose four telemetry screens per model. */
const MAX_SCREENS = 4;

export type ModelScreenStatus = 'added' | 'already' | 'full' | 'removed' | 'absent';

export interface ModelScreenResult {
  file: string;
  name: string;
  status: ModelScreenStatus;
  slot?: number;
}

function detectEol(raw: string): string {
  return raw.includes('\r\n') ? '\r\n' : '\n';
}

/** Model display name lives in the `header:` map at the top of the file. */
function modelName(raw: string): string {
  return raw.match(/^\s+name:\s*"(.*)"/m)?.[1] ?? '';
}

function screenEntry(slot: number, script: string): string[] {
  return [
    `   ${slot}:`,
    '      type: SCRIPT',
    '      u: ',
    '         script: ',
    `            file: "${script}"`,
  ];
}

/** Line range [start, end) of the `screens:` block body, or null. */
function screensBlock(lines: string[]): { header: number; start: number; end: number } | null {
  const header = lines.findIndex((l) => /^screens:\s*$/.test(l));
  if (header < 0) return null;
  let end = header + 1;
  while (end < lines.length && (lines[end]!.startsWith(' ') || lines[end]!.trim() === '')) end++;
  return { header, start: header + 1, end };
}

/** Slot indices already in use, in file order. */
function usedSlots(lines: string[], start: number, end: number): number[] {
  const slots: number[] = [];
  for (let i = start; i < end; i++) {
    const m = lines[i]!.match(/^ {3}(\d+):\s*$/);
    if (m) slots.push(Number(m[1]));
  }
  return slots;
}

/** Line index where slot `n` starts, or -1. */
function slotLine(lines: string[], start: number, end: number, n: number): number {
  for (let i = start; i < end; i++) {
    if (new RegExp(`^ {3}${n}:\\s*$`).test(lines[i]!)) return i;
  }
  return -1;
}

function addToModel(raw: string, script: string): { raw: string; status: ModelScreenStatus; slot?: number } {
  const eol = detectEol(raw);
  const lines = raw.split(/\r?\n/);
  const block = screensBlock(lines);

  if (!block) {
    // No telemetry screens at all: write the block where the radio writes
    // it, immediately before `view:`.
    const anchor = lines.findIndex((l) => /^view:/.test(l));
    const at = anchor >= 0 ? anchor : lines.length;
    lines.splice(at, 0, 'screens: ', ...screenEntry(0, script));
    return { raw: lines.join(eol), status: 'added', slot: 0 };
  }

  const body = lines.slice(block.start, block.end).join('\n');
  if (body.includes(`file: "${script}"`)) return { raw, status: 'already' };

  const used = usedSlots(lines, block.start, block.end);
  let free = -1;
  for (let n = 0; n < MAX_SCREENS; n++) {
    if (!used.includes(n)) { free = n; break; }
  }
  if (free < 0) return { raw, status: 'full' };

  // Keep slots in ascending order: insert before the first higher slot.
  const next = used.filter((n) => n > free).sort((a, b) => a - b)[0];
  const at = next === undefined ? block.end : slotLine(lines, block.start, block.end, next);
  lines.splice(at, 0, ...screenEntry(free, script));
  return { raw: lines.join(eol), status: 'added', slot: free };
}

function removeFromModel(raw: string, script: string): { raw: string; status: ModelScreenStatus } {
  const eol = detectEol(raw);
  const lines = raw.split(/\r?\n/);
  const block = screensBlock(lines);
  if (!block) return { raw, status: 'absent' };

  const slots = usedSlots(lines, block.start, block.end);
  for (const n of slots) {
    const at = slotLine(lines, block.start, block.end, n);
    if (at < 0) continue;
    // Slot body runs until the next slot line or the end of the block.
    let stop = at + 1;
    while (stop < block.end && !/^ {3}\d+:\s*$/.test(lines[stop]!)) stop++;
    if (!lines.slice(at, stop).join('\n').includes(`file: "${script}"`)) continue;
    lines.splice(at, stop - at);
    // An emptied block would leave a dangling `screens:` key; drop it too.
    const after = screensBlock(lines);
    if (after && usedSlots(lines, after.start, after.end).length === 0) {
      lines.splice(after.header, after.end - after.header);
    }
    return { raw: lines.join(eol), status: 'removed' };
  }
  return { raw, status: 'absent' };
}

async function modelFiles(volumePath: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(volumePath, 'MODELS'));
    return entries.filter((e) => e.toLowerCase().endsWith('.yml')).sort();
  } catch {
    return [];
  }
}

/** Add the script to every model that has a free telemetry screen. */
export async function addTelemetryScreen(volumePath: string, script: string): Promise<ModelScreenResult[]> {
  const out: ModelScreenResult[] = [];
  for (const file of await modelFiles(volumePath)) {
    const full = path.join(volumePath, 'MODELS', file);
    try {
      const raw = await readFile(full, 'utf8');
      const result = addToModel(raw, script);
      if (result.status === 'added') await writeFile(full, result.raw, 'utf8');
      out.push({ file, name: modelName(raw), status: result.status, slot: result.slot });
    } catch {
      // an unreadable model file is the radio's business, not ours; skip it
    }
  }
  return out;
}

/** Undo what addTelemetryScreen wrote, leaving every other screen alone. */
export async function removeTelemetryScreen(volumePath: string, script: string): Promise<ModelScreenResult[]> {
  const out: ModelScreenResult[] = [];
  for (const file of await modelFiles(volumePath)) {
    const full = path.join(volumePath, 'MODELS', file);
    try {
      const raw = await readFile(full, 'utf8');
      const result = removeFromModel(raw, script);
      if (result.status === 'removed') await writeFile(full, result.raw, 'utf8');
      out.push({ file, name: modelName(raw), status: result.status });
    } catch {
      // skip unreadable model files
    }
  }
  return out;
}

export const __test = { addToModel, removeFromModel };
