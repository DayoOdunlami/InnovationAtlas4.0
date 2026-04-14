import { getSession } from "auth/server";
import { z } from "zod";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY is not set" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error.flatten()), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "alloy",
      input: parsed.data.text,
    }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(errText || upstream.statusText, { status: 502 });
  }

  const buf = await upstream.arrayBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
