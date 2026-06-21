// ═══════════════════════════════════════════════════════════════════
// BtPanel — Binance-style bottom panel for backtest mode
// Tabs: Positions | Open Orders | Trade History | Assets
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

// ── Styles ─────────────────────────────────────────────────────────

const BG       = "#0b0e11";
const BG2      = "#161a1f";
const BORDER   = "#2b3139";
const TEXT      = "#eaecef";
const MUTED     = "#848e9c";
const LONG_CLR  = "#0ecb81";
const SHORT_CLR = "#f6465d";
const HEADER    = "#0b0e11";

const cell: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 12,
  color: TEXT,
  borderBottom: `1px solid ${BORDER}`,
  whiteSpace: "nowrap",
};
const hcell: React.CSSProperties = {
  ...cell,
  color: MUTED,
  fontSize: 11,
  fontWeight: 600,
  background: HEADER,
  position: "sticky",
  top: 0,
  zIndex: 1,
};

// ── Helpers ────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pnlColor(n: number): string {
  if (n > 0) return LONG_CLR;
  if (n < 0) return SHORT_CLR;
  return TEXT;
}

function SideBadge({ side }: { side: string }) {
  const color = side === "LONG" ? LONG_CLR : SHORT_CLR;
  return (
    <span style={{ color, fontWeight: 700, fontSize: 11 }}>
      {side === "LONG" ? "▲ LONG" : "▼ SHORT"}
    </span>
  );
}

function StateTag({ state }: { state: string }) {
  const map: Record<string, string> = {
    TRIGGERED: LONG_CLR, TRIGGERED_BY_CLOSE: LONG_CLR,
    STOPPED: SHORT_CLR, STOPPED_BY_CLOSE: SHORT_CLR,
    LIQUID: "#ff9800", OPEN: TEXT,
  };
  return <span style={{ color: map[state] ?? MUTED, fontSize: 11 }}>{state.replace(/_/g, " ")}</span>;
}

// ── Tab panels ─────────────────────────────────────────────────────

function PositionsTab({ positions }: { positions: BtPosition[] }) {
  if (positions.length === 0)
    return <EmptyRow text="No open positions" />;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Symbol", "Side", "Size (USDT)", "Entry", "Mark", "Liq Price", "Margin", "Leverage", "Unrealized PnL", "ROE %", "TP", "SL", "Opened"].map(h => (
            <th key={h} style={hcell}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {positions.map(p => (
          <tr key={p.id} style={{ background: BG }}>
            <td style={cell}>{p.symbol}</td>
            <td style={cell}><SideBadge side={p.side} /></td>
            <td style={cell}>{fmt(p.margin * p.leverage)}</td>
            <td style={cell}>{fmt(p.entry, 4)}</td>
            <td style={cell}>{fmt(p.mark, 4)}</td>
            <td style={cell}>{p.liquidy != null ? fmt(p.liquidy, 4) : "—"}</td>
            <td style={cell}>{fmt(p.margin)}</td>
            <td style={cell}>{p.leverage}×</td>
            <td style={{ ...cell, color: pnlColor(p.pnl_usdt) }}>{fmt(p.pnl_usdt)}</td>
            <td style={{ ...cell, color: pnlColor(p.pnl_pct) }}>{fmt(p.pnl_pct, 2)}%</td>
            <td style={{ ...cell, color: p.take_profit ? LONG_CLR : MUTED }}>{p.take_profit != null ? fmt(p.take_profit, 4) : "—"}</td>
            <td style={{ ...cell, color: p.stop_price ? SHORT_CLR : MUTED }}>{p.stop_price != null ? fmt(p.stop_price, 4) : "—"}</td>
            <td style={{ ...cell, color: MUTED }}>{p.open_time ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrdersTab({ orders }: { orders: BtOrder[] }) {
  if (orders.length === 0)
    return <EmptyRow text="No open orders" />;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Symbol", "Type", "Side", "Limit Price", "Size (USDT)", "TP", "SL", "Placed"].map(h => (
            <th key={h} style={hcell}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map(o => (
          <tr key={o.id} style={{ background: BG }}>
            <td style={cell}>{o.symbol}</td>
            <td style={{ ...cell, color: MUTED }}>{o.type}</td>
            <td style={cell}><SideBadge side={o.side} /></td>
            <td style={cell}>{fmt(o.entry, 4)}</td>
            <td style={cell}>{fmt(o.usdt)}</td>
            <td style={{ ...cell, color: o.take_profit ? LONG_CLR : MUTED }}>{o.take_profit != null ? fmt(o.take_profit, 4) : "—"}</td>
            <td style={{ ...cell, color: o.stop_price ? SHORT_CLR : MUTED }}>{o.stop_price != null ? fmt(o.stop_price, 4) : "—"}</td>
            <td style={{ ...cell, color: MUTED }}>{o.placed_time ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TradeHistoryTab({ history }: { history: BtHistoryEntry[] }) {
  if (history.length === 0)
    return <EmptyRow text="No closed trades" />;
  const sorted = [...history].reverse();
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Symbol", "Side", "Entry", "Margin", "Leverage", "Realized PnL", "ROE %", "Result", "Opened", "Closed"].map(h => (
            <th key={h} style={hcell}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(p => (
          <tr key={p.id} style={{ background: BG }}>
            <td style={cell}>{p.symbol}</td>
            <td style={cell}><SideBadge side={p.side} /></td>
            <td style={cell}>{fmt(p.entry, 4)}</td>
            <td style={cell}>{fmt(p.margin)}</td>
            <td style={cell}>{p.leverage}×</td>
            <td style={{ ...cell, color: pnlColor(p.pnl_usdt) }}>{fmt(p.pnl_usdt)}</td>
            <td style={{ ...cell, color: pnlColor(p.pnl_pct) }}>{fmt(p.pnl_pct, 2)}%</td>
            <td style={cell}><StateTag state={p.state} /></td>
            <td style={{ ...cell, color: MUTED }}>{p.open_time ?? "—"}</td>
            <td style={{ ...cell, color: MUTED }}>{p.close_time ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AssetsTab({ state }: { state: BtState }) {
  const rows: [string, string, string?][] = [
    ["Wallet Balance",   fmt(state.balance),         "USDT"],
    ["Margin Used",      fmt(state.margin_used),     "USDT"],
    ["Unrealized PnL",   fmt(state.unrealized_pnl),  "USDT"],
    ["Equity",           fmt(state.equity),           "USDT"],
  ];
  return (
    <div style={{ padding: "16px 20px", display: "flex", gap: 40, flexWrap: "wrap" }}>
      {rows.map(([label, val, unit]) => (
        <div key={label} style={{ minWidth: 160 }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: label.includes("Unrealized") ? pnlColor(state.unrealized_pnl) : TEXT }}>
            {val} <span style={{ fontSize: 12, fontWeight: 400, color: MUTED }}>{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EquityCurve({ curve, initial }: { curve: number[]; initial: number }) {
  if (curve.length < 2) return null;
  const W = 320, H = 80, PAD = 6;
  const min = curve.reduce((a, b) => Math.min(a, b));
  const max = curve.reduce((a, b) => Math.max(a, b));
  const range = max - min || 1;
  const xs = curve.map((_, i) => PAD + ((W - PAD * 2) * i) / (curve.length - 1));
  const ys = curve.map(v => PAD + (H - PAD * 2) * (1 - (v - min) / range));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const baseline = PAD + (H - PAD * 2) * (1 - (initial - min) / range);
  const color = curve[curve.length - 1] >= initial ? LONG_CLR : SHORT_CLR;
  return (
    <svg width={W} height={H} style={{ display: "block", borderRadius: 4, background: "#0d1117", overflow: "visible" }}>
      <line x1={PAD} y1={baseline} x2={W - PAD} y2={baseline} stroke="#2b3139" strokeWidth={1} strokeDasharray="3,3" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} fill={color} />
    </svg>
  );
}

function ResultsTab({ result }: { result: BtResult }) {
  const win = result.return_pct >= 0;
  const rows: [string, string, string?][] = [
    ["Initial Balance",   `$${result.initial_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "USDT"],
    ["Final Balance",     `$${result.final_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "USDT"],
    ["Net Return",        `${result.return_pct >= 0 ? "+" : ""}${fmt(result.return_pct, 2)}%`],
    ["Total P&L",         `${result.total_pnl_usdt >= 0 ? "+" : ""}${fmt(result.total_pnl_usdt)}`, "USDT"],
  ];
  const stats: [string, string][] = [
    ["Total Trades",     String(result.total_trades)],
    ["Win / Loss",       `${result.winning_trades} / ${result.losing_trades}`],
    ["Win Rate",         `${fmt(result.win_rate, 1)}%`],
    ["Profit Factor",    fmt(result.profit_factor, 2)],
    ["Risk / Reward",    fmt(result.risk_reward, 2)],
    ["Gross Profit",     `+${fmt(result.gross_profit)} USDT`],
    ["Gross Loss",       `${fmt(result.gross_loss)} USDT`],
    ["Largest Win",      `+${fmt(result.largest_win)} USDT`],
    ["Largest Loss",     `${fmt(result.largest_loss)} USDT`],
    ["Avg Win",          `+${fmt(result.avg_win)} USDT`],
    ["Avg Loss",         `${fmt(result.avg_loss)} USDT`],
    ["Max Drawdown",     `${fmt(result.max_drawdown_pct, 1)}%  ($${fmt(result.max_drawdown_usdt)})`],
  ];
  return (
    <div style={{ padding: "16px 20px", display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
      {/* Left: key metrics */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 200 }}>
        {rows.map(([label, val, unit]) => {
          const isReturn = label === "Net Return";
          const isPnl = label === "Total P&L";
          const colored = (isReturn || isPnl) ? pnlColor(isPnl ? result.total_pnl_usdt : result.return_pct) : TEXT;
          return (
            <div key={label}>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: isReturn ? 22 : 16, fontWeight: 700, color: isReturn ? (win ? LONG_CLR : SHORT_CLR) : colored }}>
                {val}{unit && <span style={{ fontSize: 11, fontWeight: 400, color: MUTED, marginLeft: 4 }}>{unit}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Middle: equity curve */}
      <div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>Equity Curve</div>
        <EquityCurve curve={result.equity_curve} initial={result.initial_balance} />
      </div>

      {/* Right: stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "6px 24px", alignContent: "start" }}>
        {stats.map(([label, val]) => (
          <div key={label} style={{ display: "contents" }}>
            <span style={{ fontSize: 11, color: MUTED }}>{label}</span>
            <span style={{ fontSize: 11, color: TEXT, fontWeight: 500 }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: "20px", textAlign: "center", color: MUTED, fontSize: 13 }}>
      {text}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

type Tab = "positions" | "orders" | "history" | "assets" | "results";

const TABS: { id: Tab; label: string }[] = [
  { id: "positions", label: "Positions" },
  { id: "orders",    label: "Open Orders" },
  { id: "history",   label: "Trade History" },
  { id: "assets",    label: "Assets" },
  { id: "results",   label: "Results" },
];

interface Props {
  state: BtState;
  result?: BtResult | null;
  progress?: { current: number; total: number; pct: number } | null;
}

export const BtPanel = memo(function BtPanel({ state, result, progress }: Props) {
  const [tab, setTab]       = useState<Tab>("positions");
  const [height, setHeight] = useState(240);
  const dragging            = useRef(false);

  useEffect(() => {
    if (!result && tab === "results") setTab("positions");
  }, [result, tab]);
  const startY              = useRef(0);
  const startH              = useRef(0);

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
      setHeight(Math.max(120, Math.min(600, startH.current + delta)));
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

  return (
    <div
      style={{
        height,
        background: BG,
        borderTop: `1px solid ${BORDER}`,
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
          height: 4,
          cursor: "row-resize",
          background: "transparent",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "#3b4250")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      />

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: BG2,
          borderBottom: `1px solid ${BORDER}`,
          paddingLeft: 8,
          height: 36,
          flexShrink: 0,
        }}
      >
        {TABS.map(t => {
          if (t.id === "results" && !result) return null;
          const badge = t.id === "positions" ? posCount : t.id === "orders" ? ordCount : null;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                height: "100%",
                padding: "0 14px",
                background: "transparent",
                border: "none",
                borderBottom: active ? `2px solid #f0b90b` : "2px solid transparent",
                color: active ? TEXT : MUTED,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "color 0.15s",
              }}
            >
              {t.label}
              {badge != null && badge > 0 && (
                <span
                  style={{
                    background: "#f0b90b22",
                    color: "#f0b90b",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 3,
                    minWidth: 16,
                    textAlign: "center",
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Progress bar */}
      {progress && progress.total > 0 && progress.pct < 100 && (
        <div style={{ height: 3, background: "#2b3139", flexShrink: 0 }}>
          <div style={{
            height: "100%",
            width: `${progress.pct}%`,
            background: "linear-gradient(90deg, #f0b90b, #f5a623)",
            transition: "width 0.15s ease",
          }} />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "positions" && <PositionsTab positions={state.positions} />}
        {tab === "orders"    && <OrdersTab orders={state.orders} />}
        {tab === "history"   && <TradeHistoryTab history={state.trade_history} />}
        {tab === "assets"    && <AssetsTab state={state} />}
        {tab === "results"   && result && <ResultsTab result={result} />}
      </div>
    </div>
  );
});
