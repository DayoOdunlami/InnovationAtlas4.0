// ---------------------------------------------------------------------------
// URL-owned state round-trip — copied verbatim from the POC.
//
// Schema (POC `serialiseState`):
//   m  — POC mode: explore | gravity | compare
//   z  — z-axis: score | time | funding | flat
//   qa — query A (gravity + compare)
//   qb — query B (compare)
//   f  — focused node id
//   t  — toggle booleans: s(pread) v(olumes) e(dges) r(ings)
//   c  — camera: tx/ty/tz target, th/ph/d polar coords
//
// Encoding uses the same base64-wrapped JSON blob stored in `location.
// hash` so shared links round-trip between the POC and the React
// lens without translation.
// ---------------------------------------------------------------------------

export type UrlState = {
  m?: "explore" | "gravity" | "compare";
  z?: "score" | "time" | "funding" | "flat";
  qa?: string | null;
  qb?: string | null;
  f?: string | null;
  t?: { s?: 0 | 1; v?: 0 | 1; e?: 0 | 1; r?: 0 | 1 };
  c?: {
    tx?: number;
    ty?: number;
    tz?: number;
    th?: number;
    ph?: number;
    d?: number;
  };
};

export function encodeUrlState(state: UrlState): string {
  if (typeof btoa === "undefined") {
    return Buffer.from(JSON.stringify(state), "utf8").toString("base64");
  }
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  } catch {
    return "";
  }
}

export function decodeUrlState(hash: string): UrlState | null {
  if (!hash) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    const json =
      typeof atob === "undefined"
        ? Buffer.from(raw, "base64").toString("utf8")
        : decodeURIComponent(escape(atob(raw)));
    return JSON.parse(json) as UrlState;
  } catch {
    return null;
  }
}

export function readUrlState(): UrlState | null {
  if (typeof window === "undefined") return null;
  return decodeUrlState(window.location.hash);
}

export function writeUrlState(state: UrlState): void {
  if (typeof window === "undefined") return;
  try {
    window.history.replaceState(null, "", "#" + encodeUrlState(state));
  } catch {
    /* no-op */
  }
}
