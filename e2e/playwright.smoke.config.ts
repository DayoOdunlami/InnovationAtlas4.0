import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Load environment variables (same as dev environment)
config();

/**
 * Base URL for the smoke tests.
 * Override via PLAYWRIGHT_SMOKE_BASE_URL env var.
 * The app dev server defaults to port 4000 (Next.js default when 3000 is busy).
 */
const BASE_URL =
  process.env.PLAYWRIGHT_SMOKE_BASE_URL || "http://localhost:4000";

export default defineConfig({
  testDir: "./",
  testMatch: /smoke\.spec\.ts/,
  timeout: 90 * 1000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [
    ["html", { open: "never", outputFolder: "../playwright-smoke-report" }],
    ["list"],
  ],
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },

  projects: [
    {
      name: "chromium-smoke",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: `${BASE_URL}/ping`,
    reuseExistingServer: true,
    timeout: 120 * 1000,
    stdout: "pipe",
    stderr: "pipe",
    env: Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined),
    ) as Record<string, string>,
  },
});
