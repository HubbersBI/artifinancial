/** Shapes exchanged with the backend. See planning/PLAN.md sections 6 and 8. */

export type Direction = "up" | "down" | "flat";

/** One ticker inside an SSE price event. */
export interface PriceUpdate {
  ticker: string;
  price: number;
  previous_price: number;
  timestamp: number;
  change: number;
  change_percent: number;
  direction: Direction;
}

/** The SSE payload: every tracked ticker in one object keyed by symbol. */
export type PriceMap = Record<string, PriceUpdate>;

export type ConnectionState = "connected" | "reconnecting" | "disconnected";

export interface WatchlistEntry {
  ticker: string;
  price?: number | null;
  change_percent?: number | null;
}

export interface Position {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price?: number | null;
  market_value?: number | null;
  unrealized_pnl?: number | null;
  unrealized_pnl_percent?: number | null;
}

export interface Portfolio {
  cash_balance: number;
  total_value: number;
  positions_value?: number;
  unrealized_pnl?: number;
  positions: Position[];
}

export interface PortfolioSnapshot {
  total_value: number;
  recorded_at: string;
}

export interface Trade {
  id?: string;
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executed_at: string;
}

export interface ChatAction {
  type?: string;
  ticker?: string;
  side?: string;
  quantity?: number;
  price?: number | null;
  action?: string;
  status?: string;
  error?: string | null;
  message?: string;
}

/** How a stored assistant message carries what it executed. */
export interface ChatActionSet {
  trades?: ChatAction[] | null;
  watchlist_changes?: ChatAction[] | null;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  /** Null on user messages; the nested set on assistant messages. */
  actions?: ChatActionSet | ChatAction[] | null;
  created_at?: string;
}

export interface ChatResponse extends ChatActionSet {
  message: string;
  created_at?: string;
}

/** A point accumulated from the SSE stream since page load. */
export interface SeriesPoint {
  t: number;
  price: number;
}
