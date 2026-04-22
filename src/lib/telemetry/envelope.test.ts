// ---------------------------------------------------------------------------
// Pure tests for the telemetry envelope builder (Phase 1).
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  ACTION_EVENT_NAMES,
  NAV_EVENT_NAMES,
  buildEnvelope,
  hashUserId,
} from "./envelope";

describe("telemetry envelope", () => {
  it("buildEnvelope copies session_id, env, category, event verbatim", () => {
    const env = buildEnvelope({
      sessionId: "sess-abc",
      env: "dev",
      category: "nav",
      event: "brief_opened",
    });
    expect(env.sessionId).toBe("sess-abc");
    expect(env.env).toBe("dev");
    expect(env.category).toBe("nav");
    expect(env.event).toBe("brief_opened");
  });

  it("buildEnvelope substitutes an empty payload when none is supplied", () => {
    const env = buildEnvelope({
      sessionId: "s",
      env: "dev",
      category: "nav",
      event: "brief_list_opened",
    });
    expect(env.payload).toEqual({});
  });

  it("buildEnvelope preserves the supplied payload object", () => {
    const payload = { briefId: "11111111-2222-3333-4444-555555555555" };
    const env = buildEnvelope({
      sessionId: "s",
      env: "prod",
      category: "action",
      event: "brief_created",
      payload,
    });
    expect(env.payload).toEqual(payload);
  });

  it("buildEnvelope hashes userId into userIdHash using SHA-256 (stable)", () => {
    const a = buildEnvelope({
      sessionId: "s",
      userId: "user-xyz",
      env: "prod",
      category: "action",
      event: "brief_created",
    });
    const b = buildEnvelope({
      sessionId: "s",
      userId: "user-xyz",
      env: "prod",
      category: "action",
      event: "brief_created",
    });
    expect(a.userIdHash).toBe(b.userIdHash);
    expect(a.userIdHash).toBe(hashUserId("user-xyz"));
    expect(a.userIdHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("buildEnvelope leaves userIdHash null when no userId is supplied", () => {
    const env = buildEnvelope({
      sessionId: "s",
      env: "dev",
      category: "nav",
      event: "brief_list_opened",
    });
    expect(env.userIdHash).toBeNull();
  });

  it("buildEnvelope fills ts from Date.now() when ts is omitted", () => {
    const before = Date.now();
    const env = buildEnvelope({
      sessionId: "s",
      env: "dev",
      category: "nav",
      event: "brief_list_opened",
    });
    const after = Date.now();
    expect(env.ts).toBeGreaterThanOrEqual(before);
    expect(env.ts).toBeLessThanOrEqual(after);
  });

  it("buildEnvelope preserves the supplied ts", () => {
    const fixedTs = 1_700_000_000_000;
    const env = buildEnvelope({
      sessionId: "s",
      env: "dev",
      category: "nav",
      event: "brief_list_opened",
      ts: fixedTs,
    });
    expect(env.ts).toBe(fixedTs);
  });

  it("NAV_EVENT_NAMES covers the five Phase 1 nav events (Perf & Telemetry §3.2)", () => {
    expect([...NAV_EVENT_NAMES].sort()).toEqual(
      [
        "brief_created",
        "brief_deleted",
        "brief_list_opened",
        "brief_opened",
        "brief_renamed",
      ].sort(),
    );
  });

  it("ACTION_EVENT_NAMES covers the four Phase 1 action events (recon default #15)", () => {
    expect([...ACTION_EVENT_NAMES].sort()).toEqual(
      [
        "brief_created",
        "brief_deleted",
        "brief_renamed",
        "brief_share_token_minted",
      ].sort(),
    );
  });
});
