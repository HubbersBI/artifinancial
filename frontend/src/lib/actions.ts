/**
 * Chat actions arrive either as one `actions` list or as separate `trades` and
 * `watchlist_changes` lists. Both are flattened to a single list for display.
 */

import { money, quantity } from "./format";
import type { ChatAction, ChatActionSet, ChatMessage, ChatResponse } from "./types";

/**
 * Accepts a POST /api/chat response, a stored chat message whose `actions` is
 * the nested `{trades, watchlist_changes}` pair, or a plain action array.
 */
export function normalizeActions(source: ChatResponse | ChatMessage): ChatAction[] {
  const nested = (source as ChatMessage).actions;
  if (Array.isArray(nested)) return nested;
  return flatten(nested ?? (source as ChatActionSet));
}

function flatten(set: ChatActionSet): ChatAction[] {
  return [
    ...(set.trades ?? []).map((t) => ({ ...t, type: t.type ?? "trade" })),
    ...(set.watchlist_changes ?? []).map((w) => ({ ...w, type: w.type ?? "watchlist" })),
  ];
}

/** One line of confirmation text for an executed or rejected action. */
export function describeAction(action: ChatAction): string {
  const summary = action.side ? tradeSummary(action) : watchlistSummary(action);
  return action.error ? `${summary} rejected: ${action.error}` : summary;
}

function tradeSummary(action: ChatAction): string {
  const qty = action.quantity === undefined ? "?" : quantity(action.quantity);
  const at = action.price ? ` at ${money(action.price)}` : "";
  return `${action.side!.toUpperCase()} ${qty} ${action.ticker ?? ""}${at}`.replace(/\s+/g, " ").trim();
}

function watchlistSummary(action: ChatAction): string {
  if (!action.action) return action.message ?? "Action";
  const removing = action.action === "remove";
  return `${removing ? "Removed" : "Added"} ${action.ticker ?? ""} ${removing ? "from" : "to"} watchlist`;
}

export function isRejected(action: ChatAction): boolean {
  return Boolean(action.error) || action.status === "rejected" || action.status === "failed";
}
