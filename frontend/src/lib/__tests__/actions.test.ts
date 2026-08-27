import { describe, expect, it } from "vitest";
import { describeAction, isRejected, normalizeActions } from "../actions";
import type { ChatMessage, ChatResponse } from "../types";

const response: ChatResponse = {
  message: "Bought 5 AAPL.",
  trades: [{ ticker: "AAPL", side: "buy", quantity: 5, price: 190.5, status: "executed", error: null }],
  watchlist_changes: [{ ticker: "PYPL", action: "add", status: "executed", error: null }],
};

describe("normalizeActions", () => {
  it("flattens a chat response into one list", () => {
    expect(normalizeActions(response).map((a) => a.ticker)).toEqual(["AAPL", "PYPL"]);
  });

  it("flattens the nested actions object stored on a history message", () => {
    const stored: ChatMessage = {
      role: "assistant",
      content: "Bought 5 AAPL.",
      actions: { trades: response.trades, watchlist_changes: [] },
    };
    expect(normalizeActions(stored)).toHaveLength(1);
  });

  it("returns nothing for a user message with null actions", () => {
    expect(normalizeActions({ role: "user", content: "hi", actions: null })).toEqual([]);
  });
});

describe("describeAction", () => {
  it("summarises an executed trade with its fill price", () => {
    expect(describeAction(response.trades![0])).toBe("BUY 5 AAPL at 190.50");
  });

  it("summarises a watchlist change", () => {
    expect(describeAction({ ticker: "PYPL", action: "add" })).toBe("Added PYPL to watchlist");
    expect(describeAction({ ticker: "TSLA", action: "remove" })).toBe(
      "Removed TSLA from watchlist",
    );
  });

  it("keeps the intent visible on a rejection and omits the null price", () => {
    const text = describeAction({
      ticker: "AAPL",
      side: "buy",
      quantity: 100000,
      price: null,
      status: "rejected",
      error: "Insufficient cash: need $19050000.00, have $10000.00",
    });
    expect(text).toBe(
      "BUY 100000 AAPL rejected: Insufficient cash: need $19050000.00, have $10000.00",
    );
  });
});

describe("isRejected", () => {
  it("flags rejected status and error messages", () => {
    expect(isRejected({ status: "rejected" })).toBe(true);
    expect(isRejected({ error: "nope" })).toBe(true);
    expect(isRejected({ status: "executed", error: null })).toBe(false);
  });
});
