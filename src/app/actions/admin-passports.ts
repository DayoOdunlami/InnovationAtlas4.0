"use server";

import { getPassportPool } from "@/lib/passport/db";
import { requireAdminPermission } from "auth/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const idSchema = z.string().uuid();

async function requireAdminPassports(): Promise<
  { ok: true } | { error: string }
> {
  try {
    await requireAdminPermission("manage passports in admin");
    return { ok: true };
  } catch {
    return { error: "Unauthorized" };
  }
}

export async function archivePassport(
  passportId: string,
): Promise<{ ok: true } | { error: string }> {
  const parsed = idSchema.safeParse(passportId);
  if (!parsed.success) return { error: "Invalid passport id" };
  const auth = await requireAdminPassports();
  if ("error" in auth) return auth;

  const pool = getPassportPool();
  try {
    const r = await pool.query(
      `UPDATE atlas.passports
       SET is_archived = true, updated_at = now()
       WHERE id = $1`,
      [parsed.data],
    );
    if (r.rowCount === 0) return { error: "Passport not found" };
  } finally {
    await pool.end();
  }
  revalidatePath("/admin/passports");
  return { ok: true };
}

export async function restorePassport(
  passportId: string,
): Promise<{ ok: true } | { error: string }> {
  const parsed = idSchema.safeParse(passportId);
  if (!parsed.success) return { error: "Invalid passport id" };
  const auth = await requireAdminPassports();
  if ("error" in auth) return auth;

  const pool = getPassportPool();
  try {
    const r = await pool.query(
      `UPDATE atlas.passports
       SET is_archived = false, updated_at = now()
       WHERE id = $1`,
      [parsed.data],
    );
    if (r.rowCount === 0) return { error: "Passport not found" };
  } finally {
    await pool.end();
  }
  revalidatePath("/admin/passports");
  return { ok: true };
}

export async function deletePassport(
  passportId: string,
): Promise<{ ok: true } | { error: string }> {
  const parsed = idSchema.safeParse(passportId);
  if (!parsed.success) return { error: "Invalid passport id" };
  const auth = await requireAdminPassports();
  if ("error" in auth) return auth;

  const pool = getPassportPool();
  try {
    const claimRes = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM atlas.passport_claims WHERE passport_id = $1`,
      [parsed.data],
    );
    const claimCount = Number(claimRes.rows[0]?.n ?? "1");
    if (claimCount > 0) {
      return { error: "Cannot delete passport with claims" };
    }

    const arch = await pool.query<{ is_archived: boolean | null }>(
      `SELECT is_archived FROM atlas.passports WHERE id = $1`,
      [parsed.data],
    );
    if (arch.rows.length === 0) return { error: "Passport not found" };
    if (arch.rows[0].is_archived !== true) {
      return { error: "Only archived passports can be deleted from this UI" };
    }

    await pool.query(`DELETE FROM atlas.passports WHERE id = $1`, [
      parsed.data,
    ]);
  } finally {
    await pool.end();
  }
  revalidatePath("/admin/passports");
  return { ok: true };
}
