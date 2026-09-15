// DOM side of auto-arrange: measure wrappers + chrome, run the pure arranger,
// glide widgets there via the drag hook's arrange event (no remount).
import { ARRANGE_EVENT, writeOverlayPosPayload, clearOverlayPosPayload, readOverlayPosPayload, type ArrangeEventDetail } from '../useDraggableOverlay';
import { computeArrangement, toAnchorPayload, groupSemantics, type ArrangeItem, type Rect } from './auto-arrange';
import { useMapInstrumentsStore, resolveInstrumentVisible } from '../../../stores/map-instruments-store';
import { MAP_INSTRUMENTS } from './registry';
import { GROUP_KEY_PREFIX, groupOverlayKey } from './dock-groups';

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
  const groupWrappers = Array.from(document.querySelectorAll<HTMLElement>('[data-dock-group-id]'));
  if (wrappers.length === 0 && groupWrappers.length === 0) return { arranged: 0 };
  const container = (wrappers[0] ?? groupWrappers[0])!.offsetParent as HTMLElement | null;
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
  // Each docked group arranges as ONE item under its strongest member's
  // semantics; members are not in the DOM individually.
  for (const el of groupWrappers) {
    const gid = el.dataset.dockGroupId!;
    const group = store.groups[gid];
    if (!group) continue;
    const r = relRect(el, containerRect);
    if (r.w <= 0 || r.h <= 0) continue;
    items.push({ id: GROUP_KEY_PREFIX + gid, size: { w: r.w, h: r.h }, variant: 'group', sem: groupSemantics(group.members) });
  }
  if (items.length === 0) return { arranged: 0 };

  // Chrome (toolbars, menus) lives at the PANEL level while the instruments
  // host is the map half, so scan the document and keep what overlaps the
  // container; on split this also drops second-surface chrome.
  const chrome: Rect[] = Array.from(document.querySelectorAll('[data-arrange-chrome]'))
    .map((el) => relRect(el, containerRect))
    .filter((r) => r.x < panel.w && r.x + r.w > 0 && r.y < panel.h && r.y + r.h > 0);

  // Snapshot BEFORE moving anything, so one step of undo exists.
  const snapshot: Record<string, unknown | null> = {};
  for (const def of MAP_INSTRUMENTS) {
    const key = 'instrument:' + def.id;
    snapshot[key] = readOverlayPosPayload(key);
  }
  for (const gid of Object.keys(store.groups)) {
    const key = groupOverlayKey(gid);
    snapshot[key] = readOverlayPosPayload(key);
  }
  store.setArrangeSnapshot(snapshot);

  const { placements } = computeArrangement(items, panel, chrome);
  for (const [id, pos] of placements) {
    const item = items.find((i) => i.id === id)!;
    const anchor = toAnchorPayload(panel, item.size, pos);
    const key = id.startsWith(GROUP_KEY_PREFIX)
      ? groupOverlayKey(id.slice(GROUP_KEY_PREFIX.length))
      : 'instrument:' + id;
    writeOverlayPosPayload(key, anchor);
    window.dispatchEvent(new CustomEvent(ARRANGE_EVENT, { detail: { key, anchor } }));
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
