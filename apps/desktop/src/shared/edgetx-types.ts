/** Shared types for the EdgeTX radio SD-card package feature. */

export interface EdgeTxSdCard {
  volumePath: string;
  volumeName: string;
  sdCardVersion: string | null;
  freeBytes: number;
  hasWidgets: boolean;
  /** EdgeTX target name from RADIO/radio.yml (e.g. "pocket"), null if absent. */
  board: string | null;
  /** Firmware semver from RADIO/radio.yml, null if absent. */
  firmwareVersion: string | null;
  /** Screen variant implied by the board; null when the board is unknown. */
  suggestedVariantId: string | null;
  /** Human label for the detected radio, e.g. "RadioMaster Pocket". */
  radioLabel: string | null;
}

export interface RadioVariant {
  id: string;
  label: string;
  radios: string;
}

/** Catalog entry as exposed to the renderer (no mapping internals). */
export interface EdgeTxPackageInfo {
  id: string;
  name: string;
  description: string;
  homepage: string;
  license: string;
  variants: RadioVariant[];
}

export interface InstalledPackageRecord {
  version: string;
  variantId: string;
  installedAt: string;
  files: string[];
}

/** What install did to the card's models (monochrome radios only). */
export interface TelemetryScreenSummary {
  /** Models that now point a telemetry screen at the script. */
  added: number;
  /** Models that already had it. */
  already: number;
  /** Models whose four telemetry screens were all taken. */
  full: string[];
}

export interface InstallProgress {
  phase: 'resolve' | 'download' | 'extract' | 'copy' | 'done';
  percent: number;
  detail?: string;
}

export interface EdgeTxScanResult {
  cards: EdgeTxSdCard[];
  catalog: EdgeTxPackageInfo[];
  /** Installed records per volumePath, keyed by package id */
  installed: Record<string, Record<string, InstalledPackageRecord>>;
}
