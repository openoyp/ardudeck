/**
 * Column storage for a parsed flight log.
 *
 * A 200 MB dataflash file holds millions of messages. As one JS object per
 * message ({ type, timeUs, fields: {...} }) that is gigabytes of heap and a
 * structured clone the renderer stalls on for seconds. Stored as one typed
 * array per field it is a few hundred MB, clones by reference and reads without
 * touching the allocator.
 *
 * `logRows` rebuilds the old object shape for the panels that walk small
 * message types (events, params, mode changes), where the convenience is worth
 * more than the memory. It caches per log, so the cost is paid once and only
 * for types that are actually read.
 */

export interface LogColumns {
  count: number;
  /** Microseconds, one per message. */
  timeUs: Float64Array;
  /** Numeric fields, each the same length as `timeUs`. */
  num: Record<string, Float64Array>;
  /** String fields (MSG text, mode names). */
  txt: Record<string, string[]>;
}

export interface LogRow {
  type: string;
  timeUs: number;
  fields: Record<string, number | string>;
}

interface ColumnHost {
  messages: Record<string, LogColumns>;
}

const rowCache = new WeakMap<object, Map<string, LogRow[]>>();

/** Field names of a message type, numeric first, in insertion order. */
export function fieldNames(cols: LogColumns): string[] {
  return [...Object.keys(cols.num), ...Object.keys(cols.txt)];
}

/** Numeric field names only: what a chart can plot. */
export function numericFieldNames(cols: LogColumns): string[] {
  return Object.keys(cols.num);
}

/** How many messages of this type the log holds. */
export function logCount(log: ColumnHost | null | undefined, type: string): number {
  return log?.messages[type]?.count ?? 0;
}

/** One message as an object, for code that reads a handful of them. */
export function rowAt(cols: LogColumns, type: string, i: number): LogRow {
  const fields: Record<string, number | string> = {};
  for (const [name, col] of Object.entries(cols.num)) fields[name] = col[i] ?? 0;
  for (const [name, col] of Object.entries(cols.txt)) fields[name] = col[i] ?? '';
  return { type, timeUs: cols.timeUs[i] ?? 0, fields };
}

/**
 * Every message of a type as objects. Materialised once per log and cached;
 * prefer the columns directly for anything that runs per frame or per point.
 */
export function logRows(log: ColumnHost | null | undefined, type: string): LogRow[] {
  if (!log) return [];
  const cols = log.messages[type];
  if (!cols) return [];
  let byType = rowCache.get(log);
  if (!byType) {
    byType = new Map();
    rowCache.set(log, byType);
  }
  const hit = byType.get(type);
  if (hit) return hit;
  const rows: LogRow[] = new Array(cols.count);
  for (let i = 0; i < cols.count; i++) rows[i] = rowAt(cols, type, i);
  byType.set(type, rows);
  return rows;
}

/** Columns from plain rows. Test fixtures and any caller that still has
 * objects in hand; the parser emits columns directly. */
export function columnsFromRows(rows: Array<{ type?: string; timeUs: number; fields: Record<string, number | string> }>): LogColumns {
  const count = rows.length;
  const timeUs = new Float64Array(count);
  const num: Record<string, Float64Array> = {};
  const txt: Record<string, string[]> = {};
  for (const row of rows) {
    for (const [name, value] of Object.entries(row.fields)) {
      if (typeof value === 'number') num[name] ??= new Float64Array(count);
      else txt[name] ??= new Array<string>(count).fill('');
    }
  }
  for (let i = 0; i < count; i++) {
    const row = rows[i]!;
    timeUs[i] = row.timeUs;
    for (const [name, col] of Object.entries(num)) {
      const v = row.fields[name];
      col[i] = typeof v === 'number' ? v : Number.NaN;
    }
    for (const [name, col] of Object.entries(txt)) {
      const v = row.fields[name];
      col[i] = typeof v === 'string' ? v : v === undefined ? '' : String(v);
    }
  }
  return { count, timeUs, num, txt };
}
