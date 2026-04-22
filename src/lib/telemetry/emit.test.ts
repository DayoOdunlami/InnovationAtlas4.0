// ---------------------------------------------------------------------------
// emit() destination-routing + swallow-on-failure tests (Phase 1).
// Dest selection is tested with the injectable destinations override so
// these run entirely in-process and never touch Postgres or stdout.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setTelemetryDestinationsForTesting, emit, emitAction, emitNav, selectDestinations } from "./emit";
import type { TelemetryDestination } from "./destinations/stdout";
import type { TelemetryEnvelope } from "./envelope";

function makeRecorder(): TelemetryDestination & {
  calls: TelemetryEnvelope[];
} {
  const calls: TelemetryEnvelope[] = [];
  return {
    calls,
    write(envelope) {
      calls.push(envelope);
    },
  };
}

describe("telemetry emit()", () => {
  beforeEach(() => {
    __setTelemetryDestinationsForTesting(null);
  });

  afterEach(() => {
    __setTelemetryDestinationsForTesting(null);
  });

  it("routes to the injected destination once per event", async () => {
    const rec = makeRecorder();
    __setTelemetryDestinationsForTesting([rec]);
    await emit({
      sessionId: "s1",
      env: "dev",
      category: "nav",
      event: "brief_list_opened",
    });
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].event).toBe("brief_list_opened");
  });

  it("fans out to every injected destination", async () => {
    const a = makeRecorder();
    const b = makeRecorder();
    __setTelemetryDestinationsForTesting([a, b]);
    await emit({
      sessionId: "s1",
      env: "dev",
      category: "action",
      event: "brief_created",
    });
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
  });

  it("swallows a destination failure and continues to the next destination", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const flaky: TelemetryDestination = {
      write() {
        throw new Error("boom");
      },
    };
    const good = makeRecorder();
    __setTelemetryDestinationsForTesting([flaky, good]);
    await expect(
      emit({
        sessionId: "s1",
        env: "dev",
        category: "nav",
        event: "brief_list_opened",
      }),
    ).resolves.toBeTruthy();
    expect(good.calls).toHaveLength(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns the fully-built envelope to the caller", async () => {
    __setTelemetryDestinationsForTesting([]);
    const env = await emit({
      sessionId: "s1",
      userId: "user-a",
      env: "dev",
      category: "nav",
      event: "brief_list_opened",
      payload: { note: "hi" },
    });
    expect(env.userIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(env.payload).toEqual({ note: "hi" });
  });

  it("emitNav attaches category='nav' to the built envelope", async () => {
    const rec = makeRecorder();
    __setTelemetryDestinationsForTesting([rec]);
    await emitNav("brief_opened", { sessionId: "s1", env: "dev" });
    expect(rec.calls[0].category).toBe("nav");
    expect(rec.calls[0].event).toBe("brief_opened");
  });

  it("emitAction attaches category='action' to the built envelope", async () => {
    const rec = makeRecorder();
    __setTelemetryDestinationsForTesting([rec]);
    await emitAction("brief_share_token_minted", {
      sessionId: "s1",
      env: "prod",
    });
    expect(rec.calls[0].category).toBe("action");
    expect(rec.calls[0].event).toBe("brief_share_token_minted");
  });
});

describe("telemetry selectDestinations()", () => {
  beforeEach(() => {
    __setTelemetryDestinationsForTesting(null);
  });

  it("dev selects stdout only", async () => {
    const dests = selectDestinations("dev");
    expect(dests).toHaveLength(1);
  });

  it("test selects stdout only", async () => {
    const dests = selectDestinations("test");
    expect(dests).toHaveLength(1);
  });

  it("preview selects atlas-pg only", async () => {
    const dests = selectDestinations("preview");
    expect(dests).toHaveLength(1);
  });

  it("prod selects atlas-pg only", async () => {
    const dests = selectDestinations("prod");
    expect(dests).toHaveLength(1);
  });

  it("injected override wins over APP_ENV selection", async () => {
    const rec = makeRecorder();
    __setTelemetryDestinationsForTesting([rec]);
    const dests = selectDestinations("prod");
    expect(dests).toEqual([rec]);
  });
});
