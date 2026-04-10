import { getSession } from "lib/auth/server";
import { redirect } from "next/navigation";
import { getPassportList } from "@/lib/passport/queries";
import Link from "next/link";
import {
  FileBadge2,
  Plus,
  ChevronRight,
  Clock,
  CheckCircle2,
  FileText,
  Brain,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  technology: "Technology",
  product: "Product",
  service: "Service",
  process: "Process",
  system: "System",
};

export default async function PassportListPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const passports = await getPassportList();

  // Group by user_id (owner), with "mine" first based on session user
  const mine = passports.filter(
    (p) => !p.user_id || p.user_id === session.user.id,
  );
  const others = passports.filter(
    (p) => p.user_id && p.user_id !== session.user.id,
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileBadge2 className="size-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Innovation Passports</h1>
            <p className="text-sm text-muted-foreground">
              Structured evidence records for cross-sector translation
            </p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href="/">
            <Plus className="size-4 mr-1.5" />
            New via JARVIS
          </Link>
        </Button>
      </div>

      {/* Empty state */}
      {passports.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground space-y-2">
            <FileBadge2 className="size-10 mx-auto opacity-30" />
            <p className="font-medium">No passports yet</p>
            <p className="text-sm">
              Upload a document or describe your innovation to JARVIS to create
              your first passport.
            </p>
          </CardContent>
        </Card>
      )}

      {/* My passports */}
      {mine.length > 0 && (
        <section className="space-y-3">
          {others.length > 0 && (
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              My passports
            </h2>
          )}
          <div className="space-y-3">
            {mine.map((p) => (
              <Link
                key={p.id}
                href={`/passport/${p.id}`}
                className="block group"
              >
                <Card className="border-border/60 transition-colors group-hover:border-primary/40 group-hover:bg-accent/20">
                  <CardHeader className="pb-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base leading-snug">
                          {p.project_name ?? p.title ?? "Untitled passport"}
                        </CardTitle>
                        {p.project_name &&
                          p.title &&
                          p.title !== p.project_name && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {p.title}
                            </p>
                          )}
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
                    </div>
                    <CardDescription className="flex flex-wrap gap-1.5 mt-1">
                      {p.passport_type && (
                        <Badge variant="secondary" className="text-xs">
                          {TYPE_LABELS[p.passport_type] ?? p.passport_type}
                        </Badge>
                      )}
                      {p.trl_level != null && (
                        <Badge variant="outline" className="text-xs font-mono">
                          TRL {p.trl_level}
                          {p.trl_target != null && ` → ${p.trl_target}`}
                        </Badge>
                      )}
                      {p.owner_org && (
                        <span className="text-xs text-muted-foreground self-center">
                          {p.owner_org}
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {/* Tags */}
                    {p.tags && p.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {p.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs px-1.5 py-0 bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {/* Counts + metadata */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Brain className="size-3" />
                        {p.claim_count} claim
                        {p.claim_count !== 1 ? "s" : ""}
                        {p.verified_count > 0 && (
                          <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="size-3" />
                            {p.verified_count} verified
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="size-3" />
                        {p.document_count} doc
                        {p.document_count !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1 ml-auto">
                        <Clock className="size-3" />
                        {new Date(p.updated_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Others' passports */}
      {others.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Other passports
          </h2>
          <div className="space-y-3">
            {others.map((p) => (
              <Link
                key={p.id}
                href={`/passport/${p.id}`}
                className="block group"
              >
                <Card className="border-border/60 transition-colors group-hover:border-primary/40 group-hover:bg-accent/20">
                  <CardHeader className="pb-1">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug flex-1 min-w-0">
                        {p.project_name ?? p.title ?? "Untitled passport"}
                      </CardTitle>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {p.tags?.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{p.claim_count} claims</span>
                      <span>{p.document_count} docs</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
