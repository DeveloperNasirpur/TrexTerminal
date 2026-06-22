// ═══════════════════════════════════════════════════════════════════
// SVG Icons for the trading terminal
// All icons are 18×18 stroke-based glyphs matching TradingView's
// light-line icon language. `currentColor` lets CSS drive the tint.
// ═══════════════════════════════════════════════════════════════════

// TradingView renders toolbar glyphs ~20px with a light ~1.3 stroke.
// Authoring stays on a 24-unit viewBox; only the rendered size and
// stroke weight change so every glyph carries TV's optical weight.
const s = {
  width: 22,
  height: 22,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  // Icons are decorative — the surrounding button carries the accessible
  // label — so hide the glyph from assistive tech and keep it out of the
  // tab order. (focusable=false stops IE/Edge giving SVGs a tab stop.)
  "aria-hidden": true as const,
  focusable: "false" as const,
};

export const IconCursor = () => (
  <svg {...s} viewBox="0 0 24 24"><path d="M5 3l14 8-6.5 1.5L11 19z"/><path d="M11 19l1.5-6.5"/></svg>
);

export const IconCrosshair = () => (
  <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
);

export const IconTrendline = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="1.4" fill="currentColor"/><circle cx="20" cy="4" r="1.4" fill="currentColor"/></svg>
);

export const IconHorizontal = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="2" y1="12" x2="22" y2="12"/><circle cx="8" cy="12" r="1.4" fill="currentColor"/></svg>
);

export const IconVertical = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22"/><circle cx="12" cy="8" r="1.4" fill="currentColor"/></svg>
);

export const IconRay = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="4" y1="18" x2="22" y2="6"/><circle cx="4" cy="18" r="1.4" fill="currentColor"/><polyline points="18,4 22,6 20,10"/></svg>
);

export const IconExtended = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="1" y1="20" x2="23" y2="4"/><circle cx="8" cy="15" r="1.4" fill="currentColor"/><circle cx="16" cy="9" r="1.4" fill="currentColor"/></svg>
);

export const IconFibonacci = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="3" y1="4" x2="21" y2="4"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="3" y1="16" x2="21" y2="16"/><line x1="3" y1="20" x2="21" y2="20"/></svg>
);

export const IconRectangle = () => (
  <svg {...s} viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>
);

export const IconText = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="6" y1="4" x2="18" y2="4"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>
);

export const IconArrow = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="14,5 19,5 19,10"/></svg>
);

export const IconMeasure = () => (
  <svg {...s} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3,2"/><line x1="8" y1="16" x2="16" y2="8"/><polyline points="12,8 16,8 16,12"/></svg>
);

export const IconTrash = () => (
  <svg {...s} viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
);

export const IconSettings = () => (
  <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
);

export const IconIndicator = () => (
  <svg {...s} viewBox="0 0 24 24"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
);

export const IconFullscreen = () => (
  <svg {...s} viewBox="0 0 24 24"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
);

export const IconCamera = () => (
  <svg {...s} viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
);

export const IconUndo = () => (
  <svg {...s} viewBox="0 0 24 24"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
);

export const IconRedo = () => (
  <svg {...s} viewBox="0 0 24 24"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.13-9.36L23 10"/></svg>
);

export const IconZoomIn = () => (
  <svg {...s} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
);

export const IconZoomOut = () => (
  <svg {...s} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
);

export const IconFitContent = () => (
  <svg {...s} viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
);

export const IconConnection = () => (
  <svg {...s} viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
);

export const IconLock = () => (
  <svg {...s} viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
);

export const IconUnlock = () => (
  <svg {...s} viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>
);

export const IconEye = () => (
  <svg {...s} viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);

export const IconEyeOff = () => (
  <svg {...s} viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);

export const IconX = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);

export const IconMinus = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

export const IconPlus = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

export const IconCandle = () => (
  <svg {...s} viewBox="0 0 24 24">
    <line x1="8" y1="2" x2="8" y2="6"/>
    <rect x="5" y="6" width="6" height="10" rx="0.5"/>
    <line x1="8" y1="16" x2="8" y2="22"/>
    <line x1="17" y1="4" x2="17" y2="8"/>
    <rect x="14" y="8" width="6" height="8" rx="0.5" fill="currentColor" fillOpacity="0.3"/>
    <line x1="17" y1="16" x2="17" y2="20"/>
  </svg>
);

export const IconServer = () => (
  <svg {...s} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
);

export const IconPlay = () => (
  <svg {...s} viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor" fillOpacity="0.3"/></svg>
);

export const IconMagnet = () => (
  <svg {...s} viewBox="0 0 24 24">
    <path d="M4 8C4 4.7 6.7 2 10 2h4c3.3 0 6 2.7 6 6v2h-4V8c0-1.1-.9-2-2-2h-4C8.9 6 8 6.9 8 8v2H4V8z"/>
    <rect x="4" y="10" width="4" height="8" rx="1"/>
    <rect x="16" y="10" width="4" height="8" rx="1"/>
    <line x1="6" y1="14" x2="6" y2="14.01" strokeWidth="2"/>
    <line x1="18" y1="14" x2="18" y2="14.01" strokeWidth="2"/>
  </svg>
);

export const IconPolyline = () => (
  <svg {...s} viewBox="0 0 24 24">
    <polyline points="3,18 8,6 13,16 18,4 22,12" />
    <circle cx="3" cy="18" r="1.4" fill="currentColor"/>
    <circle cx="8" cy="6" r="1.4" fill="currentColor"/>
    <circle cx="13" cy="16" r="1.4" fill="currentColor"/>
    <circle cx="18" cy="4" r="1.4" fill="currentColor"/>
    <circle cx="22" cy="12" r="1.4" fill="currentColor"/>
  </svg>
);

// ───────────────────────────────────────────────────────────────────
// New icons added for the rebuilt terminal
// ───────────────────────────────────────────────────────────────────

/** Long/Short position tool — layered profit/loss zones */
export const IconPosition = () => (
  <svg {...s} viewBox="0 0 24 24">
    <rect x="4" y="4" width="16" height="7" rx="1" fill="currentColor" fillOpacity="0.18"/>
    <rect x="4" y="13" width="16" height="7" rx="1"/>
    <line x1="4" y1="11" x2="20" y2="11" strokeWidth="2"/>
  </svg>
);

/** Line chart type */
export const IconLineChart = () => (
  <svg {...s} viewBox="0 0 24 24"><polyline points="3,17 8,11 12,14 21,5"/></svg>
);

/** Area chart type */
export const IconAreaChart = () => (
  <svg {...s} viewBox="0 0 24 24"><polyline points="3,17 8,11 12,14 21,5"/><path d="M3 17 L8 11 L12 14 L21 5 V20 H3 Z" fill="currentColor" fillOpacity="0.18" stroke="none"/><line x1="3" y1="20" x2="21" y2="20"/></svg>
);

/** OHLC bars chart type */
export const IconBarsChart = () => (
  <svg {...s} viewBox="0 0 24 24">
    <line x1="7" y1="4" x2="7" y2="18"/><line x1="4" y1="8" x2="7" y2="8"/><line x1="7" y1="14" x2="10" y2="14"/>
    <line x1="16" y1="6" x2="16" y2="20"/><line x1="13" y1="16" x2="16" y2="16"/><line x1="16" y1="10" x2="19" y2="10"/>
  </svg>
);

/** Heikin Ashi chart type — smoothed candles */
export const IconHeikin = () => (
  <svg {...s} viewBox="0 0 24 24">
    <line x1="7" y1="3" x2="7" y2="7"/>
    <rect x="4.5" y="7" width="5" height="9" rx="1.5"/>
    <line x1="7" y1="16" x2="7" y2="20"/>
    <line x1="17" y1="5" x2="17" y2="9"/>
    <rect x="14.5" y="9" width="5" height="8" rx="1.5" fill="currentColor" fillOpacity="0.3"/>
    <line x1="17" y1="17" x2="17" y2="21"/>
  </svg>
);

/** Indicator Builder — wrench over a mini chart */
export const IconBuilder = () => (
  <svg {...s} viewBox="0 0 24 24">
    <polyline points="3,20 8,13 12,16 16,9"/>
    <path d="M21.5 6.5a3.5 3.5 0 01-4.7 3.29L14 12.6l-1.6-1.6 2.81-2.8A3.5 3.5 0 0119.5 3l-2 2 1.5 1.5 2-2c.32.6.5 1.28.5 2z"/>
  </svg>
);

/** Search magnifier */
export const IconSearch = () => (
  <svg {...s} viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/></svg>
);

/** Copy to clipboard */
export const IconCopy = () => (
  <svg {...s} viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
);

/** Download file */
export const IconDownload = () => (
  <svg {...s} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);

/** Clone / duplicate */
export const IconClone = () => (
  <svg {...s} viewBox="0 0 24 24"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16H4a2 2 0 01-2-2V4a2 2 0 012-2h10a2 2 0 012 2v1"/><line x1="14.5" y1="11.5" x2="14.5" y2="17.5"/><line x1="11.5" y1="14.5" x2="17.5" y2="14.5"/></svg>
);

/** Small chevron for dropdown buttons */
export const IconChevronDown = () => (
  <svg {...s} width={12} height={12} viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9"/></svg>
);

/** Checkmark */
export const IconCheck = () => (
  <svg {...s} viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12"/></svg>
);

/** Left arrow (back navigation) */
export const IconArrowLeft = () => (
  <svg {...s} viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/></svg>
);

/** Grip dots for draggable items */
export const IconGrip = () => (
  <svg {...s} viewBox="0 0 24 24">
    <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/>
  </svg>
);

/** Baseline chart series glyph (above/below split) */
export const IconBaseline = () => (
  <svg {...s} viewBox="0 0 24 24">
    <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="3,3"/>
    <polyline points="3,15 7,9 11,13 15,7 19,11 21,9"/>
  </svg>
);

/** Histogram series glyph */
export const IconHistogram = () => (
  <svg {...s} viewBox="0 0 24 24">
    <line x1="5" y1="20" x2="5" y2="12"/><line x1="9" y1="20" x2="9" y2="7"/>
    <line x1="13" y1="20" x2="13" y2="14"/><line x1="17" y1="20" x2="17" y2="4"/><line x1="21" y1="20" x2="21" y2="10"/>
    <line x1="3" y1="20" x2="22" y2="20" strokeWidth="1"/>
  </svg>
);

export const IconStar = ({ filled = false }: { filled?: boolean }) => (
  <svg {...s} viewBox="0 0 24 24">
    <path
      d="M12 3.2l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.48 6.8 19.2l.99-5.79-4.21-4.1 5.82-.85z"
      fill={filled ? "currentColor" : "none"}
    />
  </svg>
);

export const IconEllipse = () => (
  <svg {...s} viewBox="0 0 24 24">
    <ellipse cx="12" cy="12" rx="9" ry="6" />
  </svg>
);

export const IconChannel = () => (
  <svg {...s} viewBox="0 0 24 24">
    <line x1="3" y1="9" x2="21" y2="5" />
    <line x1="3" y1="19" x2="21" y2="15" />
  </svg>
);

export const IconFibExtension = () => (
  <svg {...s} viewBox="0 0 24 24">
    <line x1="3" y1="20" x2="21" y2="4" />
    <line x1="3" y1="8" x2="21" y2="8" strokeWidth="1" />
    <line x1="3" y1="13" x2="21" y2="13" strokeWidth="1" />
    <line x1="3" y1="18" x2="21" y2="18" strokeWidth="1" />
  </svg>
);

export const IconScatter = () => (
  <svg {...s} viewBox="0 0 24 24">
    <circle cx="6" cy="15" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="11" cy="9" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="15" cy="17" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="7" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export const IconLayout = () => (
  <svg {...s} viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);
