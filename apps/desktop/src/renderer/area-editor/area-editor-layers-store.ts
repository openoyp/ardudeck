/**
 * area-editor-layers-store — base map layer + data overlay state for the Area
 * Editor's MapLibre surface. Kept separate from the geometry store so the
 * heavily-tested polygon model stays focused; this is purely view state.
 *
 * Mirrors the main app's map layer system (see shared/map-layers.ts and the
 * overlay set in components/map/overlays): the same base layers, plus the
 * raster/WMS overlays a pilot expects (Aviation = OpenAIP, Zones = DIPUL).
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { LayerKey } from '../../shared/map-layers';

/** Base layers offered in the editor — the planning-relevant subset of MAP_LAYERS. */
export const AREA_EDITOR_BASE_LAYERS: { key: LayerKey; label: string }[] = [
  { key: 'googleSat', label: '卫星' },
  { key: 'googleHybrid', label: '混合' },
  { key: 'bingSat', label: 'Bing 卫星' },
  { key: 'bingHybrid', label: 'Bing 混合' },
  { key: 'osm', label: '街道' },
  { key: 'terrain', label: '地形' },
  { key: 'dark', label: '深色' },
];

export type AreaEditorOverlayId = 'aviation' | 'zones' | 'wind' | 'traffic' | 'gliders';

export const AREA_EDITOR_OVERLAYS: { id: AreaEditorOverlayId; label: string; hint: string }[] = [
  { id: 'aviation', label: '航空', hint: 'OpenAIP 机场、导航台与空域(需要 OpenAIP 密钥)' },
  { id: 'zones', label: '空域', hint: 'DIPUL 德国无人机地理围栏(仅限德国)' },
  { id: 'wind', label: '风', hint: '动态预报风场(Open-Meteo)' },
  { id: 'traffic', label: '交通', hint: '实时 ADS-B 飞机' },
  { id: 'gliders', label: '滑翔机', hint: '实时 OGN/FLARM 滑翔机' },
];

interface LayersState {
  baseLayer: LayerKey;
  overlays: Record<AreaEditorOverlayId, boolean>;
  setBaseLayer: (key: LayerKey) => void;
  toggleOverlay: (id: AreaEditorOverlayId) => void;
}

export const useAreaEditorLayersStore = create<LayersState>()(
  subscribeWithSelector((set) => ({
    baseLayer: 'googleSat',
    overlays: { aviation: false, zones: false, wind: false, traffic: false, gliders: false },
    setBaseLayer: (key) => set({ baseLayer: key }),
    toggleOverlay: (id) =>
      set((s) => ({ overlays: { ...s.overlays, [id]: !s.overlays[id] } })),
  })),
);
