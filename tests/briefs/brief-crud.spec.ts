// ---------------------------------------------------------------------------
// Playwright spec: /briefs list CRUD (Phase 1, Brief-First Rebuild).
//
// Uses the editor user's saved auth state from auth-states.setup.ts.
// Covers the three Phase 1 server actions end-to-end through the UI:
//
//   createBriefAction → list shows the new brief and redirects to /brief/[id]
//   renameBriefAction → inline edit updates the row title
//   deleteBriefAction → row disappears from the list
//
// Telemetry side-effects land in atlas.telemetry_events (dev APP_ENV
// routes to stdout; preview/prod routes to the table). No assertion on
// those here — they're covered in the vitest emitter suite.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

test.describe("Phase 1 briefs CRUD", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("create a brief -> redirects to /brief/[id] with the default title", async ({
    page,
  }) => {
    await page.goto("/briefs");
    await expect(
      page.getByRole("heading", { name: "Briefs", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: /New brief/i }).click();

    await page.waitForURL(/\/brief\/[0-9a-f-]{36}/, { timeout: 10_000 });

    const heading = page.getByRole("heading", { name: "Untitled brief" });
    await expect(heading).toBeVisible();
  });

  test("rename a brief -> new title shows in the list", async ({ page }) => {
    const uniqueTitle = `Phase 1 renamed ${Date.now()}`;

    await page.goto("/briefs");
    await page.getByRole("button", { name: /New brief/i }).click();
    await page.waitForURL(/\/brief\/[0-9a-f-]{36}/);

    await page.goto("/briefs");
    await expect(
      page.getByRole("link", { name: "Untitled brief" }).first(),
    ).toBeVisible();

    const firstRow = page.locator("ul > li").first();
    await firstRow.getByRole("button", { name: /Rename/ }).click();
    await firstRow.locator("input[name=title]").fill(uniqueTitle);
    await firstRow.getByRole("button", { name: /Save/ }).click();

    await expect(
      page.getByRole("link", { name: uniqueTitle }).first(),
    ).toBeVisible();
  });

  test("delete a brief -> row disappears", async ({ page }) => {
    const uniqueTitle = `Phase 1 to-delete ${Date.now()}`;

    await page.goto("/briefs");
    await page.getByRole("button", { name: /New brief/i }).click();
    await page.waitForURL(/\/brief\/[0-9a-f-]{36}/);

    await page.goto("/briefs");
    const firstRow = page.locator("ul > li").first();
    await firstRow.getByRole("button", { name: /Rename/ }).click();
    await firstRow.locator("input[name=title]").fill(uniqueTitle);
    await firstRow.getByRole("button", { name: /Save/ }).click();
    await expect(
      page.getByRole("link", { name: uniqueTitle }).first(),
    ).toBeVisible();

    // Auto-accept the window.confirm dialog the delete button triggers.
    page.on("dialog", (dialog) => dialog.accept());

    const row = page.getByRole("link", { name: uniqueTitle }).first();
    const rowItem = row.locator("xpath=ancestor::li[1]");
    await rowItem.getByRole("button", { name: /Delete/ }).click();

    await expect(page.getByRole("link", { name: uniqueTitle })).toHaveCount(0);
  });
});
