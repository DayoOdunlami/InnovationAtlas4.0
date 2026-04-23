"use client";

// ---------------------------------------------------------------------------
// Owner-only Realtime mount point (Phase 3a — Brief-First Rebuild).
//
// Uses `next/dynamic` with `ssr: false` so `LivePassportViewRealtime`
// (which imports `@supabase/realtime-js` transitively) only loads for the
// owner scope path. The share-route bundle-leak guard in
// `scripts/check-share-bundle.ts` asserts that `@supabase/realtime-js` is
// absent from all share-reachable server files and client chunks.
//
// Pattern mirrors `editable-block-list-mount.client.tsx` from Phase 2a.1.
// ---------------------------------------------------------------------------

import dynamic from "next/dynamic";
import type { PassportRow } from "@/lib/passport/types";

const LazyLivePassportViewRealtime = dynamic(
  () =>
    import("./live-passport-view-realtime.client").then((m) => ({
      default: m.LivePassportViewRealtime,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="live-passport-view-loading"
        className="rounded-lg border border-border/30 bg-muted/20 p-4 text-sm text-muted-foreground animate-pulse"
      >
        Loading live passport…
      </div>
    ),
  },
);

export function LivePassportViewMount(props: {
  blockId: string;
  passportId: string;
  initialPassport: PassportRow;
  initialClaimsCount: number;
}) {
  return <LazyLivePassportViewRealtime {...props} />;
}
