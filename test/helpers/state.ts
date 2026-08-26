import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/** The seeded watchlist from PLAN section 7. */
export const DEFAULT_TICKERS = [
  "AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX",
];

/**
 * Return the app to a known shape through the public API: no open positions and
 * exactly the ten seeded watchlist tickers.
 *
 * Cash is deliberately not forced back to 10,000 - prices move between the buy
 * and the closing sell, so only `01-fresh-start.spec.ts` asserts the seed value.
 * Every other spec asserts relative movement.
 */
export async function resetState(request: APIRequestContext): Promise<void> {
  const portfolio = await getJson(request, "/api/portfolio");
  for (const position of portfolio.positions) {
    await request.post("/api/portfolio/trade", {
      data: { ticker: position.ticker, quantity: position.quantity, side: "sell" },
    });
  }

  const watchlist = await getJson(request, "/api/watchlist");
  const present: string[] = watchlist.watchlist.map((row: { ticker: string }) => row.ticker);
  for (const ticker of present) {
    if (!DEFAULT_TICKERS.includes(ticker)) {
      await request.delete(`/api/watchlist/${ticker}`);
    }
  }
  for (const ticker of DEFAULT_TICKERS) {
    if (!present.includes(ticker)) {
      await request.post("/api/watchlist", { data: { ticker } });
    }
  }
}

export async function getJson(request: APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.ok(), `GET ${path} returned ${response.status()}`).toBeTruthy();
  return response.json();
}

/** Parse a rendered figure such as `12,345.67`, `+1.23%` or `-12.34`. */
export function parseNumber(text: string): number {
  const cleaned = text.trim().replace(/,/g, "").replace(/%/g, "").replace(/^\+/, "");
  const value = Number(cleaned);
  expect(Number.isNaN(value), `cannot parse "${text}" as a number`).toBeFalsy();
  return value;
}

export async function readNumber(locator: Locator): Promise<number> {
  return parseNumber((await locator.innerText()) ?? "");
}

/** Wait until the SSE stream has delivered at least one price for `ticker`. */
export async function waitForPrice(page: Page, ticker: string): Promise<void> {
  await expect(page.getByTestId(`watchlist-price-${ticker}`)).not.toHaveAttribute(
    "data-waiting",
    "true",
    { timeout: 30_000 },
  );
}

/** Open the app and wait for the stream to connect and paint a first price. */
export async function openTerminal(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("header")).toBeVisible();
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
  await waitForPrice(page, "AAPL");
}

/** Execute a market order through the trade bar and wait for the fill line. */
export async function tradeViaBar(
  page: Page,
  ticker: string,
  quantity: number,
  side: "buy" | "sell",
): Promise<void> {
  await page.getByTestId("trade-ticker-input").fill(ticker);
  await page.getByTestId("trade-quantity-input").fill(String(quantity));
  await page.getByTestId(side === "buy" ? "trade-buy-button" : "trade-sell-button").click();
  await expect(page.getByTestId("trade-status")).toContainText(
    `${side.toUpperCase()} ${quantity} ${ticker} filled`,
  );
}
