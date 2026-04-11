/**
 * Shared rules for dev / QA quick login (Admin & Guest bypass).
 * Never treat production as "easy login" unless one of the flags below is set.
 */

/** Defaults when env passwords are unset — only used when isDevTestLoginEnabled(). */
export const DEFAULT_DEV_ADMIN_BYPASS = "atlas-dev-admin";
export const DEFAULT_DEV_GUEST_BYPASS = "atlas-dev-guest";

/** Show bypass UI and allow /api/auth/dev-bypass */
export function isDevTestLoginEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.ALLOW_VERCEL_DEV_LOGIN === "true") return true;
  if (process.env.VERCEL_ENV === "preview") return true;
  return false;
}

/** Password expected for the given role (env override or default). */
export function getDevBypassPassword(role: "admin" | "guest"): string {
  const fromEnv =
    role === "admin"
      ? process.env.DEV_ADMIN_BYPASS_PASSWORD
      : process.env.DEV_GUEST_BYPASS_PASSWORD;
  const trimmed = fromEnv?.trim();
  if (trimmed) return trimmed;
  return role === "admin" ? DEFAULT_DEV_ADMIN_BYPASS : DEFAULT_DEV_GUEST_BYPASS;
}

export function getDevBypassPasswordHints(): {
  admin: string;
  guest: string;
} {
  return {
    admin:
      process.env.DEV_ADMIN_BYPASS_PASSWORD?.trim() || DEFAULT_DEV_ADMIN_BYPASS,
    guest:
      process.env.DEV_GUEST_BYPASS_PASSWORD?.trim() || DEFAULT_DEV_GUEST_BYPASS,
  };
}
