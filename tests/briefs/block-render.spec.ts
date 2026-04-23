// ---------------------------------------------------------------------------
// Playwright spec: /brief/[id] block rendering for owner scope (Phase
// 2a.0, Brief-First Rebuild).
//
// Flow:
//   1. Owner creates a brief via the /briefs new-brief button.
//   2. Three blocks are seeded through POST /api/brief-blocks — one
//      heading, one paragraph, and one block whose type is not in
//      the 2a.0 renderer set (e.g. `bullets`) to verify the silent
//      placeholder.
//   3. The page reloads; the owner sees the heading + paragraph
//      rendered, and the unsupported block row is present in the
//      DOM as an aria-hidden data-block-type placeholder (Spec §4.1).
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

test.describe("Phase 2a.0 brief block rendering — owner", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("owner sees heading + paragraph rendered and a silent placeholder for unsupported types", async ({
    page,
  }) => {
    await page.goto("/briefs");
    await page.getByRole("button", { name: /New brief/i }).click();
    await page.waitForURL(/\/brief\/[0-9a-f-]{36}/);
    const briefId = page.url().match(/\/brief\/([0-9a-f-]{36})/)?.[1];
    expect(briefId).toBeTruthy();

    const uniqueSuffix = Date.now().toString(36);
    const headingText = `Block render test ${uniqueSuffix}`;
    const paragraphText = `Rendered paragraph ${uniqueSuffix} with bold and a link.`;

    // Seed a heading.
    const h = await page.request.post("/api/brief-blocks", {
      data: {
        briefId,
        type: "heading",
        contentJson: { level: 2, text: headingText },
        source: "user",
      },
    });
    expect(h.status()).toBe(200);

    // Seed a paragraph with inline formatting.
    const p = await page.request.post("/api/brief-blocks", {
      data: {
        briefId,
        type: "paragraph",
        contentJson: {
          text: paragraphText,
          inline_formatting: [
            { start: 20, end: 24, type: "bold" },
            {
              start: 33,
              end: 37,
              type: "link",
              url: "https://innovation-atlas.test/",
            },
          ],
        },
        source: "user",
      },
    });
    expect(p.status()).toBe(200);

    // Seed a bullets block to exercise the silent-placeholder path.
    const b = await page.request.post("/api/brief-blocks", {
      data: {
        briefId,
        type: "bullets",
        contentJson: { items: ["one", "two", "three"] },
        source: "agent",
      },
    });
    expect(b.status()).toBe(200);

    await page.reload();

    const blocksSection = page.locator('[data-testid="brief-blocks-section"]');
    await expect(blocksSection).toBeVisible();

    // Heading should render as an <h2> with the seeded text.
    await expect(
      blocksSection.locator('h2[data-block-type="heading"]'),
    ).toContainText(headingText);

    // Paragraph renders as <p>, contains the text, and has the
    // inline-formatted tags inside.
    const paragraphEl = blocksSection.locator('p[data-block-type="paragraph"]');
    await expect(paragraphEl).toContainText(paragraphText);
    await expect(paragraphEl.locator("strong")).toBeVisible();
    await expect(paragraphEl.locator("a")).toHaveAttribute(
      "target",
      "_blank",
    );
    await expect(paragraphEl.locator("a")).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );

    // Bullets renders as a silent placeholder div: aria-hidden, empty,
    // with data-block-type="bullets".
    const placeholder = blocksSection.locator(
      'div[data-block-type="bullets"]',
    );
    await expect(placeholder).toHaveCount(1);
    await expect(placeholder).toHaveAttribute("aria-hidden", "true");
    await expect(placeholder).toHaveText("");
  });
});
