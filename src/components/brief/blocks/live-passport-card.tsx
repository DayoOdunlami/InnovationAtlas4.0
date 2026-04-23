// ---------------------------------------------------------------------------
// LivePassportCard — shared presentational component (Phase 3a).
//
// Pure UI card that renders a passport snapshot. Imported by both:
//   • live-passport-view.server.tsx (RSC, server-only path)
//   • live-passport-view-realtime.client.tsx (client island, Realtime path)
//
// IMPORTANT: This file MUST NOT import any server-only modules. It is
// reachable from the client bundle via the Realtime island.
// ---------------------------------------------------------------------------

import { Clock, FileText } from "lucide-react";
import type { PassportRow } from "@/lib/passport/types";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export type LivePassportCardProps = {
  passport: PassportRow;
  claimsCount: number;
  blockId: string;
};

export function LivePassportCard({
  passport,
  claimsCount,
  blockId,
}: LivePassportCardProps) {
  return (
    <div
      data-block-id={blockId}
      data-block-type="live-passport-view"
      className="rounded-lg border border-border/60 bg-card text-card-foreground shadow-sm"
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-semibold text-foreground truncate">
              {passport.title ?? passport.project_name ?? "Untitled passport"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
            <Clock className="size-3" />
            {formatDate(passport.updated_at)}
          </span>
        </div>

        {passport.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {passport.summary}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{claimsCount}</strong>{" "}
            {claimsCount === 1 ? "claim" : "claims"}
          </span>
          {passport.owner_org && (
            <span className="truncate">{passport.owner_org}</span>
          )}
        </div>
      </div>
    </div>
  );
}
