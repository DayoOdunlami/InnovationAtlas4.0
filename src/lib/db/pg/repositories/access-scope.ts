// ---------------------------------------------------------------------------
// AccessScope contract (Phase 1, Brief-First Rebuild)
//
// A single parameter passed to every read/write method on the new atlas.*
// repositories (brief-repository, message-repository, telemetry-repository).
// The repository boundary is where access control is enforced — there is no
// Postgres RLS on these tables. See Phase 1 recon / Data Model Spec §6 for
// rationale.
//
// Three kinds of scope are supported today:
//
//   - `user`    An authenticated human acting on their own resources.
//   - `share`   A view-only caller carrying a share token (brief or passport).
//               Tokens are validated against the matching share-token table
//               inside each method — a scope object alone does NOT grant
//               access; it's a claim the method must verify.
//   - `system`  Server-internal code paths (e.g. the telemetry emitter
//               writing to atlas.telemetry_events, or a future backfill
//               script). Never attach `system` to user-facing entry points.
//
// Adding a new scope kind (e.g. `admin`) requires updating every repository
// method's permit/deny matrix AND the co-located vitest tests. Keep this
// contract small: if you need an escape hatch, write a raw SQL path and
// narrow the scope-type rather than diluting the union here.
// ---------------------------------------------------------------------------

export type AccessScope =
  | { kind: "user"; userId: string }
  | {
      kind: "share";
      token: string;
      /** Optional claim: the brief this share token is for. */
      briefId?: string;
      /** Optional claim: the passport this share token is for. */
      passportId?: string;
    }
  | { kind: "system" };

export class AccessDeniedError extends Error {
  readonly code = "access_denied" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "AccessDeniedError";
  }
}
