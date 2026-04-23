// ---------------------------------------------------------------------------
// Playwright spec: /brief/[id]?share=<token> block rendering (Phase
// 2a.0 — share-scope read path).
//
// Flow:
//   1. Owner creates a brief, seeds one heading + one paragraph.
//   2. Owner mints a share token from the UI.
//   3. Signed-out visitor opens the share URL and sees the block
//      list; asserts on the same data-* attributes.
//   4. Bundle-leak assertion: the server-rendered HTML on the
//      share route must NOT contain `@udecode/plate`, `platejs`, or
//      `slate-react`. Paired with `scripts/check-share-bundle.ts`
//      which walks the .next build output for belt-and-braces
//      coverage.
// ---------------------------------------------------------------------------

import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

// Phase 2a.1 extends the leak guard to @dnd-kit: the drag-reorder
// surface only exists in the owner route, and its package strings
// would be an unambiguous signal of a bundle leak into the share
// route if they ever appeared in the rendered HTML.
const FORBIDDEN_PACKAGE_NAMES = [
  "@udecode/plate",
  "platejs",
  "slate-react",
  "@dnd-kit",
] as const;

test.describe("Phase 2a.0 brief block rendering — share scope", () => {
  test("signed-out visitor sees rendered blocks via ?share=<token>, no editor bundle leaks", async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext({
      storageState: TEST_USERS.editor.authFile,
    });
    const ownerPage = await ownerContext.newPage();

    const suffix = Date.now().toString(36);
    const headingText = `Share block heading ${suffix}`;
    const paragraphText = `Share block paragraph ${suffix} body.`;

    // Owner creates a brief + seeds blocks.
    await ownerPage.goto("/briefs");
    await ownerPage.getByRole("button", { name: /New brief/i }).click();
    await ownerPage.waitForURL(/\/brief\/[0-9a-f-]{36}/);
    const briefId = ownerPage.url().match(/\/brief\/([0-9a-f-]{36})/)?.[1];
    expect(briefId).toBeTruthy();

    const h = await ownerPage.request.post("/api/brief-blocks", {
      data: {
        briefId,
        type: "heading",
        contentJson: { level: 1, text: headingText },
        source: "user",
      },
    });
    expect(h.status()).toBe(200);

    const p = await ownerPage.request.post("/api/brief-blocks", {
      data: {
        briefId,
        type: "paragraph",
        contentJson: { text: paragraphText },
        source: "user",
      },
    });
    expect(p.status()).toBe(200);

    // Owner mints a share token via the Share bar and copies the URL.
    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: /^Share$/ }).click();
    await expect(
      ownerPage.getByRole("button", { name: /Copy link|Revoke/ }).first(),
    ).toBeVisible();
    await ownerContext.grantPermissions(["clipboard-read", "clipboard-write"]);
    await ownerPage.getByRole("button", { name: /Copy link/ }).click();
    const clipText: string = await ownerPage.evaluate(async () =>
      navigator.clipboard.readText(),
    );
    expect(clipText).toContain(`/brief/${briefId}?share=`);
    const shareUrlRelative = clipText.replace(/^.*\/\/[^/]+/, "");

    // Signed-out visitor opens the share URL in a fresh context.
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    const response = await visitorPage.goto(shareUrlRelative);
    expect(response?.status()).toBe(200);

    const blocksSection = visitorPage.locator(
      '[data-testid="brief-blocks-section"]',
    );
    await expect(blocksSection).toBeVisible();
    await expect(
      blocksSection.locator('h1[data-block-type="heading"]'),
    ).toContainText(headingText);
    await expect(
      blocksSection.locator('p[data-block-type="paragraph"]'),
    ).toContainText(paragraphText);

    // Share-scope visitors have no write UI.
    await expect(visitorPage.getByPlaceholder(/Message the agent/)).toHaveCount(
      0,
    );
    await expect(
      visitorPage.getByRole("button", { name: /^Share$/ }),
    ).toHaveCount(0);

    // Bundle-leak assertion on the server-rendered HTML. Pairs with
    // scripts/check-share-bundle.ts which walks the .next build
    // output. Two checks, because HTML-string scanning alone is
    // unreliable (chunks are hash-named) and build-output scanning
    // misses SSR-rendered DOM strings.
    const html = (await response?.text()) ?? "";
    for (const pkg of FORBIDDEN_PACKAGE_NAMES) {
      expect(
        html.includes(pkg),
        `share-route HTML must not contain "${pkg}"`,
      ).toBe(false);
    }

    await visitorContext.close();
    await ownerContext.close();
  });
});
