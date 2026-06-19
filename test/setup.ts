// ═══════════════════════════════════════════════════════════════════
// Test setup — runs once before every test file
// ═══════════════════════════════════════════════════════════════════

import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees and reset between tests so component tests don't
// leak state into one another.
afterEach(() => {
  cleanup();
});

// ── Browser API stubs ───────────────────────────────────────────────
// jsdom doesn't implement these, but several modules reference them.
// Providing no-op stubs keeps imports from throwing.

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error — assigning a stub onto the global
  globalThis.ResizeObserver = ResizeObserverStub;
}

if (!("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// A minimal WebSocket stub used by WSClient tests. Tests can grab the
// most recently constructed instance via `__lastSocket` and drive its
// lifecycle (open/message/close/error) deterministically.
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static get last() { return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]; }
  static reset() { FakeWebSocket.instances = []; }

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) { this.sent.push(data); }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  // ── test drivers ──
  _open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  _message(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  _raw(data: string) { this.onmessage?.({ data }); }
  _error() { this.onerror?.(); }
  _serverClose() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
}
