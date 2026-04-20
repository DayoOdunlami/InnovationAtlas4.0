import { CanvasWorkbench } from "@/components/canvas/canvas-workbench";
import { getSession } from "auth/server";
import { generateUUID } from "lib/utils";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /canvas — the unified exploratory workspace introduced in Sprint X.
 *
 * A three-column shell: icon-rail (lens switcher) · main stage · right chat.
 * The main stage currently hosts the force-graph lens; scatter lens and a
 * briefing panel land in later commits (Brief X §7–15).
 */
export default async function CanvasPage({
  searchParams,
}: {
  searchParams?: Promise<{ passportId?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  const params = (await searchParams) ?? {};
  const threadId = generateUUID();
  return (
    <CanvasWorkbench
      threadId={threadId}
      key={threadId}
      initialPassportId={params.passportId ?? null}
    />
  );
}
