import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PositionsPanel } from "../PositionsPanel";
import { positions, prices, trades } from "./fixtures";

function renderPanel(overrides: Partial<Parameters<typeof PositionsPanel>[0]> = {}) {
  const props = { positions, prices, trades, onSelect: vi.fn(), ...overrides };
  return { props, ...render(<PositionsPanel {...props} />) };
}

describe("PositionsPanel", () => {
  it("computes unrealized P&L from the live price, not the fetched one", () => {
    renderPanel();
    // 10 shares bought at 180, streaming at 190.50.
    expect(screen.getByTestId("position-pnl-AAPL")).toHaveTextContent("+105.00");
    expect(screen.getByTestId("position-pnl-percent-AAPL")).toHaveTextContent("+5.83%");
  });

  it("shows a loss in the down tone", () => {
    renderPanel();
    const pnl = screen.getByTestId("position-pnl-GOOGL");
    expect(pnl).toHaveTextContent("-19.20");
    expect(pnl.className).toContain("text-down");
  });

  it("renders quantity, average cost and current price", () => {
    renderPanel();
    expect(screen.getByTestId("position-qty-AAPL")).toHaveTextContent("10");
    expect(screen.getByTestId("position-avg-cost-AAPL")).toHaveTextContent("180.00");
    expect(screen.getByTestId("position-price-AAPL")).toHaveTextContent("190.50");
  });

  it("waits for a price rather than showing zero", () => {
    renderPanel({
      positions: [{ ticker: "PYPL", quantity: 1, avg_cost: 60, current_price: null }],
    });
    expect(screen.getByTestId("position-price-PYPL")).toHaveTextContent("waiting");
  });

  it("selects a ticker when a row is clicked", async () => {
    const { props } = renderPanel();
    await userEvent.click(screen.getByTestId("position-row-GOOGL"));
    expect(props.onSelect).toHaveBeenCalledWith("GOOGL");
  });

  it("shows an empty state instead of a bare table", () => {
    renderPanel({ positions: [] });
    expect(screen.getByTestId("positions-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("positions-table")).toBeNull();
  });

  it("switches to recent trades, newest first", async () => {
    renderPanel();
    expect(screen.queryByTestId("trades-table")).toBeNull();
    await userEvent.click(screen.getByTestId("positions-tab-trades"));
    expect(screen.getByTestId("trades-table")).toBeInTheDocument();
    expect(screen.getByTestId("trade-row-0")).toHaveTextContent("GOOGL");
    expect(screen.getByTestId("trade-row-0")).toHaveTextContent("SELL");
    expect(screen.getByTestId("trade-row-1")).toHaveTextContent("AAPL");
    expect(screen.getByTestId("positions-tab-trades")).toHaveAttribute("data-active", "true");
  });

  it("shows an empty trades state", async () => {
    renderPanel({ trades: [] });
    await userEvent.click(screen.getByTestId("positions-tab-trades"));
    expect(screen.getByTestId("trades-empty")).toBeInTheDocument();
  });
});
