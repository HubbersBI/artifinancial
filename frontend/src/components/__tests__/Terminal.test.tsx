import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "../Terminal";
import { chatHistory, positions, trades } from "./fixtures";

/** Routes fetch by path so the whole page can be driven from one place. */
function mockBackend(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    "/api/watchlist": { watchlist: [{ ticker: "AAPL" }, { ticker: "GOOGL" }, { ticker: "PYPL" }] },
    "/api/portfolio": { cash_balance: 8095, total_value: 10007, positions },
    "/api/trades": { trades },
    "/api/portfolio/history": {
      snapshots: [
        { total_value: 10000, recorded_at: "2026-08-25T12:00:00+00:00" },
        { total_value: 10007, recorded_at: "2026-08-25T12:00:30+00:00" },
      ],
    },
    "/api/chat/history": { messages: chatHistory },
    ...overrides,
  };

  const calls: { path: string; init?: RequestInit }[] = [];
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((r) => path.startsWith(r));
    const body = key ? routes[key] : {};
    if (body && typeof body === "object" && "__status" in body) {
      const failure = body as { __status: number; detail: string };
      return new Response(JSON.stringify({ detail: failure.detail }), { status: failure.__status });
    }
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

class SilentEventSource {
  static readonly CLOSED = 2;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  close() {}
}

beforeEach(() => {
  vi.stubGlobal("EventSource", SilentEventSource);
});

describe("Terminal", () => {
  it("loads the watchlist, book and chat history on mount", async () => {
    mockBackend();
    render(<Terminal />);

    expect(await screen.findByTestId("watchlist-row-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("cash-balance")).toHaveTextContent("8,095.00");
    expect(screen.getByTestId("position-row-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("chat-message-1")).toHaveTextContent("Bought 10 AAPL.");
    expect(screen.getByTestId("pnl-chart")).toBeInTheDocument();
  });

  it("marks positions to price and totals them with cash", async () => {
    mockBackend();
    render(<Terminal />);
    // 8095 cash + 10 AAPL at 190.50 + 4 GOOGL at 175.20.
    await waitFor(() => expect(screen.getByTestId("total-value")).toHaveTextContent("10,700.80"));
  });

  it("selects the first watchlist ticker and points the trade bar at it", async () => {
    mockBackend();
    render(<Terminal />);
    await screen.findByTestId("watchlist-row-AAPL");
    expect(screen.getByTestId("watchlist-row-AAPL")).toHaveAttribute("data-selected", "true");
    await waitFor(() => expect(screen.getByTestId("trade-ticker-input")).toHaveValue("AAPL"));
  });

  it("moves the chart and the order ticket when a watchlist row is clicked", async () => {
    mockBackend();
    render(<Terminal />);
    await userEvent.click(await screen.findByTestId("watchlist-row-GOOGL"));
    expect(screen.getByTestId("main-chart-ticker")).toHaveTextContent("GOOGL");
    expect(screen.getByTestId("main-chart-collecting")).toBeInTheDocument();
    expect(screen.getByTestId("trade-ticker-input")).toHaveValue("GOOGL");
  });

  it("posts a trade and confirms the fill", async () => {
    const { calls } = mockBackend();
    render(<Terminal />);
    await screen.findByTestId("watchlist-row-AAPL");

    await userEvent.click(screen.getByTestId("trade-buy-button"));

    const trade = calls.find((c) => c.path === "/api/portfolio/trade");
    expect(JSON.parse(trade!.init!.body as string)).toEqual({
      ticker: "AAPL",
      quantity: 1,
      side: "buy",
    });
    expect(await screen.findByTestId("trade-status")).toHaveTextContent("BUY 1 AAPL filled");
  });

  it("surfaces a rejected trade inline with the backend message", async () => {
    mockBackend({
      "/api/portfolio/trade": { __status: 400, detail: "No price available for PYPL yet" },
    });
    render(<Terminal />);
    await screen.findByTestId("watchlist-row-AAPL");

    await userEvent.click(screen.getByTestId("trade-buy-button"));
    expect(await screen.findByTestId("trade-error")).toHaveTextContent(
      "No price available for PYPL yet",
    );
  });

  it("adds a watchlist ticker and reports a duplicate rejection", async () => {
    const { calls } = mockBackend({ "/api/watchlist": { __status: 409, detail: "AAPL is already on the watchlist" } });
    render(<Terminal />);

    await userEvent.type(screen.getByTestId("watchlist-add-input"), "aapl");
    await userEvent.click(screen.getByTestId("watchlist-add-submit"));

    const post = calls.find((c) => c.init?.method === "POST" && c.path === "/api/watchlist");
    expect(JSON.parse(post!.init!.body as string)).toEqual({ ticker: "AAPL" });
    expect(await screen.findByTestId("watchlist-error")).toHaveTextContent("already on the watchlist");
  });

  it("removes a watchlist ticker", async () => {
    const { calls } = mockBackend();
    render(<Terminal />);
    await userEvent.click(await screen.findByTestId("watchlist-remove-GOOGL"));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/watchlist/GOOGL" && c.init?.method === "DELETE")).toBe(
        true,
      ),
    );
  });

  it("sends a chat message and renders the executed trade inline", async () => {
    mockBackend({
      "/api/chat/history": { messages: [] },
      "/api/chat": {
        message: "Bought 5 AAPL.",
        trades: [
          { ticker: "AAPL", side: "buy", quantity: 5, price: 190.5, status: "executed", error: null },
        ],
        watchlist_changes: [],
      },
    });
    render(<Terminal />);
    await screen.findByTestId("watchlist-row-AAPL");

    await userEvent.type(screen.getByTestId("chat-input"), "buy 5 AAPL");
    await userEvent.click(screen.getByTestId("chat-send"));

    expect(await screen.findByTestId("chat-message-1")).toHaveTextContent("Bought 5 AAPL.");
    expect(screen.getByTestId("chat-actions-1")).toHaveTextContent("BUY 5 AAPL at 190.50");
  });

  it("collapses and reopens the chat sidebar", async () => {
    mockBackend();
    render(<Terminal />);
    await screen.findByTestId("chat-panel");

    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.queryByTestId("chat-panel")).toBeNull();

    await userEvent.click(screen.getByTestId("chat-toggle"));
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });
});
