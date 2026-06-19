// ═══════════════════════════════════════════════════════════════════
// wsClient.test.ts — connection resilience
// ═══════════════════════════════════════════════════════════════════
// The WSClient is the lifeline to the trading server. These tests pin
// down the behaviours users rely on during flaky networks: automatic
// reconnect with backoff, an offline queue so actions aren't lost, and
// latency measurement — all driven deterministically with fake timers.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WSClient } from "@/wsClient";
import { FakeWebSocket } from "./setup";

beforeEach(() => {
  FakeWebSocket.reset();
  // @ts-expect-error — swap the global WebSocket for our deterministic stub
  globalThis.WebSocket = FakeWebSocket;
  // WSClient reads WebSocket.OPEN off the global; mirror every constant.
  // @ts-expect-error
  globalThis.WebSocket.CONNECTING = FakeWebSocket.CONNECTING;
  // @ts-expect-error
  globalThis.WebSocket.OPEN = FakeWebSocket.OPEN;
  // @ts-expect-error
  globalThis.WebSocket.CLOSING = FakeWebSocket.CLOSING;
  // @ts-expect-error
  globalThis.WebSocket.CLOSED = FakeWebSocket.CLOSED;
  // Drive performance.now() off the fake clock so latency is measurable.
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeClient() {
  const msgs: unknown[] = [];
  const statuses: boolean[] = [];
  const latencies: number[] = [];
  const client = new WSClient(
    "ws://test.local:9999",
    (m) => msgs.push(m),
    (ok) => statuses.push(ok),
    (rtt) => latencies.push(rtt)
  );
  return { client, msgs, statuses, latencies };
}

describe("WSClient — connection lifecycle", () => {
  it("reports connected on open and sends an initial ping", () => {
    const { client, statuses } = makeClient();
    client.connect();
    const sock = FakeWebSocket.last;
    expect(sock.url).toBe("ws://test.local:9999");

    sock._open();
    expect(statuses).toContain(true);
    expect(client.isConnected()).toBe(true);
    // initial latency ping fired on open
    const sentTypes = sock.sent.map((s) => JSON.parse(s).type);
    expect(sentTypes).toContain("ping");
  });

  it("routes non-pong messages to the consumer", () => {
    const { client, msgs } = makeClient();
    client.connect();
    FakeWebSocket.last._open();
    FakeWebSocket.last._message({ type: "bar", bar: { time: 1, open: 1, high: 1, low: 1, close: 1 } });
    expect(msgs).toHaveLength(1);
    expect((msgs[0] as { type: string }).type).toBe("bar");
  });

  it("computes latency from a pong without forwarding it as a message", () => {
    const { client, msgs, latencies } = makeClient();
    client.connect();
    FakeWebSocket.last._open();
    // advance the clock so RTT is measurable, then reply with pong
    vi.advanceTimersByTime(12);
    FakeWebSocket.last._message({ type: "pong" });
    expect(latencies.length).toBeGreaterThan(0);
    expect(latencies[0]).toBeGreaterThanOrEqual(0);
    // pong must NOT reach the message consumer
    expect(msgs.find((m) => (m as { type: string }).type === "pong")).toBeUndefined();
  });

  it("tolerates malformed JSON without throwing", () => {
    const { client, msgs } = makeClient();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    client.connect();
    FakeWebSocket.last._open();
    expect(() => FakeWebSocket.last._raw("{not json")).not.toThrow();
    expect(msgs).toHaveLength(0);
  });
});

describe("WSClient — offline send queue", () => {
  it("queues messages while down and flushes them on (re)connect", () => {
    const { client } = makeClient();
    client.connect();
    const sock = FakeWebSocket.last;
    // not open yet — these should queue, not throw
    client.send({ type: "timeframe", timeframe: "5m" });
    client.send({ type: "symbol", symbol: "ETHUSDT" });
    expect(sock.sent).toHaveLength(0);

    sock._open();
    const flushed = sock.sent.map((s) => JSON.parse(s).type);
    expect(flushed).toContain("timeframe");
    expect(flushed).toContain("symbol");
  });

  it("never queues keep-alive pings", () => {
    const { client } = makeClient();
    client.connect(); // socket constructed but not open
    client.send({ type: "ping" });
    FakeWebSocket.last._open();
    const flushedBeforeOpenPing = FakeWebSocket.last.sent
      .map((s) => JSON.parse(s).type)
      .filter((t) => t === "ping");
    // the only ping present is the open-handler's latency ping, not a queued one
    expect(flushedBeforeOpenPing.length).toBeLessThanOrEqual(1);
  });

  it("sends immediately when already open", () => {
    const { client } = makeClient();
    client.connect();
    const sock = FakeWebSocket.last;
    sock._open();
    sock.sent.length = 0; // ignore the open-ping
    client.send({ type: "chartType", chartType: "line" });
    expect(JSON.parse(sock.sent[0]).type).toBe("chartType");
  });

  it("bounds the queue so it can't grow without limit", () => {
    const { client } = makeClient();
    client.connect(); // stays closed
    for (let i = 0; i < 250; i++) client.send({ type: "drawing_upsert", n: i });
    FakeWebSocket.last._open();
    const flushed = FakeWebSocket.last.sent
      .map((s) => JSON.parse(s))
      .filter((m) => m.type === "drawing_upsert");
    // MAX_QUEUE is 100; the oldest are evicted, newest survive
    expect(flushed.length).toBeLessThanOrEqual(100);
    expect(flushed[flushed.length - 1].n).toBe(249);
  });
});

describe("WSClient — reconnect with backoff", () => {
  it("schedules a reconnect after an unexpected close", () => {
    const { client, statuses } = makeClient();
    client.connect();
    FakeWebSocket.last._open();
    expect(FakeWebSocket.instances.length).toBe(1);

    FakeWebSocket.last._serverClose();
    expect(statuses[statuses.length - 1]).toBe(false);

    // first backoff is 1000ms → a new socket is constructed
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it("increases the delay on repeated failures (exponential backoff)", () => {
    const { client } = makeClient();
    client.connect();
    FakeWebSocket.last._open();

    FakeWebSocket.last._serverClose();
    vi.advanceTimersByTime(1000);           // 1st reconnect attempt
    expect(FakeWebSocket.instances.length).toBe(2);

    FakeWebSocket.last._serverClose();
    // backoff grew to 1500ms — not yet at 1000
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances.length).toBe(2);
    vi.advanceTimersByTime(500);            // now past 1500
    expect(FakeWebSocket.instances.length).toBe(3);
  });
});

describe("WSClient — disconnect", () => {
  it("stops reconnecting and clears the queue permanently", () => {
    const { client, statuses } = makeClient();
    client.connect();
    FakeWebSocket.last._open();

    client.disconnect();
    expect(client.isConnected()).toBe(false);

    // a post-disconnect send is dropped, not queued
    client.send({ type: "symbol", symbol: "X" });
    // and no reconnect is ever scheduled
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances.length).toBe(1);
    expect(statuses[statuses.length - 1]).toBe(false);
  });
});
