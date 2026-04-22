// ---------------------------------------------------------------------------
// Telemetry emitter (Phase 1, Brief-First Rebuild — Performance &
// Telemetry Spec §3 / §4).
//
// Single entry point for all server-side telemetry. Client-side
// callers go through a tiny `POST /api/telemetry` shim that delegates
// here (so the atlas-pg destination only ever runs server-side).
//
// Destination routing by APP_ENV
// ------------------------------
// * `dev`, `test`       → stdout only
// * `preview`, `prod`   → atlas.telemetry_events only
// * No APP_ENV set      → treated as `dev` (stdout)
//
// The emit() function never throws: a destination write that fails is
// logged to stderr and swallowed. Telemetry loss is preferable to a
// failed page render or a failed action.
//
// Adding a new destination
// ------------------------
// Implement the `TelemetryDestination` contract (see
// `destinations/stdout.ts`), extend `selectDestinations()` below, and
// add the corresponding vitest case to emit.test.ts.
// ---------------------------------------------------------------------------

import {
  type ActionEventName,
  type NavEventName,
  type TelemetryCategory,
  type TelemetryEnv,
  type TelemetryEnvelope,
  type TelemetryInput,
  buildEnvelope,
} from "./envelope";
import { atlasPgTelemetryDestination } from "./destinations/atlas-pg";
import {
  stdoutTelemetryDestination,
  type TelemetryDestination,
} from "./destinations/stdout";

// Internal: allow tests and the /api/telemetry shim to inject
// destinations without reaching into module state. Defaults to the
// env-driven selection below.
let destinationsOverride: TelemetryDestination[] | null = null;

export function __setTelemetryDestinationsForTesting(
  dests: TelemetryDestination[] | null,
): void {
  destinationsOverride = dests;
}

function resolveEnv(envOverride?: TelemetryEnv): TelemetryEnv {
  if (envOverride) return envOverride;
  const raw = (process.env.APP_ENV ?? "").toLowerCase();
  if (raw === "prod" || raw === "production") return "prod";
  if (raw === "preview") return "preview";
  if (raw === "test") return "test";
  return "dev";
}

export function selectDestinations(env: TelemetryEnv): TelemetryDestination[] {
  if (destinationsOverride !== null) return destinationsOverride;
  switch (env) {
    case "prod":
    case "preview":
      return [atlasPgTelemetryDestination];
    case "dev":
    case "test":
      return [stdoutTelemetryDestination];
  }
}

export async function emit(input: TelemetryInput): Promise<TelemetryEnvelope> {
  const env = resolveEnv(input.env);
  const envelope = buildEnvelope({ ...input, env });
  const destinations = selectDestinations(env);
  await Promise.allSettled(
    destinations.map(async (dest) => {
      try {
        await dest.write(envelope);
      } catch (err) {
        console.error("[telemetry] destination write failed:", err);
      }
    }),
  );
  return envelope;
}

// ---------------------------------------------------------------------------
// Convenience helpers for the typed event catalogue. Callers that use
// these get compile-time enforcement of the event name; raw `emit()`
// callers bypass that enforcement for ad-hoc events (e.g. `perf.*`).
// ---------------------------------------------------------------------------

export async function emitNav(
  name: NavEventName,
  rest: Omit<TelemetryInput, "category" | "event">,
): Promise<TelemetryEnvelope> {
  return emit({ ...rest, category: "nav" as TelemetryCategory, event: name });
}

export async function emitAction(
  name: ActionEventName,
  rest: Omit<TelemetryInput, "category" | "event">,
): Promise<TelemetryEnvelope> {
  return emit({
    ...rest,
    category: "action" as TelemetryCategory,
    event: name,
  });
}
