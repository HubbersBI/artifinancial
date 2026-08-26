import type { ChatMessage, PriceMap, Position, SeriesPoint, Trade } from "@/lib/types";

export function quote(ticker: string, price: number, changePercent = 0.5, timestamp = 1) {
  return {
    ticker,
    price,
    previous_price: price - 0.1,
    timestamp,
    change: 0.1,
    change_percent: changePercent,
    direction: "up" as const,
  };
}

export const prices: PriceMap = {
  AAPL: quote("AAPL", 190.5, 0.42),
  GOOGL: quote("GOOGL", 175.2, -1.1),
};

export const series: Record<string, SeriesPoint[]> = {
  AAPL: [
    { t: 1, price: 190.1 },
    { t: 2, price: 190.3 },
    { t: 3, price: 190.5 },
  ],
  GOOGL: [{ t: 1, price: 175.2 }],
};

export const positions: Position[] = [
  {
    ticker: "AAPL",
    quantity: 10,
    avg_cost: 180,
    current_price: 190.5,
    market_value: 1905,
    unrealized_pnl: 105,
    unrealized_pnl_percent: 5.83,
  },
  {
    ticker: "GOOGL",
    quantity: 4,
    avg_cost: 180,
    current_price: 175.2,
    market_value: 700.8,
    unrealized_pnl: -19.2,
    unrealized_pnl_percent: -2.67,
  },
];

export const trades: Trade[] = [
  {
    id: "t2",
    ticker: "GOOGL",
    side: "sell",
    quantity: 2,
    price: 175.2,
    executed_at: "2026-08-25T12:05:00+00:00",
  },
  {
    id: "t1",
    ticker: "AAPL",
    side: "buy",
    quantity: 10,
    price: 180,
    executed_at: "2026-08-25T12:00:00+00:00",
  },
];

export const chatHistory: ChatMessage[] = [
  { id: "m1", role: "user", content: "buy 10 AAPL", actions: null },
  {
    id: "m2",
    role: "assistant",
    content: "Bought 10 AAPL.",
    actions: {
      trades: [
        { ticker: "AAPL", side: "buy", quantity: 10, price: 180, status: "executed", error: null },
      ],
      watchlist_changes: [],
    },
  },
];
