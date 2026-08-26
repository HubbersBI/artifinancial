import { expect, test, type Page, type Route } from "@playwright/test";
import { getJson, openTerminal, resetState } from "../helpers/state";

/**
 * The provider-failure path (PLAN section 9): when the LLM call fails the
 * backend answers 502 with a `detail` string, and the panel must show it.
 *
 * The failure is forced at the route layer rather than with a bad key, so the
 * suite stays on LLM_MOCK=true and never spends real Groq quota. The glob ends
 * at `/api/chat`, so `/api/chat/history` is untouched; the method guard is
 * belt-and-braces for that.
 */
const CHAT = "**/api/chat";

const messages = (page: Page) => page.getByTestId(/^chat-message-\d+$/);

/** Fail every chat turn with the given status and body. */
async function failChatWith(page: Page, status: number, body: string, contentType: string) {
  await page.route(CHAT, async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({ status, contentType, body });
  });
}

test.describe("chat provider failure", () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request);
  });

  test("a 502 renders inline and the user's message survives", async ({ page, request }) => {
    await openTerminal(page);
    await expect(page.getByTestId("chat-panel")).toHaveAttribute("data-open", "true");

    const detail = "The assistant is unavailable: Invalid API Key";
    await failChatWith(page, 502, JSON.stringify({ detail }), "application/json");

    const before = await messages(page).count();
    const marker = `provider failure check ${Date.now()}`;
    await page.getByTestId("chat-input").fill(marker);
    await page.getByTestId("chat-send").click();

    await expect(page.getByTestId("chat-error")).toHaveText(detail);
    await expect(page.getByTestId("chat-loading")).toHaveCount(0);

    // The turn produced the user's bubble and nothing else - no phantom reply.
    await expect(messages(page)).toHaveCount(before + 1);
    const last = messages(page).last();
    await expect(last).toHaveAttribute("data-role", "user");
    await expect(last).toContainText(marker);

    // A failed turn is never persisted, so it is gone after a reload.
    const history = await getJson(request, "/api/chat/history");
    const contents = history.messages.map((m: { content: string }) => m.content);
    expect(contents).not.toContain(marker);

    await page.unroute(CHAT);
    await page.reload();
    await expect(page.getByTestId("chat-panel")).toBeVisible();
    await expect(page.getByTestId("chat-messages")).not.toContainText(marker);
  });

  test("an error body with no detail field still reads as a message", async ({ page }) => {
    await openTerminal(page);
    await failChatWith(page, 502, "Bad Gateway", "text/plain");

    await page.getByTestId("chat-input").fill("plain text failure");
    await page.getByTestId("chat-send").click();

    await expect(page.getByTestId("chat-error")).toHaveText("Bad Gateway");
    await expect(page.getByTestId("chat-loading")).toHaveCount(0);
    await expect(messages(page).last()).toHaveAttribute("data-role", "user");
  });

  test("the error clears once the assistant answers again", async ({ page }) => {
    await openTerminal(page);
    await failChatWith(page, 502, JSON.stringify({ detail: "The assistant is unavailable" }), "application/json");

    await page.getByTestId("chat-input").fill("first attempt");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-error")).toBeVisible();

    // Back to the real mocked backend: the next turn must recover on its own.
    await page.unroute(CHAT);
    const before = await messages(page).count();
    await page.getByTestId("chat-input").fill("second attempt");
    await page.getByTestId("chat-send").click();

    await expect(messages(page)).toHaveCount(before + 2, { timeout: 45_000 });
    await expect(messages(page).last()).toHaveAttribute("data-role", "assistant");
    await expect(page.getByTestId("chat-error")).toHaveCount(0);
  });
});
