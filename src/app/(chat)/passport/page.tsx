import { getSession } from "lib/auth/server";
import { redirect } from "next/navigation";
import { getPassportList } from "@/lib/passport/queries";
import Link from "next/link";
import { FileBadge2, Plus, ChevronRight, Clock } from "lucide-react";
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

      {/* Passport list */}
      {passports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground space-y-2">
            <FileBadge2 className="size-10 mx-auto opacity-30" />
            <p className="font-medium">No passports yet</p>
            <p className="text-sm">
              Upload a PDF or describe your innovation to JARVIS to create your
              first passport.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {passports.map((p) => (
            <Link key={p.id} href={`/passport/${p.id}`} className="block group">
              <Card className="border-border/60 transition-colors group-hover:border-primary/40 group-hover:bg-accent/20">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">
                      {p.title ?? "Untitled passport"}
                    </CardTitle>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
                  </div>
                  <CardDescription className="flex flex-wrap gap-2 mt-1">
                    {p.passport_type && (
                      <Badge variant="secondary" className="text-xs">
                        {TYPE_LABELS[p.passport_type] ?? p.passport_type}
                      </Badge>
                    )}
                    {p.trl_level != null && (
                      <Badge variant="outline" className="text-xs">
                        TRL {p.trl_level}
                        {p.trl_target != null && ` → ${p.trl_target}`}
                      </Badge>
                    )}
                    {p.owner_org && (
                      <span className="text-xs text-muted-foreground">
                        {p.owner_org}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                {(p.summary || p.sector_origin?.length) && (
                  <CardContent className="pt-0">
                    {p.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {p.summary}
                      </p>
                    )}
                    {p.sector_origin && p.sector_origin.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.sector_origin.map((s) => (
                          <Badge
                            key={s}
                            variant="outline"
                            className="text-xs bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                          >
                            {s}
                          </Badge>
                        ))}
                        {p.sector_target && p.sector_target.length > 0 && (
                          <>
                            <span className="text-xs text-muted-foreground self-center">
                              →
                            </span>
                            {p.sector_target.map((s) => (
                              <Badge
                                key={s}
                                variant="outline"
                                className="text-xs bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300"
                              >
                                {s}
                              </Badge>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      Updated{" "}
                      {new Date(p.updated_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
