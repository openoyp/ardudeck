/**
 * contact-popup — builds the detail HTML shown when a contact is clicked.
 *
 * Colours come from the app's themed CSS variables (var(--text-*)) so the popup
 * is readable in both light and dark mode; the Leaflet wrapper itself is themed
 * via the `.traffic-popup` rules in globals.css. A small dot encodes the contact's
 * altitude band colour, tying the popup to the map icon.
 */

import type { TrafficContact } from '../../../../shared/traffic-types';
import type { ProximityResult } from './proximity';
import { ALT_STATE_COLOR, CATEGORY_LABEL, altitudeColorState, type AltitudeBand } from './contact-style';

function row(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;gap:14px;line-height:1.7">
    <span style="color:var(--text-secondary)">${label}</span>
    <span style="color:var(--text-primary);font-variant-numeric:tabular-nums">${value}</span>
  </div>`;
}

const MS_TO_KT = 1.94384;
const M_TO_FT = 1 / 0.3048;
const MS_TO_FPM = 1 / 0.00508;

export function buildContactPopup(
  c: TrafficContact,
  prox: ProximityResult | null,
  nowMs: number,
  band: AltitudeBand,
): string {
  const title = c.callsign || c.registration || c.id;
  // Lead with what the thing IS in plain words; the raw type code and data
  // source come after (B412 alone means nothing to most operators).
  const sourceLabel = c.source === 'ogn' ? 'OGN' : c.source === 'remoteid' ? 'Remote ID' : 'ADS-B';
  const sub = [CATEGORY_LABEL[c.category], c.model, c.registration, sourceLabel]
    .filter(Boolean).join(' • ');
  const color = ALT_STATE_COLOR[altitudeColorState(c, band)];

  const rows: string[] = [];
  if (c.altMeters != null) rows.push(row('高度', `${Math.round(c.altMeters * M_TO_FT).toLocaleString()} ft`));
  if (c.onGround) rows.push(row('状态', '在地面'));
  if (c.groundSpeedMps != null) rows.push(row('地速', `${Math.round(c.groundSpeedMps * MS_TO_KT)} kt`));
  if (c.trackDeg != null) rows.push(row('航迹', `${Math.round(c.trackDeg)}°`));
  if (c.verticalRateMps != null && Math.abs(c.verticalRateMps) > 0.05)
    rows.push(row('垂直速度', `${c.verticalRateMps > 0 ? '+' : ''}${Math.round(c.verticalRateMps * MS_TO_FPM)} fpm`));
  if (c.squawk) rows.push(row('应答机', c.squawk));
  if (prox) {
    rows.push(row('距离', `${(prox.distanceMeters / 1000).toFixed(1)} km`));
    rows.push(row('方位', `${Math.round(prox.bearingDeg)}°`));
    if (prox.verticalMeters != null) rows.push(row('垂直间隔', `${Math.round(prox.verticalMeters * M_TO_FT).toLocaleString()} ft`));
  }
  rows.push(row('时延', `${Math.max(0, Math.round((nowMs - c.lastSeen) / 1000))}s`));

  return `<div style="min-width:190px;font-size:12px">
    <div style="display:flex;align-items:center;gap:7px">
      <span style="width:9px;height:9px;border-radius:50%;background:${color};flex:none;box-shadow:0 0 6px ${color}"></span>
      <span style="font-weight:600;color:var(--text-primary);font-size:13px">${title}</span>
    </div>
    <div style="color:var(--text-secondary);font-size:11px;margin:2px 0 7px 16px">${sub}</div>
    ${rows.join('')}
  </div>`;
}
