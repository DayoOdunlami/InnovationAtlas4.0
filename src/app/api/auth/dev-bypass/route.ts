import { NextRequest, NextResponse } from "next/server";
import { auth } from "auth/server";
import pg from "pg";

// Hard block in production — this route must never be reachable outside dev
if (process.env.NODE_ENV === "production") {
  throw new Error("dev-bypass route must not be included in production builds");
}

const rawUrl = process.env.POSTGRES_URL!;
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");

function getPool() {
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

  // Create guest via better-auth signUp
  const res = await auth.api.signUpEmail({
    body: {
      email: "guest@innovation-atlas.local",
      password: "GuestLocal2026!",
      name: "Guest",
    },
  });
  if (!res?.user?.id) return null;

  // Mark verified and set role
  await pool.query(
    `UPDATE public.user SET email_verified = true, role = 'user'
     WHERE email = 'guest@innovation-atlas.local'`,
  );
  return res.user.id;
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { role, password } = (await request.json()) as {
    role: "admin" | "guest";
    password: string;
  };

  // Validate bypass password
  const expectedPassword =
    role === "admin"
      ? process.env.DEV_ADMIN_BYPASS_PASSWORD
      : process.env.DEV_GUEST_BYPASS_PASSWORD;

  if (!expectedPassword || password !== expectedPassword) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const pool = getPool();
  try {
    let userId: string | null = null;

    if (role === "admin") {
      const result = await pool.query(
        `SELECT id FROM public.user WHERE role = 'admin' ORDER BY created_at LIMIT 1`,
      );
      userId = result.rows[0]?.id ?? null;
    } else {
      userId = await ensureGuestUser(pool);
    }

    if (!userId) {
      return NextResponse.json(
        { error: "No matching user found" },
        { status: 404 },
      );
    }

    // Use better-auth admin plugin to impersonate the user
    const impersonateResponse = await auth.api.impersonateUser({
      body: { userId },
      headers: request.headers,
      asResponse: true,
    });

    // Forward the Set-Cookie headers from better-auth to the browser
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
