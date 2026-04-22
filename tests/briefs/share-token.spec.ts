// ---------------------------------------------------------------------------
// Playwright spec: /brief/[id] share-token flow (Phase 1, Brief-First
// Rebuild).
//
// Owner view:
//   1. Create a brief + drop a user message via /api/brief-messages.
//   2. Click "Share" to mint a token (fires action.brief_share_token_minted).
//   3. Click "Copy link" — the rendered text "Copy link" confirms the
//      token is active.
//
// Share-reader view (fresh, signed-out browser context):
//   4. Extract the ?share= token from the DOM.
//   5. Open /brief/[id]?share=<token> without credentials.
//   6. Assert the chat history is visible (DEFAULT #13 — share readers
//      see chat) and no input / share / rename / delete controls
//      render.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

test.describe("Phase 1 brief share tokens", () => {
  test("owner mints a share token; signed-out visitor gets read-only view", async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const ownerPage = await ownerContext.newPage();

    const uniqueText = `phase-1-share-history ${Date.now()}`;

    // 1. Owner creates a brief.
    await ownerPage.goto("/briefs");
    await ownerPage.getByRole("button", { name: /New brief/i }).click();
    await ownerPage.waitForURL(/\/brief\/[0-9a-f-]{36}/);
    const briefUrl = ownerPage.url();
    const briefId = briefUrl.match(/\/brief\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(briefId).toMatch(/^[0-9a-f-]{36}$/);

    // 2. Owner drops a message via the persistence API (no model needed).
    const persistRes = await ownerPage.request.post("/api/brief-messages", {
      data: {
        briefId,
        role: "user",
        contentJson: { parts: [{ type: "text", text: uniqueText }] },
      },
    });
    expect(persistRes.status()).toBe(200);

    // 3. Owner mints a share token.
    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: /^Share$/ }).click();
    await expect(
      ownerPage.getByRole("button", { name: /Copy link|Revoke/ }).first(),
    ).toBeVisible();

    // 4. Pull the share token out of the DOM by clicking "Copy link".
    //    Playwright grants clipboard permission implicitly on chromium
    //    in this setup; fall back to reading window.location after
    //    navigating to share URL.
    await ownerContext.grantPermissions(["clipboard-read", "clipboard-write"]);
    await ownerPage.getByRole("button", { name: /Copy link/ }).click();
    const clipText: string = await ownerPage.evaluate(async () =>
      navigator.clipboard.readText(),
    );
    expect(clipText).toContain(`/brief/${briefId}?share=`);
    const shareUrlRelative = clipText.replace(/^.*\/\/[^/]+/, "");

    // 5. Signed-out visitor opens the share URL in a fresh context.
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto(shareUrlRelative);

    // 6. History visible, no write controls.
    await expect(visitorPage.getByText(uniqueText)).toBeVisible();
    await expect(
      visitorPage.getByPlaceholder(/Message the agent/),
    ).toHaveCount(0);
    await expect(
      visitorPage.getByRole("button", { name: /^Share$/ }),
    ).toHaveCount(0);
    await expect(
      visitorPage.getByRole("button", { name: /Rename/ }),
    ).toHaveCount(0);
    await expect(
      visitorPage.getByRole("button", { name: /Delete/ }),
    ).toHaveCount(0);

    await visitorContext.close();
    await ownerContext.close();
  });
});
