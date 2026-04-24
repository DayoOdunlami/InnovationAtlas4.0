// ---------------------------------------------------------------------------
// Phase 3d — theme-tokens unit tests.
//
// The dark palette must match the POC constants. Light + print must
// remain distinct so the chrome actually looks different when switched.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  getThemeTokens,
  hexToThreeColour,
  themeCssVars,
  THEME_TOKENS,
} from "./theme-tokens";

describe("theme-tokens", () => {
  it("dark tokens match the POC :root palette", () => {
    const t = getThemeTokens("dark");
    expect(t.bg0).toBe("#0a0e13");
    expect(t.queryA).toBe("#8fe4b1");
    expect(t.queryB).toBe("#b69afc");
    expect(t.warm).toBe("#ff6b4a");
  });

  it("light + print bg0 diverge from dark so the switch is visible", () => {
    expect(THEME_TOKENS.light.bg0).not.toBe(THEME_TOKENS.dark.bg0);
    expect(THEME_TOKENS.print.bg0).toBe("#ffffff");
    expect(THEME_TOKENS.print.grid).toBe("transparent");
  });

  it("themeCssVars produces --lens-* keys consumable by CSS", () => {
    const vars = themeCssVars("dark");
    expect(vars["--lens-bg-0"]).toBe("#0a0e13");
    expect(vars["--lens-query-a"]).toBe("#8fe4b1");
  });

  it("hexToThreeColour returns the int form expected by THREE.Color", () => {
    expect(hexToThreeColour("#8fe4b1")).toBe(0x8fe4b1);
    expect(hexToThreeColour("#000000")).toBe(0x000000);
    // Invalid falls back to the project green rather than throwing.
    expect(hexToThreeColour("not-hex")).toBe(0x8fe4b1);
  });
});
