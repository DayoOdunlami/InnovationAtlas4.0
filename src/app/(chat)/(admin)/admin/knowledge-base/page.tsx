import { requireAdminPermission } from "auth/permissions";
import { unauthorized } from "next/navigation";
import { pgKnowledgeRepository } from "@/lib/db/pg/repositories/knowledge-repository.pg";
import { getKnowledgeCoverageMatrix } from "@/lib/db/pg/repositories/knowledge-repository.pg";
import { KnowledgeBaseAdminPanel } from "@/components/admin/knowledge-base-admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgeBasePage() {
  try {
    await requireAdminPermission();
  } catch {
    unauthorized();
  }

  const systemScope = { kind: "system" } as const;

  const [allDocs, coverageMatrix] = await Promise.all([
    pgKnowledgeRepository.listDocuments({}, systemScope),
    getKnowledgeCoverageMatrix(),
  ]);

  return (
    <div className="relative bg-background w-full flex flex-col min-h-screen">
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="space-y-6 w-full max-w-7xl">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Transport Knowledge Library
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Admin-curated policy documents, strategy papers, and government
              reports powering the{" "}
              <code className="text-xs font-mono">surfaceKnowledgeBase</code>{" "}
              agent tool. Only <span className="font-medium">approved</span>{" "}
              documents are returned to agents.
            </p>
          </div>
          <KnowledgeBaseAdminPanel
            documents={allDocs}
            coverageMatrix={coverageMatrix}
          />
        </div>
      </div>
    </div>
  );
}
