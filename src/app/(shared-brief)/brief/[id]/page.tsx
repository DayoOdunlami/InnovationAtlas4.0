// ---------------------------------------------------------------------------
// /brief/[id] — single-brief shell (Phase 1, Brief-First Rebuild).
//
// Scope resolution
// ----------------
// * If the request has a signed-in session and the user owns the brief,
//   render the editable owner view (BriefChatShell) and pre-load the
//   chat history from atlas.messages.
// * Else if the URL carries `?share=<token>` and that token is an
//   active share for this brief, render a read-only view with the chat
//   history visible (per Data Model Spec §13 Q1 / APPROVED DEFAULT
//   #13).
// * Otherwise redirect to /sign-in (no share token) or show a small
//   not-authorised notice (invalid / revoked share token).
//
// Telemetry
// ---------
// * `nav.brief_opened` fires on every successful render. `payload.scope`
//   is either "user" or "share" so dashboards can split the chart.
// ---------------------------------------------------------------------------

import { pgBlockRepository } from "@/lib/db/pg/repositories/block-repository.pg";
import { pgBriefRepository } from "@/lib/db/pg/repositories/brief-repository.pg";
import { pgBriefShareTokenRepository } from "@/lib/db/pg/repositories/brief-share-token-repository.pg";
import { pgMessageRepository } from "@/lib/db/pg/repositories/message-repository.pg";
import { emitNav } from "@/lib/telemetry/emit";
import type { TelemetryEnv } from "@/lib/telemetry/envelope";
import { BlockList } from "@/components/brief/blocks/block-list.server";
import { getSession } from "lib/auth/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BriefChatShell } from "./brief-chat-shell";

export const dynamic = "force-dynamic";

function resolveAppEnv(): TelemetryEnv {
  const raw = (process.env.APP_ENV ?? "").toLowerCase();
  if (raw === "prod" || raw === "production") return "prod";
  if (raw === "preview") return "preview";
  if (raw === "test") return "test";
  return "dev";
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ share?: string }>;
}

export default async function BriefDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const shareToken = typeof sp.share === "string" ? sp.share : null;
  const session = await getSession();

  if (!session?.user.id && !shareToken) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/brief/${id}`)}`);
  }

  const scope = session?.user.id
    ? ({ kind: "user", userId: session.user.id } as const)
    : ({ kind: "share", token: shareToken!, briefId: id } as const);

  let brief;
  try {
    brief = await pgBriefRepository.getBriefById(id, scope);
  } catch {
    return <AccessDeniedNotice briefId={id} />;
  }
  if (!brief) {
    notFound();
  }

  let messages;
  try {
    messages = await pgMessageRepository.listMessagesByBriefId(id, scope);
  } catch {
    return <AccessDeniedNotice briefId={id} />;
  }

  let blocks;
  try {
    blocks = await pgBlockRepository.listByBrief(id, scope);
  } catch {
    return <AccessDeniedNotice briefId={id} />;
  }

  const sessionId =
    session?.session.id ?? `share:${shareToken!.slice(0, 12)}`;

  await emitNav("brief_opened", {
    sessionId,
    ...(session?.user.id ? { userId: session.user.id } : {}),
    env: resolveAppEnv(),
    payload: {
      briefId: id,
      scope: scope.kind,
      historyLength: messages.length,
    },
  });

  const ownerShareTokens =
    scope.kind === "user"
      ? await pgBriefShareTokenRepository.listTokensForBrief(id, scope)
      : [];
  const activeShareTokens = ownerShareTokens.filter(
    (t) =>
      t.revokedAt === null &&
      (t.expiresAt === null || t.expiresAt.getTime() > Date.now()),
  );

  const blocksSlot = (
    <BlockList
      blocks={blocks.map((b) => ({
        id: b.id,
        type: b.type,
        contentJson: b.contentJson,
      }))}
    />
  );

  return (
    <BriefChatShell
      briefId={brief.id}
      briefTitle={brief.title}
      scopeKind={scope.kind}
      blocksSlot={blocksSlot}
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system" | "tool",
        content: m.contentJson,
        createdAt: m.createdAt.toISOString(),
      }))}
      shareTokens={
        scope.kind === "user"
          ? activeShareTokens.map((t) => ({
              id: t.id,
              token: t.token,
              createdAt: t.createdAt.toISOString(),
              expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
            }))
          : null
      }
    />
  );
}

function AccessDeniedNotice({ briefId }: { briefId: string }) {
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">
        This brief is not available
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The link you used is invalid, expired, or has been revoked
        (brief&nbsp;<code className="text-xs">{briefId.slice(0, 8)}</code>).
      </p>
      <p className="mt-6 text-sm">
        <Link href="/briefs" className="underline">
          Back to your briefs
        </Link>
      </p>
    </div>
  );
}
