#!/usr/bin/env tsx
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";

const OUT_DIR = "/opt/cursor/artifacts";

async function main() {
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("preview-") && f.endsWith(".html"))
    .sort();
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/local/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();
  for (const f of files) {
    const png = `${OUT_DIR}/${f.replace(".html", ".png")}`;
    await page.goto(`file://${OUT_DIR}/${f}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    // Let the Tailwind Play CDN script inject utility classes.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: png, fullPage: true });
    console.log(`wrote ${png}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
