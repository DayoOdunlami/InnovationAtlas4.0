#!/usr/bin/env tsx
import "load-env";
import pg from "pg";
import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { SURFACE_KNOWLEDGE_BASE_TOOL_DESCRIPTION } from "@/lib/ai/tools/kb/surface-knowledge-base";

const PROMPT =
  "What does Justin Anderson's Testbed Britain say about portable trust?";

async function loadJarvisSystemPrompt(): Promise<string> {
  const rawUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("POSTGRES_URL or DATABASE_URL required");
  const connectionString = rawUrl.replace(/[?&]sslmode=[^&]*/g, "");
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const r = await client.query<{
      system_prompt: string | null;
    }>(
      `
      SELECT instructions->>'systemPrompt' AS system_prompt
      FROM agent
      WHERE name = 'JARVIS'
      ORDER BY created_at DESC
      LIMIT 1
      `,
    );
    const prompt = r.rows[0]?.system_prompt;
    if (!prompt)
      throw new Error("JARVIS system prompt not found in agent table");
    return prompt;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY required");
  }

  const system = await loadJarvisSystemPrompt();
  const called: string[] = [];

  const surfaceKnowledgeBase = tool({
    description: SURFACE_KNOWLEDGE_BASE_TOOL_DESCRIPTION,
    inputSchema: z.object({
      query: z.string(),
      modes: z.array(z.string()).optional(),
      themes: z.array(z.string()).optional(),
      topK: z.number().optional(),
    }),
    execute: async () => {
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
        filtersApplied: { modes: [], themes: [] },
      };
    },
  });

  const webSearch = tool({
    description: "Search web for real-time updates and live news.",
    inputSchema: z.object({ query: z.string() }),
    execute: async () => {
      called.push("webSearch");
      return { results: [] };
    },
  });

  await generateText({
    model: openai("gpt-4o-mini"),
    system,
    prompt: PROMPT,
    tools: {
      surfaceKnowledgeBase,
      webSearch,
    },
  });

  console.log("Prompt:", PROMPT);
  console.log("Tool calls in order:", called.join(" -> ") || "(none)");
  console.log(
    "PASS (JARVIS KB first):",
    called.length > 0 && called[0] === "surfaceKnowledgeBase",
  );
}

void main();
