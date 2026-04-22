// ---------------------------------------------------------------------------
// Telemetry repository (Phase 1, Brief-First Rebuild — Data Model Spec §4.6)
//
// Write-only interface for `atlas.telemetry_events`. No read methods in
// Phase 1 — dashboards consume the table directly via SQL / Metabase.
//
// This repository is `system`-scope-only: the only legitimate caller is
// the server-side telemetry emitter in `src/lib/telemetry/destinations/
// atlas-pg.ts` (commit 5). There is no `AccessScope` parameter on
// `insertEvent` because user-scope telemetry flows via that emitter, not
// by reaching this repository directly. This is intentional — any other
// caller is a bug.
// ---------------------------------------------------------------------------

import { pgDb as db } from "../db.pg";
import {
  AtlasTelemetryEventsTable,
  type AtlasTelemetryEventEntity,
  type AtlasTelemetryEventInsert,
} from "../schema.pg";

export type TelemetryCategory = "nav" | "action" | "agent" | "perf";

export interface TelemetryInsert {
  sessionId: string;
  userIdHash?: string | null;
  env: string;
  category: TelemetryCategory;
  event: string;
  payloadJson?: unknown;
  ts?: Date;
}

export interface TelemetryRepository {
  insertEvent(input: TelemetryInsert): Promise<AtlasTelemetryEventEntity>;
}

export const pgTelemetryRepository: TelemetryRepository = {
  async insertEvent(input) {
    const values: AtlasTelemetryEventInsert = {
      sessionId: input.sessionId,
      userIdHash: input.userIdHash ?? null,
      env: input.env,
      category: input.category,
      event: input.event,
      ...(input.payloadJson !== undefined
        ? { payloadJson: input.payloadJson as object }
        : {}),
      ...(input.ts !== undefined ? { ts: input.ts } : {}),
    };
    const [row] = await db
      .insert(AtlasTelemetryEventsTable)
      .values(values)
      .returning();
    return row;
  },
};
