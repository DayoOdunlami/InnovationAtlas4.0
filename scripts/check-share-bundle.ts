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
// chunk referenced from the share-route RSC client manifest. If any
// file contains one of the editor package names, fail.
//
// Usage:
//   pnpm build && pnpm exec tsx scripts/check-share-bundle.ts
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const NEXT_DIR = join(process.cwd(), ".next");
const SHARE_ROUTE_DIR = join(NEXT_DIR, "server/app/(shared-brief)");

const FORBIDDEN = [
  "@udecode/plate",
  "platejs",
  "slate-react",
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

function main() {
  // First: walk the server-rendered output for the share route.
  const serverFiles = walk(SHARE_ROUTE_DIR).filter((f) =>
    /\.(js|mjs|cjs|json|html)$/.test(f),
  );
  if (serverFiles.length === 0) {
    console.error(
      `[check-share-bundle] no files found under ${SHARE_ROUTE_DIR} — run pnpm build first.`,
    );
    process.exit(1);
  }
  const serverHits = scan(serverFiles, "server/app/(shared-brief)");

  // Second: also check the whole client chunks dir. Editor modules
  // usually live as named chunks; if Plate were accidentally pulled
  // in anywhere the name is easy to spot. This is a coarse second
  // net, intentionally imprecise: by Phase 2a.0 none of the chunks
  // should contain these strings.
  const chunkDir = join(NEXT_DIR, "static/chunks");
  const chunkFiles = walk(chunkDir).filter((f) => /\.(js|mjs|cjs)$/.test(f));
  const chunkHits = scan(chunkFiles, "static/chunks");

  if (serverHits.length > 0 || chunkHits.length > 0) {
    console.error(
      `\n[check-share-bundle] FAIL — share-route bundle leaked an editor dep.`,
    );
    process.exit(1);
  }
  console.log(
    `[check-share-bundle] OK — scanned ${serverFiles.length} server files + ${chunkFiles.length} client chunks; no editor package names found.`,
  );
  process.exit(0);
}

main();
