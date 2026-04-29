#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Seed (or update) the CICERONE agent. Mirrors `seed-jarvis.ts`:
 *   * finds the first admin user
 *   * registers / re-registers the supabase-atlas MCP server (read-only)
 *   * upserts a public Agent row named "CICERONE" with the system prompt
 *     from `src/lib/ai/prompts/cicerone.ts`
 *
 * CICERONE talks to atlas_demo.* + cicerone_kb.* + atlas.* (read-only on
 * production atlas — same MCP contract JARVIS uses).
 *
 * Usage:
 *   pnpm tsx scripts/seed-cicerone.ts
 */

import "load-env";
import type { MCPServerConfig, McpServerInsert } from "app-types/mcp";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { CICERONE_SYSTEM_PROMPT } from "lib/ai/prompts/cicerone";
import { AgentTable, UserTable } from "lib/db/pg/schema.pg";
import { mcpRepository } from "lib/db/repository";
import { generateUUID } from "lib/utils";
import { Pool } from "pg";

const SUPABASE_ATLAS_MCP_SERVER_INSTRUCTIONS =
  "READ ONLY for atlas.*. SELECT queries only on atlas, atlas_demo, and cicerone_kb schemas. NEVER INSERT/UPDATE/DELETE on atlas.*. Demo writes (atlas_demo.passports, atlas_demo.passport_claims, atlas_demo.matches) go through application tools, not raw MCP SQL.";

const CICERONE_INSTRUCTIONS = {
  role: "demo-time, self-aware narrator agent — explains the platform, its relationship to D&D's Innovation Passport / Testbed Britain, and authors demo passports without touching production",
  systemPrompt: CICERONE_SYSTEM_PROMPT,
  mentions: [
    {
      type: "mcpServer" as const,
      name: "supabase-atlas",
      description:
        "Direct SQL access to Supabase atlas (READ ONLY), atlas_demo (demo writes via app tools only), and cicerone_kb schemas. Tier briefs in cicerone_kb.tier_briefs, source documents in cicerone_kb.source_documents/source_chunks, demo passports in atlas_demo.passports/passport_claims/passport_gaps/matches. " +
        SUPABASE_ATLAS_MCP_SERVER_INSTRUCTIONS,
      serverId: "supabase-atlas",
    },
  ],
};

const rawUrl = process.env.POSTGRES_URL!;
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);

async function findAdminUser() {
  const admins = await db
    .select({ id: UserTable.id, email: UserTable.email, role: UserTable.role })
    .from(UserTable)
    .where(eq(UserTable.role, "admin"))
    .orderBy(asc(UserTable.createdAt))
    .limit(1);
  return admins[0] ?? null;
}

async function ensureSupabaseAtlasMcpServer(adminUserId: string) {
  const raw =
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    (() => {
      throw new Error(
        "POSTGRES_URL or DATABASE_URL is required to register supabase-atlas MCP.",
      );
    })();
  const pooled = raw.replace(/[?&]sslmode=[^&]*/g, "");

  const config = {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", pooled],
    env: { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    serverInstructions: SUPABASE_ATLAS_MCP_SERVER_INSTRUCTIONS,
  } as unknown as MCPServerConfig;

  const existing = await mcpRepository.selectByServerName("supabase-atlas");
  const row: McpServerInsert = {
    name: "supabase-atlas",
    config,
    userId: adminUserId,
    visibility: "public",
    ...(existing ? { id: existing.id } : {}),
  };
  await mcpRepository.save(row);
  const verify = await mcpRepository.selectByServerName("supabase-atlas");
  if (!verify?.id) throw new Error("supabase-atlas MCP not persisted");
  return verify.id;
}

async function upsertCiceroneAgent(adminId: string) {
  const existing = await db
    .select({ id: AgentTable.id })
    .from(AgentTable)
    .where(eq(AgentTable.name, "CICERONE"));

  const icon = {
    type: "emoji" as const,
    value: "🗣️",
    style: { backgroundColor: "#7c3aed", color: "#FFFFFF" },
  };
  const description =
    "Demo-time, self-aware narrator agent. Explains the platform, talks about the relationship to D&D, and authors demo passports without touching production.";

  if (existing.length > 0) {
    await db
      .update(AgentTable)
      .set({
        instructions: CICERONE_INSTRUCTIONS,
        description,
        icon,
        visibility: "public",
        updatedAt: new Date(),
      })
      .where(eq(AgentTable.name, "CICERONE"));
    return { id: existing[0].id, action: "updated" as const };
  }

  const [inserted] = await db
    .insert(AgentTable)
    .values({
      id: generateUUID(),
      name: "CICERONE",
      description,
      icon,
      userId: adminId,
      instructions: CICERONE_INSTRUCTIONS,
      visibility: "public",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: AgentTable.id });
  return { id: inserted.id, action: "created" as const };
}

async function main() {
  console.log("🗣️  Seeding CICERONE agent…");
  const admin = await findAdminUser();
  if (!admin) {
    console.error(
      "❌ No admin user found. Run `pnpm seed:jarvis --bootstrap` first.",
    );
    process.exit(1);
  }
  console.log(`✅ Using admin: ${admin.email} (${admin.id})`);

  const mcpId = await ensureSupabaseAtlasMcpServer(admin.id);
  console.log(`✅ supabase-atlas MCP server: ${mcpId}`);

  const result = await upsertCiceroneAgent(admin.id);
  console.log(`✅ CICERONE agent ${result.action} (id: ${result.id})`);
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("❌ CICERONE seed failed:", err);
    await pool.end();
    process.exit(1);
  });
