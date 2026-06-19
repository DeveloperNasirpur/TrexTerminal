// ═══════════════════════════════════════════════════════════════════
// persistence.ts — workspace preference persistence
// ═══════════════════════════════════════════════════════════════════
// Saves the user's UI preferences (symbol, timeframe, chart type, theme
// settings, favorites, workspace layout) to localStorage so the terminal
// reopens exactly as they left it. This is PURELY client-side UI state —
// no market data is cached here; candles and indicators always come fresh
// from the data source on reconnect, per the display-only architecture.
// ═══════════════════════════════════════════════════════════════════

import type { ChartSettings, ChartType, DrawingTool } from "./types";

const STORAGE_KEY = "trex.workspace.v1";

/** The persisted shape. Bump STORAGE_KEY's vN suffix on a breaking change. */
export interface WorkspaceState {
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  settings: ChartSettings;
  favorites: DrawingTool[];
  layout: "single" | "split2" | "grid4";
  compareSymbols: string[];
}

/**
 * Load the saved workspace, or null if none exists / parsing fails. Never
 * throws — a corrupt or partial blob just yields null and the app falls
 * back to defaults.
 */
export function loadWorkspace(): Partial<WorkspaceState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || obj === null) return null;
    return obj as Partial<WorkspaceState>;
  } catch {
    return null;
  }
}

/**
 * Persist the workspace. Debounced by the caller; this just writes. Fails
 * silently if storage is unavailable (private mode, quota, etc.).
 */
export function saveWorkspace(state: WorkspaceState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — preferences just won't persist this session */
  }
}

/** Clear the saved workspace (used by a "reset workspace" action). */
export function clearWorkspace(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
