// DOM side of auto-arrange: measure wrappers + chrome, run the pure arranger,
// glide widgets there via the drag hook's arrange event (no remount).
import { ARRANGE_EVENT, writeOverlayPosPayload, clearOverlayPosPayload, readOverlayPosPayload, type ArrangeEventDetail } from '../useDraggableOverlay';
import { computeArrangement, toAnchorPayload, type ArrangeItem, type Rect } from './auto-arrange';
import { useMapInstrumentsStore, resolveInstrumentVisible } from '../../../stores/map-instruments-store';
import { MAP_INSTRUMENTS } from './registry';

function relRect(el: Element, container: DOMRect): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left - container.left, y: r.top - container.top, w: r.width, h: r.height };
}

function isAnchorPayload(p: unknown): p is ArrangeEventDetail['anchor'] {
  const o = p as Record<string, unknown> | null;
  return !!o && typeof o === 'object' && typeof o.dx === 'number' && typeof o.dy === 'number'
    && typeof o.ax === 'string' && typeof o.ay === 'string' && o.v === 4;
}

export function runAutoArrange(): { arranged: number } {
  const wrappers = Array.from(document.querySelectorAll<HTMLElement>('[data-instrument-id]'));
  if (wrappers.length === 0) return { arranged: 0 };
  const container = wrappers[0]!.offsetParent as HTMLElement | null;
  if (!container) return { arranged: 0 };
  const containerRect = container.getBoundingClientRect();
  const panel = { w: container.clientWidth, h: container.clientHeight };

  const store = useMapInstrumentsStore.getState();
  const items: ArrangeItem[] = [];
  for (const el of wrappers) {
    const id = el.dataset.instrumentId!;
    if (!resolveInstrumentVisible(store.visible, id)) continue;
    const r = relRect(el, containerRect);
    if (r.w <= 0 || r.h <= 0) continue;
    items.push({ id, size: { w: r.w, h: r.h }, variant: store.displayMode[id] ?? 'analog' });
  }
  if (items.length === 0) return { arranged: 0 };

  const chrome: Rect[] = Array.from(container.querySelectorAll('[data-arrange-chrome]')).map((el) =>
    relRect(el, containerRect),
  );

  // Snapshot BEFORE moving anything, so one step of undo exists.
  const snapshot: Record<string, unknown | null> = {};
  for (const def of MAP_INSTRUMENTS) {
    const key = 'instrument:' + def.id;
    snapshot[key] = readOverlayPosPayload(key);
  }
  store.setArrangeSnapshot(snapshot);

  const { placements } = computeArrangement(items, panel, chrome);
  for (const [id, pos] of placements) {
    const item = items.find((i) => i.id === id)!;
    const anchor = toAnchorPayload(panel, item.size, pos);
    writeOverlayPosPayload('instrument:' + id, anchor);
    window.dispatchEvent(new CustomEvent(ARRANGE_EVENT, { detail: { key: 'instrument:' + id, anchor } }));
  }
  return { arranged: placements.size };
}

export function restorePreviousLayout(): boolean {
  const store = useMapInstrumentsStore.getState();
  const snapshot = store.arrangeSnapshot;
  if (!snapshot) return false;
  let needRemount = false;
  for (const [key, payload] of Object.entries(snapshot)) {
    if (payload === null) {
      clearOverlayPosPayload(key);
      needRemount = true;
    } else if (isAnchorPayload(payload)) {
      writeOverlayPosPayload(key, payload);
      window.dispatchEvent(new CustomEvent(ARRANGE_EVENT, { detail: { key, anchor: payload } }));
    } else {
      writeOverlayPosPayload(key, payload);
      needRemount = true;
    }
  }
  store.clearArrangeSnapshot();
  if (needRemount) store.bumpLayoutRev();
  return true;
}
