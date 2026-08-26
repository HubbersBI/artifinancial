import { expect, test } from "@playwright/test";
import { getJson, openTerminal, resetState, waitForPrice } from "../helpers/state";

const EXTRA = "PYPL";

test.describe("watchlist", () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request);
  });

  test("adds a ticker and it starts streaming a price", async ({ page }) => {
    await openTerminal(page);
    await expect(page.getByTestId(`watchlist-row-${EXTRA}`)).toHaveCount(0);

    await page.getByTestId("watchlist-add-input").fill(EXTRA.toLowerCase());
    await page.getByTestId("watchlist-add-submit").click();

    const row = page.getByTestId(`watchlist-row-${EXTRA}`);
    await expect(row).toBeVisible();

    // "waiting for price" is correct behaviour until the next tick, so wait it out.
    await waitForPrice(page, EXTRA);
    await expect(page.getByTestId(`watchlist-price-${EXTRA}`)).toHaveText(/^[\d,]+\.\d{2}$/);
    await expect(page.getByTestId(`watchlist-change-${EXTRA}`)).toBeVisible();

    // Streaming means more than one tick: the sparkline needs two points.
    await expect(page.getByTestId(`watchlist-sparkline-${EXTRA}`)).toHaveAttribute(
      "data-state",
      "live",
      { timeout: 30_000 },
    );
  });

  test("removes a ticker", async ({ page, request }) => {
    await openTerminal(page);
    await page.getByTestId("watchlist-add-input").fill(EXTRA);
    await page.getByTestId("watchlist-add-submit").click();
    await expect(page.getByTestId(`watchlist-row-${EXTRA}`)).toBeVisible();

    await page.getByTestId(`watchlist-row-${EXTRA}`).hover();
    await page.getByTestId(`watchlist-remove-${EXTRA}`).click();

    await expect(page.getByTestId(`watchlist-row-${EXTRA}`)).toHaveCount(0);

    const watchlist = await getJson(request, "/api/watchlist");
    expect(watchlist.watchlist.map((r: { ticker: string }) => r.ticker)).not.toContain(EXTRA);
  });

  test("rejects a duplicate add with the backend message", async ({ page }) => {
    await openTerminal(page);

    await page.getByTestId("watchlist-add-input").fill("AAPL");
    await page.getByTestId("watchlist-add-submit").click();

    await expect(page.getByTestId("watchlist-error")).toContainText("already on the watchlist");
    await expect(page.getByTestId("watchlist-row-AAPL")).toHaveCount(1);
  });
});
