// ═══════════════════════════════════════════════════════════════════
// seriesDefinition.test.ts — display-contract guarantees
// ═══════════════════════════════════════════════════════════════════
// SeriesDefinition tells the renderer HOW to draw a server-streamed
// series. These tests pin the validation (what's the minimum a server
// must send) and normalization (how missing fields are defaulted) so the
// engine can always assume a complete, sane definition.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  isValidSeriesDefinition,
  normalizeSeriesDefinition,
  sanitizeDefinitions,
  VALID_SERIES_KINDS,
  SERIES_DEFINITION_DEFAULTS,
} from "@/protocol";
import type { SeriesDefinition } from "@/types";

/** A minimal definition that should pass validation. */
const minimal = {
  key: "rsi",
  label: "RSI",
  type: "line",
  pane: "sub",
} as unknown as SeriesDefinition;

describe("isValidSeriesDefinition", () => {
  it("accepts a definition with the required fields", () => {
    expect(isValidSeriesDefinition(minimal)).toBe(true);
  });

  it("accepts every supported series kind", () => {
    for (const k of VALID_SERIES_KINDS) {
      expect(isValidSeriesDefinition({ key: "k", label: "L", type: k, pane: "main" })).toBe(true);
    }
  });

  it("rejects missing key / label", () => {
    expect(isValidSeriesDefinition({ label: "L", type: "line", pane: "main" })).toBe(false);
    expect(isValidSeriesDefinition({ key: "k", type: "line", pane: "main" })).toBe(false);
  });

  it("rejects an unknown series kind", () => {
    expect(isValidSeriesDefinition({ key: "k", label: "L", type: "candlestick", pane: "main" })).toBe(false);
  });

  it("rejects an invalid pane", () => {
    expect(isValidSeriesDefinition({ key: "k", label: "L", type: "line", pane: "left" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidSeriesDefinition(null)).toBe(false);
    expect(isValidSeriesDefinition("line")).toBe(false);
    expect(isValidSeriesDefinition(42)).toBe(false);
  });
});

describe("normalizeSeriesDefinition", () => {
  it("fills every default for a minimal definition", () => {
    const n = normalizeSeriesDefinition(minimal);
    expect(n.lineWidth).toBe(SERIES_DEFINITION_DEFAULTS.lineWidth);
    expect(n.lineStyle).toBe(SERIES_DEFINITION_DEFAULTS.lineStyle);
    expect(n.subPaneHeight).toBe(SERIES_DEFINITION_DEFAULTS.subPaneHeight);
    expect(n.digits).toBe(SERIES_DEFINITION_DEFAULTS.digits);
    expect(n.color).toBe(SERIES_DEFINITION_DEFAULTS.color);
    expect(n.visible).toBe(true);
    expect(n.scaleMargins).toEqual(SERIES_DEFINITION_DEFAULTS.scaleMargins);
  });

  it("derives paneId from key by convention", () => {
    expect(normalizeSeriesDefinition({ ...minimal, pane: "main" }).paneId).toBe("rsi");
    expect(normalizeSeriesDefinition({ ...minimal, pane: "sub" }).paneId).toBe("pane_rsi");
  });

  it("preserves an explicit paneId (shared panes like MACD)", () => {
    const d = { ...minimal, paneId: "macd_pane" } as SeriesDefinition;
    expect(normalizeSeriesDefinition(d).paneId).toBe("macd_pane");
  });

  it("keeps provided values instead of defaulting them", () => {
    const d = {
      ...minimal,
      color: "#FF0000",
      lineWidth: 4,
      digits: 5,
      visible: false,
      scaleMargins: { top: 0.3, bottom: 0.2 },
    } as SeriesDefinition;
    const n = normalizeSeriesDefinition(d);
    expect(n.color).toBe("#FF0000");
    expect(n.lineWidth).toBe(4);
    expect(n.digits).toBe(5);
    expect(n.visible).toBe(false);
    expect(n.scaleMargins).toEqual({ top: 0.3, bottom: 0.2 });
  });

  it("repairs a malformed scaleMargins to the default", () => {
    const d = { ...minimal, scaleMargins: { top: "x" } } as unknown as SeriesDefinition;
    expect(normalizeSeriesDefinition(d).scaleMargins).toEqual(SERIES_DEFINITION_DEFAULTS.scaleMargins);
  });

  it("carries through display flags and baseline fields", () => {
    const d = {
      ...minimal,
      type: "baseline",
      baseValue: 100,
      priceLineVisible: true,
      lastValueVisible: false,
    } as SeriesDefinition;
    const n = normalizeSeriesDefinition(d);
    expect(n.baseValue).toBe(100);
    expect(n.priceLineVisible).toBe(true);
    expect(n.lastValueVisible).toBe(false);
  });
});

describe("sanitizeDefinitions", () => {
  it("normalizes valid definitions and drops invalid ones", () => {
    const input = [
      minimal,                                              // valid
      { key: "bad" },                                       // missing fields → dropped
      { key: "ema", label: "EMA", type: "area", pane: "main" }, // valid
      "not an object",                                      // dropped
    ];
    const out = sanitizeDefinitions(input);
    expect(out).toHaveLength(2);
    expect(out.map((d) => d.key)).toEqual(["rsi", "ema"]);
    // each survivor is fully normalized
    expect(out[0].lineWidth).toBe(SERIES_DEFINITION_DEFAULTS.lineWidth);
  });

  it("returns [] for non-array input", () => {
    expect(sanitizeDefinitions(null)).toEqual([]);
    expect(sanitizeDefinitions({})).toEqual([]);
    expect(sanitizeDefinitions(undefined)).toEqual([]);
  });
});
