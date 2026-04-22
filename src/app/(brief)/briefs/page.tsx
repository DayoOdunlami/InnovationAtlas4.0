// ---------------------------------------------------------------------------
// /briefs — list of the signed-in user's briefs (Phase 1, Brief-First
// Rebuild).
//
// Server component: loads the user's non-deleted briefs via the
// repository, fires `nav.brief_list_opened` telemetry, and renders a
// minimal list + a "New brief" form. Rename and delete are client-side
// forms that post back into the three server actions in
// `./actions.ts`; they each fire their matching `action.*` event.
// ---------------------------------------------------------------------------

import { pgBriefRepository } from "@/lib/db/pg/repositories/brief-repository.pg";
import { emitNav } from "@/lib/telemetry/emit";
import type { TelemetryEnv } from "@/lib/telemetry/envelope";
import { getSession } from "lib/auth/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BriefListItem } from "./brief-list-item";
import { NewBriefButton } from "./new-brief-button";

export const dynamic = "force-dynamic";

function resolveAppEnv(): TelemetryEnv {
  const raw = (process.env.APP_ENV ?? "").toLowerCase();
  if (raw === "prod" || raw === "production") return "prod";
  if (raw === "preview") return "preview";
  if (raw === "test") return "test";
  return "dev";
}

export default async function BriefsListPage() {
  const session = await getSession();
  if (!session?.user.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const briefs = await pgBriefRepository.listBriefsForUser(userId, {
    kind: "user",
    userId,
  });
  await emitNav("brief_list_opened", {
    sessionId: session.session.id,
    userId,
    env: resolveAppEnv(),
    payload: { count: briefs.length },
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Briefs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Phase 1 preview — create a brief, chat with the agent, and pick
            back up later with your history intact.
          </p>
        </div>
        <NewBriefButton />
      </header>

      {briefs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            You don&rsquo;t have any briefs yet.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Click <span className="font-medium">New brief</span> above to get
            started.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {briefs.map((brief) => (
            <li key={brief.id}>
              <BriefListItem
                id={brief.id}
                title={brief.title}
                updatedAt={brief.updatedAt.toISOString()}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Looking for the earlier chat surface? It&rsquo;s still at{" "}
        <Link href="/chat" className="underline">
          /chat
        </Link>
        .
      </p>
    </div>
  );
}
