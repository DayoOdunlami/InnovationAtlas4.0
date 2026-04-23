#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// Phase 2a.0 bundle-leak regression check.
//
// Assertion: the `(shared-brief)` route group MUST NOT depend on Plate
// / platejs / slate-react. 2a.1 will merge a Plate-based editor into
// the owner route; we want share recipients to never pull that
// editor bundle down.
//
// Strategy
// --------
// Walk everything under `.next/server/app/(shared-brief)` and every
// static chunk whose name appears in the route's client-reference /
// build manifests, AS LOADED BY SHARE SCOPE. If any of those files
// contains one of the editor package names, fail.
//
// Phase 2a.1 adjustment
// ---------------------
// Plate and @dnd-kit are legitimate deps of the owner-scope editable
// tree. They load behind `next/dynamic({ ssr: false })` gated by a
// runtime scope check (see `editable-block-list-mount.client.tsx`), so
// the chunks *exist* inside `static/chunks/` but are never requested
// by a share-scope visitor. The original 2a.0 script walked every
// chunk indiscriminately; 2a.1 tightens the scan to the chunk IDs
// referenced from share-reachable manifests.
//
// Usage:
//   pnpm build && pnpm exec tsx scripts/check-share-bundle.ts
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const NEXT_DIR = join(process.cwd(), ".next");
const SHARE_ROUTE_DIR = join(NEXT_DIR, "server/app/(shared-brief)");
const STATIC_CHUNKS_DIR = join(NEXT_DIR, "static/chunks");

// Forbidden list — append-only per Phase 2a.1 §4.3. Do not remove.
// `@dnd-kit` is added by the runtime HTML-string guard in
// tests/briefs/block-share.spec.ts; the build-output scan below still
// treats `platejs`, `slate-react`, and `@udecode/plate` as hard fails.
// Phase 3a appends `@supabase/realtime-js`: the Realtime subscriber
// island is loaded only for owner scope via `next/dynamic({ ssr: false
// })`; the share-route bundle must never contain it.
const FORBIDDEN = [
  "@udecode/plate",
  "platejs",
  "slate-react",
  "@supabase/realtime-js",
] as const;

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out = out.concat(walk(full));
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function scan(files: string[], label: string): string[] {
  const hits: string[] = [];
  for (const f of files) {
    let body: string;
    try {
      body = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const needle of FORBIDDEN) {
      if (body.includes(needle)) {
        hits.push(`${f} (contains ${needle})`);
        break;
      }
    }
  }
  if (hits.length > 0) {
    console.error(`\n[check-share-bundle] ${label} hits:`);
    for (const h of hits) console.error(`  - ${h}`);
  }
  return hits;
}

// Extract every static-chunk filename mentioned in the share-route's
// own manifests. We deliberately SKIP `react-loadable-manifest.json`
// because it enumerates both ssr-loaded AND dynamic-import chunks —
// the Phase 2a.1 editable tree is gated behind `next/dynamic({ ssr:
// false })` + scope branching, and never runs on share scope.
//
// Phase 2b / 3a renderers that load server-side for share readers will
// land here first and the check will fail fast if any of them import a
// forbidden package.
function collectShareReachableChunks(): string[] {
  const out = new Set<string>();
  const manifestPaths = walk(SHARE_ROUTE_DIR).filter(
    (f) => /\.(js|json)$/.test(f) && !/react-loadable-manifest\.json$/.test(f),
  );
  for (const m of manifestPaths) {
    let body: string;
    try {
      body = readFileSync(m, "utf8");
    } catch {
      continue;
    }
    for (const match of body.matchAll(
      /static\/chunks\/([A-Za-z0-9_\-]+\.js)/g,
    )) {
      out.add(join(STATIC_CHUNKS_DIR, match[1]));
    }
  }
  return [...out];
}

function main() {
  // First: walk the server-rendered output for the share route itself.
  const serverFiles = walk(SHARE_ROUTE_DIR).filter((f) =>
    /\.(js|mjs|cjs|json|html)$/.test(f),
  );
  if (serverFiles.length === 0) {
    console.error(
      `[check-share-bundle] no files found under ${SHARE_ROUTE_DIR} — run pnpm build first.`,
    );
    process.exit(1);
  }
  // The server bundle itself must be clean of the forbidden strings,
  // including the server-rendered HTML string scan (paired with the
  // Playwright assertion). `react-loadable-manifest.json` enumerates
  // dynamic chunks that never load on share scope so it is excluded
  // from the scan — the share-reachable chunk set below is the check.
  const serverScanFiles = serverFiles.filter(
    (f) => !/react-loadable-manifest\.json$/.test(f),
  );
  const serverHits = scan(serverScanFiles, "server/app/(shared-brief)");

  const reachableChunks = collectShareReachableChunks().filter((f) => {
    try {
      return statSync(f).isFile();
    } catch {
      return false;
    }
  });
  const chunkHits = scan(reachableChunks, "share-reachable client chunks");

  if (serverHits.length > 0 || chunkHits.length > 0) {
    console.error(
      `\n[check-share-bundle] FAIL — share-route bundle leaked an editor dep.`,
    );
    process.exit(1);
  }
  console.log(
    `[check-share-bundle] OK — scanned ${serverScanFiles.length} server files + ${reachableChunks.length} share-reachable client chunks; no editor package names found.`,
  );
  process.exit(0);
}

main();
