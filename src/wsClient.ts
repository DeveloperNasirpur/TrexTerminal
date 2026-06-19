// ═══════════════════════════════════════════════════════════════════
// WebSocket Client — auto-reconnect, keepalive ping/pong, RTT latency
// ═══════════════════════════════════════════════════════════════════

import type { WSMessage } from "./types";
import { parseServerFrame } from "./protocol";

export type HandleMessage = (msg: WSMessage) => void;
export type HandleStatus = (connected: boolean) => void;
export type HandleLatency = (rttMs: number) => void;

export class WSClient {
  private url: string;
  private ws: WebSocket | null = null;
  private onMsg: HandleMessage;
  private onStatus: HandleStatus;
  private onLatency: HandleLatency | null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private readonly MAX_RECONNECT_DELAY = 10000;
  private readonly PING_INTERVAL = 15000;
  private destroyed = false;
  /** Time the last ping was sent — used to compute round-trip latency. */
  private lastPingAt = 0;
  /**
   * Messages queued while the socket is down. Flushed on reconnect so
   * user actions (timeframe change, drawing sync, …) are never lost
   * during a brief network blip. Bounded to avoid unbounded growth.
   */
  private sendQueue: string[] = [];
  private readonly MAX_QUEUE = 100;

  constructor(url: string, onMsg: HandleMessage, onStatus: HandleStatus, onLatency?: HandleLatency) {
    this.url = url;
    this.onMsg = onMsg;
    this.onStatus = onStatus;
    this.onLatency = onLatency ?? null;
  }

  connect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.onStatus(false);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.onStatus(true);
      this.reconnectDelay = 1000;
      // Flush anything queued while we were offline.
      const queued = this.sendQueue.splice(0, this.sendQueue.length);
      for (const raw of queued) {
        try { this.ws?.send(raw); } catch { /* socket flapped again */ }
      }
      this.startPing();
      // Measure latency immediately rather than waiting PING_INTERVAL.
      this.sendPing();
    };

    this.ws.onmessage = (ev) => {
      // Validate at the untrusted boundary: parseServerFrame returns null
      // for non-JSON or unrecognised frames instead of throwing, so a
      // malformed message from a misbehaving server can't crash the pipe.
      const msg = parseServerFrame(typeof ev.data === "string" ? ev.data : String(ev.data));
      if (!msg) {
        console.warn("[Trex WS] Ignored malformed/unknown frame:", ev.data);
        return;
      }
      if (msg.type === "pong") {
        if (this.onLatency && this.lastPingAt > 0) {
          this.onLatency(Math.max(0, Math.round(performance.now() - this.lastPingAt)));
        }
        return;
      }
      // ServerMessage is a strict subset of the legacy WSMessage shape.
      this.onMsg(msg as unknown as WSMessage);
    };

    this.ws.onclose = () => {
      this.onStatus(false);
      this.stopPing();
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // Will trigger onclose
    };
  }

  disconnect(): void {
    const wasConnected = this.ws?.readyState === WebSocket.OPEN;
    this.destroyed = true;
    this.stopPing();
    this.sendQueue.length = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    // We detached onclose above, so nothing else will report the drop.
    // Notify consumers so the UI (connection pill, status bar) reflects
    // that a manual disconnect closed the link.
    if (wasConnected) this.onStatus(false);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(data: any): void {
    if (this.destroyed) return;
    const raw = JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
      return;
    }
    // Keep-alive pings are pointless to queue; everything else is kept.
    if (data && data.type !== "ping") {
      if (this.sendQueue.length >= this.MAX_QUEUE) this.sendQueue.shift();
      this.sendQueue.push(raw);
    }
  }

  private sendPing(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.lastPingAt = performance.now();
      this.ws.send(JSON.stringify({ type: "ping" }));
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.sendPing(), this.PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 1.5,
      this.MAX_RECONNECT_DELAY
    );
  }
}
