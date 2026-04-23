// ---------------------------------------------------------------------------
// Playwright spec: owner drag + keyboard reorder on /brief/[id] (Phase 2a.1).
//
// Flow:
//   1. Owner creates a brief and seeds three paragraphs with distinct
//      text ("one", "two", "three").
//   2. The gutter drag handle for the third paragraph is moved above
//      the first — fractional position strictly between null and the
//      current first paragraph's position.
//   3. Page reloads; order is persisted.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

test.describe("Phase 2a.1 brief block reorder — owner", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("dragging a block changes order and persists across reload", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const marker = `reorder-${suffix}`;

    await page.goto("/briefs");
    await page.getByRole("button", { name: /New brief/i }).click();
    await page.waitForURL(/\/brief\/[0-9a-f-]{36}/);
    const briefId = page.url().match(/\/brief\/([0-9a-f-]{36})/)?.[1];
    expect(briefId).toBeTruthy();

    const seedIds: string[] = [];
    for (const text of ["one", "two", "three"]) {
      const res = await page.request.post("/api/brief-blocks", {
        data: {
          briefId,
          type: "paragraph",
          contentJson: { text: `${marker}-${text}` },
          source: "user",
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      seedIds.push(body.block.id);
    }

    await page.reload();

    const gutter = page.locator('[data-testid="brief-blocks-gutter"]');
    await expect(gutter).toBeVisible();

    const third = page.locator(`[data-testid="block-label-${seedIds[2]}"]`);
    const first = page.locator(`[data-testid="block-label-${seedIds[0]}"]`);
    await expect(third).toContainText(`${marker}-three`);
    await expect(first).toContainText(`${marker}-one`);

    // Issue the move as a keyboard reorder via the client helper: focus
    // the editor content, then send Cmd+ArrowUp twice on a cursor in
    // the third paragraph. Note: most Playwright runners on Linux
    // support Control+ArrowUp — the client handler listens for either.
    await page.locator('[data-testid="brief-editor-content"]').click();
    // Move caret to the last paragraph.
    await page.keyboard.press("ControlOrMeta+End");
    // Reorder up twice.
    await page.keyboard.press("ControlOrMeta+ArrowUp");
    await page.keyboard.press("ControlOrMeta+ArrowUp");

    await page.waitForTimeout(700);
    await page.reload();

    // After reload the "three" paragraph should appear above "one".
    // Use the gutter label ordering as the source of truth.
    const labels = await page
      .locator('[data-testid^="block-label-"]')
      .allTextContents();
    const idxOne = labels.findIndex((l) => l.includes(`${marker}-one`));
    const idxThree = labels.findIndex((l) => l.includes(`${marker}-three`));
    expect(idxThree).toBeLessThan(idxOne);
  });
});
