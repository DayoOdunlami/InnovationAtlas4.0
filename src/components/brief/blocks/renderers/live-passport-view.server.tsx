// ---------------------------------------------------------------------------
// Read-only live-passport-view block renderer (Phase 3a — Brief-First
// Rebuild, Block Types Spec §3.x).
//
// This is the RSC (server component) half of the live-passport-view block.
// It fetches the passport synchronously at render time and hands the
// result to either:
//
//   • (owner scope)  <LivePassportViewMount> — a "use client" dynamic
//     wrapper that attaches a Supabase Realtime subscription so updates
//     in another tab / browser propagate into this card without a page
//     refresh. The wrapper is loaded with `next/dynamic({ ssr: false })`
//     so the Realtime client never leaks into the share-route bundle.
//
//   • (share scope)  <LivePassportCard> — the read-only card rendered
//     directly as server HTML.  Share-scope visitors see a snapshot;
//     realtime is an owner privilege.
//
// The renderer never touches atlas.briefs, atlas.blocks, or message
// repositories (frozen Phase 1/2a contracts). It calls `getPassportDetail`
// directly via the existing query helper.
//
// content_json shape: { passportId: string, schema_version: 1 }
// ---------------------------------------------------------------------------

import { getPassportDetail } from "@/lib/passport/queries";
import { AlertTriangle } from "lucide-react";
import { LivePassportViewMount } from "../live-passport-view-mount.client";
import { LivePassportCard } from "../live-passport-card";

export type LivePassportViewContent = {
  passportId: string;
  schema_version: 1;
};

// Re-export LivePassportCard and its types so tests can import from this file.
export type { LivePassportCardProps } from "../live-passport-card";
export { LivePassportCard } from "../live-passport-card";

function safeParse(content: unknown): { passportId: string } | null {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  if (typeof c.passportId !== "string" || !c.passportId) return null;
  return { passportId: c.passportId };
}

// -------------------------------------------------------------------------
// Not-found placeholder — rendered when the passport id does not resolve.
// -------------------------------------------------------------------------

function PassportNotFound({
  passportId,
  blockId,
}: {
  passportId: string;
  blockId: string;
}) {
  return (
    <div
      data-block-id={blockId}
      data-block-type="live-passport-view"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3 text-sm text-muted-foreground"
    >
      <AlertTriangle className="size-4 text-destructive/60 shrink-0" />
      <span>
        Passport{" "}
        <code className="font-mono text-xs">{passportId.slice(0, 8)}…</code>{" "}
        could not be loaded. It may have been archived or you may not have
        access.
      </span>
    </div>
  );
}

// -------------------------------------------------------------------------
// Block renderer — entry point called from block-list.server.tsx.
// `isOwner` controls whether the realtime island is mounted.
// -------------------------------------------------------------------------

export async function LivePassportViewBlockRenderer({
  id,
  content,
  isOwner,
}: {
  id: string;
  content: unknown;
  isOwner?: boolean;
}) {
  const parsed = safeParse(content);
  if (!parsed) {
    return (
      <div
        data-block-id={id}
        data-block-type="live-passport-view"
        className="text-xs text-muted-foreground"
      >
        [live-passport-view: missing passportId]
      </div>
    );
  }

  const detail = await getPassportDetail(parsed.passportId);
  if (!detail) {
    return <PassportNotFound passportId={parsed.passportId} blockId={id} />;
  }

  const claimsCount = detail.claims.length;

  if (isOwner) {
    // Owner path: mount the realtime island so card updates live.
    return (
      <LivePassportViewMount
        blockId={id}
        initialPassport={detail.passport}
        initialClaimsCount={claimsCount}
        passportId={parsed.passportId}
      />
    );
  }

  // Share-scope / SSR fallback: static snapshot card.
  return (
    <LivePassportCard
      passport={detail.passport}
      claimsCount={claimsCount}
      blockId={id}
    />
  );
}
