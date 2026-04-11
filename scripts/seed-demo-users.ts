#!/usr/bin/env tsx
/**
 * Creates two fixed demo accounts (idempotent). Uses Better Auth sign-up so
 * password hashes match what the app expects.
 *
 * Run against the SAME database your app uses (local .env or Supabase URI).
 * Vercel does not run this — you run it once from your machine with
 * POSTGRES_URL pointed at the hosted DB so local + Vercel both see the users.
 *
 *   pnpm seed:demo
 *   pnpm seed:demo -- --reset   # remove demo users + recreate (fresh passwords)
 *
 * Optional env overrides:
 *   DEMO_SEED_ADMIN_PASSWORD, DEMO_SEED_TESTER_PASSWORD
 */

import { config } from "dotenv";

config();

import { USER_ROLES } from "app-types/roles";
import { auth } from "auth/auth-instance";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  ChatMessageTable,
  ChatThreadTable,
  UserTable,
} from "lib/db/pg/schema.pg";
import { Pool } from "pg";

const DEMO_ADMIN_EMAIL = "demo-admin@innovation-atlas.local";
const DEMO_TESTER_EMAIL = "demo-tester@innovation-atlas.local";
const DEMO_EMAILS = [DEMO_ADMIN_EMAIL, DEMO_TESTER_EMAIL] as const;

const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!rawUrl) {
  console.error(
    "Missing POSTGRES_URL or DATABASE_URL. Set it to your Supabase / Postgres URI.",
  );
  process.exit(1);
}

const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 3,
});
const db = drizzle(pool);

function defaultAdminPassword() {
  return process.env.DEMO_SEED_ADMIN_PASSWORD?.trim() || "DemoAtlasAdmin!2026";
}

function defaultTesterPassword() {
  return process.env.DEMO_SEED_TESTER_PASSWORD?.trim() || "DemoAtlasTest!2026";
}

async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(UserTable)
    .where(eq(UserTable.email, email));
  return user ?? null;
}

async function deleteDemoUsers() {
  const users = await db
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(inArray(UserTable.email, [...DEMO_EMAILS]));
  const ids = users.map((u) => u.id);
  if (ids.length === 0) {
    console.log("No demo users to remove.");
    return;
  }
  for (const userId of ids) {
    const threads = await db
      .select({ id: ChatThreadTable.id })
      .from(ChatThreadTable)
      .where(eq(ChatThreadTable.userId, userId));
    const threadIds = threads.map((t) => t.id);
    if (threadIds.length > 0) {
      await db
        .delete(ChatMessageTable)
        .where(inArray(ChatMessageTable.threadId, threadIds));
    }
    await db.delete(ChatThreadTable).where(eq(ChatThreadTable.userId, userId));
  }
  await db.delete(UserTable).where(inArray(UserTable.email, [...DEMO_EMAILS]));
  console.log(`Removed ${ids.length} demo user(s).`);
}

async function upsertDemoUser(input: {
  email: string;
  password: string;
  name: string;
  role: string;
}) {
  const existing = await getUserByEmail(input.email);
  let userId: string;

  if (existing) {
    userId = existing.id;
    console.log(`  ${input.email} already exists — syncing role + verified.`);
  } else {
    const result = await auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.name,
      },
      headers: new Headers({ "content-type": "application/json" }),
    });
    if (!result.user?.id) {
      throw new Error(`signUpEmail failed for ${input.email}`);
    }
    userId = result.user.id;
    console.log(`  Created ${input.email} (${userId}).`);
  }

  await db
    .update(UserTable)
    .set({
      role: input.role,
      emailVerified: true,
    })
    .where(eq(UserTable.id, userId));
}

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset) {
    console.log("🧹 --reset: removing existing demo users…");
    await deleteDemoUsers();
  }

  const adminPw = defaultAdminPassword();
  const testerPw = defaultTesterPassword();

  console.log("🌱 Seeding demo users…");
  await upsertDemoUser({
    email: DEMO_ADMIN_EMAIL,
    password: adminPw,
    name: "Demo Admin",
    role: USER_ROLES.ADMIN,
  });
  await upsertDemoUser({
    email: DEMO_TESTER_EMAIL,
    password: testerPw,
    name: "Demo Tester",
    role: USER_ROLES.USER,
  });

  console.log(`
✅ Demo users ready (same DB = works on local + Vercel).

  Admin (you):
    Email:    ${DEMO_ADMIN_EMAIL}
    Password: ${adminPw}

  Tester (share with QA):
    Email:    ${DEMO_TESTER_EMAIL}
    Password: ${testerPw}

  Sign in at /sign-in with email + password.
  Re-run anytime (idempotent). Use --reset to delete and recreate with current env passwords.
`);
}

main()
  .catch((e) => {
    console.error("❌ seed:demo failed:", e);
    process.exit(1);
  })
  .finally(() => pool.end());
