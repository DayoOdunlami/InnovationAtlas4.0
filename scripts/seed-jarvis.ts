#!/usr/bin/env tsx
/**
 * Seed the JARVIS agent for Innovation Atlas.
 *
 * Finds the first admin user in the database and creates (or updates) a
 * public JARVIS agent owned by that user.
 *
 * If no admin user exists yet, pass --bootstrap to create a seed admin
 * account, then JARVIS, in one step (no need to open the app first):
 *
 *   pnpm seed:jarvis --bootstrap --email admin@example.com --password S3cret!
 *
 * Otherwise (after signing up via the app UI):
 *   pnpm seed:jarvis
 */

import "load-env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { AgentTable, UserTable } from "lib/db/pg/schema.pg";
import { eq, asc } from "drizzle-orm";
import { generateUUID } from "lib/utils";
import { auth } from "auth/auth-instance";

// ────────────────────────────────────────────────────────────────────────────
// JARVIS system prompt — from master handoff spec Section 6
// ────────────────────────────────────────────────────────────────────────────
const JARVIS_SYSTEM_PROMPT = `You are JARVIS, the strategic intelligence assistant for Connected Places Catapult's (CPC) Transport Business Unit. You help innovators find cross-sector funding matches, understand what evidence they have, and identify what's missing.

## YOUR PRIMARY TASK

When a user uploads a document or describes their evidence:

1. EXTRACT structured claims. For each claim:
   - claim_role: 'asserts' / 'requires' / 'constrains'
   - claim_domain: 'capability' / 'evidence' / 'certification' / 'performance' / 'regulatory'
   - claim_text: plain language
   - conditions: limitations ("only valid under 40mph", "GPS-denied environments only")
   - confidence_tier: ALWAYS 'ai_inferred' — never 'verified'
   - confidence_reason: why you are uncertain
   - source_excerpt: exact sentence you extracted this from

2. MATCH against atlas.projects via supabase-atlas MCP. Find cross-sector matches.

3. SURFACE top 3-5 matches: title, funder, funding amount, why it matches, confidence score.

4. GAP ANALYSIS: what's missing, conditions mismatches, what would close it, economic estimate.

5. DRAFT PITCH on request: 3-paragraph Statement of Intent.

## CONFIDENCE CEILING — NON-NEGOTIABLE
You CANNOT set confidence_tier = 'verified'. Only the user's Verify action can do that. If asked, say: "Only you can verify this — click Verify on the claim."

## DATABASE ACCESS
Use supabase-atlas MCP. Query atlas.* only. Never hive.* or public.*.
Keyword search: SELECT id, title, lead_funder, funding_amount FROM atlas.projects WHERE title ILIKE '%keyword%' OR abstract ILIKE '%keyword%' LIMIT 20;

## VOICE BEHAVIOUR
For voice responses: lead with key finding, keep it concise, offer to expand in text. Do not read long lists aloud.

## CPC TAXONOMY (lens, not classification)
Modes: Rail, Aviation, Maritime, Highways & Integrated Transport
Themes: Autonomy, Decarbonisation, People Experience, Hubs & Clusters, Planning & Operation, Industry

## EVIDENCE RULES
- Never fabricate IDs, amounts, or funder names
- Always cite which query returned which result
- Flag conditions mismatches as gaps, not failures
- Economic framing: "This match opens eligibility for £X"`;

// ────────────────────────────────────────────────────────────────────────────
// JARVIS agent instructions — supabase-atlas attached as mcpServer mention
// serverId for file-based MCP = the server name itself
// ────────────────────────────────────────────────────────────────────────────
const JARVIS_INSTRUCTIONS = {
  role: "strategic intelligence assistant for cross-sector transport innovation",
  systemPrompt: JARVIS_SYSTEM_PROMPT,
  mentions: [
    {
      type: "mcpServer" as const,
      name: "supabase-atlas",
      description:
        "Direct SQL access to Supabase atlas schema (projects, lens_categories, passports, claims, matches). NEVER touch hive.* or public.*.",
      serverId: "supabase-atlas",
    },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// DB connection — same SSL fix as db.pg.ts
// ────────────────────────────────────────────────────────────────────────────
const rawUrl = process.env.POSTGRES_URL!;
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);

// Parse CLI args for optional bootstrap mode
const args = process.argv.slice(2);
const bootstrap = args.includes("--bootstrap");
const emailArg =
  args[args.indexOf("--email") + 1] ?? "admin@innovation-atlas.local";
const passwordArg = args[args.indexOf("--password") + 1] ?? "ChangeMe123!";

async function ensureAdminUser(): Promise<{
  id: string;
  email: string;
  role: string;
}> {
  const admins = await db
    .select({ id: UserTable.id, email: UserTable.email, role: UserTable.role })
    .from(UserTable)
    .where(eq(UserTable.role, "admin"))
    .orderBy(asc(UserTable.createdAt))
    .limit(1);

  if (admins.length > 0) return admins[0];

  if (!bootstrap) {
    console.error(`
❌ No admin user found.

Options:
  1. Open the app (pnpm dev), sign up, then re-run: pnpm seed:jarvis
  2. Bootstrap without opening the app:
       pnpm seed:jarvis --bootstrap --email you@example.com --password S3cret!
`);
    process.exit(1);
  }

  console.log(`🔑 --bootstrap: creating admin user ${emailArg}…`);
  const result = await auth.api.signUpEmail({
    body: { email: emailArg, password: passwordArg, name: "Atlas Admin" },
    headers: new Headers({ "content-type": "application/json" }),
  });
  if (!result?.user) throw new Error("Bootstrap sign-up failed");

  // First user is already set to admin by the auth hook; confirm
  const [newAdmin] = await db
    .select({ id: UserTable.id, email: UserTable.email, role: UserTable.role })
    .from(UserTable)
    .where(eq(UserTable.id, result.user.id));

  console.log(
    `✅ Admin created: ${newAdmin.email} (role: ${newAdmin.role}) — CHANGE THIS PASSWORD before production`,
  );
  return newAdmin;
}

async function seedJarvis() {
  console.log("🤖 Seeding JARVIS agent for Innovation Atlas…");

  const admin = await ensureAdminUser();
  console.log(`✅ Using admin: ${admin.email} (${admin.id})`);

  // Check if JARVIS already exists for this admin
  const existing = await db
    .select({ id: AgentTable.id })
    .from(AgentTable)
    .where(eq(AgentTable.name, "JARVIS"));

  if (existing.length > 0) {
    // Update the existing JARVIS agent
    await db
      .update(AgentTable)
      .set({
        instructions: JARVIS_INSTRUCTIONS,
        description:
          "Innovation Atlas strategic intelligence assistant. Upload evidence → extract claims → match against GtR corpus → surface cross-sector funding → gap analysis → draft pitch.",
        visibility: "public",
        updatedAt: new Date(),
      })
      .where(eq(AgentTable.name, "JARVIS"));

    console.log(`✅ Updated JARVIS agent (id: ${existing[0].id})`);
  } else {
    // Insert new JARVIS agent
    const [inserted] = await db
      .insert(AgentTable)
      .values({
        id: generateUUID(),
        name: "JARVIS",
        description:
          "Innovation Atlas strategic intelligence assistant. Upload evidence → extract claims → match against GtR corpus → surface cross-sector funding → gap analysis → draft pitch.",
        icon: { type: "emoji", value: "🤖" },
        userId: admin.id,
        instructions: JARVIS_INSTRUCTIONS,
        visibility: "public",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: AgentTable.id });

    console.log(`✅ Created JARVIS agent (id: ${inserted.id})`);
  }

  console.log(`
📋 JARVIS agent is ready.

  • Visibility: public (all users can see and use it)
  • Model to select in chat: anthropic / sonnet-4-6 (claude-sonnet-4-6)
  • MCP attached: supabase-atlas → atlas.projects (622 rows), atlas.lens_categories (14 rows)
  • To switch from file-based MCP to DB-based: add supabase-atlas via the app UI,
    then set FILE_BASED_MCP_CONFIG=false in .env
`);
}

seedJarvis()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("❌ JARVIS seed failed:", err);
    await pool.end();
    process.exit(1);
  });
