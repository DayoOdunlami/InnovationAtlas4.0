import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const raw = process.env.POSTGRES_URL!;
const connectionString = raw.replace(/[?&]sslmode=[^&]*/g, "");

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const targetEmail = process.argv[2];

async function main() {
  // Show all users
  const users = await pool.query(
    `SELECT id, email, role, email_verified FROM public.user ORDER BY created_at`,
  );
  console.log("Current users:", JSON.stringify(users.rows, null, 2));

  if (!targetEmail) {
    console.log("\nUsage: pnpm tsx scripts/fix-admin.ts <email>");
    console.log("Example: pnpm tsx scripts/fix-admin.ts dayo65@hotmail.com");
    await pool.end();
    return;
  }

  const fix = await pool.query(
    `UPDATE public.user
     SET role = 'admin', email_verified = true
     WHERE email = $1
     RETURNING email, role, email_verified`,
    [targetEmail],
  );

  if (fix.rows.length === 0) {
    console.log(`\nNo user found with email: ${targetEmail}`);
  } else {
    console.log(`\nPromoted to admin:`, JSON.stringify(fix.rows[0], null, 2));
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
