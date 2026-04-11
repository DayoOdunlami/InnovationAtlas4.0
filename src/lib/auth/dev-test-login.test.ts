import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DEV_ADMIN_BYPASS,
  DEFAULT_DEV_GUEST_BYPASS,
  getDevBypassPassword,
  getDevBypassPasswordHints,
  isDevTestLoginEnabled,
} from "./dev-test-login";

describe("dev-test-login", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isDevTestLoginEnabled()).toBe(true);
  });

  it("enables on Vercel preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isDevTestLoginEnabled()).toBe(true);
  });

  it("enables when ALLOW_VERCEL_DEV_LOGIN", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ALLOW_VERCEL_DEV_LOGIN", "true");
    expect(isDevTestLoginEnabled()).toBe(true);
  });

  it("disables on Vercel production without flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ALLOW_VERCEL_DEV_LOGIN", "");
    expect(isDevTestLoginEnabled()).toBe(false);
  });

  it("uses defaults when env passwords unset in dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_ADMIN_BYPASS_PASSWORD", "");
    vi.stubEnv("DEV_GUEST_BYPASS_PASSWORD", "");
    expect(getDevBypassPassword("admin")).toBe(DEFAULT_DEV_ADMIN_BYPASS);
    expect(getDevBypassPassword("guest")).toBe(DEFAULT_DEV_GUEST_BYPASS);
    expect(getDevBypassPasswordHints()).toEqual({
      admin: DEFAULT_DEV_ADMIN_BYPASS,
      guest: DEFAULT_DEV_GUEST_BYPASS,
    });
  });

  it("prefers env passwords when set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_ADMIN_BYPASS_PASSWORD", "custom-admin");
    vi.stubEnv("DEV_GUEST_BYPASS_PASSWORD", "custom-guest");
    expect(getDevBypassPassword("admin")).toBe("custom-admin");
    expect(getDevBypassPassword("guest")).toBe("custom-guest");
  });
});
