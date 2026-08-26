import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Watchlist } from "../Watchlist";
import { prices, quote, series } from "./fixtures";

const noop = async () => {};

function renderList(overrides: Partial<Parameters<typeof Watchlist>[0]> = {}) {
  const props = {
    tickers: ["AAPL", "GOOGL", "PYPL"],
    prices,
    series,
    selected: "AAPL",
    onSelect: vi.fn(),
    onAdd: vi.fn(noop),
    onRemove: vi.fn(noop),
    ...overrides,
  };
  return { props, ...render(<Watchlist {...props} />) };
}

describe("Watchlist", () => {
  it("renders a row per ticker with price and change", () => {
    renderList();
    expect(screen.getByTestId("watchlist-price-AAPL")).toHaveTextContent("190.50");
    expect(screen.getByTestId("watchlist-change-AAPL")).toHaveTextContent("+0.42%");
    expect(screen.getByTestId("watchlist-change-GOOGL")).toHaveTextContent("-1.10%");
  });

  it("shows waiting for price rather than an error when a ticker has no tick", () => {
    renderList();
    const cell = screen.getByTestId("watchlist-price-PYPL");
    expect(cell).toHaveAttribute("data-waiting", "true");
    expect(cell).toHaveTextContent(/waiting for price/i);
    expect(screen.queryByTestId("watchlist-change-PYPL")).toBeNull();
  });

  it("draws a sparkline once two points exist and collects before that", () => {
    renderList();
    expect(screen.getByTestId("watchlist-sparkline-AAPL")).toHaveAttribute("data-state", "live");
    expect(screen.getByTestId("watchlist-sparkline-GOOGL")).toHaveAttribute(
      "data-state",
      "collecting",
    );
  });

  it("marks the selected row and selects on click", async () => {
    const { props } = renderList();
    expect(screen.getByTestId("watchlist-row-AAPL")).toHaveAttribute("data-selected", "true");
    await userEvent.click(screen.getByTestId("watchlist-row-GOOGL"));
    expect(props.onSelect).toHaveBeenCalledWith("GOOGL");
  });

  it("adds an uppercased ticker and clears the field", async () => {
    const { props } = renderList();
    await userEvent.type(screen.getByTestId("watchlist-add-input"), "pypl");
    await userEvent.click(screen.getByTestId("watchlist-add-submit"));
    expect(props.onAdd).toHaveBeenCalledWith("PYPL");
    expect(screen.getByTestId("watchlist-add-input")).toHaveValue("");
  });

  it("removes without selecting the row", async () => {
    const { props } = renderList();
    await userEvent.click(screen.getByTestId("watchlist-remove-GOOGL"));
    expect(props.onRemove).toHaveBeenCalledWith("GOOGL");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("surfaces a rejection inline", () => {
    renderList({ error: "PYPL is already on the watchlist" });
    expect(screen.getByTestId("watchlist-error")).toHaveTextContent(
      "PYPL is already on the watchlist",
    );
  });

  it("flashes green on an uptick and red on a downtick", () => {
    const { rerender, props } = renderList();
    expect(screen.getByTestId("watchlist-price-AAPL").className).not.toMatch(/flash/);

    rerender(<Watchlist {...props} prices={{ ...prices, AAPL: quote("AAPL", 191.5) }} />);
    expect(screen.getByTestId("watchlist-price-AAPL").className).toContain("flash-up");

    rerender(<Watchlist {...props} prices={{ ...prices, AAPL: quote("AAPL", 189.0) }} />);
    expect(screen.getByTestId("watchlist-price-AAPL").className).toContain("flash-down");
  });

  it("clears the flash after the transition window", () => {
    vi.useFakeTimers();
    try {
      const { rerender, props } = renderList();
      rerender(<Watchlist {...props} prices={{ ...prices, AAPL: quote("AAPL", 191.5) }} />);
      expect(screen.getByTestId("watchlist-price-AAPL").className).toContain("flash-up");
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByTestId("watchlist-price-AAPL").className).not.toMatch(/flash/);
    } finally {
      vi.useRealTimers();
    }
  });
});
