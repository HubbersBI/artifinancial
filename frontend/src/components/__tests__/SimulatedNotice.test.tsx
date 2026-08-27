import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { SimulatedBadge, SimulatedNotice } from "../SimulatedNotice";

describe("SimulatedNotice", () => {
  beforeEach(() => localStorage.clear());

  it("says the prices are not real before the terminal is used", async () => {
    render(<SimulatedNotice />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Nothing here is real money or real market data/i)).toBeInTheDocument();
  });

  it("says the assistant is not a model", async () => {
    render(<SimulatedNotice />);
    await screen.findByRole("dialog");
    expect(screen.getByText(/scripted\s+mock, not a language model/i)).toBeInTheDocument();
  });

  it("stays dismissed for this browser once read", async () => {
    const first = render(<SimulatedNotice />);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /understood/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    first.unmount();
    render(<SimulatedNotice />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is attributed and dated in the dialog", async () => {
    render(<SimulatedNotice />);
    await screen.findByRole("dialog");
    expect(screen.getByText(/Portfolio demo by J\. Hubbers/)).toBeInTheDocument();
    expect(screen.getByText(/August 2026/)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(<SimulatedNotice />);
    await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows again when storage is unavailable rather than staying silent", async () => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      render(<SimulatedNotice />);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    } finally {
      Storage.prototype.getItem = getItem;
    }
  });
});

describe("SimulatedBadge", () => {
  it("carries the attribution alongside the badge", () => {
    render(<SimulatedBadge />);
    expect(screen.getByText(/Portfolio demo by J\. Hubbers/)).toBeInTheDocument();
  });

  it("keeps the fact in the chrome after the dialog is gone", () => {
    render(<SimulatedBadge />);
    // The dialog is dismissed once and forgotten; this is what a returning
    // visitor, or someone looking at a screenshot, still sees.
    expect(screen.getByText(/simulated/i)).toBeInTheDocument();
  });
});
