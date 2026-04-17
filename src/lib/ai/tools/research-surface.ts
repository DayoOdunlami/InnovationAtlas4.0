import { tool as createTool } from "ai";
import { JSONSchema7 } from "json-schema";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { safe } from "ts-safe";

const OPENALEX_WORKS = "https://api.openalex.org/works";

/** Decode OpenAlex `abstract_inverted_index` into plain text (best-effort). */
function decodeInvertedAbstract(
  inv: Record<string, number[]> | undefined,
): string | null {
  if (!inv || typeof inv !== "object") return null;
  const tuples: [number, string][] = [];
  for (const [word, positions] of Object.entries(inv)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      if (typeof pos === "number") tuples.push([pos, word]);
    }
  }
  tuples.sort((a, b) => a[0] - b[0]);
  const text = tuples
    .map(([, w]) => w)
    .join(" ")
    .trim();
  return text.length > 0 ? text : null;
}

function firstSentence(text: string | null): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const cut = t.match(/^.{20,400}?[.!?](?=\s|$)/);
  return cut ? cut[0].trim() : t.slice(0, 280).trim();
}

type OpenAlexAuthorship = {
  author?: { display_name?: string };
  institutions?: { display_name?: string }[];
};

type OpenAlexWork = {
  id?: string;
  display_name?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  abstract_inverted_index?: Record<string, number[]>;
  authorships?: OpenAlexAuthorship[];
};

const surfaceResearchInputSchema: JSONSchema7 = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Natural-language topic to search in peer-reviewed scholarly works (OpenAlex).",
    },
    perPage: {
      type: "number",
      description: "Number of works to return (3–10).",
      default: 5,
      minimum: 3,
      maximum: 10,
    },
  },
  required: ["query"],
};

/**
 * Tool-facing description (model decides whether to call based on this text).
 * Triggering rules mirror Workstream C: academic / evidence questions only;
 * not landscape, funding calls, or operational lookup.
 */
export const SURFACE_RESEARCH_TOOL_DESCRIPTION = [
  'Use ONLY when the user is asking what peer-reviewed research, scientific literature, systematic evidence, meta-analyses, empirical studies, or academic publications conclude about a topic — including phrasing like "what does the research say", "what does the evidence show in the literature", "what has been published on", "according to peer-reviewed work", or when they need papers with authors, institutions, years, and citation counts.',
  'Do NOT use for: open or closed funding calls, grants, tenders, competitions, deadlines, "what funding is available", Innovate UK or Horizon call listings, maritime (or other) funding-this-month style questions, Atlas / Gateway-to-Research corpus landscape counts or project lists (use the supabase-atlas MCP), sector funding concentration, policy or press headlines, company or investor announcements, day-to-day operational or implementation "how-to", procurement, or other queries where web search and live sources are the right evidence class.',
  "For funding-call and live-opportunity questions, use supabase-atlas (e.g. atlas.live_calls, atlas.projects) together with web search — not this tool.",
].join(" ");

export const surfaceResearchTool = createTool({
  description: SURFACE_RESEARCH_TOOL_DESCRIPTION,
  inputSchema: jsonSchemaToZod(surfaceResearchInputSchema),
  execute: (params: { query: string; perPage?: number }) => {
    return safe(async () => {
      const apiKey = process.env.OPENALEX_API_KEY;
      if (!apiKey?.trim()) {
        return {
          isError: true,
          error: "OPENALEX_API_KEY is not configured.",
          solution:
            "Set OPENALEX_API_KEY in the server environment, then retry.",
        };
      }

      const per = Math.min(10, Math.max(3, Math.floor(params.perPage ?? 5)));
      const url = new URL(OPENALEX_WORKS);
      url.searchParams.set("search", params.query);
      url.searchParams.set("per_page", String(per));
      url.searchParams.set("sort", "cited_by_count:desc");
      url.searchParams.set("filter", "type:article");
      url.searchParams.set("api_key", apiKey.trim());

      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": "InnovationAtlas/1.0 (mailto:support@cpcatapult.co.uk)",
        },
      });

      if (!res.ok) {
        throw new Error(`OpenAlex HTTP ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as { results?: OpenAlexWork[] };
      const results = json.results ?? [];

      const papers = results.map((work) => {
        const title = work.display_name ?? "Untitled work";
        const year = work.publication_year ?? null;
        const citations = work.cited_by_count ?? 0;
        const abstract = decodeInvertedAbstract(work.abstract_inverted_index);

        const authorships = work.authorships ?? [];
        const authorNames = authorships
          .map((a) => a.author?.display_name)
          .filter((n): n is string => Boolean(n && n.trim()));
        const primaryAuthors =
          authorNames.length > 0
            ? authorNames.slice(0, 3).join(", ") +
              (authorNames.length > 3 ? " et al." : "")
            : "Author not listed";

        const instSet = new Set<string>();
        for (const a of authorships.slice(0, 5)) {
          for (const ins of a.institutions ?? []) {
            const d = ins.display_name?.trim();
            if (d) instSet.add(d);
          }
        }
        const institution =
          instSet.size > 0
            ? [...instSet].slice(0, 2).join("; ")
            : "Institution not listed";

        const finding =
          firstSentence(abstract) ??
          "Abstract not available in OpenAlex; use the title and venue context only.";

        return {
          title,
          primaryAuthors,
          institution,
          year,
          citationCount: citations,
          openAlexId: work.id ?? null,
          oneSentenceFinding: finding,
        };
      });

      return {
        query: params.query,
        count: papers.length,
        papers,
        guide:
          "Summarise for the user in prose. For each paper, keep: authors, institution, year, citation count, and one plain-English sentence of the main finding. Do not invent metrics or venues beyond this payload.",
      };
    })
      .ifFail((e) => ({
        isError: true,
        error: e.message,
        solution:
          "Explain the OpenAlex error briefly. If the topic is valid, suggest narrowing the query or trying related keywords.",
      }))
      .unwrap();
  },
});
