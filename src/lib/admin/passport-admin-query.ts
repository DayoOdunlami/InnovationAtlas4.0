import "server-only";

import { getPassportPool } from "@/lib/passport/db";

export type AdminPassportSummaryRow = {
  id: string;
  title: string | null;
  project_name: string | null;
  is_archived: boolean | null;
  created_at: string;
  updated_at: string;
  claim_count: number;
  match_count: number;
};

const LIST_SQL = `
  SELECT
    p.id,
    p.title,
    p.project_name,
    p.is_archived,
    p.created_at::text AS created_at,
    p.updated_at::text AS updated_at,
    COUNT(DISTINCT pc.id)::int AS claim_count,
    COUNT(DISTINCT m.id)::int AS match_count
  FROM atlas.passports p
  LEFT JOIN atlas.passport_claims pc ON pc.passport_id = p.id
  LEFT JOIN atlas.matches m ON m.passport_id = p.id
  GROUP BY p.id
  ORDER BY COALESCE(p.is_archived, false) ASC, p.updated_at DESC
`;

/** Passports that share the same trimmed title or project_name (non-empty). */
export function duplicatePassportIds(
  rows: AdminPassportSummaryRow[],
): Set<string> {
  const dup = new Set<string>();
  const bump = (map: Map<string, string[]>, key: string, id: string) => {
    const cur = map.get(key);
    if (cur) cur.push(id);
    else map.set(key, [id]);
  };
  const byTitle = new Map<string, string[]>();
  const byProject = new Map<string, string[]>();
  for (const r of rows) {
    const t = (r.title ?? "").trim();
    if (t) bump(byTitle, t, r.id);
    const pn = (r.project_name ?? "").trim();
    if (pn) bump(byProject, pn, r.id);
  }
  for (const ids of byTitle.values()) {
    if (ids.length > 1) for (const id of ids) dup.add(id);
  }
  for (const ids of byProject.values()) {
    if (ids.length > 1) for (const id of ids) dup.add(id);
  }
  return dup;
}

export async function loadPassportsForAdmin(): Promise<
  AdminPassportSummaryRow[]
> {
  const pool = getPassportPool();
  try {
    const result = await pool.query<AdminPassportSummaryRow>(LIST_SQL);
    return result.rows;
  } finally {
    await pool.end();
  }
}
