import { expect, test, type Page } from "@playwright/test";
import { openTerminal, resetState, waitForPrice } from "../helpers/state";

/**
 * Chat runs against LLM_MOCK=true. Every prompt below is taken from the mock
 * trigger table in planning/CONTRACTS.md - the ticker is the only capitalised
 * token, because the mock takes the first uppercase 1-5 letter run.
 */

const messages = (page: Page) => page.getByTestId(/^chat-message-\d+$/);

/** Send a prompt and return the index of the assistant reply it produced. */
async function ask(page: Page, prompt: string): Promise<number> {
  const before = await messages(page).count();
  await page.getByTestId("chat-input").fill(prompt);
  await page.getByTestId("chat-send").click();

  // One user bubble plus one assistant bubble.
  await expect(messages(page)).toHaveCount(before + 2, { timeout: 45_000 });
  await expect(page.getByTestId("chat-loading")).toHaveCount(0);

  const last = messages(page).last();
  await expect(last).toHaveAttribute("data-role", "assistant");
  const testId = await last.getAttribute("data-testid");
  return Number(testId!.replace("chat-message-", ""));
}

test.describe("assistant chat (mocked)", () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request);
  });

  test("plain reply carries no actions", async ({ page }) => {
    await openTerminal(page);
    await expect(page.getByTestId("chat-panel")).toHaveAttribute("data-open", "true");

    const index = await ask(page, "What is my portfolio worth?");

    await expect(page.getByTestId(`chat-message-${index}`)).not.toBeEmpty();
    await expect(page.getByTestId(`chat-actions-${index}`)).toHaveCount(0);
    await expect(page.getByTestId("chat-error")).toHaveCount(0);
  });

  test("a trade executes and appears inline", async ({ page }) => {
    await openTerminal(page);
    await waitForPrice(page, "AAPL");

    const index = await ask(page, "buy 5 AAPL");

    const actions = page.getByTestId(`chat-actions-${index}`);
    await expect(actions).toBeVisible();
    const action = actions.getByTestId("chat-action").first();
    await expect(action).toContainText("BUY 5 AAPL");
    await expect(action).toHaveAttribute("data-rejected", "false");

    await expect(page.getByTestId("position-row-AAPL")).toBeVisible();
    await expect(page.getByTestId("position-qty-AAPL")).toHaveText("5");
  });

  test("a rejected trade is a 200 with the reason inline", async ({ page }) => {
    await openTerminal(page);
    await waitForPrice(page, "AAPL");

    const index = await ask(page, "buy 100000 AAPL");

    const action = page.getByTestId(`chat-actions-${index}`).getByTestId("chat-action").first();
    await expect(action).toHaveAttribute("data-rejected", "true");
    await expect(action).toContainText("Insufficient cash");

    await expect(page.getByTestId("chat-error")).toHaveCount(0);
    await expect(page.getByTestId("position-row-AAPL")).toHaveCount(0);
  });

  test("a watchlist change from chat lands on the watchlist", async ({ page }) => {
    await openTerminal(page);
    await expect(page.getByTestId("watchlist-row-PYPL")).toHaveCount(0);

    const added = await ask(page, "add PYPL to my watchlist");
    await expect(
      page.getByTestId(`chat-actions-${added}`).getByTestId("chat-action").first(),
    ).toContainText("Added PYPL to watchlist");
    await expect(page.getByTestId("watchlist-row-PYPL")).toBeVisible();

    const removed = await ask(page, "remove PYPL from the watchlist");
    await expect(
      page.getByTestId(`chat-actions-${removed}`).getByTestId("chat-action").first(),
    ).toContainText("Removed PYPL from watchlist");
    await expect(page.getByTestId("watchlist-row-PYPL")).toHaveCount(0);
  });
});
