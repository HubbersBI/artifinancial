"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { Header } from "./Header";
import { Heatmap } from "./Heatmap";
import { MainChart } from "./MainChart";
import { PnlChart } from "./PnlChart";
import { PositionsPanel } from "./PositionsPanel";
import { SimulatedNotice } from "./SimulatedNotice";
import { TradeBar } from "./TradeBar";
import { Watchlist } from "./Watchlist";
import { usePriceStream } from "@/hooks/usePriceStream";
import { api } from "@/lib/api";
import { normalizeActions } from "@/lib/actions";
import type { ChatMessage, Portfolio, PortfolioSnapshot, Trade } from "@/lib/types";

const EMPTY_PORTFOLIO: Portfolio = { cash_balance: 0, total_value: 0, positions: [] };
const REFRESH_MS = 30_000;

export function Terminal() {
  const { prices, series, status } = usePriceStream();

  const [tickers, setTickers] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio>(EMPTY_PORTFOLIO);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [selected, setSelected] = useState<string | null>(null);
  const [orderTicker, setOrderTicker] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeStatus, setTradeStatus] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const loadWatchlist = useCallback(async () => {
    const entries = await api.watchlist();
    const symbols = entries.map((e) => (typeof e === "string" ? e : e.ticker));
    setTickers(symbols);
    setSelected((current) => current ?? symbols[0] ?? null);
    setOrderTicker((current) => current || (symbols[0] ?? ""));
  }, []);

  /** Selecting anywhere in the terminal also loads the order ticket. */
  const select = useCallback((ticker: string) => {
    setSelected(ticker);
    setOrderTicker(ticker);
  }, []);

  const loadBook = useCallback(async () => {
    const [next, recent, snapshots] = await Promise.all([
      api.portfolio(),
      api.trades(),
      api.history(),
    ]);
    setPortfolio(next);
    setTrades(recent);
    setHistory(snapshots);
  }, []);

  useEffect(() => {
    // A backend that is not up yet shows as a red status dot, not a crash.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loaders, state lands in a promise callback
    void loadWatchlist().catch(() => {});
    void loadBook().catch(() => {});
    void api.chatHistory().then(setMessages).catch(() => {});
  }, [loadWatchlist, loadBook]);

  useEffect(() => {
    const timer = setInterval(() => void loadBook().catch(() => {}), REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadBook]);

  /**
   * Positions marked to the live stream, so the header ticks with the market.
   * A ticker with no price yet keeps `current_price: null` and values at cost.
   */
  const marked = useMemo(
    () =>
      portfolio.positions.map((p) => {
        const price = prices[p.ticker]?.price ?? p.current_price ?? null;
        const marketValue = (price ?? p.avg_cost) * p.quantity;
        return {
          ...p,
          current_price: price,
          market_value: marketValue,
          unrealized_pnl: price === null ? 0 : marketValue - p.avg_cost * p.quantity,
          unrealized_pnl_percent: price === null ? 0 : ((price - p.avg_cost) / p.avg_cost) * 100,
        };
      }),
    [portfolio.positions, prices],
  );

  const totalValue =
    portfolio.cash_balance + marked.reduce((sum, p) => sum + (p.market_value ?? 0), 0);

  const addTicker = async (ticker: string) => {
    setWatchlistError(null);
    try {
      await api.addTicker(ticker);
      await loadWatchlist();
      select(ticker);
    } catch (error) {
      setWatchlistError((error as Error).message);
    }
  };

  const removeTicker = async (ticker: string) => {
    setWatchlistError(null);
    try {
      await api.removeTicker(ticker);
      await loadWatchlist();
    } catch (error) {
      setWatchlistError((error as Error).message);
    }
  };

  const trade = async (ticker: string, quantity: number, side: "buy" | "sell") => {
    setTradeError(null);
    setTradeStatus(null);
    try {
      await api.trade(ticker, quantity, side);
      setTradeStatus(`${side.toUpperCase()} ${quantity} ${ticker} filled`);
      await loadBook();
    } catch (error) {
      setTradeError((error as Error).message);
    }
  };

  const sendChat = async (text: string) => {
    setChatError(null);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setChatLoading(true);
    try {
      const response = await api.chat(text);
      const actions = normalizeActions(response);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: response.message, actions },
      ]);
      if (actions.length) {
        await Promise.all([loadBook(), loadWatchlist()]);
      }
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col gap-1 bg-void p-1">
      <SimulatedNotice />
      <Header totalValue={totalValue} cashBalance={portfolio.cash_balance} status={status} />

      <TradeBar
        ticker={orderTicker}
        onTickerChange={setOrderTicker}
        prices={prices}
        onTrade={trade}
        error={tradeError}
        status={tradeStatus}
      />

      <div className="flex min-h-0 flex-1 gap-1">
        <Watchlist
          tickers={tickers}
          prices={prices}
          series={series}
          selected={selected}
          onSelect={select}
          onAdd={addTicker}
          onRemove={removeTicker}
          error={watchlistError}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 xl:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
            <MainChart
              ticker={selected}
              points={selected ? (series[selected] ?? []) : []}
              quote={selected ? prices[selected] : undefined}
            />
            <div className="h-[220px] shrink-0">
              <PositionsPanel
                positions={marked}
                prices={prices}
                trades={trades}
                onSelect={select}
              />
            </div>
          </div>

          <div className="flex h-[260px] shrink-0 gap-1 xl:h-auto xl:w-[320px] xl:flex-col">
            <Heatmap positions={marked} onSelect={select} />
            <div className="w-1/2 shrink-0 xl:h-[220px] xl:w-auto">
              <PnlChart snapshots={history} />
            </div>
          </div>
        </div>

        <ChatPanel
          messages={messages}
          loading={chatLoading}
          open={chatOpen}
          onToggle={() => setChatOpen((v) => !v)}
          onSend={sendChat}
          error={chatError}
        />
      </div>
    </div>
  );
}
