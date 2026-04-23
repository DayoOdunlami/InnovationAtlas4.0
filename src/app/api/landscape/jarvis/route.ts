// ---------------------------------------------------------------------------
// POST /api/landscape/jarvis — viewport-aware JARVIS endpoint (Phase 3b).
//
// The POC (`docs/force-graph-lens-poc.html`) simulates the vision-model
// call client-side in `simulateJarvisResponse`. Phase 3b execution
// prompt line 62-63: "the vision-model call itself ... must route
// through the existing AI SDK chat route (not a mock)."
//
// This endpoint:
//   * accepts a base64 `image/png` data URL (from
//     `renderer.domElement.toDataURL`, POC `captureViewport()`)
//   * plus a small JSON context packet (mode, zAxis, queryA, queryB,
//     focused title, cameraDistance, visibleClusterLabels).
//   * passes both to the chat model as a multimodal message and returns
//     `{ text, suggestions }` matching the POC modal shape.
//
// The full JARVIS chat stream ships through the regular chat route; this
// endpoint is a one-shot vision snapshot used by the Ask-JARVIS button
// in the lens header.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { generateText } from "ai";
import { z } from "zod";
import { customModelProvider } from "@/lib/ai/models";
import { getSession } from "lib/auth/server";

const ContextSchema = z.object({
  mode: z.enum(["explore", "gravity", "compare"]),
  zAxis: z.enum(["score", "time", "funding", "flat"]).optional(),
  queryA: z.string().nullable().optional(),
  queryB: z.string().nullable().optional(),
  focused: z.string().nullable().optional(),
  cameraDistance: z.number().finite().optional(),
  visibleClusterLabels: z.boolean().optional(),
  nodeCount: z.number().int().nonnegative().optional(),
});

const RequestSchema = z.object({
  image: z.string().min(64).max(6_000_000),
  context: ContextSchema,
});

function parseSuggestions(text: string): string[] {
  // Models often fence suggestions in a trailing list. Accept any of
  // `- foo`, `* foo`, or `1. foo` bullets after a ### Suggestions
  // heading; fall back to the first ≤3 sentence-boundary-aligned
  // clauses.
  const m = text.match(/###\s*Suggestions[^\n]*\n([\s\S]+?)(?:\n{2,}|$)/i);
  if (m) {
    const lines = m[1]
      .split(/\n+/)
      .map((l) => l.replace(/^\s*[-*\d.)\s]+/, "").trim())
      .filter((l) => l.length > 0 && l.length < 120);
    if (lines.length > 0) return lines.slice(0, 3);
  }
  return [
    "What stands out?",
    "Describe the clusters",
    "Zoom into the densest region",
  ];
}

function stripSuggestionsFromText(text: string): string {
  return text.replace(/###\s*Suggestions[\s\S]*$/i, "").trim();
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const ctx = body.context;
  try {
    const { text } = await generateText({
      model: customModelProvider.getModel(),
      system:
        "You are JARVIS, embedded in Atlas — the UK transport innovation landscape. You see a screenshot of the user's current force-graph lens viewport. Respond in 3–5 short sentences describing what is on screen (cluster families, query anchors, affinity patterns), then finish with a markdown heading '### Suggestions' followed by up to 3 bulleted follow-up questions (each ≤ 12 words). Be factual; if the image is too low-resolution to determine something, say so rather than inventing.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Lens context:\n${JSON.stringify(ctx, null, 2)}`,
            },
            {
              type: "image",
              image: body.image,
            },
          ],
        },
      ],
    });
    const clean = stripSuggestionsFromText(text);
    const suggestions = parseSuggestions(text);
    return NextResponse.json({ text: clean, suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "jarvis failed";
    return NextResponse.json(
      { error: message, text: "", suggestions: [] },
      { status: 500 },
    );
  }
}
