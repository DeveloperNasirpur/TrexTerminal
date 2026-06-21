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
  bg0:     "#0b0e11",   // deepest background
  bg1:     "#12161c",   // panel background
  bg2:     "#161b24",   // tab bar, table header
  bg3:     "#1a2130",   // card background
  bg4:     "#1e2736",   // card hover / row hover
  border:  "#1e2839",   // subtle border
  border2: "#263044",   // slightly lighter border

  text:    "#d1d5db",   // primary text
  text2:   "#9ca3af",   // secondary text
  muted:   "#6b7280",   // placeholders / labels
  accent:  "#f0b90b",   // yellow accent (active tab, badge)

  long:    "#0ecb81",   // profit green
  longBg:  "#0ecb8115", // green tint background
  short:   "#f6465d",   // loss red
  shortBg: "#f6465d15", // red tint background
  tp:      "#26a69a",   // take-profit teal
  sl:      "#ef5350",   // stop-loss red

  statCard: "#131820",  // stats card bg
};

// ── Global styles (injected once) ──────────────────────────────────

const STYLE_ID = "bt-panel-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    .bt-tr:hover td { background: ${C.bg4} !important; }
    .bt-tab:hover { color: ${C.text} !important; }
    .bt-tab-active { border-bottom-color: ${C.accent} !important; color: ${C.text} !important; }
    .bt-stat-card:hover { border-color: ${C.border2} !important; background: ${C.bg4} !important; }
    .bt-asset-card:hover { border-color: ${C.border2} !important; background: ${C.bg4} !important; }
    .bt-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
    .bt-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .bt-scrollbar::-webkit-scrollbar-thumb { background: #263044; border-radius: 2px; }
    .bt-scrollbar::-webkit-scrollbar-thumb:hover { background: #3b4a60; }
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

function pnlColor(n: number): string {
  if (n > 0) return C.long;
  if (n < 0) return C.short;
  return C.text;
}

function pnlBg(n: number): string {
  if (n > 0) return C.longBg;
  if (n < 0) return C.shortBg;
  return "transparent";
}

// ── Shared sub-components ──────────────────────────────────────────

function SideBadge({ side }: { side: string }) {
  const isLong = side === "LONG";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      padding: "2px 7px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.04em",
      background: isLong ? C.longBg : C.shortBg,
      color: isLong ? C.long : C.short,
      border: `1px solid ${isLong ? C.long + "30" : C.short + "30"}`,
    }}>
      {isLong ? "▲" : "▼"} {side}
    </span>
  );
}

function StateTag({ state }: { state: string }) {
  const cfg: Record<string, { color: string; bg: string }> = {
    TRIGGERED:          { color: C.long,   bg: C.longBg },
    TRIGGERED_BY_CLOSE: { color: C.long,   bg: C.longBg },
    STOPPED:            { color: C.short,  bg: C.shortBg },
    STOPPED_BY_CLOSE:   { color: C.short,  bg: C.shortBg },
    LIQUID:             { color: "#f59e0b", bg: "#f59e0b15" },
    OPEN:               { color: C.text2,  bg: "transparent" },
  };
  const { color, bg } = cfg[state] ?? { color: C.muted, bg: "transparent" };
  const label = state.replace(/_BY_CLOSE$/, " ✓").replace(/_/g, " ");
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 7px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      background: bg,
      color,
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
      minHeight: 80,
      gap: 8,
      color: C.muted,
    }}>
      <span style={{ fontSize: 22, opacity: 0.5 }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{text}</span>
    </div>
  );
}

// Shared table styles
const TH: React.CSSProperties = {
  padding: "0 12px",
  height: 32,
  fontSize: 10,
  fontWeight: 600,
  color: C.muted,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  background: C.bg2,
  borderBottom: `1px solid ${C.border}`,
  textAlign: "left",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const TD: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  color: C.text,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap",
};

// ── Positions Tab ──────────────────────────────────────────────────

function PositionsTab({ positions }: { positions: BtPosition[] }) {
  if (!positions.length)
    return <EmptyState icon="📭" text="No open positions" />;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Symbol", "Side", "Size", "Entry", "Mark Price", "Liq. Price", "Margin", "Lev", "Unrealized PnL", "ROE %", "Take Profit", "Stop Loss", "Opened", "Bars"].map(h => (
            <th key={h} style={TH}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {positions.map((p, i) => (
          <tr key={p.id} className="bt-tr" style={{ background: i % 2 === 0 ? C.bg0 : C.bg1 }}>
            <td style={{ ...TD, fontWeight: 600, color: C.text }}>{p.symbol}</td>
            <td style={TD}><SideBadge side={p.side} /></td>
            <td style={{ ...TD, color: C.text2 }}>${fmt(p.margin * p.leverage)}</td>
            <td style={{ ...TD, color: C.text2 }}>{fmt(p.entry, 4)}</td>
            <td style={{ ...TD, fontWeight: 500 }}>{fmt(p.mark, 4)}</td>
            <td style={{ ...TD, color: C.muted }}>{p.liquidy != null ? fmt(p.liquidy, 4) : "—"}</td>
            <td style={{ ...TD, color: C.text2 }}>${fmt(p.margin)}</td>
            <td style={{ ...TD, color: C.text2 }}>{p.leverage}×</td>
            <td style={{
              ...TD,
              color: pnlColor(p.pnl_usdt),
              background: pnlBg(p.pnl_usdt),
              fontWeight: 600,
            }}>
              {p.pnl_usdt >= 0 ? "+" : ""}{fmt(p.pnl_usdt)}
            </td>
            <td style={{ ...TD, color: pnlColor(p.pnl_pct), fontWeight: 500 }}>
              {p.pnl_pct >= 0 ? "+" : ""}{fmt(p.pnl_pct, 2)}%
            </td>
            <td style={{ ...TD, color: p.take_profit ? C.tp : C.muted }}>
              {p.take_profit != null ? fmt(p.take_profit, 4) : "—"}
            </td>
            <td style={{ ...TD, color: p.stop_price ? C.sl : C.muted }}>
              {p.stop_price != null ? fmt(p.stop_price, 4) : "—"}
            </td>
            <td style={{ ...TD, color: C.muted, fontSize: 11 }}>{p.open_time ?? "—"}</td>
            <td style={{ ...TD, color: C.muted }}>{p.bars}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Orders Tab ─────────────────────────────────────────────────────

function OrdersTab({ orders }: { orders: BtOrder[] }) {
  if (!orders.length)
    return <EmptyState icon="📋" text="No pending orders" />;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Symbol", "Type", "Side", "Limit Price", "Size (USDT)", "Take Profit", "Stop Loss", "Placed"].map(h => (
            <th key={h} style={TH}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map((o, i) => (
          <tr key={o.id} className="bt-tr" style={{ background: i % 2 === 0 ? C.bg0 : C.bg1 }}>
            <td style={{ ...TD, fontWeight: 600 }}>{o.symbol}</td>
            <td style={{ ...TD }}>
              <span style={{
                padding: "2px 7px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                background: "#ffffff0a",
                color: C.text2,
                border: `1px solid ${C.border2}`,
              }}>
                {o.type}
              </span>
            </td>
            <td style={TD}><SideBadge side={o.side} /></td>
            <td style={{ ...TD, fontWeight: 500 }}>{fmt(o.entry, 4)}</td>
            <td style={{ ...TD, color: C.text2 }}>${fmt(o.usdt)}</td>
            <td style={{ ...TD, color: o.take_profit ? C.tp : C.muted }}>
              {o.take_profit != null ? fmt(o.take_profit, 4) : "—"}
            </td>
            <td style={{ ...TD, color: o.stop_price ? C.sl : C.muted }}>
              {o.stop_price != null ? fmt(o.stop_price, 4) : "—"}
            </td>
            <td style={{ ...TD, color: C.muted, fontSize: 11 }}>{o.placed_time ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Trade History Tab ──────────────────────────────────────────────

function TradeHistoryTab({ history }: { history: BtHistoryEntry[] }) {
  if (!history.length)
    return <EmptyState icon="📜" text="No closed trades yet" />;

  const sorted = [...history].reverse();
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["#", "Symbol", "Side", "Entry", "Margin", "Lev", "Realized PnL", "ROE %", "Result", "Opened", "Closed"].map(h => (
            <th key={h} style={TH}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((p, i) => (
          <tr key={p.id} className="bt-tr" style={{ background: i % 2 === 0 ? C.bg0 : C.bg1 }}>
            <td style={{ ...TD, color: C.muted, fontSize: 11 }}>{sorted.length - i}</td>
            <td style={{ ...TD, fontWeight: 600 }}>{p.symbol}</td>
            <td style={TD}><SideBadge side={p.side} /></td>
            <td style={{ ...TD, color: C.text2 }}>{fmt(p.entry, 4)}</td>
            <td style={{ ...TD, color: C.text2 }}>${fmt(p.margin)}</td>
            <td style={{ ...TD, color: C.text2 }}>{p.leverage}×</td>
            <td style={{
              ...TD,
              color: pnlColor(p.pnl_usdt),
              background: pnlBg(p.pnl_usdt),
              fontWeight: 600,
            }}>
              {p.pnl_usdt >= 0 ? "+" : ""}{fmt(p.pnl_usdt)} USDT
            </td>
            <td style={{ ...TD, color: pnlColor(p.pnl_pct), fontWeight: 500 }}>
              {p.pnl_pct >= 0 ? "+" : ""}{fmt(p.pnl_pct, 2)}%
            </td>
            <td style={TD}><StateTag state={p.state} /></td>
            <td style={{ ...TD, color: C.muted, fontSize: 11 }}>{p.open_time ?? "—"}</td>
            <td style={{ ...TD, color: C.muted, fontSize: 11 }}>{p.close_time ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Assets Tab ─────────────────────────────────────────────────────

function AssetsTab({ state }: { state: BtState }) {
  const cards: { label: string; value: number; prefix?: string; suffix?: string; colorFn?: (n: number) => string }[] = [
    { label: "Wallet Balance",  value: state.balance,       prefix: "$", suffix: "USDT" },
    { label: "Margin Used",     value: state.margin_used,   prefix: "$", suffix: "USDT" },
    { label: "Unrealized PnL",  value: state.unrealized_pnl, prefix: "$", suffix: "USDT", colorFn: pnlColor },
    { label: "Total Equity",    value: state.equity,         prefix: "$", suffix: "USDT" },
  ];

  const icons = ["💰", "🔒", "📈", "⚖️"];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 12,
      padding: "16px 20px",
    }}>
      {cards.map(({ label, value, prefix, suffix, colorFn }, i) => {
        const color = colorFn ? colorFn(value) : C.text;
        const isMinus = value < 0;
        return (
          <div
            key={label}
            className="bt-asset-card"
            style={{
              background: C.bg3,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "14px 16px",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16, opacity: 0.8 }}>{icons[i]}</span>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 500, letterSpacing: "0.02em" }}>
                {label}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: "-0.01em" }}>
              {prefix}{isMinus ? "-" : ""}{Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{suffix}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Equity Curve ───────────────────────────────────────────────────

function EquityCurve({ curve, initial }: { curve: number[]; initial: number }) {
  if (curve.length < 2) return null;

  const W = 340, H = 100, PAD = 8;
  const min = curve.reduce((a, b) => Math.min(a, b));
  const max = curve.reduce((a, b) => Math.max(a, b));
  const range = max - min || 1;

  const xs = curve.map((_, i) => PAD + ((W - PAD * 2) * i) / (curve.length - 1));
  const ys = curve.map(v => PAD + (H - PAD * 2) * (1 - (v - min) / range));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");

  const baselineRaw = PAD + (H - PAD * 2) * (1 - (initial - min) / range);
  const baseline = Math.max(PAD, Math.min(H - PAD, baselineRaw));

  const last = curve[curve.length - 1];
  const isProfit = last >= initial;
  const lineColor = isProfit ? C.long : C.short;
  const fillColor = isProfit ? "#0ecb8120" : "#f6465d20";

  // Area fill path
  const areaPath = `M ${xs[0]},${H - PAD} L ${pts.split(" ").join(" L ")} L ${xs[xs.length - 1]},${H - PAD} Z`;

  // Grid lines (3 horizontal)
  const gridYs = [PAD, (H - PAD) / 2, H - PAD];

  return (
    <svg width={W} height={H} style={{ display: "block", borderRadius: 6, overflow: "hidden" }}>
      {/* Background */}
      <rect width={W} height={H} fill="#0d1117" />

      {/* Grid lines */}
      {gridYs.map((y, i) => (
        <line key={i} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#1e2839" strokeWidth={1} />
      ))}

      {/* Baseline */}
      <line
        x1={PAD} y1={baseline} x2={W - PAD} y2={baseline}
        stroke={isProfit ? "#0ecb8140" : "#f6465d40"}
        strokeWidth={1}
        strokeDasharray="4,3"
      />

      {/* Area fill */}
      <path d={areaPath} fill={fillColor} />

      {/* Line */}
      <polyline
        points={pts}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* End dot */}
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} fill={lineColor} />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={5} fill={lineColor} opacity={0.25} />
    </svg>
  );
}

// ── Results Tab ────────────────────────────────────────────────────

function ResultsTab({ result }: { result: BtResult }) {
  const isProfit = result.return_pct >= 0;
  const returnColor = isProfit ? C.long : C.short;
  const winRatePct = Math.min(100, Math.max(0, result.win_rate));

  return (
    <div
      className="bt-scrollbar"
      style={{
        padding: "16px 20px",
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        alignItems: "flex-start",
        overflowX: "auto",
      }}
    >
      {/* ── Hero: return + equity curve ─────────────────────────── */}
      <div style={{
        background: C.bg3,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "16px 20px",
        minWidth: 380,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              Net Return
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: returnColor, letterSpacing: "-0.02em", lineHeight: 1 }}>
              {isProfit ? "+" : ""}{fmt(result.return_pct, 2)}%
            </div>
            <div style={{ fontSize: 13, color: C.text2, marginTop: 6, fontWeight: 500 }}>
              ${fmt(result.initial_balance)} → ${fmt(result.final_balance)}{" "}
              <span style={{ color: returnColor, fontWeight: 600 }}>
                ({result.total_pnl_usdt >= 0 ? "+" : ""}{fmt(result.total_pnl_usdt)} USDT)
              </span>
            </div>
          </div>
          <div style={{
            padding: "4px 12px",
            borderRadius: 6,
            background: isProfit ? C.longBg : C.shortBg,
            color: returnColor,
            fontSize: 11,
            fontWeight: 700,
            border: `1px solid ${returnColor}30`,
          }}>
            {result.total_trades} trades
          </div>
        </div>

        {/* Equity curve */}
        <EquityCurve curve={result.equity_curve} initial={result.initial_balance} />
      </div>

      {/* ── Trade stats ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 200, flex: 1 }}>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
          Trade Statistics
        </div>

        {/* Win rate bar */}
        <div style={{
          background: C.bg3,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "12px 14px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Win Rate</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              {fmt(result.win_rate, 1)}%
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: C.shortBg, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${winRatePct}%`,
              background: `linear-gradient(90deg, ${C.long}, ${C.tp})`,
              borderRadius: 3,
              transition: "width 0.6s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 10, color: C.long }}>▲ {result.winning_trades} wins</span>
            <span style={{ fontSize: 10, color: C.short }}>▼ {result.losing_trades} losses</span>
          </div>
        </div>

        {/* Stats grid */}
        {[
          ["Profit Factor",  fmt(result.profit_factor, 2),          result.profit_factor >= 1 ? C.long : C.short],
          ["Risk / Reward",  `1 : ${fmt(result.risk_reward, 2)}`,   result.risk_reward >= 1 ? C.long : C.text],
          ["Avg Win",        `+$${fmt(result.avg_win)}`,            C.long],
          ["Avg Loss",       `-$${fmt(Math.abs(result.avg_loss))}`, C.short],
          ["Largest Win",    `+$${fmt(result.largest_win)}`,        C.long],
          ["Largest Loss",   `-$${fmt(Math.abs(result.largest_loss))}`, C.short],
        ].map(([label, val, color]) => (
          <div
            key={label as string}
            className="bt-stat-card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 14px",
              background: C.statCard,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: color as string }}>{val}</span>
          </div>
        ))}
      </div>

      {/* ── Risk metrics ────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 200, flex: 1 }}>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
          Risk Metrics
        </div>

        {/* Max drawdown card */}
        <div style={{
          background: C.bg3,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "12px 14px",
        }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Max Drawdown</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.short }}>
            -{fmt(result.max_drawdown_pct, 1)}%
          </div>
          <div style={{ fontSize: 11, color: C.text2, marginTop: 3 }}>
            -${fmt(result.max_drawdown_usdt)} USDT
          </div>
          <div style={{ height: 4, borderRadius: 2, background: C.border, marginTop: 10, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, result.max_drawdown_pct)}%`,
              background: `linear-gradient(90deg, ${C.short}, #ff6b6b)`,
              borderRadius: 2,
            }} />
          </div>
        </div>

        {[
          ["Gross Profit",   `+$${fmt(result.gross_profit)}`,           C.long],
          ["Gross Loss",     `-$${fmt(Math.abs(result.gross_loss))}`,   C.short],
          ["Initial Balance",`$${fmt(result.initial_balance)}`,         C.text2],
          ["Final Balance",  `$${fmt(result.final_balance)}`,           isProfit ? C.long : C.short],
        ].map(([label, val, color]) => (
          <div
            key={label as string}
            className="bt-stat-card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 14px",
              background: C.statCard,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: color as string }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

type Tab = "positions" | "orders" | "history" | "assets" | "results";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "positions", label: "Positions",    icon: "◈" },
  { id: "orders",    label: "Open Orders",  icon: "◎" },
  { id: "history",   label: "Trade History", icon: "≡" },
  { id: "assets",    label: "Assets",       icon: "◆" },
  { id: "results",   label: "Results",      icon: "▦" },
];

interface Props {
  state: BtState;
  result?: BtResult | null;
  progress?: { current: number; total: number; pct: number } | null;
}

export const BtPanel = memo(function BtPanel({ state, result, progress }: Props) {
  const [tab, setTab]       = useState<Tab>("positions");
  const [height, setHeight] = useState(260);
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
      const delta = startY.current - e.clientY;
      setHeight(Math.max(140, Math.min(640, startH.current + delta)));
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
    <div
      style={{
        height,
        background: C.bg1,
        borderTop: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "relative",
        userSelect: "none",
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          height: 5,
          cursor: "row-resize",
          background: "transparent",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = C.accent + "40")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      />

      {/* Progress bar — full width, above tab bar */}
      {isRunning && (
        <div style={{ height: 2, background: C.border, flexShrink: 0 }}>
          <div style={{
            height: "100%",
            width: `${progress!.pct}%`,
            background: `linear-gradient(90deg, ${C.accent}, #f5a623)`,
            transition: "width 0.2s ease",
            boxShadow: `0 0 8px ${C.accent}60`,
          }} />
        </div>
      )}

      {/* Tab bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        background: C.bg2,
        borderBottom: `1px solid ${C.border}`,
        paddingLeft: 4,
        height: 38,
        flexShrink: 0,
        gap: 0,
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
                borderBottom: `2px solid transparent`,
                color: active ? C.text : C.muted,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "color 0.15s, border-color 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ fontSize: 10, opacity: active ? 1 : 0.6 }}>{t.icon}</span>
              {t.label}
              {badge != null && badge > 0 && (
                <span style={{
                  background: active ? C.accent + "25" : "#ffffff12",
                  color: active ? C.accent : C.text2,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 10,
                  minWidth: 18,
                  textAlign: "center",
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
            marginRight: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: C.muted,
          }}>
            <span style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: C.accent,
              boxShadow: `0 0 6px ${C.accent}`,
              animation: "none",
            }} />
            {progress!.pct.toFixed(1)}%
          </div>
        )}
      </div>

      {/* Content area */}
      <div
        className="bt-scrollbar"
        style={{ flex: 1, overflow: "auto" }}
      >
        {tab === "positions" && <PositionsTab positions={state.positions} />}
        {tab === "orders"    && <OrdersTab orders={state.orders} />}
        {tab === "history"   && <TradeHistoryTab history={state.trade_history} />}
        {tab === "assets"    && <AssetsTab state={state} />}
        {tab === "results"   && result && <ResultsTab result={result} />}
      </div>
    </div>
  );
});
