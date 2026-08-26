import { expect, test } from "@playwright/test";
import { getJson, openTerminal, resetState, tradeViaBar, waitForPrice } from "../helpers/state";

test.describe("chat persistence", () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request);
  });

  test("the conversation reappears after a reload", async ({ page, request }) => {
    await openTerminal(page);

    // Lowercase and trigger-free, so the mock returns a plain reply.
    const marker = `ping check ${Date.now()}`;
    await page.getByTestId("chat-input").fill(marker);
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-messages")).toContainText(marker, { timeout: 45_000 });
    await expect(page.getByTestId("chat-loading")).toHaveCount(0);

    const history = await getJson(request, "/api/chat/history");
    const roles = history.messages.slice(-2).map((m: { role: string }) => m.role);
    expect(roles).toEqual(["user", "assistant"]);

    await page.reload();
    await expect(page.getByTestId("chat-panel")).toBeVisible();
    await expect(page.getByTestId("chat-empty")).toHaveCount(0);
    await expect(page.getByTestId("chat-messages")).toContainText(marker);
  });

  test("executed actions are restored inline on reload", async ({ page }) => {
    await openTerminal(page);
    await waitForPrice(page, "AAPL");
    await tradeViaBar(page, "AAPL", 2, "buy");

    const before = await page.getByTestId(/^chat-message-\d+$/).count();
    await page.getByTestId("chat-input").fill("sell 1 AAPL");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId(/^chat-message-\d+$/)).toHaveCount(before + 2, {
      timeout: 45_000,
    });

    await page.reload();
    await expect(page.getByTestId("chat-panel")).toBeVisible();

    const restored = page.getByTestId(/^chat-message-\d+$/).last();
    await expect(restored).toHaveAttribute("data-role", "assistant");
    const index = Number((await restored.getAttribute("data-testid"))!.replace("chat-message-", ""));

    const action = page.getByTestId(`chat-actions-${index}`).getByTestId("chat-action").first();
    await expect(action).toBeVisible();
    await expect(action).toContainText("SELL 1 AAPL");
    await expect(action).toHaveAttribute("data-rejected", "false");
  });
});
