// ═══════════════════════════════════════════════════════════════════
// drawings.test.ts — drawing-sync contract (incl. new tools)
// ═══════════════════════════════════════════════════════════════════
// Drawings sync both ways with the server. These tests pin the boundary
// validation: a drawing must have a known tool and enough points, so the
// new ellipse (2-pt) and parallel channel (3-pt) tools round-trip safely
// and malformed drawings are dropped instead of breaking the renderer.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  isValidDrawing,
  sanitizeDrawings,
  VALID_DRAWING_TOOLS,
  DRAWING_MIN_POINTS,
} from "@/protocol";

const pt = (time: number, price: number) => ({ time, price });
const draw = (tool: string, n: number) => ({
  id: `d-${tool}`,
  tool,
  points: Array.from({ length: n }, (_, i) => pt(100 + i, 50000 + i)),
});

describe("drawing tool registry", () => {
  it("includes the new ellipse and parallelChannel tools", () => {
    expect(VALID_DRAWING_TOOLS.has("ellipse")).toBe(true);
    expect(VALID_DRAWING_TOOLS.has("parallelChannel")).toBe(true);
  });
  it("requires 3 points for a parallel channel, 2 for an ellipse", () => {
    expect(DRAWING_MIN_POINTS.parallelChannel).toBe(3);
    expect(DRAWING_MIN_POINTS.ellipse).toBe(2);
  });
});

describe("isValidDrawing", () => {
  it("accepts a valid ellipse (2 points)", () => {
    expect(isValidDrawing(draw("ellipse", 2))).toBe(true);
  });
  it("accepts a valid parallel channel (3 points)", () => {
    expect(isValidDrawing(draw("parallelChannel", 3))).toBe(true);
  });
  it("rejects a parallel channel with only 2 points", () => {
    expect(isValidDrawing(draw("parallelChannel", 2))).toBe(false);
  });
  it("rejects an unknown tool", () => {
    expect(isValidDrawing(draw("teleporter", 2))).toBe(false);
  });
  it("rejects a drawing with no id", () => {
    expect(isValidDrawing({ tool: "ellipse", points: [pt(1, 2), pt(3, 4)] })).toBe(false);
  });
  it("rejects points with a non-finite price", () => {
    expect(isValidDrawing({ id: "x", tool: "ellipse", points: [pt(1, NaN), pt(2, 3)] })).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(isValidDrawing(null)).toBe(false);
    expect(isValidDrawing("ellipse")).toBe(false);
  });
});

describe("sanitizeDrawings", () => {
  it("keeps valid drawings and drops malformed ones", () => {
    const out = sanitizeDrawings([
      draw("ellipse", 2),          // ok
      draw("parallelChannel", 2),  // too few points → dropped
      draw("rectangle", 2),        // ok
      "garbage",                   // dropped
    ]);
    expect(out.map((d) => d.tool)).toEqual(["ellipse", "rectangle"]);
  });
  it("returns [] for non-array input", () => {
    expect(sanitizeDrawings(null)).toEqual([]);
    expect(sanitizeDrawings({})).toEqual([]);
  });
});
