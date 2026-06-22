// ═══════════════════════════════════════════════════════════════════
// BtPanel — professional backtest panel
// Tabs: Positions | Open Orders | Trade History | Assets | Results
// ═══════════════════════════════════════════════════════════════════
import { useState, useRef, useCallback, useEffect, memo } from "react";

// ── Types ──────────────────────────────────────────────────────────

export interface BtPosition {
  id: number;
  symbol: string;
  side: "LONG" | "SHORT";
  entry: number;
  mark: number;
  margin: number;
  leverage: number;
  pnl: number;
  pnl_usdt: number;
  pnl_pct: number;
  stop_price: number | null;
  take_profit: number | null;
  liquidy: number | null;
  open_time: string | null;
  bars: number;
}

export interface BtOrder {
  id: number;
  symbol: string;
  side: "LONG" | "SHORT";
  type: "LIMIT" | "MARKET";
  entry: number;
  usdt: number;
  stop_price: number | null;
  take_profit: number | null;
  placed_time: string | null;
}

export interface BtHistoryEntry {
  id: number;
  symbol: string;
  side: "LONG" | "SHORT";
  entry: number;
  margin: number;
  leverage: number;
  pnl_usdt: number;
  pnl_pct: number;
  state: string;
  open_time: string | null;
  close_time: string | null;
}

export interface BtState {
  balance: number;
  margin_used: number;
  unrealized_pnl: number;
  equity: number;
  positions: BtPosition[];
  orders: BtOrder[];
  trade_history: BtHistoryEntry[];
}

export interface BtResult {
  initial_balance: number;
  final_balance: number;
  return_pct: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_factor: number;
  risk_reward: number;
  total_pnl_usdt: number;
  gross_profit: number;
  gross_loss: number;
  largest_win: number;
  largest_loss: number;
  avg_win: number;
  avg_loss: number;
  max_drawdown_usdt: number;
  max_drawdown_pct: number;
  equity_curve: number[];
}

// ── Design Tokens ──────────────────────────────────────────────────

const C = {
  bg0:     "#080b0f",
  bg1:     "#0d1117",
  bg2:     "#111720",
  bg3:     "#151d29",
  bg4:     "#1a2333",
  bg5:     "#1e2a3a",
  border:  "#1c2535",
  border2: "#253045",
  border3: "#2e3d55",

  text:    "#e2e8f0",
  text2:   "#94a3b8",
  muted:   "#4a5568",
  accent:  "#f0b90b",
  accentD: "#c99607",

  long:    "#00d4a3",
  longDim: "#00d4a318",
  longMid: "#00d4a330",
  short:   "#ff4d6d",
  shortDim:"#ff4d6d18",
  shortMid:"#ff4d6d30",
  tp:      "#22d3ee",
  sl:      "#fb923c",

  card:    "#0f1621",
};

// ── Global styles ──────────────────────────────────────────────────

const STYLE_ID = "bt-panel-v3";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes bt-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes bt-fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }

    .bt-row { transition: background 0.12s; }
    .bt-row:hover { background: ${C.bg5} !important; }
    .bt-row:hover .bt-row-accent { opacity: 1 !important; }

    .bt-card { transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s; }
    .bt-card:hover { border-color: ${C.border3} !important; transform: translateY(-1px); box-shadow: 0 4px 20px #00000040 !important; }

    .bt-tab { transition: color 0.12s, background 0.12s; }
    .bt-tab:hover { color: ${C.text} !important; background: ${C.bg4}20 !important; }
    .bt-tab-active { color: ${C.text} !important; }

    .bt-stat:hover { background: ${C.bg5} !important; border-color: ${C.border3} !important; }

    .bt-scrollbar::-webkit-scrollbar { width: 3px; height: 3px; }
    .bt-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .bt-scrollbar::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 2px; }
    .bt-scrollbar::-webkit-scrollbar-thumb:hover { background: ${C.border3}; }

    .bt-pnl-bar { animation: bt-fadein 0.3s ease; }
    .bt-dot-pulse { animation: bt-pulse 1.8s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
}

// ── Helpers ────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || isNaN(n as number)) return "—";
  return (n as number).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pnlColor(n: number) { return n > 0 ? C.long : n < 0 ? C.short : C.text2; }
function pnlDim(n: number)   { return n > 0 ? C.longDim : n < 0 ? C.shortDim : "transparent"; }
function sign(n: number)     { return n >= 0 ? "+" : ""; }

function timeAgo(t: string | null): string {
  if (!t) return "—";
  return t.replace("T", " ").slice(0, 16);
}

// ── Sub-components ─────────────────────────────────────────────────

function SidePill({ side }: { side: string }) {
  const isLong = side === "LONG";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 9px",
      borderRadius: 5,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.08em",
      background: isLong ? C.longDim : C.shortDim,
      color: isLong ? C.long : C.short,
      border: `1px solid ${isLong ? C.long + "28" : C.short + "28"}`,
    }}>
      {isLong
        ? <svg width="8" height="8" viewBox="0 0 8 8"><path d="M4 1L7 7H1Z" fill={C.long}/></svg>
        : <svg width="8" height="8" viewBox="0 0 8 8"><path d="M4 7L7 1H1Z" fill={C.short}/></svg>
      }
      {side}
    </span>
  );
}

function LevBadge({ lev }: { lev: number }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 6px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      background: "#f0b90b12",
      color: C.accent,
      border: `1px solid ${C.accent}20`,
    }}>
      {lev}×
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const isLimit = type === "LIMIT";
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 7px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      background: isLimit ? "#22d3ee10" : "#a78bfa10",
      color: isLimit ? C.tp : "#a78bfa",
      border: `1px solid ${isLimit ? C.tp + "25" : "#a78bfa25"}`,
    }}>
      {type}
    </span>
  );
}

function StatePill({ state }: { state: string }) {
  const map: Record<string, [string, string]> = {
    TRIGGERED:          [C.long,    C.longDim],
    TRIGGERED_BY_CLOSE: [C.long,    C.longDim],
    STOPPED:            [C.short,   C.shortDim],
    STOPPED_BY_CLOSE:   [C.short,   C.shortDim],
    LIQUID:             ["#f59e0b", "#f59e0b15"],
    OPEN:               [C.text2,   "transparent"],
  };
  const [color, bg] = map[state] ?? [C.muted, "transparent"];
  const label = state === "TRIGGERED_BY_CLOSE" ? "TP ✓"
              : state === "STOPPED_BY_CLOSE"   ? "SL ✓"
              : state.replace(/_/g, " ");
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      background: bg,
      color,
      border: `1px solid ${color}25`,
    }}>
      {label}
    </span>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      minHeight: 100,
      gap: 10,
    }}>
      <div style={{ fontSize: 28, opacity: 0.18 }}>{icon}</div>
      <div style={{ fontSize: 12, color: C.muted, letterSpacing: "0.02em" }}>{text}</div>
    </div>
  );
}

// ── Column header row ──────────────────────────────────────────────

// ── Positions Tab ──────────────────────────────────────────────────

function PositionsTab({ positions }: { positions: BtPosition[] }) {
  if (!positions.length)
    return <EmptyState icon="◈" text="No open positions" />;

  return (
    <div style={{ fontSize: 12 }}>
      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "18px 110px 80px 70px 100px 100px 90px 70px 120px 90px 90px 90px 120px",
        padding: "0 0 0 14px",
        height: 30,
        alignItems: "center",
        background: C.bg2,
        borderBottom: `1px solid ${C.border}`,
        position: "sticky",
        top: 0,
        zIndex: 2,
        gap: "0 8px",
      }}>
        {["", "SYMBOL", "SIDE", "LEV", "ENTRY", "MARK", "LIQ PRICE", "MARGIN", "UNREALIZED PnL", "ROE %", "TAKE PROFIT", "STOP LOSS", "OPENED"].map(h => (
          <span key={h} style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>{h}</span>
        ))}
      </div>

      {positions.map((p) => {
        const isLong = p.side === "LONG";
        const accentCol = isLong ? C.long : C.short;
        const pnlPos = p.pnl_usdt > 0;
        const priceUp = p.mark >= p.entry;

        return (
          <div
            key={p.id}
            className="bt-row"
            style={{
              display: "grid",
              gridTemplateColumns: "18px 110px 80px 70px 100px 100px 90px 70px 120px 90px 90px 90px 120px",
              padding: "0 0 0 0",
              alignItems: "center",
              minHeight: 46,
              borderBottom: `1px solid ${C.border}`,
              background: C.bg1,
              gap: "0 8px",
              position: "relative",
            }}
          >
            {/* Left accent bar */}
            <div
              className="bt-row-accent"
              style={{
                width: 3,
                alignSelf: "stretch",
                background: accentCol,
                opacity: 0.7,
                borderRadius: "0 2px 2px 0",
                transition: "opacity 0.15s",
              }}
            />

            <span style={{ fontWeight: 700, color: C.text, fontSize: 12, letterSpacing: "0.02em" }}>
              {p.symbol}
            </span>
            <span><SidePill side={p.side} /></span>
            <span><LevBadge lev={p.leverage} /></span>

            {/* Entry */}
            <span style={{ color: C.text2, fontFeatureSettings: '"tnum"' }}>
              {fmt(p.entry, 4)}
            </span>

            {/* Mark — colored vs entry */}
            <span style={{
              color: priceUp ? C.long : C.short,
              fontWeight: 600,
              fontFeatureSettings: '"tnum"',
            }}>
              {fmt(p.mark, 4)}
              <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.7 }}>
                {priceUp ? "▲" : "▼"}
              </span>
            </span>

            {/* Liq price */}
            <span style={{ color: p.liquidy ? C.sl : C.muted, fontFeatureSettings: '"tnum"' }}>
              {p.liquidy != null ? fmt(p.liquidy, 4) : "—"}
            </span>

            {/* Margin */}
            <span style={{ color: C.text2, fontFeatureSettings: '"tnum"' }}>
              ${fmt(p.margin)}
            </span>

            {/* Unrealized PnL with mini bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "4px 0" }}>
              <span style={{
                color: pnlColor(p.pnl_usdt),
                fontWeight: 700,
                fontSize: 12,
                fontFeatureSettings: '"tnum"',
              }}>
                {sign(p.pnl_usdt)}${fmt(Math.abs(p.pnl_usdt))}
              </span>
              {/* mini bar */}
              <div style={{
                height: 2,
                borderRadius: 1,
                background: C.border2,
                width: 80,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, Math.abs(p.pnl_pct) * 3)}%`,
                  background: pnlPos ? C.long : C.short,
                  borderRadius: 1,
                }} />
              </div>
            </div>

            {/* ROE */}
            <span style={{
              color: pnlColor(p.pnl_pct),
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 4,
              background: pnlDim(p.pnl_pct),
              fontSize: 12,
              fontFeatureSettings: '"tnum"',
            }}>
              {sign(p.pnl_pct)}{fmt(p.pnl_pct, 2)}%
            </span>

            {/* TP */}
            <span style={{ color: p.take_profit ? C.tp : C.muted, fontFeatureSettings: '"tnum"', fontSize: 11 }}>
              {p.take_profit != null
                ? <><span style={{ fontSize: 9, marginRight: 3, color: C.tp, opacity: 0.6 }}>TP</span>{fmt(p.take_profit, 4)}</>
                : "—"}
            </span>

            {/* SL */}
            <span style={{ color: p.stop_price ? C.sl : C.muted, fontFeatureSettings: '"tnum"', fontSize: 11 }}>
              {p.stop_price != null
                ? <><span style={{ fontSize: 9, marginRight: 3, color: C.sl, opacity: 0.6 }}>SL</span>{fmt(p.stop_price, 4)}</>
                : "—"}
            </span>

            {/* Opened */}
            <span style={{ color: C.muted, fontSize: 10 }}>
              {timeAgo(p.open_time)}
              <span style={{ marginLeft: 6, color: C.border3, fontSize: 9 }}>{p.bars}b</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Orders Tab ─────────────────────────────────────────────────────

function OrdersTab({ orders }: { orders: BtOrder[] }) {
  if (!orders.length)
    return <EmptyState icon="◎" text="No pending orders" />;

  return (
    <div style={{ fontSize: 12 }}>
      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "18px 120px 80px 80px 110px 110px 100px 100px 140px",
        padding: "0 0 0 14px",
        height: 30,
        alignItems: "center",
        background: C.bg2,
        borderBottom: `1px solid ${C.border}`,
        position: "sticky",
        top: 0,
        zIndex: 2,
        gap: "0 8px",
      }}>
        {["", "SYMBOL", "TYPE", "SIDE", "LIMIT PRICE", "SIZE (USDT)", "TAKE PROFIT", "STOP LOSS", "PLACED"].map(h => (
          <span key={h} style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>{h}</span>
        ))}
      </div>

      {orders.map((o) => {
        const isLong = o.side === "LONG";
        const accentCol = isLong ? C.long : C.short;

        return (
          <div
            key={o.id}
            className="bt-row"
            style={{
              display: "grid",
              gridTemplateColumns: "18px 120px 80px 80px 110px 110px 100px 100px 140px",
              alignItems: "center",
              minHeight: 44,
              borderBottom: `1px solid ${C.border}`,
              background: C.bg1,
              gap: "0 8px",
            }}
          >
            {/* Left accent */}
            <div style={{
              width: 3,
              alignSelf: "stretch",
              background: accentCol,
              opacity: 0.5,
              borderRadius: "0 2px 2px 0",
            }} />

            <span style={{ fontWeight: 700, color: C.text }}>{o.symbol}</span>
            <span><TypeBadge type={o.type} /></span>
            <span><SidePill side={o.side} /></span>
            <span style={{ color: C.text, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>
              {fmt(o.entry, 4)}
            </span>
            <span style={{ color: C.text2, fontFeatureSettings: '"tnum"' }}>${fmt(o.usdt)}</span>
            <span style={{ color: o.take_profit ? C.tp : C.muted, fontSize: 11, fontFeatureSettings: '"tnum"' }}>
              {o.take_profit != null ? fmt(o.take_profit, 4) : "—"}
            </span>
            <span style={{ color: o.stop_price ? C.sl : C.muted, fontSize: 11, fontFeatureSettings: '"tnum"' }}>
              {o.stop_price != null ? fmt(o.stop_price, 4) : "—"}
            </span>
            <span style={{ color: C.muted, fontSize: 10 }}>{timeAgo(o.placed_time)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Trade History Tab ──────────────────────────────────────────────

function TradeHistoryTab({ history }: { history: BtHistoryEntry[] }) {
  if (!history.length)
    return <EmptyState icon="≡" text="No closed trades yet" />;

  const sorted = [...history].reverse();
  const total = sorted.length;

  return (
    <div style={{ fontSize: 12 }}>
      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "40px 18px 120px 80px 80px 100px 70px 140px 90px 140px 140px",
        padding: "0 0 0 8px",
        height: 30,
        alignItems: "center",
        background: C.bg2,
        borderBottom: `1px solid ${C.border}`,
        position: "sticky",
        top: 0,
        zIndex: 2,
        gap: "0 8px",
      }}>
        {["#", "", "SYMBOL", "SIDE", "LEV", "ENTRY", "MARGIN", "REALIZED PnL", "ROE %", "OPENED", "CLOSED"].map(h => (
          <span key={h} style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>{h}</span>
        ))}
      </div>

      {sorted.map((p, i) => {
        const isLong = p.side === "LONG";
        const accentCol = isLong ? C.long : C.short;
        const isWin = p.pnl_usdt > 0;

        return (
          <div
            key={p.id}
            className="bt-row"
            style={{
              display: "grid",
              gridTemplateColumns: "40px 18px 120px 80px 80px 100px 70px 140px 90px 140px 140px",
              alignItems: "center",
              minHeight: 44,
              borderBottom: `1px solid ${C.border}`,
              background: i % 2 === 0 ? C.bg1 : C.bg0,
              gap: "0 8px",
              padding: "0 0 0 8px",
            }}
          >
            {/* Row number */}
            <span style={{ color: C.muted, fontSize: 10, textAlign: "right", paddingRight: 8 }}>
              {total - i}
            </span>

            {/* Left accent */}
            <div style={{
              width: 3,
              alignSelf: "stretch",
              background: accentCol,
              opacity: 0.6,
              borderRadius: "0 2px 2px 0",
            }} />

            <span style={{ fontWeight: 700, color: C.text }}>{p.symbol}</span>
            <span><SidePill side={p.side} /></span>
            <span><LevBadge lev={p.leverage} /></span>
            <span style={{ color: C.text2, fontFeatureSettings: '"tnum"' }}>{fmt(p.entry, 4)}</span>
            <span style={{ color: C.text2, fontFeatureSettings: '"tnum"' }}>${fmt(p.margin)}</span>

            {/* Realized PnL — full colored cell */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 8px",
              borderRadius: 5,
              background: pnlDim(p.pnl_usdt),
              border: `1px solid ${isWin ? C.long + "20" : C.short + "20"}`,
            }}>
              {/* Win/loss icon */}
              <span style={{ fontSize: 10, color: pnlColor(p.pnl_usdt) }}>
                {isWin ? "▲" : "▼"}
              </span>
              <span style={{
                color: pnlColor(p.pnl_usdt),
                fontWeight: 700,
                fontFeatureSettings: '"tnum"',
              }}>
                {sign(p.pnl_usdt)}${fmt(Math.abs(p.pnl_usdt))}
              </span>
            </div>

            {/* ROE */}
            <span style={{
              color: pnlColor(p.pnl_pct),
              fontWeight: 700,
              fontFeatureSettings: '"tnum"',
            }}>
              {sign(p.pnl_pct)}{fmt(p.pnl_pct, 2)}%
            </span>

            <span style={{ color: C.muted, fontSize: 10 }}>{timeAgo(p.open_time)}</span>

            {/* Closed with state */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: C.muted, fontSize: 10 }}>{timeAgo(p.close_time)}</span>
              <StatePill state={p.state} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Assets Tab ─────────────────────────────────────────────────────

function AssetsTab({ state }: { state: BtState }) {
  const freeMargin = state.balance - state.margin_used;
  const marginRatio = state.balance > 0 ? (state.margin_used / state.balance) * 100 : 0;

  const cards = [
    {
      label: "Wallet Balance",
      value: state.balance,
      sub: "Available funds",
      color: C.text,
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="5" width="16" height="12" rx="2" stroke={C.accent} strokeWidth="1.5"/>
          <path d="M14 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill={C.accent}/>
          <path d="M2 8h16" stroke={C.accent} strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      label: "Margin Used",
      value: state.margin_used,
      sub: `${fmt(marginRatio, 1)}% of balance`,
      color: C.text2,
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7" stroke="#a78bfa" strokeWidth="1.5"/>
          <path d="M10 6v4l3 2" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      bar: { value: marginRatio, color: "#a78bfa" },
    },
    {
      label: "Unrealized PnL",
      value: state.unrealized_pnl,
      sub: state.unrealized_pnl >= 0 ? "In profit" : "In loss",
      color: pnlColor(state.unrealized_pnl),
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <polyline points="2,14 7,8 11,11 18,4" stroke={pnlColor(state.unrealized_pnl)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="14,4 18,4 18,8" stroke={pnlColor(state.unrealized_pnl)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: "Total Equity",
      value: state.equity,
      sub: `Free margin $${fmt(freeMargin)}`,
      color: state.equity >= state.balance ? C.long : C.short,
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2L12.5 7.5H18L13.5 11L15.5 17L10 13.5L4.5 17L6.5 11L2 7.5H7.5Z" stroke={C.accent} strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
      }}>
        {cards.map(({ label, value, sub, color, icon, bar }) => (
          <div
            key={label}
            className="bt-card"
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "16px 18px",
              boxShadow: "0 2px 12px #00000030",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
              <div style={{
                width: 36, height: 36,
                borderRadius: 8,
                background: C.bg4,
                border: `1px solid ${C.border2}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                {icon}
              </div>
            </div>

            <div style={{
              fontSize: 22,
              fontWeight: 800,
              color,
              letterSpacing: "-0.02em",
              fontFeatureSettings: '"tnum"',
              lineHeight: 1.1,
            }}>
              {value < 0 ? "-" : ""} ${fmt(Math.abs(value))}
            </div>

            <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>{sub}</div>

            {bar && (
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 3, borderRadius: 2, background: C.border2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, bar.value)}%`,
                    background: bar.color,
                    borderRadius: 2,
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Equity Curve ───────────────────────────────────────────────────

function EquityCurve({ curve, initial }: { curve: number[]; initial: number }) {
  if (curve.length < 2) return null;

  const W = 380, H = 110, PX = 10, PY = 8;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const range = max - min || 1;

  const xs = curve.map((_, i) => PX + ((W - PX * 2) * i) / (curve.length - 1));
  const ys = curve.map(v => PY + (H - PY * 2) * (1 - (v - min) / range));

  const polyPoints = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const areaD = `M ${xs[0]},${H - PY} ` + xs.map((x, i) => `L ${x},${ys[i]}`).join(" ") + ` L ${xs[xs.length-1]},${H - PY} Z`;

  const baselineY = Math.max(PY, Math.min(H - PY, PY + (H - PY * 2) * (1 - (initial - min) / range)));
  const last = curve[curve.length - 1];
  const isProfit = last >= initial;
  const lineColor = isProfit ? C.long : C.short;
  const gradId = `ec-${isProfit ? "g" : "r"}`;

  const endX = xs[xs.length - 1];
  const endY = ys[ys.length - 1];

  // Vertical grid lines (5)
  const vGridXs = [0, 1, 2, 3, 4].map(i => PX + (W - PX * 2) * i / 4);

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", borderRadius: 6 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02"/>
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="#080b0f" rx="6"/>

      {/* Vertical grid */}
      {vGridXs.map((x, i) => (
        <line key={i} x1={x} y1={PY} x2={x} y2={H - PY} stroke={C.border} strokeWidth={0.5} strokeDasharray="2,4"/>
      ))}

      {/* Horizontal grid (3) */}
      {[PY, (H) / 2, H - PY].map((y, i) => (
        <line key={i} x1={PX} y1={y} x2={W - PX} y2={y} stroke={C.border} strokeWidth={0.5}/>
      ))}

      {/* Baseline (initial_balance) */}
      <line x1={PX} y1={baselineY} x2={W - PX} y2={baselineY}
        stroke={isProfit ? C.long : C.short} strokeWidth={0.8}
        strokeDasharray="5,4" opacity={0.35}
      />

      {/* Area fill */}
      <path d={areaD} fill={`url(#${gradId})`}/>

      {/* Main line */}
      <polyline
        points={polyPoints}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* End dot — pulsing outer ring */}
      <circle cx={endX} cy={endY} r={7} fill={lineColor} opacity={0.15} className="bt-dot-pulse"/>
      <circle cx={endX} cy={endY} r={4} fill={lineColor} opacity={0.3}/>
      <circle cx={endX} cy={endY} r={2.5} fill={lineColor}/>
    </svg>
  );
}

// ── Results Tab ────────────────────────────────────────────────────

function ResultsTab({ result }: { result: BtResult }) {
  const isProfit = result.return_pct >= 0;
  const returnColor = isProfit ? C.long : C.short;
  const winPct = Math.min(100, Math.max(0, result.win_rate));

  return (
    <div className="bt-scrollbar" style={{
      padding: "16px 20px",
      overflowY: "auto",
      display: "flex",
      gap: 16,
      flexWrap: "wrap",
      alignItems: "flex-start",
    }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "18px 20px",
        minWidth: 400,
        flexShrink: 0,
        boxShadow: "0 4px 24px #00000040",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              Net Return
            </div>
            <div style={{
              fontSize: 38,
              fontWeight: 900,
              color: returnColor,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontFeatureSettings: '"tnum"',
            }}>
              {isProfit ? "+" : ""}{fmt(result.return_pct, 2)}%
            </div>
            <div style={{ fontSize: 12, color: C.text2, marginTop: 8, fontWeight: 500 }}>
              <span style={{ color: C.muted }}>${fmt(result.initial_balance)}</span>
              <span style={{ margin: "0 6px", color: C.border3 }}>→</span>
              <span style={{ fontWeight: 700, color: returnColor }}>${fmt(result.final_balance)}</span>
              <span style={{ marginLeft: 8, color: returnColor, fontWeight: 600, fontSize: 11 }}>
                ({sign(result.total_pnl_usdt)}${fmt(Math.abs(result.total_pnl_usdt))} USDT)
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              display: "inline-block",
              padding: "5px 12px",
              borderRadius: 7,
              background: isProfit ? C.longDim : C.shortDim,
              color: returnColor,
              fontSize: 12,
              fontWeight: 700,
              border: `1px solid ${returnColor}30`,
              marginBottom: 6,
            }}>
              {result.total_trades} trades
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>
              {result.winning_trades}W / {result.losing_trades}L
            </div>
          </div>
        </div>
        <EquityCurve curve={result.equity_curve} initial={result.initial_balance} />
      </div>

      {/* ── Trade stats ──────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220, flex: 1 }}>
        <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Trade Statistics
        </div>

        {/* Win rate */}
        <div style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 9,
          padding: "14px 16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: C.text2 }}>Win Rate</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFeatureSettings: '"tnum"' }}>
              {fmt(result.win_rate, 1)}%
            </span>
          </div>
          <div style={{ position: "relative", height: 6, borderRadius: 3, background: C.shortDim, overflow: "hidden" }}>
            <div style={{
              position: "absolute",
              left: 0, top: 0, bottom: 0,
              width: `${winPct}%`,
              background: `linear-gradient(90deg, ${C.long}, ${C.tp})`,
              borderRadius: 3,
              transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
            <span style={{ fontSize: 10, color: C.long, fontWeight: 600 }}>▲ {result.winning_trades} wins</span>
            <span style={{ fontSize: 10, color: C.short, fontWeight: 600 }}>▼ {result.losing_trades} losses</span>
          </div>
        </div>

        {/* Stat rows */}
        {([
          ["Profit Factor",  fmt(result.profit_factor, 2),                result.profit_factor >= 1 ? C.long : C.short],
          ["Risk / Reward",  `1 : ${fmt(result.risk_reward, 2)}`,          result.risk_reward >= 1 ? C.long : C.text2],
          ["Avg Win",        `+$${fmt(result.avg_win)}`,                   C.long],
          ["Avg Loss",       `-$${fmt(Math.abs(result.avg_loss))}`,        C.short],
          ["Largest Win",    `+$${fmt(result.largest_win)}`,               C.long],
          ["Largest Loss",   `-$${fmt(Math.abs(result.largest_loss))}`,    C.short],
        ] as [string, string, string][]).map(([label, val, color]) => (
          <div
            key={label}
            className="bt-stat"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "9px 14px",
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color, fontFeatureSettings: '"tnum"' }}>{val}</span>
          </div>
        ))}
      </div>

      {/* ── Risk metrics ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220, flex: 1 }}>
        <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Risk Metrics
        </div>

        {/* Max drawdown */}
        <div style={{
          background: C.card,
          border: `1px solid ${C.short}20`,
          borderRadius: 9,
          padding: "14px 16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: C.text2 }}>Max Drawdown</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: C.short, fontFeatureSettings: '"tnum"' }}>
              -{fmt(result.max_drawdown_pct, 1)}%
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
            -${fmt(result.max_drawdown_usdt)} USDT
          </div>
          <div style={{ height: 4, borderRadius: 2, background: C.border2, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, result.max_drawdown_pct)}%`,
              background: `linear-gradient(90deg, ${C.short}, #ff8080)`,
              borderRadius: 2,
            }} />
          </div>
        </div>

        {([
          ["Gross Profit",    `+$${fmt(result.gross_profit)}`,            C.long],
          ["Gross Loss",      `-$${fmt(Math.abs(result.gross_loss))}`,    C.short],
          ["Initial Balance", `$${fmt(result.initial_balance)}`,          C.text2],
          ["Final Balance",   `$${fmt(result.final_balance)}`,            isProfit ? C.long : C.short],
        ] as [string, string, string][]).map(([label, val, color]) => (
          <div
            key={label}
            className="bt-stat"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "9px 14px",
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color, fontFeatureSettings: '"tnum"' }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

type Tab = "positions" | "orders" | "history" | "assets" | "results";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "positions", label: "Positions",     icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="3" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4 3V2a2 2 0 0 1 4 0v1" stroke="currentColor" strokeWidth="1.3"/></svg> },
  { id: "orders",    label: "Open Orders",   icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M3 6h6M3 4h4M3 8h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg> },
  { id: "history",   label: "Trade History", icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v5l3 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/></svg> },
  { id: "assets",    label: "Assets",        icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 9l3-3 2 2 5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id: "results",   label: "Results",       icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="6" width="2.5" height="5" rx="0.8" fill="currentColor"/><rect x="4.75" y="3" width="2.5" height="8" rx="0.8" fill="currentColor"/><rect x="8.5" y="1" width="2.5" height="10" rx="0.8" fill="currentColor"/></svg> },
];

interface Props {
  state: BtState;
  result?: BtResult | null;
  progress?: { current: number; total: number; pct: number } | null;
}

export const BtPanel = memo(function BtPanel({ state, result, progress }: Props) {
  const [tab, setTab]       = useState<Tab>("positions");
  const [height, setHeight] = useState(280);
  const dragging            = useRef(false);
  const startY              = useRef(0);
  const startH              = useRef(0);

  useEffect(() => {
    if (!result && tab === "results") setTab("positions");
  }, [result, tab]);

  const prevResultRef = useRef<BtResult | null | undefined>(undefined);
  useEffect(() => {
    if (result && prevResultRef.current == null) setTab("results");
    prevResultRef.current = result;
  }, [result]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startY.current   = e.clientY;
    startH.current   = height;
    e.preventDefault();
  }, [height]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setHeight(Math.max(160, Math.min(700, startH.current + startY.current - e.clientY)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const posCount = state.positions.length;
  const ordCount = state.orders.length;
  const isRunning = progress != null && progress.pct < 100;

  return (
    <div style={{
      height,
      background: C.bg1,
      borderTop: `1px solid ${C.border}`,
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      position: "relative",
      userSelect: "none",
    }}>
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        style={{ height: 4, cursor: "row-resize", position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}
        onMouseEnter={e => (e.currentTarget.style.background = C.accent + "50")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      />

      {/* Progress bar */}
      {isRunning && (
        <div style={{ height: 2, background: C.bg3, flexShrink: 0 }}>
          <div style={{
            height: "100%",
            width: `${progress!.pct}%`,
            background: `linear-gradient(90deg, ${C.accent}, #f5a623)`,
            transition: "width 0.15s linear",
            boxShadow: `0 0 10px ${C.accent}80`,
          }} />
        </div>
      )}

      {/* Tab bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        background: C.bg2,
        borderBottom: `1px solid ${C.border}`,
        paddingLeft: 2,
        height: 38,
        flexShrink: 0,
      }}>
        {TABS.map(t => {
          if (t.id === "results" && !result) return null;
          const badge = t.id === "positions" ? posCount : t.id === "orders" ? ordCount : null;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`bt-tab${active ? " bt-tab-active" : ""}`}
              style={{
                height: "100%",
                padding: "0 14px",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${active ? C.accent : "transparent"}`,
                color: active ? C.text : C.muted,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "color 0.12s, border-color 0.12s, background 0.12s",
                whiteSpace: "nowrap",
                borderRadius: 0,
              }}
            >
              <span style={{ opacity: active ? 1 : 0.5, display: "flex", alignItems: "center" }}>
                {t.icon}
              </span>
              {t.label}
              {badge != null && badge > 0 && (
                <span style={{
                  background: active ? C.accent + "22" : C.bg4,
                  color: active ? C.accent : C.text2,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 10,
                  border: `1px solid ${active ? C.accent + "30" : C.border2}`,
                  lineHeight: "16px",
                }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Running indicator */}
        {isRunning && (
          <div style={{
            marginLeft: "auto",
            marginRight: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: C.muted,
          }}>
            <span className="bt-dot-pulse" style={{
              display: "inline-block",
              width: 6, height: 6,
              borderRadius: "50%",
              background: C.accent,
              boxShadow: `0 0 8px ${C.accent}`,
            }} />
            Running {progress!.pct.toFixed(1)}%
          </div>
        )}
      </div>

      {/* Content */}
      <div className="bt-scrollbar" style={{ flex: 1, overflow: "auto" }}>
        {tab === "positions" && <PositionsTab positions={state.positions} />}
        {tab === "orders"    && <OrdersTab orders={state.orders} />}
        {tab === "history"   && <TradeHistoryTab history={state.trade_history} />}
        {tab === "assets"    && <AssetsTab state={state} />}
        {tab === "results"   && result && <ResultsTab result={result} />}
      </div>
    </div>
  );
});
