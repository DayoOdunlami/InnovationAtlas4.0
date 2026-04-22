"use server";

// Share-token server actions for the /brief/[id] owner view.

import { pgBriefShareTokenRepository } from "@/lib/db/pg/repositories/brief-share-token-repository.pg";
import { emitAction } from "@/lib/telemetry/emit";
import type { TelemetryEnv } from "@/lib/telemetry/envelope";
import { getSession } from "lib/auth/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const MintInput = z.object({ briefId: z.string().uuid() });
const RevokeInput = z.object({
  tokenId: z.string().uuid(),
  briefId: z.string().uuid(),
});

function resolveAppEnv(): TelemetryEnv {
  const raw = (process.env.APP_ENV ?? "").toLowerCase();
  if (raw === "prod" || raw === "production") return "prod";
  if (raw === "preview") return "preview";
  if (raw === "test") return "test";
  return "dev";
}

export async function mintBriefShareTokenAction(formData: FormData) {
  const session = await getSession();
  if (!session?.user.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const parsed = MintInput.parse({ briefId: formData.get("briefId") });
  const row = await pgBriefShareTokenRepository.mintToken(parsed.briefId, {
    kind: "user",
    userId,
  });
  await emitAction("brief_share_token_minted", {
    sessionId: session.session.id,
    userId,
    env: resolveAppEnv(),
    payload: { briefId: parsed.briefId, tokenId: row.id },
  });
  revalidatePath(`/brief/${parsed.briefId}`);
}

export async function revokeBriefShareTokenAction(formData: FormData) {
  const session = await getSession();
  if (!session?.user.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const parsed = RevokeInput.parse({
    tokenId: formData.get("tokenId"),
    briefId: formData.get("briefId"),
  });
  await pgBriefShareTokenRepository.revokeToken(parsed.tokenId, {
    kind: "user",
    userId,
  });
  revalidatePath(`/brief/${parsed.briefId}`);
}
