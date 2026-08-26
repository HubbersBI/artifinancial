"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { describeAction, isRejected, normalizeActions } from "@/lib/actions";
import type { ChatMessage } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  loading: boolean;
  open: boolean;
  onToggle: () => void;
  onSend: (text: string) => Promise<void>;
  error?: string | null;
}

/** Docked, collapsible assistant sidebar. */
export function ChatPanel({ messages, loading, open, onToggle, onSend, error }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, loading]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;
    setDraft("");
    await onSend(text);
  }

  if (!open) {
    return (
      <button
        data-testid="chat-toggle"
        data-open="false"
        onClick={onToggle}
        aria-label="Open assistant"
        className="flex w-8 shrink-0 flex-col items-center justify-center gap-3 border border-edge bg-rail text-[10px] uppercase tracking-[0.2em] text-ink-dim hover:text-accent"
      >
        <span style={{ writingMode: "vertical-rl" }}>Assistant</span>
      </button>
    );
  }

  return (
    <section
      data-testid="chat-panel"
      data-open="true"
      className="flex w-[340px] shrink-0 flex-col border border-edge bg-panel"
    >
      <div className="flex h-[26px] shrink-0 items-center gap-2 border-b border-edge px-2">
        <span className="h-[9px] w-[2px] bg-submit" aria-hidden />
        <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-dim">
          Assistant
        </h2>
        <button
          data-testid="chat-toggle"
          data-open="true"
          onClick={onToggle}
          aria-label="Collapse assistant"
          className="ml-auto px-1 text-[11px] leading-none text-ink-faint hover:text-ink"
        >
          &gt;&gt;
        </button>
      </div>

      <div data-testid="chat-messages" className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {messages.length === 0 && !loading ? (
          <p data-testid="chat-empty" className="font-sans text-[11px] leading-relaxed text-ink-faint">
            Ask about your positions, request analysis, or tell the assistant to trade. It executes
            immediately.
          </p>
        ) : null}

        {messages.map((message, index) => (
          <Bubble key={message.id ?? index} message={message} index={index} />
        ))}

        {loading ? (
          <div
            data-testid="chat-loading"
            className="flex items-center gap-2 px-1 text-[10px] uppercase tracking-[0.14em] text-accent"
          >
            <span className="h-[6px] w-[6px] animate-pulse rounded-full bg-accent" />
            Thinking
          </div>
        ) : null}

        {error ? (
          <p data-testid="chat-error" className="font-sans text-[11px] text-down">
            {error}
          </p>
        ) : null}

        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex shrink-0 gap-1 border-t border-edge p-1">
        <input
          data-testid="chat-input"
          aria-label="Message the assistant"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask or instruct"
          className="min-w-0 flex-1 border border-edge bg-void px-2 py-1 font-sans text-[12px] text-ink placeholder:text-ink-faint"
        />
        <button
          data-testid="chat-send"
          type="submit"
          disabled={loading}
          className="border border-submit bg-submit px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-ink hover:brightness-125 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}

function Bubble({ message, index }: { message: ChatMessage; index: number }) {
  const user = message.role === "user";
  const actions = normalizeActions(message);

  return (
    <div data-testid={`chat-message-${index}`} data-role={message.role} className="space-y-1">
      <div
        className={`border-l-2 px-2 py-1 font-sans text-[12px] leading-relaxed ${
          user ? "border-l-primary bg-panel-hi text-ink" : "border-l-submit text-ink-dim"
        }`}
      >
        {message.content}
      </div>

      {actions.length ? (
        <ul data-testid={`chat-actions-${index}`} className="space-y-[2px] pl-2">
          {actions.map((action, i) => (
            <li
              key={i}
              data-testid="chat-action"
              data-rejected={isRejected(action)}
              className={`tnum border border-edge bg-void px-2 py-[2px] text-[10px] leading-snug tracking-[0.02em] ${
                isRejected(action) ? "text-down" : "text-accent"
              }`}
            >
              {describeAction(action)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
