import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Heatmap, tileColor } from "../Heatmap";
import { positions } from "./fixtures";

describe("Heatmap", () => {
  it("renders one tile per position", () => {
    render(<Heatmap positions={positions} onSelect={vi.fn()} />);
    expect(screen.getByTestId("heatmap-tile-AAPL")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-tile-GOOGL")).toBeInTheDocument();
  });

  it("sizes tiles by portfolio weight", () => {
    render(<Heatmap positions={positions} onSelect={vi.fn()} />);
    // 1905 and 700.80 of 2605.80 total.
    expect(screen.getByTestId("heatmap-tile-AAPL")).toHaveAttribute("data-weight", "73.11");
    expect(screen.getByTestId("heatmap-tile-GOOGL")).toHaveAttribute("data-weight", "26.89");
  });

  it("labels each tile with its ticker and P&L", () => {
    render(<Heatmap positions={positions} onSelect={vi.fn()} />);
    expect(screen.getByTestId("heatmap-tile-AAPL")).toHaveTextContent("+5.83%");
    expect(screen.getByTestId("heatmap-tile-GOOGL")).toHaveTextContent("-2.67%");
  });

  it("selects the ticker on click", async () => {
    const onSelect = vi.fn();
    render(<Heatmap positions={positions} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId("heatmap-tile-GOOGL"));
    expect(onSelect).toHaveBeenCalledWith("GOOGL");
  });

  it("invites a first trade when there is nothing to show", () => {
    render(<Heatmap positions={[]} onSelect={vi.fn()} />);
    expect(screen.getByTestId("heatmap-empty")).toBeInTheDocument();
  });

  it("colours profit green, loss red and flat neutral", () => {
    expect(tileColor(3)).toContain("#26d07c");
    expect(tileColor(-3)).toContain("#ff5765");
    expect(tileColor(0)).toBe("#232c38");
  });
});
