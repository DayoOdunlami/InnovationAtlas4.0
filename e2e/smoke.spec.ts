/**
 * Smoke tests for demo-critical routes.
 *
 * Routes tested:
 *   /              — Home (new chat)
 *   /chat          — Chat (canonical demo entry)
 *   /landscape     — Innovation Landscape
 *   /landscape-v2  — Landscape v2
 *   /landscape-3d  — Landscape 3D
 *   /mcp           — MCP Configuration
 *   /workflow      — Workflow
 *   /passport      — Passports
 *
 * Notes:
 *   - /canvas is not a registered Next.js route (no page.tsx found); omitted.
 *   - /chat-plus has no index page (only /chat-plus/[thread]); omitted.
 *   - /archive/[id] and /agent/[id] are dynamic-only; omitted.
 *   - Admin routes (/admin/**) require admin session; omitted from public smoke.
 *
 * Authentication:
 *   Uses email/password sign-in with test seed credentials (admin@test-seed.local).
 *   Dev bypass API is used as the primary method when DEV_ADMIN_BYPASS_PASSWORD is
 *   set and the API returns set-cookie headers; falls back to UI sign-in.
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

const AUTH_STATE_PATH = path.join(__dirname, ".auth", "smoke-admin.json");

/**
 * Credentials for email/password sign-in.
 *
 * Priority order:
 *  1. SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD (explicit override)
 *  2. demo-admin@innovation-atlas.local with DEMO_SEED_ADMIN_PASSWORD or default
 *  3. admin@test-seed.local / AdminPassword123! (test-seeded environment)
 */
const SMOKE_EMAIL =
  process.env.SMOKE_TEST_EMAIL || "demo-admin@innovation-atlas.local";
const SMOKE_PASSWORD =
  process.env.SMOKE_TEST_PASSWORD ||
  process.env.DEMO_SEED_ADMIN_PASSWORD?.trim() ||
  "DemoAtlasAdmin!2026";

/**
 * Sign in via the standard email/password UI.
 * This is the primary auth method as it's the most reliable.
 */
async function signInViaEmailPassword(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.waitForLoadState("domcontentloaded");

  await page.locator("#email").fill(SMOKE_EMAIL);
  await page.locator("#password").fill(SMOKE_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await page.waitForURL((url) => !url.toString().includes("/sign-in"), {
    timeout: 30000,
  });
}

/**
 * Navigate to "/" and ensure we end up authenticated.
 * Used in beforeAll and as inline recovery when storageState expires.
 */
async function authenticatePage(page: Page): Promise<void> {
  await page.goto("/");
  const url = page.url();

  if (!url.includes("/sign-in")) {
    // Already authenticated — nothing to do
    return;
  }

  await signInViaEmailPassword(page);
  await page.waitForLoadState("networkidle");
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

interface RouteSpec {
  route: string;
  /** Screenshot filename (no extension) */
  name: string;
  /** Set true for routes known to have pre-existing issues */
  xfail?: boolean;
  xfailReason?: string;
}

const SMOKE_ROUTES: RouteSpec[] = [
  { route: "/", name: "home" },
  { route: "/chat", name: "chat" },
  { route: "/landscape", name: "landscape" },
  { route: "/landscape-v2", name: "landscape-v2" },
  { route: "/landscape-3d", name: "landscape-3d" },
  { route: "/mcp", name: "mcp" },
  { route: "/workflow", name: "workflow" },
  { route: "/passport", name: "passport" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function screenshotPath(name: string): string {
  const dir = path.join(__dirname, "screenshots");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name}.png`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Smoke: demo-critical routes", () => {
  // Sign in once before all tests, persist auth to disk for reuse
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await authenticatePage(page);

    fs.mkdirSync(path.join(__dirname, ".auth"), { recursive: true });
    await context.storageState({ path: AUTH_STATE_PATH });
    await context.close();
  });

  for (const spec of SMOKE_ROUTES) {
    if (spec.xfail) {
      test.skip(`${spec.route} — loads without 5xx or console errors`, async () => {
        test.skip(true, spec.xfailReason ?? "Known pre-existing failure");
      });
      continue;
    }

    test(`${spec.route} — loads without 5xx or console errors`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: AUTH_STATE_PATH,
      });
      const page = await context.newPage();

      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          // Filter non-actionable browser noise
          if (
            text.includes("chrome-extension://") ||
            text.includes("favicon") ||
            text.includes("Extension context invalidated")
          ) {
            return;
          }
          consoleErrors.push(text);
        }
      });

      page.on("pageerror", (err) => {
        pageErrors.push(err.message);
      });

      const response = await page.goto(spec.route, {
        waitUntil: "domcontentloaded",
      });

      // If auth cookie expired / wasn't accepted, recover inline
      if (page.url().includes("/sign-in")) {
        await authenticatePage(page);
        const retryResponse = await page.goto(spec.route, {
          waitUntil: "domcontentloaded",
        });
        if (retryResponse) {
          const status = retryResponse.status();
          expect(
            status,
            `Route ${spec.route} returned HTTP ${status} (expected < 500)`,
          ).toBeLessThan(500);
        }
      } else if (response) {
        const status = response.status();
        expect(
          status,
          `Route ${spec.route} returned HTTP ${status} (expected < 500)`,
        ).toBeLessThan(500);
      }

      // Wait for network to settle
      await page.waitForLoadState("networkidle");

      // 2-second dwell for deferred errors (React hydration, async effects)
      await page.waitForTimeout(2000);

      // Confirm we're not on the sign-in page (auth sanity check)
      const finalUrl = page.url();
      expect(
        finalUrl,
        `Route ${spec.route} redirected to sign-in — auth failed`,
      ).not.toContain("/sign-in");

      // Take full-page screenshot baseline
      await page.screenshot({
        path: screenshotPath(spec.name),
        fullPage: true,
      });

      // Assert no console errors
      expect(
        consoleErrors,
        `Route ${spec.route} produced console.error messages:\n${consoleErrors.join("\n")}`,
      ).toHaveLength(0);

      // Assert no uncaught page errors
      expect(
        pageErrors,
        `Route ${spec.route} produced uncaught page errors:\n${pageErrors.join("\n")}`,
      ).toHaveLength(0);

      await context.close();
    });
  }
});
