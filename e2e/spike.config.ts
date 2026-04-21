import { defineConfig, devices } from "@playwright/test";

// Minimal standalone Playwright config for the Plate spike (Phase 0 #5).
// The main `playwright.config.ts` depends on seeded users, auth states, and
// Supabase/Postgres setup that are irrelevant to this harness. Keeping this
// config self-contained so CI/local runs of the spike remain reproducible
// and isolated.
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.SPIKE_BASE_URL || "http://localhost:4000", // pragma: allowlist secret
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "spike",
      testMatch: /.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:4000/spike/block-editor", // pragma: allowlist secret
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
