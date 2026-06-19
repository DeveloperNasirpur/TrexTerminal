// ═══════════════════════════════════════════════════════════════════
// Playwright config — Trex SuperChart e2e
// ═══════════════════════════════════════════════════════════════════
// The chart engine renders to a real canvas, so its critical paths
// (data load, drawing, history-alignment) can only be verified in a
// real browser. These tests run against the built single-file dist,
// served over HTTP so the chart's autoSize gets a real layout.
// ═══════════════════════════════════════════════════════════════════

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.e2e.ts",    // our e2e specs use the .e2e.ts suffix
  fullyParallel: false,        // shared dev server; keep runs deterministic
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4178",
    trace: "on-first-retry",
    // Google Fonts is blocked in CI sandboxes; the app falls back to
    // system fonts, so we don't fail on that network request.
    launchOptions: { args: ["--no-sandbox"] },
  },
  // Build first, then serve the single-file dist.
  webServer: {
    command: "npm run build && npx vite preview --port 4178 --strictPort",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
