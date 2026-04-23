#!/usr/bin/env tsx
/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// Capture the landscape-embed block rendered in a brief, both in the
// owner view (live force-graph lens) and the share view (static SVG
// snapshot). Used for the Phase 3b PR walkthrough.
// ---------------------------------------------------------------------------

import { config } from "dotenv";
config();

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { monotonicFactory } from "ulid";
import { Pool } from "pg";

const BASE_URL = process.env.ATLAS_BASE_URL ?? "http://localhost:4000";
const ARTIFACTS = "/opt/cursor/artifacts";
mkdirSync(ARTIFACTS, { recursive: true });

const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("POSTGRES_URL missing");
  process.exit(1);
}
const pool = new Pool({
  connectionString: rawUrl.replace(/[?&]sslmode=[^&]*/g, ""),
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const nextUlid = monotonicFactory();

async function main() {
  // Fetch demo-admin id
  const { rows: users } = await pool.query<{ id: string }>(
    `SELECT id FROM public."user" WHERE email = $1`,
    ["demo-admin@innovation-atlas.local"],
  );
  if (users.length === 0) {
    console.error("demo-admin not found");
    process.exit(1);
  }
  const ownerId = users[0].id;
  console.log("owner:", ownerId);

  // Create a brief
  const briefId =
    "a0000000-b3b3-4b3b-b3b3-" +
    Math.random().toString(16).slice(2, 14).padEnd(12, "0");
  await pool.query(
    `INSERT INTO atlas.briefs (id, owner_id, title, is_edited)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (id) DO NOTHING`,
    [briefId, ownerId, "Phase 3b landscape-embed demo"],
  );

  // Three blocks: heading, landscape-embed (umap+query), landscape-embed (rings+query)
  const headingId = nextUlid();
  const embed1Id = nextUlid();
  const embed2Id = nextUlid();
  await pool.query(
    `INSERT INTO atlas.blocks (id, brief_id, type, position, content_json, source)
     VALUES
       ($1, $2, 'heading', 'a0', $3::jsonb, 'user'),
       ($4, $2, 'landscape-embed', 'a1', $5::jsonb, 'agent'),
       ($6, $2, 'landscape-embed', 'a2', $7::jsonb, 'agent')
     ON CONFLICT (id) DO NOTHING`,
    [
      headingId,
      briefId,
      JSON.stringify({ level: 1, text: "Rail hydrogen · landscape view" }),
      embed1Id,
      JSON.stringify({
        layout: "web",
        query: "rail hydrogen decarbonisation",
        schema_version: 1,
      }),
      embed2Id,
      JSON.stringify({
        layout: "rings",
        query: "autonomous vehicles and connected mobility",
        schema_version: 1,
      }),
    ],
  );
  console.log("brief:", briefId);

  // Issue a share token
  void ownerId;
  const { rows: tokens } = await pool.query<{ token: string }>(
    `INSERT INTO atlas.brief_share_tokens (brief_id, token)
     VALUES ($1, substring(md5(random()::text) from 1 for 16))
     RETURNING token`,
    [briefId],
  );
  const shareToken = tokens[0].token;
  console.log("share token:", shareToken);

  const browser = await chromium.launch({ headless: true });
  const ownerCtx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
  });
  const ownerPage = await ownerCtx.newPage();
  await ownerPage.goto(`${BASE_URL}/sign-in`);
  await ownerPage.waitForLoadState("networkidle");
  await ownerPage
    .locator('input[type="email"], input[name="email"]')
    .first()
    .fill("demo-admin@innovation-atlas.local");
  await ownerPage
    .locator('input[type="password"], input[name="password"]')
    .first()
    .fill("DemoAtlasAdmin!2026");
  await ownerPage
    .getByRole("button", { name: /sign in|log in/i })
    .first()
    .click();
  await ownerPage.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 15_000,
  });
  await ownerPage.goto(`${BASE_URL}/brief/${briefId}`);
  await ownerPage.waitForSelector('[data-testid="brief-owner-surface"]', {
    timeout: 20_000,
  });
  await ownerPage.waitForTimeout(8000);
  await ownerPage.screenshot({
    path: `${ARTIFACTS}/brief_owner_landscape_embed.png`,
    fullPage: true,
  });
  console.log("✓ brief_owner_landscape_embed.png");

  const shareCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const sharePage = await shareCtx.newPage();
  await sharePage.goto(
    `${BASE_URL}/brief/${briefId}?share=${encodeURIComponent(shareToken)}`,
  );
  await sharePage.waitForSelector('[data-block-type="landscape-embed"]', {
    timeout: 15_000,
  });
  await sharePage.waitForTimeout(1200);
  await sharePage.screenshot({
    path: `${ARTIFACTS}/brief_share_landscape_embed.png`,
    fullPage: true,
  });
  console.log("✓ brief_share_landscape_embed.png");

  await browser.close();
  await pool.end();
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
