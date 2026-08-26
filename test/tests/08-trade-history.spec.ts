import { expect, test } from "@playwright/test";
import { getJson, openTerminal, resetState, tradeViaBar, waitForPrice } from "../helpers/state";

test.describe("trade history", () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request);
  });

  test("a buy shows up at the top of the recent-trades tab", async ({ page, request }) => {
    await openTerminal(page);
    await waitForPrice(page, "NVDA");

    await expect(page.getByTestId("positions-tab-positions")).toHaveAttribute("data-active", "true");

    await tradeViaBar(page, "NVDA", 2, "buy");

    await page.getByTestId("positions-tab-trades").click();
    await expect(page.getByTestId("positions-tab-trades")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("trades-table")).toBeVisible();

    // Newest first, so row 0 is the fill we just made.
    const row = page.getByTestId("trade-row-0");
    await expect(row).toContainText("NVDA");
    await expect(row).toContainText("BUY");
    await expect(row).toContainText("2");

    const [latest] = (await getJson(request, "/api/trades?limit=1")).trades;
    expect(latest.ticker).toBe("NVDA");
    expect(latest.side).toBe("buy");
    expect(latest.quantity).toBe(2);
    await expect(row).toContainText(
      latest.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
  });
});
