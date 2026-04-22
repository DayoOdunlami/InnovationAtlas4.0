// ---------------------------------------------------------------------------
// Telemetry envelope (Phase 1, Brief-First Rebuild — Performance &
// Telemetry Spec §3).
//
// Every emitted telemetry event is serialised into this envelope before
// it reaches a destination. The shape intentionally matches
// `atlas.telemetry_events` (Data Model Spec §4.6) so the atlas-pg
// destination is a 1:1 mapping.
//
// Field notes
// -----------
// * `session_id`  Stable per-tab / per-run identifier. Browser callers
//                 derive it from a session-scoped cookie; server callers
//                 can pass their own (e.g. a request-id for API routes).
// * `user_id`     Optional. Hashed into `user_id_hash` with SHA-256 so
//                 the emitted envelope never carries the raw UUID.
// * `env`         The APP_ENV the emitter is running in — `dev`,
//                 `preview`, `prod`, or `test`. Drives destination
//                 selection in `emit()`.
// * `category`    Must be one of the four allowed categories from the
//                 CHECK constraint on atlas.telemetry_events.
// * `event`       Dot-separated event name, e.g. `nav.brief_opened`. The
//                 `nav.*` / `action.*` prefix is implied by `category`
//                 and is kept out of the stored value to avoid
//                 stuttering; the typed catalogue in this file enforces
//                 that.
// * `payload`     Arbitrary JSON; serialised to `payload_json`.
// * `ts`          Epoch-ms; normalised to a Date on write.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

export type TelemetryCategory = "nav" | "action" | "agent" | "perf";
export type TelemetryEnv = "dev" | "preview" | "prod" | "test";

export interface TelemetryInput {
  sessionId: string;
  userId?: string | null;
  env: TelemetryEnv;
  category: TelemetryCategory;
  event: string;
  payload?: Record<string, unknown>;
  ts?: number;
}

export interface TelemetryEnvelope {
  sessionId: string;
  userIdHash: string | null;
  env: TelemetryEnv;
  category: TelemetryCategory;
  event: string;
  payload: Record<string, unknown>;
  ts: number;
}

export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

export function buildEnvelope(input: TelemetryInput): TelemetryEnvelope {
  const userIdHash =
    input.userId && input.userId.length > 0 ? hashUserId(input.userId) : null;
  return {
    sessionId: input.sessionId,
    userIdHash,
    env: input.env,
    category: input.category,
    event: input.event,
    payload: input.payload ?? {},
    ts: input.ts ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Typed nav + action event catalogue (Phase 1).
//
// Nav events fire on page views / route transitions. Action events fire
// on user-driven CRUD on briefs. Both are required by Performance &
// Telemetry Spec §3.2 and confirmed by Phase 1 recon APPROVED DEFAULT
// #15 — the brief's "only nav" line is wrong and has been superseded.
//
// Adding a new event here also updates the TelemetryEvent union that
// `emit()` type-checks callers against.
// ---------------------------------------------------------------------------

export type NavEventName =
  | "brief_list_opened"
  | "brief_opened"
  | "brief_created"
  | "brief_renamed"
  | "brief_deleted";

export type ActionEventName =
  | "brief_created"
  | "brief_renamed"
  | "brief_deleted"
  | "brief_share_token_minted";

export const NAV_EVENT_NAMES = [
  "brief_list_opened",
  "brief_opened",
  "brief_created",
  "brief_renamed",
  "brief_deleted",
] as const satisfies readonly NavEventName[];

export const ACTION_EVENT_NAMES = [
  "brief_created",
  "brief_renamed",
  "brief_deleted",
  "brief_share_token_minted",
] as const satisfies readonly ActionEventName[];
