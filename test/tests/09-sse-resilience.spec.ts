import { expect, test } from "@playwright/test";
import { openTerminal, resetState, waitForPrice } from "../helpers/state";

const STREAM = "**/api/stream/prices";

/**
 * Note on technique: `context.setOffline(true)` does not sever an already
 * established SSE connection in Chromium - the socket keeps delivering and the
 * dot stays green. Proven by probe, so these tests break the stream at the
 * route layer instead, which is what EventSource actually reacts to.
 *
 * `route.fulfill()` cannot hold a response open: the body is sent whole and the
 * stream ends. A served tick therefore reads as a dropped connection, and the
 * dot legitimately flickers. Assert on delivered prices, not on a steady green.
 */
test.describe("SSE resilience", () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request);
  });

  test("a dropped stream shows as reconnecting and recovers with no reload", async ({ page }) => {
    let mode: "serve" | "drop" = "serve";
    let attempts = 0;

    await page.route(STREAM, async (route) => {
      attempts += 1;
      if (mode === "drop") {
        await route.abort();
        return;
      }
      // A stream that opens, delivers one tick, then ends - a dropped connection.
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body:
          'retry: 500\n\ndata: {"AAPL":{"ticker":"AAPL","price":1.23,"previous_price":1.22,' +
          '"timestamp":1,"change":0.01,"change_percent":0.8,"direction":"up"}}\n\n',
      });
    });

    await page.goto("/");

    // The injected tick reached the UI, which is the proof the stream opened.
    // The dot is deliberately not asserted here: a fulfilled body ends as soon
    // as its tick is delivered, so the app correctly flickers connected ->
    // reconnecting -> connected on every retry cycle.
    await expect(page.getByTestId("watchlist-price-AAPL")).toHaveText("1.23");

    // Every reconnect attempt now fails, so the dot must never go green again.
    mode = "drop";
    const during = attempts;
    await page.waitForTimeout(2_000);
    expect(attempts, "EventSource should keep retrying on its own").toBeGreaterThan(during);
    await expect(page.getByTestId("connection-status")).not.toHaveAttribute(
      "data-status",
      "connected",
    );
    await expect(page.getByTestId("watchlist-price-AAPL")).toHaveText("1.23");

    // Let the real stream through: recovery happens without a reload.
    await page.unroute(STREAM);
    await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("watchlist-price-AAPL")).not.toHaveText("1.23");
    await waitForPrice(page, "AAPL");
  });

  test("a hard-closed stream shows as disconnected and freezes prices", async ({ page }) => {
    await openTerminal(page);
    const priceCell = page.getByTestId("watchlist-price-AAPL");
    await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");

    // window.stop() aborts the EventSource outright; per spec it is not retried.
    await page.evaluate(() => window.stop());

    await expect(page.getByTestId("connection-status")).toHaveAttribute(
      "data-status",
      "disconnected",
    );
    const frozen = await priceCell.innerText();
    await page.waitForTimeout(2_000);
    expect(await priceCell.innerText(), "prices should stop once the stream is closed").toBe(frozen);

    // A reload re-establishes the stream.
    await page.reload();
    await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "connected");
    await waitForPrice(page, "AAPL");
    await expect(priceCell).not.toHaveText(frozen, { timeout: 30_000 });
  });
});
