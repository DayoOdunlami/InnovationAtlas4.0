import { NextRequest, NextResponse } from "next/server";
import { auth } from "auth/server";
import pg from "pg";
import {
  getDevBypassPassword,
  isDevTestLoginEnabled,
} from "lib/auth/dev-test-login";

const BOOTSTRAP_ADMIN_EMAIL = "dev-bypass-bootstrap@innovation-atlas.local";

function getPool() {
  const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error(
      "POSTGRES_URL or DATABASE_URL is required for dev-bypass (development only)",
    );
  }
  const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
  return new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });
}

async function ensureGuestUser(pool: pg.Pool): Promise<string | null> {
  const existing = await pool.query(
    `SELECT id FROM public.user WHERE email = 'guest@innovation-atlas.local' LIMIT 1`,
  );
  if (existing.rows.length > 0) return existing.rows[0].id as string;

  const res = await auth.api.signUpEmail({
    body: {
      email: "guest@innovation-atlas.local",
      password: "GuestLocal2026!",
      name: "Guest",
    },
  });
  if (!res?.user?.id) return null;

  await pool.query(
    `UPDATE public.user SET email_verified = true, role = 'user'
     WHERE email = 'guest@innovation-atlas.local'`,
  );
  return res.user.id;
}

/**
 * First matching admin, or create a bootstrap admin via sign-up when none exist.
 */
async function ensureAdminUserForBypass(pool: pg.Pool): Promise<string | null> {
  const admins = await pool.query<{ id: string }>(
    `SELECT id FROM public.user WHERE role = 'admin' ORDER BY created_at LIMIT 1`,
  );
  if (admins.rows[0]) return admins.rows[0].id;

  const bootstrapPw =
    process.env.DEV_BOOTSTRAP_ADMIN_PASSWORD?.trim() ||
    "AtlasBootstrapAdmin!2026";

  const existingBoot = await pool.query<{ id: string }>(
    `SELECT id FROM public.user WHERE email = $1`,
    [BOOTSTRAP_ADMIN_EMAIL],
  );
  if (existingBoot.rows[0]) {
    await pool.query(
      `UPDATE public.user SET role = 'admin', email_verified = true WHERE id = $1`,
      [existingBoot.rows[0].id],
    );
    return existingBoot.rows[0].id;
  }

  const res = await auth.api.signUpEmail({
    body: {
      email: BOOTSTRAP_ADMIN_EMAIL,
      password: bootstrapPw,
      name: "Bootstrap Admin",
    },
  });
  if (!res?.user?.id) return null;

  await pool.query(
    `UPDATE public.user SET role = 'admin', email_verified = true WHERE id = $1`,
    [res.user.id],
  );
  return res.user.id;
}

export async function POST(request: NextRequest) {
  if (!isDevTestLoginEnabled()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { role, password } = (await request.json()) as {
    role: "admin" | "guest";
    password: string;
  };

  const expected = getDevBypassPassword(role);
  if (password !== expected) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const pool = getPool();
  try {
    const userId: string | null =
      role === "admin"
        ? await ensureAdminUserForBypass(pool)
        : await ensureGuestUser(pool);

    if (!userId) {
      return NextResponse.json(
        {
          error:
            role === "admin"
              ? "Could not create or find an admin user. Ensure email sign-up is enabled (DISABLE_EMAIL_SIGN_UP unset) and BETTER_AUTH_URL matches this site."
              : "Could not create guest user. Ensure email sign-up is enabled.",
        },
        { status: 404 },
      );
    }

    const impersonateResponse = await auth.api.impersonateUser({
      body: { userId },
      headers: request.headers,
      asResponse: true,
    });

    const response = NextResponse.json({ ok: true });
    impersonateResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        response.headers.append("set-cookie", value);
      }
    });
    return response;
  } finally {
    await pool.end();
  }
}
