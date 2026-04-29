#!/usr/bin/env tsx
import "load-env";
import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { ATLAS_SYSTEM_PROMPT } from "@/lib/ai/prompts/atlas-strategist";
import { SURFACE_KNOWLEDGE_BASE_TOOL_DESCRIPTION } from "@/lib/ai/tools/kb/surface-knowledge-base";

const prompt =
  "What does Justin Anderson's Testbed Britain say about portable trust?";

const called: string[] = [];

const surfaceKnowledgeBase = tool({
  description: SURFACE_KNOWLEDGE_BASE_TOOL_DESCRIPTION,
  inputSchema: z.object({
    query: z.string(),
    modes: z.array(z.string()).optional(),
    themes: z.array(z.string()).optional(),
    topK: z.number().optional(),
  }),
  execute: async (input) => {
    called.push("surfaceKnowledgeBase");
    return {
      documents: [
        {
          documentId: "doc-testbed",
          title:
            "Testbed Britain: An Architecture for Scalable Innovation v1.0",
          publisher: "Connected Places Catapult",
          publishedOn: "2026-02-13",
          sourceType: "doctrine",
          tier: "primary",
          citationPrefix:
            "From the Transport Knowledge Library — Testbed Britain...",
          chunks: [
            {
              chunkIndex: 0,
              body: "Portable trust requires evidence, provenance, and policy context to travel across sovereign boundaries.",
              similarity: 0.9,
              tokenCount: 20,
            },
          ],
        },
      ],
      coverageNote: "adequate",
      filtersApplied: { modes: input.modes ?? [], themes: input.themes ?? [] },
    };
  },
});

const webSearch = tool({
  description:
    "Search the web using Exa AI for current events and live updates.",
  inputSchema: z.object({ query: z.string() }),
  execute: async () => {
    called.push("webSearch");
    return { results: [] };
  },
});

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for smoke-kb-routing");
  }

  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system: ATLAS_SYSTEM_PROMPT,
    prompt,
    tools: {
      surfaceKnowledgeBase,
      webSearch,
    },
  });

  console.log("Prompt:", prompt);
  console.log("Tool calls in order:", called.join(" -> ") || "(none)");
  console.log(
    "PASS (KB first):",
    called.length > 0 && called[0] === "surfaceKnowledgeBase",
  );
  console.log("Final text preview:", result.text.slice(0, 220));
}

void main();
