"use server";

// ---------------------------------------------------------------------------
// Brief server actions (Phase 1, Brief-First Rebuild).
//
// Three user-scoped CRUD actions invoked from the `/briefs` list route
// and the `/brief/[id]` shell (rename / delete from the URL bar). All
// three funnel through the `AccessScope`-aware brief-repository, and
// each fires its matching `action.*` telemetry event per Performance &
// Telemetry Spec §3.2.
//
// Unauthenticated calls redirect to /sign-in; the repository layer is
// the authoritative guard against ownership spoofing (it will throw
// AccessDeniedError if scope.userId mismatches).
// ---------------------------------------------------------------------------

import { pgBriefRepository } from "@/lib/db/pg/repositories/brief-repository.pg";
import { emitAction } from "@/lib/telemetry/emit";
import { getSession } from "lib/auth/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const RenameInput = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
});

const DeleteInput = z.object({
  id: z.string().uuid(),
});

export async function createBriefAction(formData?: FormData) {
  const session = await getSession();
  if (!session?.user.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const rawTitle = formData?.get("title");
  const title =
    typeof rawTitle === "string" && rawTitle.trim().length > 0
      ? rawTitle.slice(0, 200)
      : undefined;

  const brief = await pgBriefRepository.createBrief(
    { ownerId: userId, ...(title !== undefined ? { title } : {}) },
    { kind: "user", userId },
  );
  await emitAction("brief_created", {
    sessionId: session.session.id,
    userId,
    env: resolveAppEnv(),
    payload: { briefId: brief.id },
  });
  revalidatePath("/briefs");
  redirect(`/brief/${brief.id}`);
}

export async function renameBriefAction(formData: FormData) {
  const session = await getSession();
  if (!session?.user.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const parsed = RenameInput.parse({
    id: formData.get("id"),
    title: formData.get("title"),
  });
  await pgBriefRepository.updateBrief(
    parsed.id,
    { title: parsed.title },
    { kind: "user", userId },
  );
  await emitAction("brief_renamed", {
    sessionId: session.session.id,
    userId,
    env: resolveAppEnv(),
    payload: { briefId: parsed.id },
  });
  revalidatePath("/briefs");
  revalidatePath(`/brief/${parsed.id}`);
}

export async function deleteBriefAction(formData: FormData) {
  const session = await getSession();
  if (!session?.user.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const parsed = DeleteInput.parse({ id: formData.get("id") });
  await pgBriefRepository.deleteBrief(parsed.id, {
    kind: "user",
    userId,
  });
  await emitAction("brief_deleted", {
    sessionId: session.session.id,
    userId,
    env: resolveAppEnv(),
    payload: { briefId: parsed.id },
  });
  revalidatePath("/briefs");
}

function resolveAppEnv(): import("@/lib/telemetry/envelope").TelemetryEnv {
  const raw = (process.env.APP_ENV ?? "").toLowerCase();
  if (raw === "prod" || raw === "production") return "prod";
  if (raw === "preview") return "preview";
  if (raw === "test") return "test";
  return "dev";
}
