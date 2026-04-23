// ---------------------------------------------------------------------------
// Permit/deny tests for the brief repository (Phase 1, Brief-First Rebuild).
//
// The brief-repository enforces the `AccessScope` contract at the repository
// boundary (no RLS). These tests exercise every method against real
// Postgres and cover both the permit and deny paths of every scope the
// method accepts.
//
// Test database
// -------------
// Runs against whatever `POSTGRES_URL` points to (shared project DB in CI,
// local dev DB otherwise). Each test creates an ephemeral public.user row
// with a UUID-tagged email and cleans up in `afterAll`, so there is no
// cross-test state. `describe.skipIf(!POSTGRES_URL)` keeps developer
// machines without a DB connection green.
// ---------------------------------------------------------------------------

import "load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hasRealPostgresUrl } from "@/test-utils/postgres-env";

describe.skipIf(!hasRealPostgresUrl())("brief-repository (permit/deny)", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const ownerEmail = `phase1-brief-repo-owner-${suffix}@innovation-atlas-test.local`;
  const otherEmail = `phase1-brief-repo-other-${suffix}@innovation-atlas-test.local`;

  let ownerId: string;
  let otherUserId: string;
  const createdBriefIds: string[] = [];
  const createdTokenIds: string[] = [];

  // Each helper is re-imported lazily so the DB pool is only instantiated
  // when the DB is reachable (matches the existing atlas-smoke pattern).
  let db: typeof import("../db.pg")["pgDb"];
  let schema: typeof import("../schema.pg");
  let repo: typeof import("./brief-repository.pg")["pgBriefRepository"];
  let AccessDeniedError: typeof import("./access-scope")["AccessDeniedError"];

  beforeAll(async () => {
    ({ pgDb: db } = await import("../db.pg"));
    schema = await import("../schema.pg");
    ({ pgBriefRepository: repo } = await import("./brief-repository.pg"));
    ({ AccessDeniedError } = await import("./access-scope"));

    const [owner] = await db
      .insert(schema.UserTable)
      .values({ email: ownerEmail, name: "Brief Repo Owner" })
      .returning();
    ownerId = owner.id;
    const [other] = await db
      .insert(schema.UserTable)
      .values({ email: otherEmail, name: "Brief Repo Other" })
      .returning();
    otherUserId = other.id;
  });

  afterAll(async () => {
    if (!db || !schema) return;
    const { eq, inArray } = await import("drizzle-orm");
    if (createdTokenIds.length > 0) {
      await db
        .delete(schema.AtlasBriefShareTokensTable)
        .where(inArray(schema.AtlasBriefShareTokensTable.id, createdTokenIds));
    }
    if (createdBriefIds.length > 0) {
      await db
        .delete(schema.AtlasBriefsTable)
        .where(inArray(schema.AtlasBriefsTable.id, createdBriefIds));
    }
    if (ownerId) {
      await db.delete(schema.UserTable).where(eq(schema.UserTable.id, ownerId));
    }
    if (otherUserId) {
      await db
        .delete(schema.UserTable)
        .where(eq(schema.UserTable.id, otherUserId));
    }
  });

  // -------- createBrief ----------------------------------------------------

  it("createBrief permits user scope whose userId matches input.ownerId", async () => {
    const row = await repo.createBrief(
      { ownerId, title: "Created in test" },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(row.id);
    expect(row.ownerId).toBe(ownerId);
    expect(row.title).toBe("Created in test");
    expect(row.isEdited).toBe(false);
    expect(row.deletedAt).toBeNull();
  });

  it("createBrief denies share scope", async () => {
    await expect(
      repo.createBrief(
        { ownerId, title: "should fail" },
        { kind: "share", token: "any", briefId: "ignored" },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("createBrief denies system scope", async () => {
    await expect(
      repo.createBrief({ ownerId }, { kind: "system" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("createBrief denies a user scope trying to set a different ownerId", async () => {
    await expect(
      repo.createBrief(
        { ownerId: otherUserId, title: "spoof" },
        { kind: "user", userId: ownerId },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // -------- getBriefById ---------------------------------------------------

  it("getBriefById permits the owner under a user scope", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    const fetched = await repo.getBriefById(created.id, {
      kind: "user",
      userId: ownerId,
    });
    expect(fetched?.id).toBe(created.id);
  });

  it("getBriefById returns null for a non-existent brief under the owner's scope", async () => {
    const nonExistent = "00000000-0000-0000-0000-000000000000";
    const fetched = await repo.getBriefById(nonExistent, {
      kind: "user",
      userId: ownerId,
    });
    expect(fetched).toBeNull();
  });

  it("getBriefById denies a non-owner user scope", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    await expect(
      repo.getBriefById(created.id, { kind: "user", userId: otherUserId }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("getBriefById denies system scope", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    await expect(
      repo.getBriefById(created.id, { kind: "system" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("getBriefById permits a valid active share token for the matching brief", async () => {
    const created = await repo.createBrief(
      { ownerId, title: "Shareable" },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    const token = `tok-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
    const [tokenRow] = await db
      .insert(schema.AtlasBriefShareTokensTable)
      .values({ briefId: created.id, token })
      .returning();
    createdTokenIds.push(tokenRow.id);
    const fetched = await repo.getBriefById(created.id, {
      kind: "share",
      token,
      briefId: created.id,
    });
    expect(fetched?.id).toBe(created.id);
  });

  it("getBriefById denies a share token that has been revoked", async () => {
    const { eq } = await import("drizzle-orm");
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    const token = `tok-revoked-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
    const [tokenRow] = await db
      .insert(schema.AtlasBriefShareTokensTable)
      .values({ briefId: created.id, token })
      .returning();
    createdTokenIds.push(tokenRow.id);
    await db
      .update(schema.AtlasBriefShareTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(schema.AtlasBriefShareTokensTable.id, tokenRow.id));
    await expect(
      repo.getBriefById(created.id, {
        kind: "share",
        token,
        briefId: created.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("getBriefById denies a share token whose expires_at is in the past", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    const token = `tok-expired-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
    const [tokenRow] = await db
      .insert(schema.AtlasBriefShareTokensTable)
      .values({
        briefId: created.id,
        token,
        expiresAt: new Date(Date.now() - 60_000),
      })
      .returning();
    createdTokenIds.push(tokenRow.id);
    await expect(
      repo.getBriefById(created.id, {
        kind: "share",
        token,
        briefId: created.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("getBriefById denies a share token that is valid for a different brief", async () => {
    const briefA = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    const briefB = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(briefA.id, briefB.id);
    const token = `tok-wrong-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
    const [tokenRow] = await db
      .insert(schema.AtlasBriefShareTokensTable)
      .values({ briefId: briefA.id, token })
      .returning();
    createdTokenIds.push(tokenRow.id);
    await expect(
      repo.getBriefById(briefB.id, {
        kind: "share",
        token,
        briefId: briefB.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // -------- listBriefsForUser ---------------------------------------------

  it("listBriefsForUser permits the same user and returns owner's non-deleted briefs", async () => {
    const first = await repo.createBrief(
      { ownerId, title: "A" },
      { kind: "user", userId: ownerId },
    );
    const second = await repo.createBrief(
      { ownerId, title: "B" },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(first.id, second.id);
    const rows = await repo.listBriefsForUser(ownerId, {
      kind: "user",
      userId: ownerId,
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
  });

  it("listBriefsForUser denies a different user", async () => {
    await expect(
      repo.listBriefsForUser(ownerId, {
        kind: "user",
        userId: otherUserId,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("listBriefsForUser denies share scope", async () => {
    await expect(
      repo.listBriefsForUser(ownerId, {
        kind: "share",
        token: "anything",
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("listBriefsForUser denies system scope", async () => {
    await expect(
      repo.listBriefsForUser(ownerId, { kind: "system" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // -------- updateBrief ----------------------------------------------------

  it("updateBrief permits the owner and applies the patch", async () => {
    const created = await repo.createBrief(
      { ownerId, title: "Before" },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    const updated = await repo.updateBrief(
      created.id,
      { title: "After", isEdited: true },
      { kind: "user", userId: ownerId },
    );
    expect(updated.title).toBe("After");
    expect(updated.isEdited).toBe(true);
  });

  it("updateBrief denies a non-owner user", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    await expect(
      repo.updateBrief(
        created.id,
        { title: "nope" },
        { kind: "user", userId: otherUserId },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("updateBrief denies share scope", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    await expect(
      repo.updateBrief(
        created.id,
        { title: "nope" },
        { kind: "share", token: "t", briefId: created.id },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("updateBrief denies system scope", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    await expect(
      repo.updateBrief(created.id, { title: "nope" }, { kind: "system" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // -------- deleteBrief ----------------------------------------------------

  it("deleteBrief permits the owner and removes the row", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    await repo.deleteBrief(created.id, { kind: "user", userId: ownerId });
    const fetched = await repo.getBriefById(created.id, {
      kind: "user",
      userId: ownerId,
    });
    expect(fetched).toBeNull();
  });

  it("deleteBrief denies a non-owner user", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    await expect(
      repo.deleteBrief(created.id, { kind: "user", userId: otherUserId }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("deleteBrief denies share scope", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    await expect(
      repo.deleteBrief(created.id, {
        kind: "share",
        token: "t",
        briefId: created.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("deleteBrief denies system scope", async () => {
    const created = await repo.createBrief(
      { ownerId },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(created.id);
    await expect(
      repo.deleteBrief(created.id, { kind: "system" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
