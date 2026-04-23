#!/usr/bin/env tsx
/* eslint-disable no-console */
// Capture /landscape-3d?lens=v2 (new shared lens) vs default legacy page.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE_URL = process.env.ATLAS_BASE_URL ?? "http://localhost:4000";
const ARTIFACTS = "/opt/cursor/artifacts";
mkdirSync(ARTIFACTS, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 960 },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/sign-in`);
  await page.waitForLoadState("networkidle");
  await page
    .locator('input[type="email"], input[name="email"]')
    .first()
    .fill("demo-admin@innovation-atlas.local");
  await page
    .locator('input[type="password"], input[name="password"]')
    .first()
    .fill("DemoAtlasAdmin!2026");
  await page
    .getByRole("button", { name: /sign in|log in/i })
    .first()
    .click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 15_000,
  });

  console.log("→ /landscape-3d?lens=v2");
  await page.goto(`${BASE_URL}/landscape-3d?lens=v2`);
  await page.waitForSelector(
    '[data-testid="force-graph-lens"][data-variant="detail"]',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(5500);
  await page.screenshot({ path: `${ARTIFACTS}/landscape3d_lens_v2.png` });
  console.log("✓ landscape3d_lens_v2.png");

  await browser.close();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
