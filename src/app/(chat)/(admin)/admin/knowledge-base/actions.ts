"use server";

import { requireAdminPermission } from "auth/permissions";
import { getSession } from "@/lib/auth/auth-instance";
import { pgKnowledgeRepository } from "@/lib/db/pg/repositories/knowledge-repository.pg";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const systemScope = { kind: "system" } as const;

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  sourceType: z.enum([
    "white_paper",
    "policy_doc",
    "govt_report",
    "industry_report",
    "guidance_doc",
    "web_article",
    "internal",
    "doctrine",
  ]),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  publisher: z.string().max(200).optional().or(z.literal("")),
  author: z.string().max(200).optional().or(z.literal("")),
  publishedOn: z.string().optional().or(z.literal("")),
  modes: z.array(
    z.enum(["rail", "aviation", "maritime", "hit", "data_digital"]),
  ),
  themes: z.array(
    z.enum([
      "autonomy",
      "decarbonisation",
      "people_experience",
      "hubs_clusters",
      "planning_operation",
      "industry",
      "data_infrastructure",
      "assurance_trust",
      "interoperability",
      "testbeds_innovation",
      "governance_stewardship",
    ]),
  ),
  tier: z.enum(["primary", "secondary", "tertiary"]).default("secondary"),
  summary: z.string().max(2000).optional().or(z.literal("")),
});

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Create document
// ---------------------------------------------------------------------------

export async function createKnowledgeDocumentAction(
  raw: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdminPermission();
  } catch {
    return { success: false, error: "Not authorised" };
  }

  const parsed = CreateDocumentSchema.safeParse({
    title: raw.get("title"),
    sourceType: raw.get("sourceType"),
    sourceUrl: raw.get("sourceUrl") || undefined,
    publisher: raw.get("publisher") || undefined,
    author: raw.get("author") || undefined,
    publishedOn: raw.get("publishedOn") || undefined,
    modes: raw.getAll("modes"),
    themes: raw.getAll("themes"),
    tier: raw.get("tier") || "secondary",
    summary: raw.get("summary") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const d = parsed.data;

  try {
    const doc = await pgKnowledgeRepository.createDocument(
      {
        title: d.title,
        sourceType: d.sourceType,
        sourceUrl: d.sourceUrl || null,
        storageKey: null,
        publisher: d.publisher || null,
        author: d.author || null,
        publishedOn: d.publishedOn || null,
        modes: d.modes,
        themes: d.themes,
        tier: d.tier,
        summary: d.summary || null,
        addedBy: null,
      },
      systemScope,
    );
    revalidatePath("/admin/knowledge-base");
    return { success: true, data: { id: doc.id } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Approve document
// ---------------------------------------------------------------------------

export async function approveKnowledgeDocumentAction(
  documentId: string,
): Promise<ActionResult> {
  let adminId: string;
  try {
    await requireAdminPermission();
    const session = await getSession();
    adminId = session?.user?.id ?? "unknown";
  } catch {
    return { success: false, error: "Not authorised" };
  }

  try {
    await pgKnowledgeRepository.approveDocument(
      documentId,
      adminId,
      systemScope,
    );
    revalidatePath("/admin/knowledge-base");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Retire document
// ---------------------------------------------------------------------------

export async function retireKnowledgeDocumentAction(
  documentId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    await requireAdminPermission();
  } catch {
    return { success: false, error: "Not authorised" };
  }

  if (!reason.trim()) {
    return { success: false, error: "Retirement reason is required" };
  }

  try {
    await pgKnowledgeRepository.retireDocument(documentId, reason, systemScope);
    revalidatePath("/admin/knowledge-base");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
