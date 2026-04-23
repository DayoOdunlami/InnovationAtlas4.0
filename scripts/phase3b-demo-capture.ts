#!/usr/bin/env tsx
/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// Phase 3b walkthrough capture script.
//
// Logs in as the demo-admin account, opens /canvas, exercises the
// force-graph lens through its three layouts + share + JARVIS buttons,
// and saves screenshots to /opt/cursor/artifacts/ so the PR can
// reference them.
//
// Run with: tsx scripts/phase3b-demo-capture.ts
// Requires: dev server running at http://localhost:4000 and
// demo-admin@innovation-atlas.local / DemoAtlasAdmin!2026 seeded.
// ---------------------------------------------------------------------------

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.ATLAS_BASE_URL ?? "http://localhost:4000";
const ARTIFACTS = "/opt/cursor/artifacts";
mkdirSync(ARTIFACTS, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 960 },
  });
  const page = await context.newPage();

  console.log("→ signing in");
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

  console.log("→ loading /canvas");
  await page.goto(`${BASE_URL}/canvas`);
  // Wait for lens header + any dot to render via the 2D canvas.
  await page.waitForSelector('[data-testid="force-graph-lens"]', {
    timeout: 20_000,
  });
  await page.waitForTimeout(4500);

  await page.screenshot({
    path: `${ARTIFACTS}/canvas_lens_umap.png`,
    fullPage: false,
  });
  console.log("✓ canvas_lens_umap.png");

  console.log("→ setting query A");
  const input = page.locator('input[aria-label="Gravity query A"]');
  await input.fill("rail hydrogen decarbonisation");
  await input.press("Enter");
  await page.waitForTimeout(5000);

  await page.screenshot({
    path: `${ARTIFACTS}/canvas_lens_web_gravity.png`,
  });
  console.log("✓ canvas_lens_web_gravity.png");

  console.log("→ switch to RINGS layout");
  await page
    .getByRole("button", { name: /^RINGS$/i })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${ARTIFACTS}/canvas_lens_rings.png` });
  console.log("✓ canvas_lens_rings.png");

  console.log("→ back to UMAP");
  await page
    .getByRole("button", { name: /^UMAP$/i })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${ARTIFACTS}/canvas_lens_umap_anchored.png` });
  console.log("✓ canvas_lens_umap_anchored.png");

  console.log("→ click Share");
  await page
    .getByRole("button", { name: /^Share$/i })
    .first()
    .click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${ARTIFACTS}/canvas_lens_share_copied.png` });
  console.log("✓ canvas_lens_share_copied.png");

  console.log("→ open JARVIS modal");
  await page
    .getByRole("button", { name: /Ask JARVIS/i })
    .first()
    .click();
  await page.waitForSelector('[role="dialog"][aria-label="JARVIS viewport"]', {
    timeout: 10_000,
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${ARTIFACTS}/canvas_lens_jarvis.png` });
  console.log("✓ canvas_lens_jarvis.png");

  await browser.close();
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
