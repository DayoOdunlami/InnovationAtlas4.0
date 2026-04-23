// ---------------------------------------------------------------------------
// Permit/deny tests for the block repository (Phase 2a.0, Brief-First
// Rebuild).
//
// Shares the atlas-smoke's skipIf-guarded Postgres pattern with
// brief-repository.pg.test.ts. Every method has both a permit and a
// deny path — a missing deny test is a CI failure per Testing Strategy
// §5.
// ---------------------------------------------------------------------------

import "load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyBetween } from "fractional-indexing";

import { hasRealPostgresUrl } from "@/test-utils/postgres-env";

describe.skipIf(!hasRealPostgresUrl())("block-repository (permit/deny)", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const ownerEmail = `phase2a0-block-repo-owner-${suffix}@innovation-atlas-test.local`;
  const otherEmail = `phase2a0-block-repo-other-${suffix}@innovation-atlas-test.local`;

  let ownerId: string;
  let otherUserId: string;
  const createdBriefIds: string[] = [];
  const createdTokenIds: string[] = [];

  let db: typeof import("../db.pg")["pgDb"];
  let schema: typeof import("../schema.pg");
  let briefRepo: typeof import("./brief-repository.pg")["pgBriefRepository"];
  let blockRepo: typeof import("./block-repository.pg")["pgBlockRepository"];
  let AccessDeniedError: typeof import("./access-scope")["AccessDeniedError"];

  beforeAll(async () => {
    ({ pgDb: db } = await import("../db.pg"));
    schema = await import("../schema.pg");
    ({ pgBriefRepository: briefRepo } = await import("./brief-repository.pg"));
    ({ pgBlockRepository: blockRepo } = await import("./block-repository.pg"));
    ({ AccessDeniedError } = await import("./access-scope"));

    const [owner] = await db
      .insert(schema.UserTable)
      .values({ email: ownerEmail, name: "Block Repo Owner" })
      .returning();
    ownerId = owner.id;
    const [other] = await db
      .insert(schema.UserTable)
      .values({ email: otherEmail, name: "Block Repo Other" })
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
      // atlas.blocks cascades on brief delete; delete briefs removes blocks.
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

  async function newBrief() {
    const brief = await briefRepo.createBrief(
      {
        ownerId,
        title: `block-test-${Math.random().toString(36).slice(2, 8)}`,
      },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(brief.id);
    return brief;
  }

  async function newShareToken(briefId: string) {
    const token = `blk-tok-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
    const [tokenRow] = await db
      .insert(schema.AtlasBriefShareTokensTable)
      .values({ briefId, token })
      .returning();
    createdTokenIds.push(tokenRow.id);
    return token;
  }

  // -------- create ---------------------------------------------------------

  it("create permits owner user scope and returns a 26-char ULID id", async () => {
    const brief = await newBrief();
    const row = await blockRepo.create(
      {
        briefId: brief.id,
        type: "heading",
        contentJson: { level: 1, text: "Hello" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    expect(row.briefId).toBe(brief.id);
    expect(row.type).toBe("heading");
    expect(row.source).toBe("user");
    expect(row.id).toHaveLength(26);
    expect(typeof row.position).toBe("string");
    expect(row.position.length).toBeGreaterThan(0);
  });

  it("create appends fractional-indexing position after the last existing block", async () => {
    const brief = await newBrief();
    const first = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "first" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    const second = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "second" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    expect(second.position > first.position).toBe(true);
  });

  it("create denies a non-owner user scope", async () => {
    const brief = await newBrief();
    await expect(
      blockRepo.create(
        {
          briefId: brief.id,
          type: "paragraph",
          contentJson: { text: "nope" },
          source: "user",
        },
        { kind: "user", userId: otherUserId },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("create denies share scope (share is read-only in v1)", async () => {
    const brief = await newBrief();
    const token = await newShareToken(brief.id);
    await expect(
      blockRepo.create(
        {
          briefId: brief.id,
          type: "paragraph",
          contentJson: { text: "nope" },
          source: "user",
        },
        { kind: "share", token, briefId: brief.id },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("create denies system scope", async () => {
    const brief = await newBrief();
    await expect(
      blockRepo.create(
        {
          briefId: brief.id,
          type: "paragraph",
          contentJson: { text: "nope" },
          source: "agent",
        },
        { kind: "system" },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // -------- getById --------------------------------------------------------

  it("getById permits the owner under a user scope", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "heading",
        contentJson: { level: 2, text: "Howdy" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    const fetched = await blockRepo.getById(created.id, {
      kind: "user",
      userId: ownerId,
    });
    expect(fetched?.id).toBe(created.id);
  });

  it("getById permits an active share-token scope on the parent brief", async () => {
    const brief = await newBrief();
    const token = await newShareToken(brief.id);
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "shareable" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    const fetched = await blockRepo.getById(created.id, {
      kind: "share",
      token,
      briefId: brief.id,
    });
    expect(fetched?.id).toBe(created.id);
  });

  it("getById denies a non-owner user scope", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "secret" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.getById(created.id, { kind: "user", userId: otherUserId }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("getById denies system scope", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "x" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.getById(created.id, { kind: "system" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("getById returns null for a missing id under owner scope", async () => {
    const missing = "01HXNOTAREALULIDSOTESTME01";
    const fetched = await blockRepo.getById(missing, {
      kind: "user",
      userId: ownerId,
    });
    expect(fetched).toBeNull();
  });

  // -------- listByBrief ----------------------------------------------------

  it("listByBrief permits the owner and returns blocks ordered by position", async () => {
    const brief = await newBrief();
    const middleKey = generateKeyBetween(null, null);
    const leftKey = generateKeyBetween(null, middleKey);
    const rightKey = generateKeyBetween(middleKey, null);
    await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        position: rightKey,
        contentJson: { text: "R" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        position: middleKey,
        contentJson: { text: "M" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        position: leftKey,
        contentJson: { text: "L" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    const rows = await blockRepo.listByBrief(brief.id, {
      kind: "user",
      userId: ownerId,
    });
    const labels = rows.map((r) => (r.contentJson as { text: string }).text);
    expect(labels).toEqual(["L", "M", "R"]);
  });

  it("listByBrief permits an active share-token scope", async () => {
    const brief = await newBrief();
    const token = await newShareToken(brief.id);
    await blockRepo.create(
      {
        briefId: brief.id,
        type: "heading",
        contentJson: { level: 1, text: "Title" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    const rows = await blockRepo.listByBrief(brief.id, {
      kind: "share",
      token,
      briefId: brief.id,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("heading");
  });

  it("listByBrief denies a non-owner user scope", async () => {
    const brief = await newBrief();
    await expect(
      blockRepo.listByBrief(brief.id, {
        kind: "user",
        userId: otherUserId,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("listByBrief denies system scope", async () => {
    const brief = await newBrief();
    await expect(
      blockRepo.listByBrief(brief.id, { kind: "system" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("listByBrief denies an invalid share token", async () => {
    const brief = await newBrief();
    await expect(
      blockRepo.listByBrief(brief.id, {
        kind: "share",
        token: "not-a-real-token",
        briefId: brief.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // -------- update ---------------------------------------------------------

  it("update permits the owner and applies the contentJson patch", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "before" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    const updated = await blockRepo.update(
      created.id,
      { contentJson: { text: "after" } },
      { kind: "user", userId: ownerId },
    );
    expect((updated.contentJson as { text: string }).text).toBe("after");
  });

  it("update denies a non-owner user scope", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "x" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.update(
        created.id,
        { contentJson: { text: "hacked" } },
        { kind: "user", userId: otherUserId },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("update denies share scope", async () => {
    const brief = await newBrief();
    const token = await newShareToken(brief.id);
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "x" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.update(
        created.id,
        { contentJson: { text: "hacked" } },
        { kind: "share", token, briefId: brief.id },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("update denies system scope", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "x" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.update(
        created.id,
        { contentJson: { text: "hacked" } },
        { kind: "system" },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // -------- delete ---------------------------------------------------------

  it("delete permits the owner and removes the row", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "gone" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await blockRepo.delete(created.id, { kind: "user", userId: ownerId });
    const fetched = await blockRepo.getById(created.id, {
      kind: "user",
      userId: ownerId,
    });
    expect(fetched).toBeNull();
  });

  it("delete denies a non-owner user scope", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "x" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.delete(created.id, { kind: "user", userId: otherUserId }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("delete denies share scope", async () => {
    const brief = await newBrief();
    const token = await newShareToken(brief.id);
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "x" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.delete(created.id, {
        kind: "share",
        token,
        briefId: brief.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("delete denies system scope", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "x" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.delete(created.id, { kind: "system" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // -------- move -----------------------------------------------------------

  it("move permits the owner and reorders by updating the position key", async () => {
    const brief = await newBrief();
    const a = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "A" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    const b = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "B" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    // Move B before A.
    const newPos = generateKeyBetween(null, a.position);
    const moved = await blockRepo.move(b.id, newPos, {
      kind: "user",
      userId: ownerId,
    });
    expect(moved.position).toBe(newPos);
    const rows = await blockRepo.listByBrief(brief.id, {
      kind: "user",
      userId: ownerId,
    });
    const labels = rows.map((r) => (r.contentJson as { text: string }).text);
    expect(labels).toEqual(["B", "A"]);
  });

  it("move denies a non-owner user scope", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "x" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.move(created.id, generateKeyBetween(null, null), {
        kind: "user",
        userId: otherUserId,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("move denies share scope", async () => {
    const brief = await newBrief();
    const token = await newShareToken(brief.id);
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "x" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.move(created.id, generateKeyBetween(null, null), {
        kind: "share",
        token,
        briefId: brief.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("move denies system scope", async () => {
    const brief = await newBrief();
    const created = await blockRepo.create(
      {
        briefId: brief.id,
        type: "paragraph",
        contentJson: { text: "x" },
        source: "user",
      },
      { kind: "user", userId: ownerId },
    );
    await expect(
      blockRepo.move(created.id, generateKeyBetween(null, null), {
        kind: "system",
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
