// ═══════════════════════════════════════════════════════════════════
// protocolValidation.test.ts — wire-protocol contract guarantees
// ═══════════════════════════════════════════════════════════════════
// The WebSocket boundary is untrusted, so these tests pin down exactly
// what the protocol accepts and rejects: only well-formed, recognised
// server frames pass; everything else is safely dropped (never thrown).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  PROTOCOL_VERSION,
  isProtocolMessage,
  isKnownServerType,
  makeHello,
  parseServerFrame,
  SERVER_MESSAGE_TYPES,
  CLIENT_MESSAGE_TYPES,
} from "@/protocol";

describe("PROTOCOL_VERSION", () => {
  it("is a semver-shaped string", () => {
    expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("isProtocolMessage", () => {
  it("accepts an object with a non-empty string type", () => {
    expect(isProtocolMessage({ type: "bar" })).toBe(true);
  });
  it("rejects null, primitives, arrays and typeless objects", () => {
    expect(isProtocolMessage(null)).toBe(false);
    expect(isProtocolMessage(42)).toBe(false);
    expect(isProtocolMessage("bar")).toBe(false);
    expect(isProtocolMessage([])).toBe(false);
    expect(isProtocolMessage({})).toBe(false);
    expect(isProtocolMessage({ type: "" })).toBe(false);
    expect(isProtocolMessage({ type: 7 })).toBe(false);
  });
});

describe("isKnownServerType", () => {
  it("recognises every documented server message", () => {
    for (const t of SERVER_MESSAGE_TYPES) {
      expect(isKnownServerType(t)).toBe(true);
    }
  });
  it("rejects unknown / client-only types it shouldn't accept from a server", () => {
    expect(isKnownServerType("hello")).toBe(false); // hello is client→server
    expect(isKnownServerType("ping")).toBe(false);  // ping is client→server
    expect(isKnownServerType("nonsense")).toBe(false);
  });
});

describe("registries", () => {
  it("server set covers the snapshot/bar synonyms", () => {
    for (const t of ["snapshot", "init", "bar", "tick", "update"]) {
      expect(SERVER_MESSAGE_TYPES.has(t)).toBe(true);
    }
  });
  it("client set covers the handshake + sync messages", () => {
    for (const t of ["hello", "ping", "history", "drawing_upsert"]) {
      expect(CLIENT_MESSAGE_TYPES.has(t)).toBe(true);
    }
  });
});

describe("makeHello", () => {
  it("builds a versioned handshake frame", () => {
    const h = makeHello("trex-terminal", "9.9.9");
    expect(h).toEqual({
      type: "hello",
      client: "trex-terminal",
      version: "9.9.9",
      protocol: PROTOCOL_VERSION,
    });
  });
});

describe("parseServerFrame", () => {
  it("parses a valid snapshot frame", () => {
    const raw = JSON.stringify({ type: "snapshot", data: [] });
    const msg = parseServerFrame(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe("snapshot");
  });

  it("parses a realtime bar frame", () => {
    const bar = { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 };
    const msg = parseServerFrame(JSON.stringify({ type: "bar", bar }));
    expect(msg?.type).toBe("bar");
  });

  it("returns null for non-JSON", () => {
    expect(parseServerFrame("}{ not json")).toBeNull();
    expect(parseServerFrame("")).toBeNull();
  });

  it("returns null for JSON that isn't a protocol message", () => {
    expect(parseServerFrame(JSON.stringify({ foo: "bar" }))).toBeNull();
    expect(parseServerFrame(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(parseServerFrame(JSON.stringify("hello"))).toBeNull();
  });

  it("returns null for an unrecognised server type", () => {
    expect(parseServerFrame(JSON.stringify({ type: "weird_type" }))).toBeNull();
  });

  it("never throws on hostile input", () => {
    const hostile = ["null", "undefined", "NaN", "{", "[}", "\u0000", "true"];
    for (const h of hostile) {
      expect(() => parseServerFrame(h)).not.toThrow();
    }
  });

  it("accepts the pong keep-alive frame", () => {
    expect(parseServerFrame(JSON.stringify({ type: "pong", t: 123 }))?.type).toBe("pong");
  });
});
