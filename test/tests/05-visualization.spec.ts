import { expect, test, type Locator } from "@playwright/test";
import { getJson, openTerminal, parseNumber, resetState, tradeViaBar, waitForPrice } from "../helpers/state";

/** First three numbers of a computed colour, whatever notation the browser used. */
async function channels(locator: Locator): Promise<number[]> {
  const colour = await locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  const parts = colour.match(/[\d.]+/g);
  expect(parts, `cannot read a colour from "${colour}"`).toBeTruthy();
  return parts!.slice(0, 3).map(Number);
}

test.describe("portfolio visualization", () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request);
  });

  test("heatmap tiles are sized by weight and coloured by P&L", async ({ page, request }) => {
    await openTerminal(page);
    await expect(page.getByTestId("heatmap-empty")).toBeVisible();

    await waitForPrice(page, "AAPL");
    await waitForPrice(page, "NVDA");
    await tradeViaBar(page, "AAPL", 4, "buy");
    await tradeViaBar(page, "NVDA", 2, "buy");

    await expect(page.getByTestId("heatmap-empty")).toHaveCount(0);
    const tiles = ["AAPL", "NVDA"].map((t) => page.getByTestId(`heatmap-tile-${t}`));
    for (const tile of tiles) await expect(tile).toBeVisible();

    const weights = await Promise.all(
      tiles.map(async (tile) => Number(await tile.getAttribute("data-weight"))),
    );
    expect(weights[0] + weights[1]).toBeCloseTo(100, 1);
    for (const weight of weights) expect(weight).toBeGreaterThan(0);

    // Weight ordering must match market value ordering.
    const portfolio = await getJson(request, "/api/portfolio");
    const value = (ticker: string) =>
      portfolio.positions.find((p: { ticker: string }) => p.ticker === ticker).market_value;
    expect(weights[0] > weights[1]).toBe(value("AAPL") > value("NVDA"));

    // Colour must follow the sign of the P&L the same tile's row reports. A
    // freshly opened position sits at zero until the next tick, so wait it out.
    const pnlCell = page.getByTestId("position-pnl-percent-AAPL");
    await expect
      .poll(async () => parseNumber(await pnlCell.innerText()), { timeout: 30_000 })
      .not.toBe(0);

    const pnl = parseNumber(await pnlCell.innerText());
    const [r, g] = await channels(page.getByTestId("heatmap-tile-AAPL"));
    if (pnl > 0) {
      expect(g, `profit tile should be green, got rgb(${r}, ${g}, ...)`).toBeGreaterThan(r);
    } else {
      expect(r, `loss tile should be red, got rgb(${r}, ${g}, ...)`).toBeGreaterThan(g);
    }
  });

  test("P&L chart fills in from persisted snapshots", async ({ page, request }) => {
    await openTerminal(page);
    await waitForPrice(page, "AAPL");

    // Exactly one of the two states is in the DOM at any time.
    const chart = page.getByTestId("pnl-chart");
    await expect(page.getByTestId("pnl-empty").or(chart)).toBeVisible();

    // Every fill writes a snapshot, so two trades guarantee two data points.
    await tradeViaBar(page, "AAPL", 1, "buy");
    await tradeViaBar(page, "AAPL", 1, "sell");

    const history = await getJson(request, "/api/portfolio/history");
    expect(history.snapshots.length).toBeGreaterThanOrEqual(2);

    await expect(chart).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("pnl-empty")).toHaveCount(0);
    await expect(chart.locator("svg path").first()).toBeVisible();
  });
});
