/**
 * How the autopilot sits in the vehicle, drawn top-down.
 *
 * The vehicle outline is always the same way up with its nose at the top, so
 * the only thing that moves is the board: which way its printed arrow points,
 * whether it is lying on its back, and whether it stands on an edge. A picture
 * of the board alone cannot answer "forward relative to what".
 */

import { orientationRotation } from './board-orientation';

interface BoardGlyphProps {
  /** AHRS_ORIENTATION value. */
  value: number;
  size?: number;
  active?: boolean;
  /** Live attitude in degrees; tilts the vehicle outline so the glyph moves
   * with the machine on the bench. */
  roll?: number;
  pitch?: number;
}

export function BoardGlyph({ value, size = 56, active, roll = 0, pitch = 0 }: BoardGlyphProps): JSX.Element {
  const r = orientationRotation(value);
  // Both themes: the accent carries the meaning, never a fixed dark fill. A
  // near-black underside reads fine on dark and swallows the arrow on light.
  const accent = active ? '#a855f7' : 'var(--text-tertiary, #6b7280)';
  const faint = active ? 'rgba(168,85,247,0.16)' : 'rgba(100,116,139,0.14)';
  const hatchId = `svt-hatch-${value}${active ? '-a' : ''}`;
  const inverted = r.roll === 180 || r.pitch === 180;
  const onEdge = r.roll === 90 || r.roll === 270;
  const vertical = r.pitch === 90 || r.pitch === 270;
  // Yaw turns the board inside the vehicle; a board on its back has its arrow
  // mirrored left/right, which is exactly the trap this drawing has to show.
  const arrowTurn = (r.yaw + (r.pitch === 180 ? 180 : 0)) % 360;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      style={{ transform: `rotate(${(-roll * 0.3).toFixed(1)}deg) translateY(${(pitch * 0.12).toFixed(1)}px)`, transition: 'transform 200ms ease-out' }}
    >
      {/* Vehicle: nose marker at the top, body below. Fixed, it is the frame
          of reference. */}
      <path d="M50 6 L58 18 L42 18 Z" fill={accent} opacity={0.55} />
      <rect x="18" y="22" width="64" height="66" rx="10" fill="none" stroke={accent} strokeOpacity={0.45} strokeWidth="2" strokeDasharray="4 4" />

      {onEdge || vertical ? (
        // Standing up: seen from above the board is a bar, so show it edge-on
        // with the connector side marked.
        <g>
          <rect
            x={onEdge ? 44 : 30}
            y={onEdge ? 32 : 46}
            width={onEdge ? 12 : 40}
            height={onEdge ? 46 : 12}
            rx="3"
            fill={faint}
            stroke={accent}
            strokeWidth="2.5"
          />
          <g transform={`rotate(${onEdge ? (r.roll === 90 ? 90 : 270) : (r.pitch === 90 ? 180 : 0)} 50 55)`}>
            <path d="M50 34 L57 48 L52.5 48 L52.5 62 L47.5 62 L47.5 48 L43 48 Z" fill={accent} />
          </g>
        </g>
      ) : (
        <g>
          {/* Upside down reads as a hatched underside with its pin header and a
              hollow arrow, which works on either theme; a dark fill did not. */}
          {inverted && (
            <defs>
              <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={faint} />
                <line x1="0" y1="0" x2="0" y2="6" stroke={accent} strokeWidth="1.6" opacity="0.5" />
              </pattern>
            </defs>
          )}
          <rect
            x="30"
            y="36"
            width="40"
            height="40"
            rx="5"
            fill={inverted ? `url(#${hatchId})` : faint}
            stroke={accent}
            strokeWidth="2.5"
            strokeDasharray={inverted ? '5 3' : undefined}
          />
          {inverted && [36, 44, 52, 60].map((x) => (
            <rect key={x} x={x} y="66" width="3" height="6" rx="1" fill={accent} opacity={0.8} />
          ))}
          <g transform={`rotate(${arrowTurn} 50 54)`}>
            <path
              d="M50 38 L59 52 L53.5 52 L53.5 68 L46.5 68 L46.5 52 L41 52 Z"
              fill={inverted ? 'var(--bg-surface-solid, #ffffff)' : accent}
              stroke={accent}
              strokeWidth={inverted ? 2.5 : 0}
              strokeLinejoin="round"
            />
          </g>
        </g>
      )}
    </svg>
  );
}
