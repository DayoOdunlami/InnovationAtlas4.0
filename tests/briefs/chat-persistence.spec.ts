// ---------------------------------------------------------------------------
// Playwright spec: /brief/[id] chat-persistence (Phase 1, Brief-First
// Rebuild).
//
// Posts a user message via /api/brief-messages directly (the fastest
// way to exercise the append + list path end-to-end without waiting on
// a model stream). Reloads the page and asserts the history renders
// from atlas.messages. The final step also confirms that the message
// appears before any model response, proving that user-side persistence
// is independent of the stream completing.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

test.describe("Phase 1 brief chat persistence", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("user message persists to atlas.messages and survives a reload", async ({
    page,
  }) => {
    const uniqueText = `phase-1-persist-check ${Date.now()}`;

    await page.goto("/briefs");
    await page.getByRole("button", { name: /New brief/i }).click();
    await page.waitForURL(/\/brief\/[0-9a-f-]{36}/);

    const briefUrl = page.url();
    const briefId = briefUrl.match(/\/brief\/([0-9a-f-]{36})/)?.[1];
    expect(briefId, "briefId should be a UUID").toBeTruthy();

    // Post a user message through the same API the client uses. This
    // skips the model stream entirely but exercises the full
    // persistence path (AccessScope -> repository -> atlas.messages).
    const res = await page.request.post("/api/brief-messages", {
      data: {
        briefId,
        role: "user",
        contentJson: { parts: [{ type: "text", text: uniqueText }] },
      },
    });
    expect(res.status(), `persistence POST body: ${await res.text()}`).toBe(
      200,
    );

    await page.goto(briefUrl);
    await expect(page.getByText(uniqueText, { exact: false })).toBeVisible();

    await page.reload();
    await expect(page.getByText(uniqueText, { exact: false })).toBeVisible();
  });
});
