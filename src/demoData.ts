// ═══════════════════════════════════════════════════════════════════
// demoData.ts — compatibility barrel
// ═══════════════════════════════════════════════════════════════════
// The demo data layer was split for a clean architecture boundary:
//
//   • marketData.ts — shared, stateless market-data toolkit (candle
//     generators, indicator math, the indicator catalog/registry,
//     computeCalc, demo symbols). Used by the mock server, the unit
//     tests, and the Indicator Builder's design-time preview.
//
//   • mockServer.ts — the simulated trading-data SERVER (DemoFeed). The
//     only place in the demo path that produces data "as a server would".
//
// This barrel re-exports both so existing imports keep working. New code
// should import directly from marketData.ts or mockServer.ts to make the
// dependency direction explicit.
// ═══════════════════════════════════════════════════════════════════

export * from "./marketData";
export * from "./mockServer";
