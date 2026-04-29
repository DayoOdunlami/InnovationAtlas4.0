// @ts-nocheck
// ---------------------------------------------------------------------------
// CICERONE tool kit — Stage 3 (registration) + Stage 5 (cite + handoff).
//
// All tools are tool-invoked from the chat surface. They obey the same
// "always return a structured value" contract as surfaceKnowledgeBase
// (see docs/chat-tool-safety.md): an uncaught throw would poison the
// OpenAI Responses API tool-call history.
//
// Tools:
//   * cicerone_kb_search     — Tier briefs + source chunks search
//   * cicerone_testbed_search — Testbed inventory (deferred in build; surfaces deferral honestly)
//   * cite_source            — Builds structured citation (3 types)
//   * generate_demo_passport — Authors a demo passport + claims
//   * run_demo_matching      — Cosine match against atlas.live_calls + atlas.projects
//   * suggest_handoff        — Structured payload for JARVIS / ATLAS handoff
//   * render_canonical_diagram — SVG asset reference (placeholder when missing)
//   * render_custom_diagram   — Inline Mermaid generator
// ---------------------------------------------------------------------------

import { tool as createTool } from "ai";
import { z } from "zod";
import {
  searchTierBriefs,
  searchCiceroneChunks,
  listCiceroneDocuments,
  searchTestbeds,
  insertDemoPassport,
  insertDemoClaims,
  runDemoMatching,
} from "@/lib/db/pg/repositories/cicerone-repository.pg";

// ---------------------------------------------------------------------------
// Embedding helper — same model as Stage 2.4 ingestion.
// ---------------------------------------------------------------------------

async function embedQuery(query: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: query,
      model: process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small", // pragma: allowlist secret
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

const embeddingLiteral = (v: number[]) => `[${v.join(",")}]`;

// ---------------------------------------------------------------------------
// cicerone_kb_search — main retrieval tool
// ---------------------------------------------------------------------------

export const ciceroneKbSearchTool = createTool({
  description:
    "Search CICERONE's knowledge base — Tier 1/2/3 briefs and the five Stage-2.4 source documents (Innovation Passport FAQs, Testbed Britain Landscape Survey, NHS Innovator Passport Model, Innovation Passport Research, Innovation Passport — Juhee). Use this for any substantive claim about Atlas, D&D, Innovation Passports, or Testbed Britain. Returns tier briefs and source chunks ranked by cosine similarity, with full provenance for citation.",
  inputSchema: z.object({
    query: z.string().min(1),
    topKChunks: z.number().int().min(1).max(10).optional().default(6),
    includeTierBriefs: z.boolean().optional().default(true),
  }),
  execute: async (params) => {
    let embedding: number[];
    try {
      embedding = await embedQuery(params.query);
    } catch (err) {
      return {
        results: [],
        reason: "embedding_failed",
        message:
          (err as Error).message ?? "Embedding API unreachable; cannot search.",
      } as const;
    }

    const eLit = embeddingLiteral(embedding);

    const [tierBriefs, chunks] = await Promise.all([
      params.includeTierBriefs
        ? searchTierBriefs({ embeddingLiteral: eLit, topK: 3 })
        : Promise.resolve([]),
      searchCiceroneChunks({ embeddingLiteral: eLit, topK: params.topKChunks }),
    ]);

    return {
      tierBriefs: tierBriefs.map((t) => ({
        tierNumber: t.tierNumber,
        title: t.title,
        similarity: Number(t.similarity.toFixed(3)),
        excerpt: t.excerpt,
        citation: `Tier ${t.tierNumber} brief — ${t.title} (CICERONE internal)`,
      })),
      chunks: chunks.map((c) => ({
        documentTitle: c.documentTitle,
        sourceType: c.sourceType,
        tier: c.tier,
        chunkIndex: c.chunkIndex,
        body: c.body,
        similarity: Number(c.similarity.toFixed(3)),
        citation: `${c.documentTitle} — chunk ${c.chunkIndex} (${c.sourceType})`,
      })),
      coverageNote:
        chunks.length >= 6
          ? "strong"
          : chunks.length >= 3
            ? "adequate"
            : "thin",
    };
  },
});

// ---------------------------------------------------------------------------
// cicerone_testbed_search — Stage 2.6 deferred in this build
// ---------------------------------------------------------------------------

export const ciceroneTestbedSearchTool = createTool({
  description:
    "Search the CICERONE testbed inventory by natural-language description (sector / location / what-can-be-tested). In this build the testbed inventory is empty — Stage 2.6 was deferred because the source xlsx was not committed. The tool returns an explicit deferral payload so CICERONE can tell the user honestly.",
  inputSchema: z.object({
    query: z.string().min(1),
    topK: z.number().int().min(1).max(10).optional().default(5),
  }),
  execute: async (params) => {
    let embedding: number[];
    try {
      embedding = await embedQuery(params.query);
    } catch {
      return {
        results: [],
        deferred: true,
        reason: "stage_2_6_deferred",
        message:
          "Testbed inventory not ingested in this build (Stage 2.6 deferred — source xlsx not committed to remote). Embedding probe also failed.",
      } as const;
    }
    const rows = await searchTestbeds({
      embeddingLiteral: embeddingLiteral(embedding),
      topK: params.topK,
    });
    return {
      results: rows,
      deferred: rows.length === 0,
      reason:
        rows.length === 0 ? ("stage_2_6_deferred" as const) : ("ok" as const),
      message:
        rows.length === 0
          ? "Testbed inventory not ingested in this build (Stage 2.6 deferred). When the source xlsx is committed and ingested, this tool will return semantic matches across the ~97-row inventory."
          : "Top testbed matches by cosine similarity over description embedding.",
    };
  },
});

// ---------------------------------------------------------------------------
// cite_source — three citation types
// ---------------------------------------------------------------------------

export const citeSourceTool = createTool({
  description:
    "Build a structured citation. Three citation types: tier_brief (tier_number 1/2/3), source_chunk (documentTitle + chunkIndex), internal_doc (a known internal CPC / D&D doctrine doc). Returns a citation object the caller should render inline. NEVER fabricate a tier_number or chunkIndex you have not retrieved via cicerone_kb_search.",
  inputSchema: z.object({
    citationType: z.enum(["tier_brief", "source_chunk", "internal_doc"]),
    tierNumber: z.number().int().min(1).max(3).optional(),
    documentTitle: z.string().optional(),
    chunkIndex: z.number().int().min(0).optional(),
    excerpt: z.string().optional(),
  }),
  execute: async (params) => {
    if (params.citationType === "tier_brief") {
      if (!params.tierNumber) {
        return {
          ok: false,
          error: "tier_brief citation requires tierNumber",
        } as const;
      }
      return {
        ok: true,
        type: "tier_brief" as const,
        text: `Tier ${params.tierNumber} brief (CICERONE internal)`,
        excerpt: params.excerpt ?? null,
      };
    }
    if (params.citationType === "source_chunk") {
      if (!params.documentTitle || params.chunkIndex === undefined) {
        return {
          ok: false,
          error: "source_chunk citation requires documentTitle and chunkIndex",
        } as const;
      }
      return {
        ok: true,
        type: "source_chunk" as const,
        text: `${params.documentTitle} — chunk ${params.chunkIndex}`,
        excerpt: params.excerpt ?? null,
      };
    }
    if (!params.documentTitle) {
      return {
        ok: false,
        error: "internal_doc citation requires documentTitle",
      } as const;
    }
    const docs = await listCiceroneDocuments();
    const known = docs.find(
      (d) => d.title.toLowerCase() === params.documentTitle!.toLowerCase(),
    );
    return {
      ok: true,
      type: "internal_doc" as const,
      text: known
        ? `${known.title} (${known.sourceType})`
        : `${params.documentTitle} (UNVERIFIED — not in cicerone_kb)`,
      verified: !!known,
      excerpt: params.excerpt ?? null,
    };
  },
});

// ---------------------------------------------------------------------------
// generate_demo_passport — write to atlas_demo.*
// ---------------------------------------------------------------------------

const DemoClaimSchema = z.object({
  claimRole: z.enum(["asserts", "requires", "constrains"]),
  claimDomain: z.enum([
    "capability",
    "evidence",
    "certification",
    "performance",
    "regulatory",
  ]),
  claimText: z.string().min(1),
  conditions: z.string().optional().nullable(),
  confidenceTier: z
    .enum(["self_reported", "ai_inferred"])
    .optional()
    .default("ai_inferred"),
  confidenceReason: z.string().optional().nullable(),
});

export const generateDemoPassportTool = createTool({
  description:
    "Author a demo Innovation Passport in atlas_demo.* (never atlas.*). Sets is_demo=true. Embeds title+summary+context+tags via the configured embeddings model for matching. Returns the new passport_id and inserted claim_ids. NEVER set confidence_tier='verified' — only the production HITL flow can do that.",
  inputSchema: z.object({
    passportType: z.enum([
      "evidence_profile",
      "capability_profile",
      "requirements_profile",
      "certification_record",
    ]),
    title: z.string().min(1),
    summary: z.string().optional().nullable(),
    context: z.string().optional().nullable(),
    ownerOrg: z.string().optional().nullable(),
    ownerName: z.string().optional().nullable(),
    trlLevel: z.number().int().min(1).max(9).optional().nullable(),
    sectorOrigin: z.array(z.string()).optional().nullable(),
    sectorTarget: z.array(z.string()).optional().nullable(),
    tags: z.array(z.string()).optional().nullable(),
    claims: z.array(DemoClaimSchema).optional().default([]),
  }),
  execute: async (params) => {
    const embeddingText = [
      params.title,
      params.summary ?? "",
      params.context ?? "",
      (params.tags ?? []).join(" "),
    ]
      .filter(Boolean)
      .join("\n");

    let eLit: string | null = null;
    try {
      const e = await embedQuery(embeddingText);
      eLit = embeddingLiteral(e);
    } catch {
      eLit = null;
    }

    const { id: passportId } = await insertDemoPassport({
      passportType: params.passportType,
      title: params.title,
      summary: params.summary ?? null,
      context: params.context ?? null,
      ownerOrg: params.ownerOrg ?? null,
      ownerName: params.ownerName ?? null,
      trlLevel: params.trlLevel ?? null,
      sectorOrigin: params.sectorOrigin ?? null,
      sectorTarget: params.sectorTarget ?? null,
      tags: params.tags ?? null,
      embeddingLiteral: eLit,
    });

    let claimIds: string[] = [];
    if (params.claims && params.claims.length > 0) {
      const inserted = await insertDemoClaims(
        params.claims.map((c) => ({
          passportId,
          claimRole: c.claimRole,
          claimDomain: c.claimDomain,
          claimText: c.claimText,
          conditions: c.conditions ?? null,
          confidenceTier: c.confidenceTier,
          confidenceReason: c.confidenceReason ?? null,
        })),
      );
      claimIds = inserted.ids;
    }

    return {
      ok: true,
      passportId,
      claimIds,
      embedded: eLit !== null,
      isDemo: true,
      message:
        "Demo passport created in atlas_demo.passports. is_demo=true; will not enter production corpus.",
    };
  },
});

// ---------------------------------------------------------------------------
// run_demo_matching — read atlas.* (live_calls + projects), write atlas_demo.matches
// ---------------------------------------------------------------------------

export const runDemoMatchingTool = createTool({
  description:
    "Run cosine-similarity matching for a demo passport against atlas.live_calls AND atlas.projects (production corpus, READ ONLY). Persists top matches to atlas_demo.matches. Returns ranked matches with funder, funding amount, and similarity. Honesty rule: surface real cosine scores (often 0.3-0.5 for genuine cross-sector matches), never round up.",
  inputSchema: z.object({
    passportId: z.string().uuid(),
    topK: z.number().int().min(1).max(10).optional().default(5),
  }),
  execute: async (params) => {
    const matches = await runDemoMatching({
      passportId: params.passportId,
      topK: params.topK,
    });
    if (matches.length === 0) {
      return {
        ok: true,
        matches: [],
        message:
          "No matches returned. Likely the demo passport's embedding is null (embedding API failed at generate time) or the production corpus has no embedded rows.",
      } as const;
    }
    return {
      ok: true,
      matches: matches.map((m) => ({
        matchType: m.matchType,
        title: m.title,
        funder: m.funder,
        fundingAmount: m.fundingAmount,
        similarity: Number(m.similarity.toFixed(3)),
      })),
      topSimilarity: Number(matches[0].similarity.toFixed(3)),
      note: "Cosine similarity over the configured embeddings model. Cross-sector matches typically score 0.3–0.5. Treat as retrieval signal, not absolute truth.",
    };
  },
});

// ---------------------------------------------------------------------------
// suggest_handoff — structured payload describing the handoff path
// ---------------------------------------------------------------------------

const HandoffTargetSchema = z.enum(["jarvis", "atlas"]);

export const suggestHandoffTool = createTool({
  description:
    "Produce a structured handoff payload describing how the user could continue with JARVIS (passport authoring, real persistence) or ATLAS (landscape exploration, strategic intelligence). In this demo build the tool returns the payload but does not actually transition the user — the user reads the recommended next step and chooses. Use when the user signals they want to do real work, save a real passport, or run real matching against atlas.*.",
  inputSchema: z.object({
    target: HandoffTargetSchema,
    reason: z.string().min(1),
    context: z.string().optional().nullable(),
  }),
  execute: async (params) => {
    const playbook =
      params.target === "jarvis"
        ? {
            agent: "JARVIS",
            agentDescription:
              "Passport authoring assistant. Extracts claims from documents, runs real matching, persists to atlas.* (production).",
            recommendedNextSteps: [
              "Open a new chat thread and select the JARVIS agent.",
              "Upload your evidence document (or describe it verbally).",
              "JARVIS will call extractClaimsPreview, then listPassports, then ask you to save.",
              "After saveClaimsToPassport, JARVIS will call runMatching against atlas.live_calls + atlas.projects.",
            ],
            entryUrl: "/agent/jarvis",
            artefactsCreated: [
              "atlas.passports row",
              "atlas.passport_claims rows",
              "atlas.matches rows",
            ],
          }
        : {
            agent: "ATLAS",
            agentDescription:
              "Strategic intelligence partner. Landscape exploration, cross-sector synthesis, briefing generation.",
            recommendedNextSteps: [
              "Open a new chat thread and select the ATLAS agent.",
              "Ask a landscape question (corpus sizing, organisation footprint, cross-sector gaps).",
              "ATLAS will query atlas.projects / atlas.organisations / atlas.live_calls and synthesise.",
              "Ask for a Director-level briefing if you need a shareable artefact.",
            ],
            entryUrl: "/agent/atlas",
            artefactsCreated: [
              "Brief blocks (atlas.blocks)",
              "atlas.briefs row (if a fresh briefing is generated)",
            ],
          };

    return {
      ok: true,
      target: params.target,
      reason: params.reason,
      context: params.context ?? null,
      playbook,
      transitionAttempted: false,
      note: "Demo build: this tool emits the handoff structure for the user to follow manually. The chat surface does not auto-switch agents.",
    };
  },
});

// ---------------------------------------------------------------------------
// render_canonical_diagram — placeholder pattern
// ---------------------------------------------------------------------------

const KNOWN_CANONICAL_DIAGRAMS = [
  "atlas-dnd-layer-map",
  "evidence-claims-matching-flow",
  "agent-triad",
  "sarah-scenario",
] as const;

const CanonicalDiagramSchema = z.enum(KNOWN_CANONICAL_DIAGRAMS);

export const renderCanonicalDiagramTool = createTool({
  description:
    "Return a reference to a pre-built canonical CICERONE SVG diagram. Four diagrams are defined: atlas-dnd-layer-map, evidence-claims-matching-flow, agent-triad, sarah-scenario. The tool reports which assets exist on disk; if missing, it suggests render_custom_diagram instead.",
  inputSchema: z.object({
    diagramName: CanonicalDiagramSchema,
  }),
  execute: async (params) => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const assetPath = path.join(
      process.cwd(),
      "public",
      "cicerone",
      `${params.diagramName}.svg`,
    );
    try {
      await fs.access(assetPath);
      return {
        ok: true,
        diagramName: params.diagramName,
        assetUrl: `/cicerone/${params.diagramName}.svg`,
        present: true,
      };
    } catch {
      return {
        ok: false,
        diagramName: params.diagramName,
        assetUrl: null,
        present: false,
        fallback:
          "Canonical SVG asset not present in this build. Use render_custom_diagram to produce inline Mermaid instead.",
      };
    }
  },
});

// ---------------------------------------------------------------------------
// render_custom_diagram — inline Mermaid
// ---------------------------------------------------------------------------

export const renderCustomDiagramTool = createTool({
  description:
    "Generate an inline Mermaid diagram for ad-hoc explanations. Returns a fenced ```mermaid``` block the chat surface will render. Keep diagrams small (≤12 nodes, ≤16 edges). Supports flowchart, graph TD, sequenceDiagram, and classDiagram.",
  inputSchema: z.object({
    mermaidSource: z
      .string()
      .min(10)
      .describe(
        "Raw Mermaid source. Do not include the surrounding ```mermaid fence — the tool adds it.",
      ),
    caption: z.string().optional().nullable(),
  }),
  execute: async (params) => {
    return {
      ok: true,
      markdown: `\`\`\`mermaid\n${params.mermaidSource.trim()}\n\`\`\``,
      caption: params.caption ?? null,
    };
  },
});

// ---------------------------------------------------------------------------
// Aggregated kit — keys mirror the names the system prompt references.
// ---------------------------------------------------------------------------

export const ciceroneToolKit = {
  cicerone_kb_search: ciceroneKbSearchTool,
  cicerone_testbed_search: ciceroneTestbedSearchTool,
  cite_source: citeSourceTool,
  generate_demo_passport: generateDemoPassportTool,
  run_demo_matching: runDemoMatchingTool,
  suggest_handoff: suggestHandoffTool,
  render_canonical_diagram: renderCanonicalDiagramTool,
  render_custom_diagram: renderCustomDiagramTool,
} as const;
