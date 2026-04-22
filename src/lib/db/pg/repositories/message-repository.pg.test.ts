// ---------------------------------------------------------------------------
// Permit/deny tests for the message repository (Phase 1, Brief-First
// Rebuild).
//
// Shares the atlas-smoke's skipIf-guarded Postgres pattern. Each test
// creates ephemeral users, briefs, and optional share tokens tagged with
// a run-specific suffix and cleans up in afterAll.
// ---------------------------------------------------------------------------

import "load-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const smokesReady = () => Boolean(process.env.POSTGRES_URL);

describe.skipIf(!smokesReady())("message-repository (permit/deny)", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const ownerEmail = `phase1-msg-repo-owner-${suffix}@innovation-atlas-test.local`;
  const otherEmail = `phase1-msg-repo-other-${suffix}@innovation-atlas-test.local`;

  let ownerId: string;
  let otherUserId: string;
  const createdBriefIds: string[] = [];
  const createdTokenIds: string[] = [];

  let db: typeof import("../db.pg")["pgDb"];
  let schema: typeof import("../schema.pg");
  let briefRepo: typeof import("./brief-repository.pg")["pgBriefRepository"];
  let messageRepo: typeof import("./message-repository.pg")["pgMessageRepository"];
  let AccessDeniedError: typeof import("./access-scope")["AccessDeniedError"];

  beforeAll(async () => {
    ({ pgDb: db } = await import("../db.pg"));
    schema = await import("../schema.pg");
    ({ pgBriefRepository: briefRepo } = await import("./brief-repository.pg"));
    ({ pgMessageRepository: messageRepo } = await import(
      "./message-repository.pg"
    ));
    ({ AccessDeniedError } = await import("./access-scope"));

    const [owner] = await db
      .insert(schema.UserTable)
      .values({ email: ownerEmail, name: "Message Repo Owner" })
      .returning();
    ownerId = owner.id;
    const [other] = await db
      .insert(schema.UserTable)
      .values({ email: otherEmail, name: "Message Repo Other" })
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
      await db
        .delete(schema.UserTable)
        .where(eq(schema.UserTable.id, ownerId));
    }
    if (otherUserId) {
      await db
        .delete(schema.UserTable)
        .where(eq(schema.UserTable.id, otherUserId));
    }
  });

  async function newBrief() {
    const brief = await briefRepo.createBrief(
      { ownerId, title: `msg-repo-test-${Math.random().toString(36).slice(2, 8)}` },
      { kind: "user", userId: ownerId },
    );
    createdBriefIds.push(brief.id);
    return brief;
  }

  async function newShareToken(briefId: string, opts?: { revoked?: boolean; expiresInMs?: number }) {
    const token = `msg-tok-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
    const [tokenRow] = await db
      .insert(schema.AtlasBriefShareTokensTable)
      .values({
        briefId,
        token,
        ...(opts?.expiresInMs !== undefined
          ? { expiresAt: new Date(Date.now() + opts.expiresInMs) }
          : {}),
        ...(opts?.revoked ? { revokedAt: new Date() } : {}),
      })
      .returning();
    createdTokenIds.push(tokenRow.id);
    return token;
  }

  // -------- appendMessage --------------------------------------------------

  it("appendMessage permits the owner under a user scope", async () => {
    const brief = await newBrief();
    const msg = await messageRepo.appendMessage(
      brief.id,
      { role: "user", contentJson: { text: "hello" } },
      { kind: "user", userId: ownerId },
    );
    expect(msg.briefId).toBe(brief.id);
    expect(msg.role).toBe("user");
    expect(msg.transcript).toBe(false);
  });

  it("appendMessage denies a non-owner user scope", async () => {
    const brief = await newBrief();
    await expect(
      messageRepo.appendMessage(
        brief.id,
        { role: "user", contentJson: { text: "nope" } },
        { kind: "user", userId: otherUserId },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("appendMessage denies share scope", async () => {
    const brief = await newBrief();
    const token = await newShareToken(brief.id);
    await expect(
      messageRepo.appendMessage(
        brief.id,
        { role: "user", contentJson: { text: "nope" } },
        { kind: "share", token, briefId: brief.id },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("appendMessage denies system scope", async () => {
    const brief = await newBrief();
    await expect(
      messageRepo.appendMessage(
        brief.id,
        { role: "system", contentJson: { text: "nope" } },
        { kind: "system" },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("appendMessage denies a user scope targeting a non-existent brief", async () => {
    const nonExistent = "00000000-0000-0000-0000-000000000000";
    await expect(
      messageRepo.appendMessage(
        nonExistent,
        { role: "user", contentJson: { text: "ghost" } },
        { kind: "user", userId: ownerId },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // -------- listMessagesByBriefId -----------------------------------------

  it("listMessagesByBriefId permits the owner and returns messages in created_at order", async () => {
    const brief = await newBrief();
    const m1 = await messageRepo.appendMessage(
      brief.id,
      { role: "user", contentJson: { text: "first" } },
      { kind: "user", userId: ownerId },
    );
    const m2 = await messageRepo.appendMessage(
      brief.id,
      { role: "assistant", contentJson: { text: "second" } },
      { kind: "user", userId: ownerId },
    );
    const rows = await messageRepo.listMessagesByBriefId(brief.id, {
      kind: "user",
      userId: ownerId,
    });
    expect(rows.map((r) => r.id)).toEqual([m1.id, m2.id]);
  });

  it("listMessagesByBriefId denies a non-owner user scope", async () => {
    const brief = await newBrief();
    await expect(
      messageRepo.listMessagesByBriefId(brief.id, {
        kind: "user",
        userId: otherUserId,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("listMessagesByBriefId permits a valid active share token", async () => {
    const brief = await newBrief();
    await messageRepo.appendMessage(
      brief.id,
      { role: "user", contentJson: { text: "visible to share reader" } },
      { kind: "user", userId: ownerId },
    );
    const token = await newShareToken(brief.id);
    const rows = await messageRepo.listMessagesByBriefId(brief.id, {
      kind: "share",
      token,
      briefId: brief.id,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].briefId).toBe(brief.id);
  });

  it("listMessagesByBriefId denies a revoked share token", async () => {
    const brief = await newBrief();
    const token = await newShareToken(brief.id, { revoked: true });
    await expect(
      messageRepo.listMessagesByBriefId(brief.id, {
        kind: "share",
        token,
        briefId: brief.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("listMessagesByBriefId denies an expired share token", async () => {
    const brief = await newBrief();
    const token = await newShareToken(brief.id, { expiresInMs: -60_000 });
    await expect(
      messageRepo.listMessagesByBriefId(brief.id, {
        kind: "share",
        token,
        briefId: brief.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("listMessagesByBriefId denies a share token that is for a different brief", async () => {
    const briefA = await newBrief();
    const briefB = await newBrief();
    const token = await newShareToken(briefA.id);
    await expect(
      messageRepo.listMessagesByBriefId(briefB.id, {
        kind: "share",
        token,
        briefId: briefB.id,
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("listMessagesByBriefId denies system scope", async () => {
    const brief = await newBrief();
    await expect(
      messageRepo.listMessagesByBriefId(brief.id, { kind: "system" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("listMessagesByBriefId returns an empty array for a non-existent brief under the owner's scope", async () => {
    const nonExistent = "00000000-0000-0000-0000-000000000000";
    const rows = await messageRepo.listMessagesByBriefId(nonExistent, {
      kind: "user",
      userId: ownerId,
    });
    expect(rows).toEqual([]);
  });
});
