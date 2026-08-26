import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TradeBar } from "../TradeBar";
import { prices } from "./fixtures";

function renderBar(overrides: Partial<Parameters<typeof TradeBar>[0]> = {}) {
  const props = {
    ticker: "AAPL",
    onTickerChange: vi.fn(),
    prices,
    onTrade: vi.fn(async () => {}),
    ...overrides,
  };
  return { props, ...render(<TradeBar {...props} />) };
}

describe("TradeBar", () => {
  it("prefills the selected ticker and a quantity of one", () => {
    renderBar();
    expect(screen.getByTestId("trade-ticker-input")).toHaveValue("AAPL");
    expect(screen.getByTestId("trade-quantity-input")).toHaveValue("1");
  });

  it("follows the watchlist selection", () => {
    const { rerender, props } = renderBar();
    rerender(<TradeBar {...props} ticker="GOOGL" />);
    expect(screen.getByTestId("trade-ticker-input")).toHaveValue("GOOGL");
  });

  it("submits a buy and a sell with the typed quantity", async () => {
    const { props } = renderBar();
    const qty = screen.getByTestId("trade-quantity-input");
    await userEvent.clear(qty);
    await userEvent.type(qty, "5");

    await userEvent.click(screen.getByTestId("trade-buy-button"));
    expect(props.onTrade).toHaveBeenCalledWith("AAPL", 5, "buy");

    await userEvent.click(screen.getByTestId("trade-sell-button"));
    expect(props.onTrade).toHaveBeenCalledWith("AAPL", 5, "sell");
  });

  it("uppercases a typed ticker as it is entered", async () => {
    const { props } = renderBar({ ticker: "" });
    await userEvent.type(screen.getByTestId("trade-ticker-input"), "n");
    expect(props.onTickerChange).toHaveBeenCalledWith("N");
  });

  it("says it is waiting rather than erroring on an untracked ticker", async () => {
    renderBar({ ticker: "PYPL" });
    expect(screen.getByTestId("trade-bar")).toHaveTextContent(/waiting for price/i);
  });

  it("shows the fill confirmation and the rejection message inline", () => {
    const { rerender, props } = renderBar({ status: "BUY 5 AAPL filled" });
    expect(screen.getByTestId("trade-status")).toHaveTextContent("BUY 5 AAPL filled");
    expect(screen.queryByTestId("trade-error")).toBeNull();

    rerender(<TradeBar {...props} error="No price available for PYPL yet" />);
    expect(screen.getByTestId("trade-error")).toHaveTextContent("No price available for PYPL yet");
    expect(screen.queryByTestId("trade-status")).toBeNull();
  });
});
