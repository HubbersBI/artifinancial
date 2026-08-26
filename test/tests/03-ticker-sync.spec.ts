import { expect, test } from "@playwright/test";
import { getJson, openTerminal, resetState, tradeViaBar, waitForPrice } from "../helpers/state";

const HELD = "TSLA";

/**
 * The Tracked Ticker Set invariant (PLAN section 8): the market data source
 * tracks the union of the watchlist and every ticker with an open position.
 * Removing a held ticker from the watchlist must NOT untrack it - doing so
 * evicts its price from the cache, which strands the position at a stale value
 * and makes the closing sell fail the no-cached-price rule.
 */
test.describe("removing a watchlist ticker while holding it", () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request);
  });

  test("keeps the position priced, live, and sellable", async ({ page, request }) => {
    await openTerminal(page);
    await waitForPrice(page, HELD);

    await tradeViaBar(page, HELD, 2, "buy");
    await expect(page.getByTestId(`position-row-${HELD}`)).toBeVisible();
    await expect(page.getByTestId(`position-price-${HELD}`)).not.toHaveText("waiting");

    await page.getByTestId(`watchlist-row-${HELD}`).hover();
    await page.getByTestId(`watchlist-remove-${HELD}`).click();
    await expect(page.getByTestId(`watchlist-row-${HELD}`)).toHaveCount(0);

    // The position survives the removal and is still priced.
    const priceCell = page.getByTestId(`position-price-${HELD}`);
    await expect(page.getByTestId(`position-row-${HELD}`)).toBeVisible();
    await expect(priceCell).not.toHaveText("waiting");

    // The server still has a cached price for it.
    const portfolio = await getJson(request, "/api/portfolio");
    const held = portfolio.positions.find((p: { ticker: string }) => p.ticker === HELD);
    expect(held, `${HELD} position missing from /api/portfolio`).toBeTruthy();
    expect(
      held.current_price,
      `${HELD} lost its cached price after leaving the watchlist - remove_ticker was called on a held ticker`,
    ).not.toBeNull();

    // And it is still on the stream: the cell keeps moving with the market.
    const before = await priceCell.innerText();
    await expect(priceCell, `${HELD} price froze after leaving the watchlist`).not.toHaveText(
      before,
      { timeout: 30_000 },
    );

    // Finally, the whole point: it can still be sold.
    await tradeViaBar(page, HELD, 2, "sell");
    await expect(page.getByTestId(`position-row-${HELD}`)).toHaveCount(0);
    await expect(page.getByTestId("trade-error")).toHaveCount(0);
  });

  test("untracks a removed ticker that is not held", async ({ page, request }) => {
    await openTerminal(page);

    await page.getByTestId("watchlist-row-NFLX").hover();
    await page.getByTestId("watchlist-remove-NFLX").click();
    await expect(page.getByTestId("watchlist-row-NFLX")).toHaveCount(0);

    // No position, so the trade must be rejected on the no-cached-price rule.
    const response = await request.post("/api/portfolio/trade", {
      data: { ticker: "NFLX", quantity: 1, side: "buy" },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).detail).toContain("No price available for NFLX");
  });
});
