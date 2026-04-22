// ---------------------------------------------------------------------------
// atlas.telemetry_events destination (Phase 1, Brief-First Rebuild —
// Performance & Telemetry Spec §4).
//
// Used in the `preview` and `prod` APP_ENVs. Writes go through the
// `system`-scope-only telemetry repository, which is the only
// legitimate caller of that repository (see comment at top of
// telemetry-repository.pg.ts).
//
// Azure App Insights + GA4 are deferred per Phase 1 recon APPROVED
// DEFAULT #12; atlas.telemetry_events is the primary destination. If a
// later phase enables App Insights, it plugs in as an additional
// destination here with identical envelope shape.
// ---------------------------------------------------------------------------

import { pgTelemetryRepository } from "@/lib/db/pg/repositories/telemetry-repository.pg";
import type { TelemetryEnvelope } from "../envelope";
import type { TelemetryDestination } from "./stdout";

export const atlasPgTelemetryDestination: TelemetryDestination = {
  async write(envelope: TelemetryEnvelope) {
    await pgTelemetryRepository.insertEvent({
      sessionId: envelope.sessionId,
      userIdHash: envelope.userIdHash,
      env: envelope.env,
      category: envelope.category,
      event: envelope.event,
      payloadJson: envelope.payload,
      ts: new Date(envelope.ts),
    });
  },
};
