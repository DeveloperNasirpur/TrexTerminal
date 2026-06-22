// ═══════════════════════════════════════════════════════════════════
// persistence.ts — workspace preference persistence
// ═══════════════════════════════════════════════════════════════════

import type { ChartSettings, ChartType, DrawingTool } from "./types";

const STORAGE_KEY = "trex.workspace.v2";

export interface WorkspaceState {
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  settings: ChartSettings;
  favorites: DrawingTool[];
  layout: "single" | "split2" | "grid4";
  compareSymbols: string[];
  // UX extras persisted across sessions
  wsUrl?: string;
  btPanelHeight?: number;
  btActiveTab?: string;
  lastMode?: "demo" | "server";
}

export function loadWorkspace(): Partial<WorkspaceState> | null {
  if (typeof window === "undefined") return null;
  try {
    // migrate from v1
    const raw = window.localStorage.getItem(STORAGE_KEY)
      ?? window.localStorage.getItem("trex.workspace.v1");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || obj === null) return null;
    return obj as Partial<WorkspaceState>;
  } catch {
    return null;
  }
}

export function saveWorkspace(state: WorkspaceState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

export function clearWorkspace(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem("trex.workspace.v1");
  } catch {
    /* ignore */
  }
}
