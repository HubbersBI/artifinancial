import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header } from "../Header";

describe("Header", () => {
  it("shows total value and cash", () => {
    render(<Header totalValue={10007} cashBalance={8095} status="connected" />);
    expect(screen.getByTestId("total-value")).toHaveTextContent("10,007.00");
    expect(screen.getByTestId("cash-balance")).toHaveTextContent("8,095.00");
  });

  it("colours the connection dot by state", () => {
    const { rerender } = render(<Header totalValue={0} cashBalance={0} status="connected" />);
    const dot = () => screen.getByTestId("connection-status");
    expect(dot()).toHaveAttribute("data-status", "connected");
    expect(dot().className).toContain("bg-up");

    rerender(<Header totalValue={0} cashBalance={0} status="reconnecting" />);
    expect(dot().className).toContain("bg-accent");

    rerender(<Header totalValue={0} cashBalance={0} status="disconnected" />);
    expect(dot().className).toContain("bg-down");
  });
});
