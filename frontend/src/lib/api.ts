/**
 * Same-origin REST client. All paths are /api/* so no CORS setup is needed.
 *
 * When NEXT_PUBLIC_ARTIFINANCIAL_STATIC is set there is no server to talk to and
 * every call is served by the in-browser engine instead. The shape of `api` is
 * identical either way, which is what lets every component upstream stay
 * unchanged - they never learn whether a network is involved.
 */

import { EngineError, getEngine } from "./engine";
import type {
  ChatMessage,
  ChatResponse,
  Portfolio,
  PortfolioSnapshot,
  Trade,
  WatchlistEntry,
} from "./types";

/** Thrown when the backend rejects a request; `message` is shown inline. */
export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) throw new ApiError(await errorMessage(res));
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

async function errorMessage(res: Response): Promise<string> {
  const body = await res.text();
  if (!body) return `Request failed (${res.status})`;
  try {
    const parsed = JSON.parse(body);
    return parsed.detail ?? parsed.message ?? parsed.error ?? body;
  } catch {
    return body;
  }
}

/** Unwraps `{items: [...]}`, `{watchlist: [...]}` and bare arrays alike. */
function toList<T>(payload: unknown, ...keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

const STATIC = process.env.NEXT_PUBLIC_ARTIFINANCIAL_STATIC === "true";

/** True when the app is running with no backend at all. */
export const isStatic = STATIC;

/**
 * Run an engine call, presenting its rejections the way the REST layer did.
 *
 * Components catch ApiError and show `message` inline; an EngineError carries
 * exactly the text the 400 `detail` used to carry, so they keep working.
 */
async function local<T>(run: () => T): Promise<T> {
  try {
    return run();
  } catch (error) {
    if (error instanceof EngineError) throw new ApiError(error.message);
    throw error;
  }
}

export const api = {
  async watchlist(): Promise<WatchlistEntry[]> {
    if (STATIC) return local(() => getEngine().watchlist() as WatchlistEntry[]);
    const data = await request<unknown>("/api/watchlist");
    return toList<WatchlistEntry>(data, "watchlist", "items", "tickers");
  },

  addTicker(ticker: string): Promise<unknown> {
    if (STATIC) return local(() => getEngine().addTicker(ticker));
    return request("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ ticker: ticker.toUpperCase() }),
    });
  },

  removeTicker(ticker: string): Promise<unknown> {
    if (STATIC) return local(() => getEngine().removeTicker(ticker));
    return request(`/api/watchlist/${ticker.toUpperCase()}`, { method: "DELETE" });
  },

  portfolio(): Promise<Portfolio> {
    if (STATIC) return local(() => getEngine().portfolio() as Portfolio);
    return request<Portfolio>("/api/portfolio");
  },

  async history(): Promise<PortfolioSnapshot[]> {
    if (STATIC) return local(() => getEngine().history());
    const data = await request<unknown>("/api/portfolio/history");
    return toList<PortfolioSnapshot>(data, "history", "snapshots", "items");
  },

  trade(ticker: string, quantity: number, side: "buy" | "sell"): Promise<unknown> {
    if (STATIC) return local(() => getEngine().trade(ticker, quantity, side));
    return request("/api/portfolio/trade", {
      method: "POST",
      body: JSON.stringify({ ticker: ticker.toUpperCase(), quantity, side }),
    });
  },

  async trades(limit = 50): Promise<Trade[]> {
    if (STATIC) return local(() => getEngine().trades(limit) as Trade[]);
    const data = await request<unknown>(`/api/trades?limit=${limit}`);
    return toList<Trade>(data, "trades", "items");
  },

  async chatHistory(limit = 50): Promise<ChatMessage[]> {
    if (STATIC) return local(() => getEngine().chatHistory(limit) as ChatMessage[]);
    const data = await request<unknown>(`/api/chat/history?limit=${limit}`);
    return toList<ChatMessage>(data, "messages", "history", "items");
  },

  chat(message: string): Promise<ChatResponse> {
    if (STATIC) return local(() => getEngine().chat(message) as ChatResponse);
    return request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  },
};
