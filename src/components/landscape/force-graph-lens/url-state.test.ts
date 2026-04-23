// ---------------------------------------------------------------------------
// URL state round-trip tests (Phase 3b).
//
// The encoder uses the same base64-wrapped JSON format as the POC so
// links generated in the POC HTML and in the React lens are
// interchangeable.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { decodeUrlState, encodeUrlState } from "./url-state";

describe("encode/decode URL state", () => {
  it("round-trips a gravity-mode payload", () => {
    const state = {
      m: "gravity" as const,
      qa: "rail hydrogen decarbonisation",
      qb: null,
      f: "abc123",
      z: "score" as const,
      t: { s: 0 as const, v: 1 as const, e: 1 as const, r: 1 as const },
      c: { tx: 0, ty: 0, tz: 0, th: 0.78, ph: 1.01, d: 900 },
    };
    const encoded = encodeUrlState(state);
    expect(encoded.length).toBeGreaterThan(0);
    expect(decodeUrlState(encoded)).toEqual(state);
  });

  it("returns null on an empty or invalid hash", () => {
    expect(decodeUrlState("")).toBeNull();
    expect(decodeUrlState("##not-base64##")).toBeNull();
  });

  it("tolerates a leading '#'", () => {
    const encoded = "#" + encodeUrlState({ m: "explore" });
    expect(decodeUrlState(encoded)?.m).toBe("explore");
  });
});
