// ---------------------------------------------------------------------------
// Phase 3d — Theme token map.
//
// The 3D renderer + chrome consume the same tokens so a single switch
// flips both the CSS variables on the wrapper (for the sidebars,
// buttons, hover card) and the THREE materials / sprite colours (for
// the scene).
//
// The `dark` palette matches the POC exactly — a direct copy of the
// `:root` vars in `docs/force-graph-lens-poc.html` lines 17–29.
//
// `light` is intended for brief embeds that render alongside black
// body copy; the background drops to an off-white with enough contrast
// that node silhouettes remain legible without relying on the glow
// halos only the dark theme carries.
//
// `print` flattens colours further, removes the grid and glow, and
// nudges towards single-channel CMYK-safe hues so the same block can
// be exported to PDF in Phase 4 without a second pass.
// ---------------------------------------------------------------------------

export type LensTheme = "dark" | "light" | "print";

export type ThemeTokens = {
  bg0: string;
  bg1: string;
  bg2: string;
  ink: string;
  inkDim: string;
  inkFaint: string;
  rule: string;
  grid: string;
  project: string;
  projectStrong: string;
  live: string;
  queryA: string;
  queryB: string;
  warm: string;
  edge: string;
  edgeLive: string;
  edgeQuery: string;
};

export const THEME_TOKENS: Record<LensTheme, ThemeTokens> = {
  dark: {
    bg0: "#0a0e13",
    bg1: "#101620",
    bg2: "#1a2230",
    ink: "#e8ecf1",
    inkDim: "#8a96a8",
    inkFaint: "#4a5566",
    rule: "#253040",
    grid: "rgba(143,228,177,0.04)",
    project: "#8fe4b1",
    projectStrong: "#8fe4b1",
    live: "#f5b547",
    queryA: "#8fe4b1",
    queryB: "#b69afc",
    warm: "#ff6b4a",
    edge: "rgba(74,85,102,0.6)",
    edgeLive: "rgba(245,181,71,0.7)",
    edgeQuery: "rgba(143,228,177,0.35)",
  },
  light: {
    bg0: "#f7f8f9",
    bg1: "#ffffff",
    bg2: "#eef0f3",
    ink: "#1a2230",
    inkDim: "#4a5566",
    inkFaint: "#8a96a8",
    rule: "#d4d8de",
    grid: "rgba(34,97,63,0.06)",
    project: "#2d9163",
    projectStrong: "#1f6b47",
    live: "#c38720",
    queryA: "#2d9163",
    queryB: "#6a4bcf",
    warm: "#cc4a2b",
    edge: "rgba(74,85,102,0.35)",
    edgeLive: "rgba(195,135,32,0.6)",
    edgeQuery: "rgba(45,145,99,0.4)",
  },
  print: {
    bg0: "#ffffff",
    bg1: "#ffffff",
    bg2: "#fafafa",
    ink: "#000000",
    inkDim: "#333333",
    inkFaint: "#666666",
    rule: "#bbbbbb",
    grid: "transparent",
    project: "#1f6b47",
    projectStrong: "#0f3d29",
    live: "#8a5f10",
    queryA: "#1f6b47",
    queryB: "#4a3099",
    warm: "#8a2f1a",
    edge: "rgba(0,0,0,0.3)",
    edgeLive: "rgba(0,0,0,0.45)",
    edgeQuery: "rgba(31,107,71,0.5)",
  },
};

export function getThemeTokens(theme: LensTheme | undefined): ThemeTokens {
  return THEME_TOKENS[theme ?? "dark"];
}

// THREE.Color expects hex `0x…` ints. Parse a `#rrggbb` CSS colour to
// the integer form. (The POC uses `new THREE.Color(0x8fe4b1)` literals;
// we need the same but from the token map.)
export function hexToThreeColour(hex: string): number {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return 0x8fe4b1;
  return parseInt(h, 16);
}

// CSS custom-property style bundle — consumers spread this onto an
// element's `style` to propagate tokens into descendant Tailwind
// arbitrary-value classes that read `var(--lens-bg-0)` etc. Keeps the
// chrome/scene palettes in lockstep.
export function themeCssVars(theme: LensTheme): Record<string, string> {
  const t = getThemeTokens(theme);
  return {
    "--lens-bg-0": t.bg0,
    "--lens-bg-1": t.bg1,
    "--lens-bg-2": t.bg2,
    "--lens-ink": t.ink,
    "--lens-ink-dim": t.inkDim,
    "--lens-ink-faint": t.inkFaint,
    "--lens-rule": t.rule,
    "--lens-grid": t.grid,
    "--lens-project": t.project,
    "--lens-project-strong": t.projectStrong,
    "--lens-live": t.live,
    "--lens-query-a": t.queryA,
    "--lens-query-b": t.queryB,
    "--lens-warm": t.warm,
    "--lens-edge": t.edge,
    "--lens-edge-live": t.edgeLive,
    "--lens-edge-query": t.edgeQuery,
  };
}
