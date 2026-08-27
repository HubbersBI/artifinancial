/**
 * The assistant, ported from backend/app/llm/mock.py.
 *
 * The container can call a real model when GROQ_API_KEY is set; the published
 * build cannot, because a static site has nowhere to keep a key. It runs the
 * mock path the backend already shipped for LLM_MOCK=true, which the E2E suite
 * steers on, so this is an existing supported mode rather than a new pretence.
 *
 * The panel says "Mock assistant" in every reply. That is the honest signal that
 * no model is involved, and it must not be removed to make the demo look
 * cleverer than it is.
 */

const TICKER_RE = /\b[A-Z]{1,5}\b/;
const NUMBER_RE = /\d+(?:\.\d+)?/;

export interface MockTrade {
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
}

export interface MockWatchlistChange {
  ticker: string;
  action: "add" | "remove";
}

export interface MockReply {
  message: string;
  trades: MockTrade[];
  watchlist_changes: MockWatchlistChange[];
}

/** Map a message to a fixed response by first matching trigger, as the Python does. */
export function mockResponse(userMessage: string): MockReply {
  const lowered = userMessage.toLowerCase();
  const ticker = firstTicker(userMessage);
  const quantity = firstNumber(userMessage);

  if (lowered.includes("sell")) return trade("sell", ticker ?? "AAPL", quantity);
  if (lowered.includes("buy")) return trade("buy", ticker ?? "AAPL", quantity);
  if (lowered.includes("remove")) return watchlist("remove", ticker ?? "PYPL");
  if (lowered.includes("watch") || lowered.includes("add")) {
    return watchlist("add", ticker ?? "PYPL");
  }
  return {
    message: "Mock assistant: your portfolio is shown in the panels on the left.",
    trades: [],
    watchlist_changes: [],
  };
}

function trade(side: "buy" | "sell", ticker: string, quantity: number): MockReply {
  const verb = side === "buy" ? "Bought" : "Sold";
  return {
    message: `Mock assistant: ${verb} ${format(quantity)} ${ticker}.`,
    trades: [{ ticker, side, quantity }],
    watchlist_changes: [],
  };
}

function watchlist(action: "add" | "remove", ticker: string): MockReply {
  const phrase = action === "add" ? `Added ${ticker} to` : `Removed ${ticker} from`;
  return {
    message: `Mock assistant: ${phrase} the watchlist.`,
    trades: [],
    watchlist_changes: [{ ticker, action }],
  };
}

/** First uppercase 1-5 letter token, matching the Python's TICKER_RE. */
function firstTicker(message: string): string | null {
  return message.match(TICKER_RE)?.[0] ?? null;
}

/** First number in the message, defaulting to 1. */
function firstNumber(message: string): number {
  const match = message.match(NUMBER_RE);
  return match ? Number(match[0]) : 1;
}

/** Python's %g: no trailing zeros. */
function format(value: number): string {
  return String(Number(value.toPrecision(6)));
}
