import { expect, test } from "@playwright/test";
import { DEFAULT_TICKERS, getJson, waitForPrice } from "../helpers/state";

/**
 * Runs first, against an untouched database, so it can assert the seed values
 * from PLAN section 7 exactly. Every later spec asserts relative movement.
 */
test.describe("fresh start", () => {
  test("seeded watchlist, 10,000 cash, and a live stream", async ({ page, request }) => {
    await page.goto("/");

    await expect(page.getByTestId("header")).toBeVisible();

    for (const ticker of DEFAULT_TICKERS) {
      await expect(page.getByTestId(`watchlist-row-${ticker}`)).toBeVisible();
    }
    await expect(page.getByTestId("watchlist-row-AAPL")).toHaveCount(1);

    await expect(page.getByTestId("cash-balance")).toHaveText("10,000.00");
    await expect(page.getByTestId("total-value")).toHaveText("10,000.00");

    await expect(page.getByTestId("positions-empty")).toBeVisible();
    await expect(page.getByTestId("heatmap-empty")).toBeVisible();

    await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
    await waitForPrice(page, "AAPL");

    const portfolio = await getJson(request, "/api/portfolio");
    expect(portfolio.cash_balance).toBe(10000.0);
    expect(portfolio.positions).toEqual([]);
  });

  test("prices keep ticking after the first quote", async ({ page }) => {
    await page.goto("/");

    // Charts accumulate from SSE since page load, so exactly one of the two
    // states is in the DOM at any moment - asserting on the pair avoids racing
    // the first ticks.
    const chart = page.getByTestId("main-chart");
    await expect(page.getByTestId("main-chart-collecting").or(chart)).toBeVisible();

    // Two accumulated ticks replace the collecting state with the real chart.
    await expect(chart).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("main-chart-collecting")).toHaveCount(0);

    await expect(page.getByTestId("watchlist-sparkline-AAPL")).toHaveAttribute(
      "data-state",
      "live",
      { timeout: 30_000 },
    );
  });
});
