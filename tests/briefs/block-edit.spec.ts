// ---------------------------------------------------------------------------
// Playwright spec: owner inline editing on /brief/[id] (Phase 2a.1).
//
// Flow:
//   1. Owner creates a brief via /briefs.
//   2. A heading + paragraph are seeded through POST /api/brief-blocks
//      so the editor mounts with known content.
//   3. Owner clicks into the paragraph, appends text, and blurs — the
//      edit persists. Reloading the page shows the new text.
//   4. The "edited" status line flips from "Click any block to start
//      editing." to "Edited by you", and `data-is-edited="true"`.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

test.describe("Phase 2a.1 brief inline editing — owner", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("owner edits a paragraph inline, reload persists, is_edited flips", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const baseParagraph = `Inline edit target ${suffix}.`;
    const appendedText = ` Appended ${suffix}.`;

    await page.goto("/briefs");
    await page.getByRole("button", { name: /New brief/i }).click();
    await page.waitForURL(/\/brief\/[0-9a-f-]{36}/);
    const briefId = page.url().match(/\/brief\/([0-9a-f-]{36})/)?.[1];
    expect(briefId).toBeTruthy();

    // Seed a heading + paragraph.
    await page.request.post("/api/brief-blocks", {
      data: {
        briefId,
        type: "heading",
        contentJson: { level: 2, text: `Edit-me ${suffix}` },
        source: "user",
      },
    });
    await page.request.post("/api/brief-blocks", {
      data: {
        briefId,
        type: "paragraph",
        contentJson: { text: baseParagraph },
        source: "user",
      },
    });

    await page.reload();

    // Status line starts un-edited.
    const statusLine = page.locator('[data-testid="brief-status-line"]');
    await expect(statusLine).toHaveAttribute("data-is-edited", "false");

    // Click into the editable surface and type at the end of the
    // paragraph. Playwright types into the focused contentEditable.
    const editor = page.locator('[data-testid="brief-editor-content"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Move caret to the end and append text.
    await page.keyboard.press("End");
    await page.keyboard.type(appendedText);

    // Blur commits the edit.
    await editor.blur();

    // Wait briefly for the debounce (150ms) + server round-trip.
    await page.waitForTimeout(600);

    // Reload — edit should be persisted.
    await page.reload();
    const paragraph = page.locator('[data-testid="brief-editor-content"] p');
    await expect(paragraph).toContainText(appendedText);

    // Status line now reflects is_edited === true.
    await expect(
      page.locator('[data-testid="brief-status-line"]'),
    ).toHaveAttribute("data-is-edited", "true");
  });
});
