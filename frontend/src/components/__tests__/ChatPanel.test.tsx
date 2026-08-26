import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "../ChatPanel";
import { chatHistory } from "./fixtures";

function renderChat(overrides: Partial<Parameters<typeof ChatPanel>[0]> = {}) {
  const props = {
    messages: chatHistory,
    loading: false,
    open: true,
    onToggle: vi.fn(),
    onSend: vi.fn(async () => {}),
    ...overrides,
  };
  return { props, ...render(<ChatPanel {...props} />) };
}

describe("ChatPanel", () => {
  it("replays restored history in order with roles", () => {
    renderChat();
    expect(screen.getByTestId("chat-message-0")).toHaveAttribute("data-role", "user");
    expect(screen.getByTestId("chat-message-0")).toHaveTextContent("buy 10 AAPL");
    expect(screen.getByTestId("chat-message-1")).toHaveAttribute("data-role", "assistant");
  });

  it("renders executed trades inline as confirmations", () => {
    renderChat();
    const actions = screen.getByTestId("chat-actions-1");
    expect(actions).toHaveTextContent("BUY 10 AAPL at 180.00");
    expect(screen.getByTestId("chat-action")).toHaveAttribute("data-rejected", "false");
  });

  it("marks a rejected action without hiding it", () => {
    renderChat({
      messages: [
        {
          role: "assistant",
          content: "That would cost more than you have.",
          actions: {
            trades: [
              {
                ticker: "AAPL",
                side: "buy",
                quantity: 100000,
                price: null,
                status: "rejected",
                error: "Insufficient cash",
              },
            ],
          },
        },
      ],
    });
    const action = screen.getByTestId("chat-action");
    expect(action).toHaveAttribute("data-rejected", "true");
    expect(action).toHaveTextContent("Insufficient cash");
  });

  it("attaches no action list to a plain reply", () => {
    renderChat({ messages: [{ role: "assistant", content: "Your portfolio is up.", actions: {} }] });
    expect(screen.queryByTestId("chat-actions-0")).toBeNull();
  });

  it("shows a loading indicator while awaiting a reply", () => {
    const { rerender, props } = renderChat();
    expect(screen.queryByTestId("chat-loading")).toBeNull();
    rerender(<ChatPanel {...props} loading />);
    expect(screen.getByTestId("chat-loading")).toBeInTheDocument();
  });

  it("sends the draft and clears the field", async () => {
    const { props } = renderChat();
    await userEvent.type(screen.getByTestId("chat-input"), "what is my exposure");
    await userEvent.click(screen.getByTestId("chat-send"));
    expect(props.onSend).toHaveBeenCalledWith("what is my exposure");
    expect(screen.getByTestId("chat-input")).toHaveValue("");
  });

  it("refuses to send an empty draft", async () => {
    const { props } = renderChat();
    await userEvent.click(screen.getByTestId("chat-send"));
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("collapses to a rail that can reopen it", async () => {
    const { props } = renderChat({ open: false });
    expect(screen.queryByTestId("chat-panel")).toBeNull();
    const toggle = screen.getByTestId("chat-toggle");
    expect(toggle).toHaveAttribute("data-open", "false");
    await userEvent.click(toggle);
    expect(props.onToggle).toHaveBeenCalled();
  });

  it("prompts when there is no history", () => {
    renderChat({ messages: [] });
    expect(screen.getByTestId("chat-empty")).toBeInTheDocument();
  });

  it("surfaces a failed chat call", () => {
    renderChat({ error: "Rate limited" });
    expect(screen.getByTestId("chat-error")).toHaveTextContent("Rate limited");
  });
});
