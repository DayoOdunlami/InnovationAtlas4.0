import { test, expect, type ConsoleMessage } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const PAGE_PATH = "/spike/block-editor";

test.describe("Plate spike block editor", () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });
  });

  test("renders six blocks, supports node click, passport cycling, and re-add cycle", async ({
    page,
  }) => {
    await page.goto(PAGE_PATH);

    const editor = page.getByTestId("spike-editor-content");
    await expect(editor).toBeVisible();

    // Wait for landscape to finish its 600ms loading phase.
    await expect(page.getByTestId("landscape-embed")).toBeVisible({
      timeout: 5000,
    });

    // (b) six blocks visible in the editor.
    const topLevelBlocks = editor.locator(":scope > *");
    await expect(topLevelBlocks).toHaveCount(6);

    // (c) click a node on the landscape canvas via its test hook.
    const node3 = page.getByTestId("landscape-node-3");
    await expect(node3).toBeVisible();
    await node3.click();

    // (d) new paragraph appears directly after landscape-embed.
    await expect(
      page.getByText(/Selected node: 3/).first(),
    ).toBeVisible({ timeout: 4000 });
    await expect(editor.locator(":scope > *")).toHaveCount(7);

    // (e) passport cycling transitions to Connecting… then Connected. Tick #
    const status = page.getByTestId("live-passport-status");
    await expect(status).toContainText(/Connecting…|Connected\. Tick #/);
    await page.getByTestId("btn-cycle-passport").click();
    await expect(status).toHaveText(/Connecting…/, { timeout: 2000 });
    await expect(status).toHaveText(/Connected\. Tick #\d+/, {
      timeout: 5000,
    });

    // (f) remove/re-add cycle remounts cleanly.
    await page.getByTestId("btn-remove-landscape").click();
    await expect(page.getByTestId("landscape-embed")).toHaveCount(0);
    await page.getByTestId("btn-readd-both").click();
    await expect(page.getByTestId("landscape-embed")).toBeVisible({
      timeout: 5000,
    });

    // Ensure zero console errors across the whole run.
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
