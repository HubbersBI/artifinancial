import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MainChart } from "../MainChart";
import { quote, series } from "./fixtures";

describe("MainChart", () => {
  it("shows the collecting state with no ticks, never a blank panel", () => {
    render(<MainChart ticker="AAPL" points={[]} />);
    expect(screen.getByTestId("main-chart-collecting")).toHaveTextContent(/collecting data/i);
    expect(screen.queryByTestId("main-chart")).toBeNull();
  });

  it("stays in the collecting state with a single tick", () => {
    render(<MainChart ticker="GOOGL" points={series.GOOGL} quote={quote("GOOGL", 175.2)} />);
    expect(screen.getByTestId("main-chart-collecting")).toBeInTheDocument();
  });

  it("draws the chart once two ticks have accumulated", () => {
    render(<MainChart ticker="AAPL" points={series.AAPL} quote={quote("AAPL", 190.5, 0.42)} />);
    expect(screen.getByTestId("main-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("main-chart-collecting")).toBeNull();
  });

  it("headlines the selected ticker and its live price", () => {
    render(<MainChart ticker="AAPL" points={series.AAPL} quote={quote("AAPL", 190.5, 0.42)} />);
    expect(screen.getByTestId("main-chart-ticker")).toHaveTextContent("AAPL");
    expect(screen.getByTestId("main-chart-price")).toHaveTextContent("190.50");
  });

  it("flashes the headline price on change", () => {
    const props = { ticker: "AAPL", points: series.AAPL };
    const { rerender } = render(<MainChart {...props} quote={quote("AAPL", 190.5)} />);
    rerender(<MainChart {...props} quote={quote("AAPL", 192.0)} />);
    expect(screen.getByTestId("main-chart-price").className).toContain("flash-up");
  });

  it("renders a dash when nothing is selected", () => {
    render(<MainChart ticker={null} points={[]} />);
    expect(screen.getByTestId("main-chart-ticker")).toHaveTextContent("--");
  });
});
