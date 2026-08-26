import { expect, test } from "@playwright/test";
import {
  getJson,
  openTerminal,
  parseNumber,
  readNumber,
  resetState,
  tradeViaBar,
  waitForPrice,
} from "../helpers/state";

test.describe("trading", () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request);
  });

  test("buy: cash decreases, the position appears, the portfolio updates", async ({
    page,
    request,
  }) => {
    await openTerminal(page);
    await waitForPrice(page, "AAPL");

    const before = (await getJson(request, "/api/portfolio")).cash_balance;
    await expect(page.getByTestId("cash-balance")).toHaveText(
      before.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );

    await tradeViaBar(page, "AAPL", 3, "buy");

    const [fill] = (await getJson(request, "/api/trades?limit=1&ticker=AAPL")).trades;
    expect(fill.side).toBe("buy");
    expect(fill.quantity).toBe(3);

    const after = await getJson(request, "/api/portfolio");
    expect(after.cash_balance).toBeCloseTo(before - fill.quantity * fill.price, 2);
    expect(after.cash_balance).toBeLessThan(before);

    const position = after.positions.find((p: { ticker: string }) => p.ticker === "AAPL");
    expect(position.quantity).toBe(3);
    expect(position.avg_cost).toBeCloseTo(fill.price, 2);

    await expect(page.getByTestId("position-row-AAPL")).toBeVisible();
    await expect(page.getByTestId("position-qty-AAPL")).toHaveText("3");
    await expect(page.getByTestId("position-avg-cost-AAPL")).toHaveText(
      fill.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
    await expect(page.getByTestId("cash-balance")).toHaveText(
      after.cash_balance.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );

    // Total value is cash plus the marked position, and it ticks with the stream.
    const total = await readNumber(page.getByTestId("total-value"));
    const price = await readNumber(page.getByTestId("position-price-AAPL"));
    expect(total).toBeCloseTo(after.cash_balance + price * 3, 1);
  });

  test("sell: cash increases, the position shrinks then disappears", async ({ page, request }) => {
    await openTerminal(page);
    await waitForPrice(page, "MSFT");

    await tradeViaBar(page, "MSFT", 4, "buy");
    await expect(page.getByTestId("position-qty-MSFT")).toHaveText("4");
    const afterBuy = (await getJson(request, "/api/portfolio")).cash_balance;

    await tradeViaBar(page, "MSFT", 2, "sell");
    await expect(page.getByTestId("position-qty-MSFT")).toHaveText("2");

    const afterFirstSell = (await getJson(request, "/api/portfolio")).cash_balance;
    expect(afterFirstSell).toBeGreaterThan(afterBuy);

    // avg_cost is unchanged by a sell (PLAN section 8).
    const position = (await getJson(request, "/api/portfolio")).positions.find(
      (p: { ticker: string }) => p.ticker === "MSFT",
    );
    const shownAvg = parseNumber(await page.getByTestId("position-avg-cost-MSFT").innerText());
    expect(position.avg_cost).toBeCloseTo(shownAvg, 2);

    await tradeViaBar(page, "MSFT", 2, "sell");
    await expect(page.getByTestId("position-row-MSFT")).toHaveCount(0);
    await expect(page.getByTestId("positions-empty")).toBeVisible();

    const final = await getJson(request, "/api/portfolio");
    expect(final.positions).toEqual([]);
    expect(final.cash_balance).toBeGreaterThan(afterFirstSell);
  });

  test("rejects a sell with no shares, inline", async ({ page }) => {
    await openTerminal(page);
    await waitForPrice(page, "NVDA");

    await page.getByTestId("trade-ticker-input").fill("NVDA");
    await page.getByTestId("trade-quantity-input").fill("5");
    await page.getByTestId("trade-sell-button").click();

    await expect(page.getByTestId("trade-error")).toContainText(
      "Insufficient shares: cannot sell 5 NVDA, holding 0",
    );
    await expect(page.getByTestId("trade-status")).toHaveCount(0);
  });
});
