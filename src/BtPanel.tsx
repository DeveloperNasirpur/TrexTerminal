// ═══════════════════════════════════════════════════════════════════
// BtPanel — professional backtest panel
// Tabs: Positions | Open Orders | Trade History | Assets | Results
// ═══════════════════════════════════════════════════════════════════
import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react";

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

const STYLE_ID = "bt-panel-v4";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes bt-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes bt-fadein { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
    @keyframes bt-shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }

    .bt-row { transition: background 0.1s; cursor: default; }
    .bt-row:hover { background: ${C.bg5} !important; }
    .bt-row:hover .bt-accent { opacity: 1 !important; }

    .bt-th-sort { cursor: pointer; user-select: none; }
    .bt-th-sort:hover { color: ${C.text2} !important; }

    .bt-card { transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s; }
    .bt-card:hover { border-color: ${C.border3} !important; transform: translateY(-1px); box-shadow: 0 4px 20px #00000040 !important; }

    .bt-tab { transition: color 0.12s, background 0.12s; }
    .bt-tab:hover { color: ${C.text} !important; background: ${C.bg4}20 !important; }

    .bt-stat { transition: background 0.12s, border-color 0.12s; }
    .bt-stat:hover { background: ${C.bg5} !important; border-color: ${C.border3} !important; }

    .bt-scrollbar::-webkit-scrollbar { width: 3px; height: 3px; }
    .bt-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .bt-scrollbar::-webkit-scrollbar-thumb { background: ${C.border2}; border-radius: 2px; }
    .bt-scrollbar::-webkit-scrollbar-thumb:hover { background: ${C.border3}; }

    .bt-dot-pulse { animation: bt-pulse 1.8s ease-in-out infinite; }
    .bt-fadein { animation: bt-fadein 0.25s ease; }

    .bt-search:focus { outline: none; border-color: ${C.accent}60 !important; }

    .bt-export-btn { transition: background 0.12s, border-color 0.12s; }
    .bt-export-btn:hover { background: ${C.bg5} !important; border-color: ${C.border3} !important; }

    .bt-skeleton {
      background: linear-gradient(90deg, ${C.bg3} 25%, ${C.bg4} 50%, ${C.bg3} 75%);
      background-size: 400px 100%;
      animation: bt-shimmer 1.4s ease-in-out infinite;
      border-radius: 3px;
    }
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
function ts(t: string | null) { return t ? t.replace("T", " ").slice(0, 16) : "—"; }

function downloadCsv(filename: string, rows: string[][], headers: string[]) {
  const lines = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([lines], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ─────────────────────────────────────────────────

function SidePill({ side }: { side: string }) {
  const isLong = side === "LONG";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 5,
      fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
      background: isLong ? C.longDim : C.shortDim,
      color: isLong ? C.long : C.short,
      border: `1px solid ${isLong ? C.long + "28" : C.short + "28"}`,
    }}>
      {isLong
        ? <svg width="7" height="7" viewBox="0 0 8 8"><path d="M4 1L7 7H1Z" fill={C.long}/></svg>
        : <svg width="7" height="7" viewBox="0 0 8 8"><path d="M4 7L7 1H1Z" fill={C.short}/></svg>}
      {side}
    </span>
  );
}

function LevBadge({ lev }: { lev: number }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 6px", borderRadius: 4,
      fontSize: 10, fontWeight: 700,
      background: "#f0b90b12", color: C.accent, border: `1px solid ${C.accent}20`,
    }}>{lev}×</span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const isLimit = type === "LIMIT";
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 4,
      fontSize: 10, fontWeight: 700,
      background: isLimit ? "#22d3ee10" : "#a78bfa10",
      color: isLimit ? C.tp : "#a78bfa",
      border: `1px solid ${isLimit ? C.tp + "25" : "#a78bfa25"}`,
    }}>{type}</span>
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
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      fontSize: 10, fontWeight: 700,
      background: bg, color, border: `1px solid ${color}25`,
    }}>{label}</span>
  );
}

function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%", minHeight: 110, gap: 8,
    }}>
      <div style={{ fontSize: 30, opacity: 0.12 }}>{icon}</div>
      <div style={{ fontSize: 12, color: C.muted }}>{text}</div>
      {sub && <div style={{ fontSize: 11, color: C.border3 }}>{sub}</div>}
    </div>
  );
}

// Search + filter bar
function SearchBar({
  value, onChange, placeholder, count, total, onExport,
}: {
  value: string; onChange: (v: string) => void;
  placeholder: string; count: number; total: number;
  onExport?: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 12px",
      background: C.bg2, borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
    }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
        <circle cx="6.5" cy="6.5" r="5" stroke={C.text2} strokeWidth="1.5"/>
        <path d="M10.5 10.5L14 14" stroke={C.text2} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <input
        className="bt-search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, background: "transparent", border: `1px solid ${C.border}`,
          borderRadius: 5, padding: "3px 8px", fontSize: 11, color: C.text,
          outline: "none", transition: "border-color 0.15s",
        }}
      />
      {value && (
        <button onClick={() => onChange("")} style={{
          background: "none", border: "none", cursor: "pointer",
          color: C.muted, fontSize: 14, lineHeight: 1, padding: "0 2px",
        }}>×</button>
      )}
      <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>
        {count !== total ? `${count} / ${total}` : `${total}`}
      </span>
      {onExport && (
        <button
          className="bt-export-btn"
          onClick={onExport}
          title="Export CSV"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 600,
            background: C.bg4, color: C.text2,
            border: `1px solid ${C.border2}`, cursor: "pointer",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v7M3 6l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          CSV
        </button>
      )}
    </div>
  );
}

// Sortable column header cell
type SortDir = "asc" | "desc" | null;
function SortTH({
  label, col, sortCol, sortDir, onSort, style,
}: {
  label: string; col: string;
  sortCol: string | null; sortDir: SortDir;
  onSort: (col: string) => void;
  style?: React.CSSProperties;
}) {
  const active = sortCol === col;
  return (
    <span
      className="bt-th-sort"
      onClick={() => onSort(col)}
      style={{
        fontSize: 9, fontWeight: 700,
        color: active ? C.text2 : C.muted,
        letterSpacing: "0.08em",
        display: "inline-flex", alignItems: "center", gap: 3,
        ...style,
      }}
    >
      {label}
      {active
        ? <span style={{ fontSize: 8 }}>{sortDir === "asc" ? "▲" : "▼"}</span>
        : <span style={{ fontSize: 8, opacity: 0.3 }}>⇅</span>
      }
    </span>
  );
}

function useSort<T>(items: T[], defaultCol: string, cols: Record<string, (a: T) => number | string>) {
  const [col, setCol] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>(null);

  const toggle = useCallback((c: string) => {
    setCol(prev => {
      if (prev !== c) { setDir("desc"); return c; }
      setDir(d => d === "desc" ? "asc" : d === "asc" ? null : "desc");
      return c;
    });
  }, []);

  const sorted = useMemo(() => {
    const activeCol = col ?? defaultCol;
    const activeDir = col ? dir : "desc";
    if (!activeDir) return items;
    const fn = cols[activeCol];
    if (!fn) return items;
    return [...items].sort((a, b) => {
      const va = fn(a), vb = fn(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return activeDir === "asc" ? cmp : -cmp;
    });
  }, [items, col, dir, cols, defaultCol]);

  return { sorted, sortCol: col, sortDir: dir, toggleSort: toggle };
}

// ── Grid header row ────────────────────────────────────────────────

const GRID_POS  = "3px 120px 76px 64px 100px 100px 90px 70px 130px 88px 90px 90px 1fr";
const GRID_ORD  = "3px 130px 76px 76px 110px 110px 100px 100px 1fr";
const GRID_HIST = "40px 3px 120px 76px 64px 100px 70px 140px 88px 1fr 140px";

// ── Positions Tab ──────────────────────────────────────────────────

function PositionsTab({ positions }: { positions: BtPosition[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() =>
    q ? positions.filter(p => p.symbol.toLowerCase().includes(q.toLowerCase()) || p.side.includes(q.toUpperCase()))
      : positions,
  [positions, q]);

  const colFns = useMemo(() => ({
    symbol:   (p: BtPosition) => p.symbol,
    side:     (p: BtPosition) => p.side,
    entry:    (p: BtPosition) => p.entry,
    mark:     (p: BtPosition) => p.mark,
    margin:   (p: BtPosition) => p.margin,
    leverage: (p: BtPosition) => p.leverage,
    pnl:      (p: BtPosition) => p.pnl_usdt,
    roe:      (p: BtPosition) => p.pnl_pct,
    bars:     (p: BtPosition) => p.bars,
  }), []);

  const { sorted, sortCol, sortDir, toggleSort } = useSort(filtered, "pnl", colFns);

  const exportCsv = () => downloadCsv("positions.csv", sorted.map(p => [
    p.symbol, p.side, String(p.leverage), fmt(p.entry, 4), fmt(p.mark, 4),
    fmt(p.margin), fmt(p.pnl_usdt), fmt(p.pnl_pct) + "%",
    p.take_profit != null ? fmt(p.take_profit, 4) : "",
    p.stop_price != null ? fmt(p.stop_price, 4) : "",
    p.open_time ?? "", String(p.bars),
  ]), ["Symbol","Side","Lev","Entry","Mark","Margin","PnL USDT","ROE%","TP","SL","Opened","Bars"]);

  const TH = ({ label, col }: { label: string; col: string }) => (
    <SortTH label={label} col={col} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SearchBar
        value={q} onChange={setQ}
        placeholder="Filter by symbol or side…"
        count={filtered.length} total={positions.length}
        onExport={exportCsv}
      />

      {!sorted.length
        ? <EmptyState icon="◈" text={q ? "No results" : "No open positions"} sub={q ? "Try a different filter" : undefined} />
        : (
          <div className="bt-scrollbar" style={{ flex: 1, overflow: "auto" }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: GRID_POS,
              padding: "0 14px 0 0", height: 30, alignItems: "center",
              background: C.bg2, borderBottom: `1px solid ${C.border}`,
              position: "sticky", top: 0, zIndex: 2, gap: "0 8px",
            }}>
              <span/>
              <TH label="SYMBOL" col="symbol" />
              <TH label="SIDE" col="side" />
              <TH label="LEV" col="leverage" />
              <TH label="ENTRY" col="entry" />
              <TH label="MARK" col="mark" />
              <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>LIQ PRICE</span>
              <TH label="MARGIN" col="margin" />
              <TH label="UNREALIZED PnL" col="pnl" />
              <TH label="ROE %" col="roe" />
              <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>TAKE PROFIT</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>STOP LOSS</span>
              <TH label="OPENED / BARS" col="bars" />
            </div>

            {sorted.map((p) => {
              const isLong = p.side === "LONG";
              const priceUp = p.mark >= p.entry;
              const pnlPos  = p.pnl_usdt > 0;
              return (
                <div key={p.id} className="bt-row" style={{
                  display: "grid", gridTemplateColumns: GRID_POS,
                  alignItems: "center", minHeight: 46,
                  borderBottom: `1px solid ${C.border}`,
                  background: C.bg1, gap: "0 8px",
                }}>
                  <div className="bt-accent" style={{
                    width: 3, alignSelf: "stretch", borderRadius: "0 2px 2px 0",
                    background: isLong ? C.long : C.short, opacity: 0.65,
                    transition: "opacity 0.15s",
                  }} />
                  <span style={{ fontWeight: 700, color: C.text, fontSize: 12 }}>{p.symbol}</span>
                  <span><SidePill side={p.side} /></span>
                  <span><LevBadge lev={p.leverage} /></span>
                  <span style={{ color: C.text2, fontFeatureSettings: '"tnum"', fontSize: 12 }}>{fmt(p.entry, 4)}</span>
                  <span style={{ color: priceUp ? C.long : C.short, fontWeight: 600, fontFeatureSettings: '"tnum"', fontSize: 12 }}>
                    {fmt(p.mark, 4)} <span style={{ fontSize: 9, opacity: 0.7 }}>{priceUp ? "▲" : "▼"}</span>
                  </span>
                  <span style={{ color: p.liquidy ? C.sl : C.muted, fontFeatureSettings: '"tnum"', fontSize: 11 }}>
                    {p.liquidy != null ? fmt(p.liquidy, 4) : "—"}
                  </span>
                  <span style={{ color: C.text2, fontFeatureSettings: '"tnum"', fontSize: 12 }}>${fmt(p.margin)}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "4px 0" }}>
                    <span style={{ color: pnlColor(p.pnl_usdt), fontWeight: 700, fontSize: 12, fontFeatureSettings: '"tnum"' }}>
                      {sign(p.pnl_usdt)}${fmt(Math.abs(p.pnl_usdt))}
                    </span>
                    <div style={{ height: 2, borderRadius: 1, background: C.border2, width: 70, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, Math.abs(p.pnl_pct) * 3)}%`, background: pnlPos ? C.long : C.short, borderRadius: 1 }} />
                    </div>
                  </div>
                  <span style={{ color: pnlColor(p.pnl_pct), fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: pnlDim(p.pnl_pct), fontSize: 12, fontFeatureSettings: '"tnum"' }}>
                    {sign(p.pnl_pct)}{fmt(p.pnl_pct, 2)}%
                  </span>
                  <span style={{ color: p.take_profit ? C.tp : C.muted, fontSize: 11, fontFeatureSettings: '"tnum"' }}>
                    {p.take_profit != null ? <><span style={{ fontSize: 9, marginRight: 3, color: C.tp, opacity: 0.6 }}>TP</span>{fmt(p.take_profit, 4)}</> : "—"}
                  </span>
                  <span style={{ color: p.stop_price ? C.sl : C.muted, fontSize: 11, fontFeatureSettings: '"tnum"' }}>
                    {p.stop_price != null ? <><span style={{ fontSize: 9, marginRight: 3, color: C.sl, opacity: 0.6 }}>SL</span>{fmt(p.stop_price, 4)}</> : "—"}
                  </span>
                  <span style={{ color: C.muted, fontSize: 10 }}>
                    {ts(p.open_time)} <span style={{ color: C.border3, fontSize: 9 }}>{p.bars}b</span>
                  </span>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

// ── Orders Tab ─────────────────────────────────────────────────────

function OrdersTab({ orders }: { orders: BtOrder[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() =>
    q ? orders.filter(o => o.symbol.toLowerCase().includes(q.toLowerCase()) || o.side.includes(q.toUpperCase()) || o.type.includes(q.toUpperCase()))
      : orders,
  [orders, q]);

  const colFns = useMemo(() => ({
    symbol: (o: BtOrder) => o.symbol,
    side:   (o: BtOrder) => o.side,
    type:   (o: BtOrder) => o.type,
    entry:  (o: BtOrder) => o.entry,
    usdt:   (o: BtOrder) => o.usdt,
  }), []);

  const { sorted, sortCol, sortDir, toggleSort } = useSort(filtered, "usdt", colFns);

  const exportCsv = () => downloadCsv("orders.csv", sorted.map(o => [
    o.symbol, o.type, o.side, fmt(o.entry, 4), fmt(o.usdt),
    o.take_profit != null ? fmt(o.take_profit, 4) : "",
    o.stop_price  != null ? fmt(o.stop_price,  4) : "",
    o.placed_time ?? "",
  ]), ["Symbol","Type","Side","Limit Price","Size USDT","TP","SL","Placed"]);

  const TH = ({ label, col }: { label: string; col: string }) => (
    <SortTH label={label} col={col} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SearchBar
        value={q} onChange={setQ}
        placeholder="Filter by symbol, type or side…"
        count={filtered.length} total={orders.length}
        onExport={exportCsv}
      />

      {!sorted.length
        ? <EmptyState icon="◎" text={q ? "No results" : "No pending orders"} />
        : (
          <div className="bt-scrollbar" style={{ flex: 1, overflow: "auto" }}>
            <div style={{
              display: "grid", gridTemplateColumns: GRID_ORD,
              padding: "0 14px 0 0", height: 30, alignItems: "center",
              background: C.bg2, borderBottom: `1px solid ${C.border}`,
              position: "sticky", top: 0, zIndex: 2, gap: "0 8px",
            }}>
              <span />
              <TH label="SYMBOL" col="symbol" />
              <TH label="TYPE"   col="type" />
              <TH label="SIDE"   col="side" />
              <TH label="LIMIT PRICE" col="entry" />
              <TH label="SIZE (USDT)" col="usdt" />
              <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>TAKE PROFIT</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>STOP LOSS</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>PLACED</span>
            </div>

            {sorted.map(o => {
              const isLong = o.side === "LONG";
              return (
                <div key={o.id} className="bt-row" style={{
                  display: "grid", gridTemplateColumns: GRID_ORD,
                  alignItems: "center", minHeight: 44,
                  borderBottom: `1px solid ${C.border}`,
                  background: C.bg1, gap: "0 8px",
                }}>
                  <div className="bt-accent" style={{
                    width: 3, alignSelf: "stretch", borderRadius: "0 2px 2px 0",
                    background: isLong ? C.long : C.short, opacity: 0.5, transition: "opacity 0.15s",
                  }} />
                  <span style={{ fontWeight: 700, color: C.text, fontSize: 12 }}>{o.symbol}</span>
                  <span><TypeBadge type={o.type} /></span>
                  <span><SidePill side={o.side} /></span>
                  <span style={{ color: C.text, fontWeight: 600, fontFeatureSettings: '"tnum"', fontSize: 12 }}>{fmt(o.entry, 4)}</span>
                  <span style={{ color: C.text2, fontFeatureSettings: '"tnum"', fontSize: 12 }}>${fmt(o.usdt)}</span>
                  <span style={{ color: o.take_profit ? C.tp : C.muted, fontSize: 11, fontFeatureSettings: '"tnum"' }}>
                    {o.take_profit != null ? fmt(o.take_profit, 4) : "—"}
                  </span>
                  <span style={{ color: o.stop_price ? C.sl : C.muted, fontSize: 11, fontFeatureSettings: '"tnum"' }}>
                    {o.stop_price != null ? fmt(o.stop_price, 4) : "—"}
                  </span>
                  <span style={{ color: C.muted, fontSize: 10 }}>{ts(o.placed_time)}</span>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

// ── Trade History Tab ──────────────────────────────────────────────

type HistFilter = "all" | "win" | "loss";

function TradeHistoryTab({ history }: { history: BtHistoryEntry[] }) {
  const [q,      setQ]      = useState("");
  const [filter, setFilter] = useState<HistFilter>("all");

  const base = useMemo(() => [...history].reverse(), [history]);

  const filtered = useMemo(() => base.filter(p => {
    const matchQ = !q || p.symbol.toLowerCase().includes(q.toLowerCase()) || p.side.includes(q.toUpperCase()) || p.state.includes(q.toUpperCase());
    const matchF = filter === "all" || (filter === "win" && p.pnl_usdt > 0) || (filter === "loss" && p.pnl_usdt <= 0);
    return matchQ && matchF;
  }), [base, q, filter]);

  const colFns = useMemo(() => ({
    symbol:  (p: BtHistoryEntry) => p.symbol,
    side:    (p: BtHistoryEntry) => p.side,
    entry:   (p: BtHistoryEntry) => p.entry,
    margin:  (p: BtHistoryEntry) => p.margin,
    pnl:     (p: BtHistoryEntry) => p.pnl_usdt,
    roe:     (p: BtHistoryEntry) => p.pnl_pct,
    state:   (p: BtHistoryEntry) => p.state,
    opened:  (p: BtHistoryEntry) => p.open_time ?? "",
    closed:  (p: BtHistoryEntry) => p.close_time ?? "",
  }), []);

  const { sorted, sortCol, sortDir, toggleSort } = useSort(filtered, "pnl", colFns);

  const exportCsv = () => downloadCsv("trade_history.csv", sorted.map((p, i) => [
    String(sorted.length - i), p.symbol, p.side, String(p.leverage),
    fmt(p.entry, 4), fmt(p.margin), fmt(p.pnl_usdt), fmt(p.pnl_pct) + "%",
    p.state, p.open_time ?? "", p.close_time ?? "",
  ]), ["#","Symbol","Side","Lev","Entry","Margin","PnL USDT","ROE%","State","Opened","Closed"]);

  const TH = ({ label, col }: { label: string; col: string }) => (
    <SortTH label={label} col={col} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
  );

  // win/loss summary
  const wins   = base.filter(p => p.pnl_usdt > 0).length;
  const losses = base.filter(p => p.pnl_usdt <= 0).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search + filter pills */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px",
        background: C.bg2, borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
          <circle cx="6.5" cy="6.5" r="5" stroke={C.text2} strokeWidth="1.5"/>
          <path d="M10.5 10.5L14 14" stroke={C.text2} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          className="bt-search"
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Filter by symbol, side or result…"
          style={{
            flex: 1, background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 5, padding: "3px 8px", fontSize: 11, color: C.text, outline: "none",
          }}
        />
        {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 14 }}>×</button>}

        {/* Filter pills */}
        {(["all", "win", "loss"] as HistFilter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "3px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${filter === f ? (f === "win" ? C.long : f === "loss" ? C.short : C.accent) + "50" : C.border}`,
            background: filter === f ? (f === "win" ? C.longDim : f === "loss" ? C.shortDim : C.accent + "15") : C.bg4,
            color: filter === f ? (f === "win" ? C.long : f === "loss" ? C.short : C.accent) : C.muted,
            transition: "all 0.12s",
          }}>
            {f === "all" ? `All ${base.length}` : f === "win" ? `▲ ${wins}` : `▼ ${losses}`}
          </button>
        ))}

        <button
          className="bt-export-btn"
          onClick={exportCsv}
          title="Export CSV"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 600,
            background: C.bg4, color: C.text2, border: `1px solid ${C.border2}`, cursor: "pointer",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v7M3 6l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          CSV
        </button>
      </div>

      {!sorted.length
        ? <EmptyState icon="≡" text={q || filter !== "all" ? "No results" : "No closed trades yet"} />
        : (
          <div className="bt-scrollbar" style={{ flex: 1, overflow: "auto" }}>
            <div style={{
              display: "grid", gridTemplateColumns: GRID_HIST,
              padding: "0 14px 0 8px", height: 30, alignItems: "center",
              background: C.bg2, borderBottom: `1px solid ${C.border}`,
              position: "sticky", top: 0, zIndex: 2, gap: "0 8px",
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, textAlign: "right", paddingRight: 8 }}>#</span>
              <span />
              <TH label="SYMBOL" col="symbol" />
              <TH label="SIDE"   col="side" />
              <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>LEV</span>
              <TH label="ENTRY"  col="entry" />
              <TH label="MARGIN" col="margin" />
              <TH label="REALIZED PnL" col="pnl" />
              <TH label="ROE %" col="roe" />
              <TH label="OPENED" col="opened" />
              <TH label="CLOSED" col="closed" />
            </div>

            {sorted.map((p, i) => {
              const isLong = p.side === "LONG";
              const isWin  = p.pnl_usdt > 0;
              return (
                <div key={p.id} className="bt-row bt-fadein" style={{
                  display: "grid", gridTemplateColumns: GRID_HIST,
                  alignItems: "center", minHeight: 44,
                  borderBottom: `1px solid ${C.border}`,
                  background: i % 2 === 0 ? C.bg1 : C.bg0,
                  gap: "0 8px", padding: "0 14px 0 8px",
                }}>
                  <span style={{ color: C.muted, fontSize: 10, textAlign: "right", paddingRight: 8 }}>
                    {sorted.length - i}
                  </span>
                  <div className="bt-accent" style={{
                    width: 3, alignSelf: "stretch", borderRadius: "0 2px 2px 0",
                    background: isLong ? C.long : C.short, opacity: 0.55, transition: "opacity 0.15s",
                  }} />
                  <span style={{ fontWeight: 700, color: C.text, fontSize: 12 }}>{p.symbol}</span>
                  <span><SidePill side={p.side} /></span>
                  <span><LevBadge lev={p.leverage} /></span>
                  <span style={{ color: C.text2, fontFeatureSettings: '"tnum"', fontSize: 12 }}>{fmt(p.entry, 4)}</span>
                  <span style={{ color: C.text2, fontFeatureSettings: '"tnum"', fontSize: 12 }}>${fmt(p.margin)}</span>
                  {/* PnL card */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 8px", borderRadius: 5,
                    background: pnlDim(p.pnl_usdt),
                    border: `1px solid ${isWin ? C.long + "20" : C.short + "20"}`,
                  }}>
                    <span style={{ fontSize: 10, color: pnlColor(p.pnl_usdt) }}>{isWin ? "▲" : "▼"}</span>
                    <span style={{ color: pnlColor(p.pnl_usdt), fontWeight: 700, fontFeatureSettings: '"tnum"', fontSize: 12 }}>
                      {sign(p.pnl_usdt)}${fmt(Math.abs(p.pnl_usdt))}
                    </span>
                  </div>
                  <span style={{ color: pnlColor(p.pnl_pct), fontWeight: 700, fontFeatureSettings: '"tnum"', fontSize: 12 }}>
                    {sign(p.pnl_pct)}{fmt(p.pnl_pct, 2)}%
                  </span>
                  <span style={{ color: C.muted, fontSize: 10 }}>{ts(p.open_time)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: C.muted, fontSize: 10 }}>{ts(p.close_time)}</span>
                    <StatePill state={p.state} />
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

// ── Assets Tab ─────────────────────────────────────────────────────

function AssetsTab({ state }: { state: BtState }) {
  const freeMargin  = state.balance - state.margin_used;
  const marginRatio = state.balance > 0 ? (state.margin_used / state.balance) * 100 : 0;

  const cards = [
    {
      label: "Wallet Balance", value: state.balance, sub: "Available funds",
      color: C.text,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="12" rx="2" stroke={C.accent} strokeWidth="1.5"/><path d="M14 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill={C.accent}/><path d="M2 8h16" stroke={C.accent} strokeWidth="1.5"/></svg>,
    },
    {
      label: "Margin Used", value: state.margin_used, sub: `${fmt(marginRatio, 1)}% of balance`,
      color: C.text2,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="#a78bfa" strokeWidth="1.5"/><path d="M10 6v4l3 2" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/></svg>,
      bar: { value: marginRatio, color: "#a78bfa" },
    },
    {
      label: "Unrealized PnL", value: state.unrealized_pnl,
      sub: state.unrealized_pnl >= 0 ? "In profit" : "In loss",
      color: pnlColor(state.unrealized_pnl),
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><polyline points="2,14 7,8 11,11 18,4" stroke={pnlColor(state.unrealized_pnl)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><polyline points="14,4 18,4 18,8" stroke={pnlColor(state.unrealized_pnl)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
    {
      label: "Total Equity", value: state.equity,
      sub: `Free margin $${fmt(freeMargin)}`,
      color: state.equity >= state.balance ? C.long : C.short,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L12.5 7.5H18L13.5 11L15.5 17L10 13.5L4.5 17L6.5 11L2 7.5H7.5Z" stroke={C.accent} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
    },
  ] as const;

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {cards.map(({ label, value, sub, color, icon, bar }: any) => (
          <div key={label} className="bt-card" style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "16px 18px",
            boxShadow: "0 2px 12px #00000030",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{label}</span>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: C.bg4, border: `1px solid ${C.border2}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{icon}</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.02em", fontFeatureSettings: '"tnum"', lineHeight: 1.1 }}>
              {value < 0 ? "-" : ""}${fmt(Math.abs(value))}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>{sub}</div>
            {bar && (
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 3, borderRadius: 2, background: C.border2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, bar.value)}%`, background: bar.color, borderRadius: 2, transition: "width 0.5s ease" }} />
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
  const min = Math.min(...curve), max = Math.max(...curve);
  const range = max - min || 1;
  const xs = curve.map((_, i) => PX + ((W - PX * 2) * i) / (curve.length - 1));
  const ys = curve.map(v => PY + (H - PY * 2) * (1 - (v - min) / range));
  const polyPoints = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const areaD = `M ${xs[0]},${H - PY} ` + xs.map((x, i) => `L ${x},${ys[i]}`).join(" ") + ` L ${xs[xs.length-1]},${H - PY} Z`;
  const baselineY = Math.max(PY, Math.min(H - PY, PY + (H - PY * 2) * (1 - (initial - min) / range)));
  const last = curve[curve.length - 1];
  const isProfit = last >= initial;
  const lineColor = isProfit ? C.long : C.short;
  const gradId = isProfit ? "ec-g2" : "ec-r2";
  const endX = xs[xs.length - 1], endY = ys[ys.length - 1];
  const vGridXs = [0,1,2,3,4].map(i => PX + (W - PX * 2) * i / 4);

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", borderRadius: 6 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="#080b0f" rx="6"/>
      {vGridXs.map((x, i) => <line key={i} x1={x} y1={PY} x2={x} y2={H-PY} stroke={C.border} strokeWidth={0.5} strokeDasharray="2,4"/>)}
      {[PY, H/2, H-PY].map((y, i) => <line key={i} x1={PX} y1={y} x2={W-PX} y2={y} stroke={C.border} strokeWidth={0.5}/>)}
      <line x1={PX} y1={baselineY} x2={W-PX} y2={baselineY} stroke={isProfit ? C.long : C.short} strokeWidth={0.8} strokeDasharray="5,4" opacity={0.35}/>
      <path d={areaD} fill={`url(#${gradId})`}/>
      <polyline points={polyPoints} fill="none" stroke={lineColor} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"/>
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
    <div className="bt-scrollbar" style={{ padding: "16px 20px", overflowY: "auto", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      {/* Hero */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px", minWidth: 400, flexShrink: 0, boxShadow: "0 4px 24px #00000040" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Net Return</div>
            <div style={{ fontSize: 38, fontWeight: 900, color: returnColor, letterSpacing: "-0.03em", lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
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
            <div style={{ display: "inline-block", padding: "5px 12px", borderRadius: 7, background: isProfit ? C.longDim : C.shortDim, color: returnColor, fontSize: 12, fontWeight: 700, border: `1px solid ${returnColor}30`, marginBottom: 6 }}>
              {result.total_trades} trades
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>{result.winning_trades}W / {result.losing_trades}L</div>
          </div>
        </div>
        <EquityCurve curve={result.equity_curve} initial={result.initial_balance} />
      </div>

      {/* Trade stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220, flex: 1 }}>
        <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Trade Statistics</div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: C.text2 }}>Win Rate</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFeatureSettings: '"tnum"' }}>{fmt(result.win_rate, 1)}%</span>
          </div>
          <div style={{ position: "relative", height: 6, borderRadius: 3, background: C.shortDim, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${winPct}%`, background: `linear-gradient(90deg, ${C.long}, ${C.tp})`, borderRadius: 3, transition: "width 0.8s cubic-bezier(.4,0,.2,1)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
            <span style={{ fontSize: 10, color: C.long, fontWeight: 600 }}>▲ {result.winning_trades} wins</span>
            <span style={{ fontSize: 10, color: C.short, fontWeight: 600 }}>▼ {result.losing_trades} losses</span>
          </div>
        </div>
        {([
          ["Profit Factor",  fmt(result.profit_factor, 2),            result.profit_factor >= 1 ? C.long : C.short],
          ["Risk / Reward",  `1 : ${fmt(result.risk_reward, 2)}`,      result.risk_reward >= 1 ? C.long : C.text2],
          ["Avg Win",        `+$${fmt(result.avg_win)}`,               C.long],
          ["Avg Loss",       `-$${fmt(Math.abs(result.avg_loss))}`,    C.short],
          ["Largest Win",    `+$${fmt(result.largest_win)}`,           C.long],
          ["Largest Loss",   `-$${fmt(Math.abs(result.largest_loss))}`, C.short],
        ] as [string,string,string][]).map(([label, val, color]) => (
          <div key={label} className="bt-stat" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 7 }}>
            <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color, fontFeatureSettings: '"tnum"' }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Risk metrics */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220, flex: 1 }}>
        <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Risk Metrics</div>
        <div style={{ background: C.card, border: `1px solid ${C.short}20`, borderRadius: 9, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: C.text2 }}>Max Drawdown</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: C.short, fontFeatureSettings: '"tnum"' }}>-{fmt(result.max_drawdown_pct, 1)}%</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>-${fmt(result.max_drawdown_usdt)} USDT</div>
          <div style={{ height: 4, borderRadius: 2, background: C.border2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, result.max_drawdown_pct)}%`, background: `linear-gradient(90deg, ${C.short}, #ff8080)`, borderRadius: 2 }} />
          </div>
        </div>
        {([
          ["Gross Profit",    `+$${fmt(result.gross_profit)}`,          C.long],
          ["Gross Loss",      `-$${fmt(Math.abs(result.gross_loss))}`,  C.short],
          ["Initial Balance", `$${fmt(result.initial_balance)}`,        C.text2],
          ["Final Balance",   `$${fmt(result.final_balance)}`,          isProfit ? C.long : C.short],
        ] as [string,string,string][]).map(([label, val, color]) => (
          <div key={label} className="bt-stat" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 7 }}>
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

const TAB_STORAGE_KEY = "trex.bt.tab";
const HEIGHT_STORAGE_KEY = "trex.bt.height";

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
  onHeightChange?: (h: number) => void;
  onTabChange?: (t: string) => void;
  initialHeight?: number;
  initialTab?: string;
}

export const BtPanel = memo(function BtPanel({ state, result, progress, onHeightChange, onTabChange, initialHeight, initialTab }: Props) {
  const [tab, setTab]       = useState<Tab>((initialTab as Tab) ?? "positions");
  const [height, setHeight] = useState(initialHeight ?? 280);
  const dragging            = useRef(false);
  const startY              = useRef(0);
  const startH              = useRef(0);

  // Persist height and tab
  const setTabAndPersist = useCallback((t: Tab) => {
    setTab(t);
    onTabChange?.(t);
    try { localStorage.setItem(TAB_STORAGE_KEY, t); } catch { /**/ }
  }, [onTabChange]);

  const setHeightAndPersist = useCallback((h: number) => {
    setHeight(h);
    onHeightChange?.(h);
    try { localStorage.setItem(HEIGHT_STORAGE_KEY, String(h)); } catch { /**/ }
  }, [onHeightChange]);

  useEffect(() => {
    if (!result && tab === "results") setTabAndPersist("positions");
  }, [result, tab, setTabAndPersist]);

  const prevResultRef = useRef<BtResult | null | undefined>(undefined);
  useEffect(() => {
    if (result && prevResultRef.current == null) setTabAndPersist("results");
    prevResultRef.current = result;
  }, [result, setTabAndPersist]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startY.current   = e.clientY;
    startH.current   = height;
    e.preventDefault();
  }, [height]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setHeightAndPersist(Math.max(160, Math.min(700, startH.current + startY.current - e.clientY)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setHeightAndPersist]);

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
        display: "flex", alignItems: "center",
        background: C.bg2, borderBottom: `1px solid ${C.border}`,
        paddingLeft: 2, height: 38, flexShrink: 0,
      }}>
        {TABS.map(t => {
          if (t.id === "results" && !result) return null;
          const badge  = t.id === "positions" ? posCount : t.id === "orders" ? ordCount : null;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTabAndPersist(t.id)}
              className="bt-tab"
              style={{
                height: "100%", padding: "0 14px", background: "transparent",
                border: "none", borderBottom: `2px solid ${active ? C.accent : "transparent"}`,
                color: active ? C.text : C.muted,
                fontSize: 12, fontWeight: active ? 600 : 400,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                whiteSpace: "nowrap", borderRadius: 0,
              }}
            >
              <span style={{ opacity: active ? 1 : 0.5, display: "flex", alignItems: "center" }}>{t.icon}</span>
              {t.label}
              {badge != null && badge > 0 && (
                <span style={{
                  background: active ? C.accent + "22" : C.bg4,
                  color: active ? C.accent : C.text2,
                  fontSize: 10, fontWeight: 700,
                  padding: "1px 7px", borderRadius: 10,
                  border: `1px solid ${active ? C.accent + "30" : C.border2}`,
                  lineHeight: "16px",
                }}>{badge}</span>
              )}
            </button>
          );
        })}

        {/* Running indicator */}
        {isRunning && (
          <div style={{ marginLeft: "auto", marginRight: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.muted }}>
            <span className="bt-dot-pulse" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
            Running {progress!.pct.toFixed(1)}%
          </div>
        )}
      </div>

      {/* Content */}
      <div className="bt-scrollbar" style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {tab === "positions" && <PositionsTab positions={state.positions} />}
        {tab === "orders"    && <OrdersTab orders={state.orders} />}
        {tab === "history"   && <TradeHistoryTab history={state.trade_history} />}
        {tab === "assets"    && <AssetsTab state={state} />}
        {tab === "results"   && result && <ResultsTab result={result} />}
      </div>
    </div>
  );
});
