// ---------------------------------------------------------------------------
// Tests for the telemetry repository (Phase 1, Brief-First Rebuild).
//
// `insertEvent` is system-scope-only by construction (no AccessScope param).
// The checks below cover the happy path for each category, the CHECK
// constraint that rejects unknown categories, and the default behaviour
// for optional fields (userIdHash null, payloadJson {}, ts auto).
// ---------------------------------------------------------------------------

import "load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hasRealPostgresUrl } from "@/test-utils/postgres-env";

describe.skipIf(!hasRealPostgresUrl())("telemetry-repository", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const sessionId = `phase1-telemetry-${suffix}`;
  const insertedIds: string[] = [];

  let db: typeof import("../db.pg")["pgDb"];
  let schema: typeof import("../schema.pg");
  let repo: typeof import("./telemetry-repository.pg")["pgTelemetryRepository"];

  beforeAll(async () => {
    ({ pgDb: db } = await import("../db.pg"));
    schema = await import("../schema.pg");
    ({ pgTelemetryRepository: repo } = await import(
      "./telemetry-repository.pg"
    ));
  });

  afterAll(async () => {
    if (!db || !schema || insertedIds.length === 0) return;
    const { inArray } = await import("drizzle-orm");
    await db
      .delete(schema.AtlasTelemetryEventsTable)
      .where(inArray(schema.AtlasTelemetryEventsTable.id, insertedIds));
  });

  it("insertEvent persists a nav event with defaults populated", async () => {
    const row = await repo.insertEvent({
      sessionId,
      env: "test",
      category: "nav",
      event: "brief_list_opened",
    });
    insertedIds.push(row.id);
    expect(row.sessionId).toBe(sessionId);
    expect(row.category).toBe("nav");
    expect(row.event).toBe("brief_list_opened");
    expect(row.userIdHash).toBeNull();
    expect(row.payloadJson).toEqual({});
    expect(row.ts).toBeInstanceOf(Date);
  });

  it("insertEvent accepts each of the four permitted categories", async () => {
    const categories = ["nav", "action", "agent", "perf"] as const;
    for (const category of categories) {
      const row = await repo.insertEvent({
        sessionId,
        env: "test",
        category,
        event: `${category}.probe`,
      });
      insertedIds.push(row.id);
      expect(row.category).toBe(category);
    }
  });

  it("insertEvent persists userIdHash and payloadJson when provided", async () => {
    const payload = {
      briefId: "00000000-0000-0000-0000-000000000001",
      foo: 42,
    };
    const row = await repo.insertEvent({
      sessionId,
      userIdHash: "hash-test-12345",
      env: "test",
      category: "action",
      event: "brief_created",
      payloadJson: payload,
    });
    insertedIds.push(row.id);
    expect(row.userIdHash).toBe("hash-test-12345");
    expect(row.payloadJson).toEqual(payload);
  });

  it("insertEvent rejects an unknown category via the CHECK constraint", async () => {
    await expect(
      repo.insertEvent({
        sessionId,
        env: "test",
        category: "invalid" as unknown as "nav",
        event: "bogus",
      }),
    ).rejects.toThrow();
  });
});
