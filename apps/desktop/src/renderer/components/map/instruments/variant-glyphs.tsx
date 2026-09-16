/** Tiny preview glyphs for the instrument display variants (shared by the
 * per-instrument config popover and the group display switch). */
// A tiny glyph previewing each display variant, so the picker shows what each
// mode looks like rather than just naming it.
export function variantGlyph(id: string): JSX.Element {
  const p = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none' } as const;
  switch (id) {
    case 'analog':
      return (<svg {...p}><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.4" /><path d="M10 10L13 6.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="10" cy="10" r="1.1" fill="currentColor" /></svg>);
    case 'numeric':
      return (<svg {...p}><rect x="3" y="5.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.3" /><text x="10" y="12.6" fontSize="7.5" fontWeight="700" textAnchor="middle" fill="currentColor" fontFamily="monospace">12</text></svg>);
    case 'strip':
      return (<svg {...p}><g fill="currentColor"><rect x="2.5" y="8.4" width="2.3" height="3.2" rx=".6" /><rect x="5.6" y="8.4" width="2.3" height="3.2" rx=".6" /><rect x="8.7" y="8.4" width="2.3" height="3.2" rx=".6" /><rect x="11.8" y="8.4" width="2.3" height="3.2" rx=".6" opacity=".38" /><rect x="14.9" y="8.4" width="2.3" height="3.2" rx=".6" opacity=".38" /></g></svg>);
    case 'cell':
      return (<svg {...p}><rect x="5.5" y="3.5" width="9" height="13" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="M7.8 13.5H12.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
    case 'inline':
      return (<svg {...p}><rect x="3" y="8" width="14" height="4" rx="2" stroke="currentColor" strokeWidth="1.2" /><rect x="3.9" y="8.9" width="7" height="2.2" rx="1.1" fill="currentColor" /></svg>);
    case 'compact':
      return (<svg {...p}><rect x="3" y="7" width="4.2" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" /><rect x="8.2" y="7" width="4.2" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" /><rect x="13.4" y="7" width="3.6" height="6" rx="1.2" fill="currentColor" /></svg>);
    case 'bar':
      return (<svg {...p}><rect x="3.5" y="7" width="5.5" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" /><rect x="10.5" y="7" width="6" height="6" rx="1.2" fill="currentColor" /></svg>);
    default:
      return (<svg {...p}><circle cx="10" cy="10" r="2.6" fill="currentColor" /></svg>);
  }
}
