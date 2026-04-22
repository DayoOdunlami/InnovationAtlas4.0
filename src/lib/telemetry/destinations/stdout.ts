// ---------------------------------------------------------------------------
// Stdout telemetry destination (Phase 1, Brief-First Rebuild).
//
// Used in the `dev` and `test` APP_ENVs so engineers can tail a local
// log and see events without touching the shared DB. Format is a single
// line of JSON per event (easy to pipe through `jq`).
// ---------------------------------------------------------------------------

import type { TelemetryEnvelope } from "../envelope";

export interface TelemetryDestination {
  write(envelope: TelemetryEnvelope): Promise<void> | void;
}

export const stdoutTelemetryDestination: TelemetryDestination = {
  write(envelope) {
    const line = JSON.stringify({ kind: "telemetry", ...envelope });
    process.stdout.write(`${line}\n`);
  },
};
