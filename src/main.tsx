import { Component, ErrorInfo, ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import DocsPage from "./DocsPage";

declare global {
  interface Window {
    __trexAction?: "demo" | "server" | "docs" | null;
    __trexWsUrl?: string | null;
  }
}

function setLoaderHidden(hidden: boolean) {
  const loader = document.getElementById("trex-loader");
  if (loader) loader.style.display = hidden ? "none" : "";
}

function removeLoader() {
  const loader = document.getElementById("trex-loader");
  if (loader) {
    loader.classList.add("fade-out");
    setTimeout(() => loader.remove(), 500);
  }
}

function setLoaderStatus(status: "idle" | "connecting" | "connected" | "failed", message?: string) {
  const hint = document.getElementById("trex-hint");
  const statusEl = document.getElementById("trex-status");
  const launchBtn = document.getElementById("trex-launch-btn");
  const launchText = document.getElementById("trex-launch-text");

  switch (status) {
    case "connecting":
      if (statusEl) {
        statusEl.style.display = "flex";
        statusEl.innerHTML = `<div class="status-spinner"></div><span style="color:#58a6ff;font-size:14px;font-weight:500;">${message || "Connecting..."}</span>`;
      }
      if (hint) { hint.textContent = "Establishing WebSocket connection..."; hint.style.color = "#58a6ff"; }
      break;
    case "connected":
      if (statusEl) {
        statusEl.innerHTML = `<div style="width:12px;height:12px;border-radius:50%;background:#0ecb81;box-shadow:0 0 10px rgba(14,203,129,0.5);"></div><span style="color:#0ecb81;font-size:14px;font-weight:600;">Connected!</span>`;
      }
      if (hint) { hint.textContent = "Loading chart..."; hint.style.color = "#0ecb81"; }
      break;
    case "failed":
      if (statusEl) statusEl.style.display = "none";
      if (hint) { hint.textContent = message || "Connection failed. Check URL and try again."; hint.style.color = "#f6465d"; }
      if (launchBtn) { (launchBtn as HTMLButtonElement).disabled = false; }
      if (launchText) launchText.textContent = "↻ Try Again";
      window.__trexAction = null;
      break;
    case "idle":
      if (statusEl) statusEl.style.display = "none";
      break;
  }
}

type Page = "loading" | "chart" | "docs";

function Router() {
  const [page, setPage] = useState<Page>("loading");
  const [initialMode, setInitialMode] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  /** true ⇢ docs were opened from the loader, so Back returns there */
  const docsFromLoaderRef = useRef(false);

  const handleAction = useCallback((action: "demo" | "server" | "docs") => {
    window.__trexAction = null;
    if (action === "docs") {
      if (pollTimerRef.current) { cancelAnimationFrame(pollTimerRef.current); pollTimerRef.current = null; }
      docsFromLoaderRef.current = true;
      setLoaderHidden(true);
      setPage("docs");
      return;
    }
    if (action === "demo") {
      if (pollTimerRef.current) { cancelAnimationFrame(pollTimerRef.current); pollTimerRef.current = null; }
      setInitialMode("demo");
      setPage("chart");
      removeLoader();
      return;
    }
    if (action === "server") {
      if (pollTimerRef.current) { cancelAnimationFrame(pollTimerRef.current); pollTimerRef.current = null; }
      const urlInput = document.getElementById("trex-ws-url") as HTMLInputElement | null;
      const url = urlInput?.value?.trim() || "ws://localhost:8765";
      window.__trexWsUrl = url;
      setLoaderStatus("connecting", `Connecting to ${url}...`);

      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { setLoaderStatus("failed", "Invalid WebSocket URL"); startPolling(); return; }
      wsRef.current = ws;
      let settled = false;
      const fail = (reason: string) => {
        if (settled) return; settled = true;
        clearTimeout(timeout);
        ws.onopen = null; ws.onerror = null; ws.onclose = null;
        try { ws.close(); } catch {}
        wsRef.current = null;
        setLoaderStatus("failed", reason);
        startPollingRef.current();
      };
      const timeout = setTimeout(() => { fail(`Timeout — Could not reach ${url}`); }, 8000);
      ws.onopen = () => {
        if (settled) return; settled = true; clearTimeout(timeout);
        setLoaderStatus("connected");
        ws.onclose = null; ws.onerror = null; ws.close(); wsRef.current = null;
        setTimeout(() => { setInitialMode("server"); setPage("chart"); removeLoader(); }, 600);
      };
      ws.onerror = () => { fail(`Cannot connect to ${url}`); };
      ws.onclose = () => { fail(`Connection refused — ${url}`); };
    }
    // startPolling is reached through startPollingRef (kept current below),
    // so this callback is intentionally identity-stable with no deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPollingRef = useRef<() => void>(() => {});
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) { cancelAnimationFrame(pollTimerRef.current); pollTimerRef.current = null; }
    const poll = () => {
      const action = window.__trexAction;
      if (action) { handleAction(action); return; }
      pollTimerRef.current = requestAnimationFrame(poll);
    };
    pollTimerRef.current = requestAnimationFrame(poll);
  }, [handleAction]);

  useEffect(() => {
    if (page !== "loading") return;
    startPolling();
    return () => {
      if (pollTimerRef.current) { cancelAnimationFrame(pollTimerRef.current); pollTimerRef.current = null; }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [page, startPolling]);

  if (page === "docs") {
    return (
      <DocsPage
        lang="fa"
        onBack={() => {
          if (docsFromLoaderRef.current) {
            // came from the landing page — bring the loader back
            docsFromLoaderRef.current = false;
            window.__trexAction = null;
            setLoaderHidden(false);
            setPage("loading");
          } else {
            setPage("chart");
          }
        }}
      />
    );
  }
  if (page === "loading") {
    return null;
  }

  return (
    <div className="trex-app-root">
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <App initialMode={initialMode} />
      </div>
      <button onClick={() => setPage("docs")} className="trex-docs-btn" title="Open API Documentation">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <span>API Docs</span>
      </button>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error("Error caught:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: "monospace", background: "#0b0e11", color: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 600, background: "#1e2329", border: "1px solid #f6465d", borderRadius: 12, padding: 32 }}>
            <h1 style={{ color: "#f6465d", marginBottom: 16, fontSize: 20 }}>⚠️ Something went wrong</h1>
            <pre style={{ background: "#0b0e11", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12, color: "#848e9c", border: "1px solid #2b2f36" }}>{this.state.error?.message}{"\n\n"}{this.state.error?.stack}</pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: "10px 20px", background: "#f0b90b", color: "#0b0e11", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Router />
  </ErrorBoundary>
);
