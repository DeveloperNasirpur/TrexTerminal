// ═══════════════════════════════════════════════════════════════════
// Vitest configuration — Trex SuperChart test suite
// ═══════════════════════════════════════════════════════════════════
// Kept SEPARATE from vite.config.ts on purpose: the production build
// uses vite-plugin-singlefile which would interfere with the test
// runner. This config only concerns itself with running unit and
// component tests under jsdom.
// ═══════════════════════════════════════════════════════════════════

import path from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // jsdom gives us a DOM so component tests and modules that touch
    // window/document (DemoFeed timers, WSClient) run without a browser.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    // Engine + chart rendering need a real canvas/WebGL surface, so they
    // are covered by Playwright e2e tests, not unit tests here.
    exclude: ["node_modules", "dist", "test/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/types.ts", "src/wsClient.ts", "src/demoData.ts"],
      // The DemoFeed class and indicator registry are timer-driven and
      // exercised by the Playwright e2e suite, not unit tests. chartEngine,
      // App, main and icons are UI/canvas and likewise covered by e2e.
      exclude: [
        "src/main.tsx",
        "src/App.tsx",
        "src/chartEngine.ts",
        "src/DocsPage.tsx",
        "src/icons.tsx",
        "src/**/*.d.ts",
      ],
      // Enforced floors for the pure-logic surface that unit tests own.
      // Per-file thresholds keep each module honest rather than letting a
      // well-covered file mask a poorly-covered one.
      thresholds: {
        "src/types.ts": { lines: 90, functions: 90, branches: 80, statements: 90 },
        "src/wsClient.ts": { lines: 85, functions: 80, branches: 70, statements: 85 },
        // demoData mixes pure math (fully tested) with the timer-driven
        // DemoFeed (e2e-tested); the floor reflects the math portion.
        "src/demoData.ts": { lines: 50, functions: 32, branches: 45, statements: 50 },
      },
    },
    // Deterministic, fast feedback.
    testTimeout: 10_000,
    restoreMocks: true,
  },
});
