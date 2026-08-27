/**
 * Persistence for the browser engine, replacing the SQLite volume.
 *
 * localStorage rather than IndexedDB: the whole state is a few kilobytes of
 * positions, trades and chat, and IndexedDB's async API would spread awaits
 * through code that is otherwise synchronous for no gain.
 *
 * Every access is guarded. Storage throws outright in some privacy modes, and a
 * demo that white-screens because someone has cookies disabled is worse than one
 * that forgets a portfolio between visits.
 */

import { initialState, type PortfolioState } from "./state";

const KEY = "artifinancial:state:v1";
/** Trades and snapshots grow without bound otherwise; the charts read far less. */
const MAX_TRADES = 500;
const MAX_SNAPSHOTS = 500;
const MAX_CHAT = 200;

export function loadState(): PortfolioState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    return revive(JSON.parse(raw) as Partial<PortfolioState>);
  } catch {
    // Corrupt, unreadable or blocked. A fresh portfolio beats a broken page.
    return initialState();
  }
}

export function saveState(state: PortfolioState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(trim(state)));
  } catch {
    // Full, or blocked. The session still works; it just will not survive.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * Fill in anything a stored state is missing.
 *
 * A state written by an older build, or hand-edited, must not be able to produce
 * undefined where the app expects an array - that would surface as a crash in a
 * component rather than as the bad data it is.
 */
function revive(stored: Partial<PortfolioState>): PortfolioState {
  const base = initialState();
  return {
    cash_balance:
      typeof stored.cash_balance === "number" && Number.isFinite(stored.cash_balance)
        ? stored.cash_balance
        : base.cash_balance,
    positions: Array.isArray(stored.positions) ? stored.positions : base.positions,
    trades: Array.isArray(stored.trades) ? stored.trades : base.trades,
    snapshots: Array.isArray(stored.snapshots) ? stored.snapshots : base.snapshots,
    watchlist: Array.isArray(stored.watchlist) ? stored.watchlist : base.watchlist,
    chat: Array.isArray(stored.chat) ? stored.chat : base.chat,
  };
}

function trim(state: PortfolioState): PortfolioState {
  return {
    ...state,
    trades: state.trades.slice(-MAX_TRADES),
    snapshots: state.snapshots.slice(-MAX_SNAPSHOTS),
    chat: state.chat.slice(-MAX_CHAT),
  };
}
