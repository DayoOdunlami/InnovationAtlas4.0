"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToolUIPart } from "ai";
import type {
  PassportListItem,
  PassportListOutput,
} from "lib/ai/tools/passport/list-passports-tool";
import { BookOpen, CheckCircle2, FileText } from "lucide-react";
import { memo, useMemo } from "react";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function PassportRow({ passport }: { passport: PassportListItem }) {
  const displayName =
    passport.title ?? passport.project_name ?? "Untitled Passport";

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-2 min-w-0">
        <FileText className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Updated {formatDate(passport.updated_at)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {passport.verified_count > 0 && (
          <Badge
            variant="outline"
            className="text-xs bg-green-50 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 gap-1"
          >
            <CheckCircle2 className="size-3" />
            {passport.verified_count} verified
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          {passport.claim_count} claim{passport.claim_count !== 1 ? "s" : ""}
        </Badge>
      </div>
    </div>
  );
}

export const PassportListCard = memo(function PassportListCard({
  part,
}: { part: ToolUIPart }) {
  const output = useMemo(
    () => part.output as PassportListOutput | null,
    [part.output],
  );

  if (!part.state.startsWith("output") || !output) return null;

  const passports = output.passports ?? [];

  return (
    <Card className="my-2 border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="size-4" />
          Your Passports
          <Badge variant="secondary" className="ml-auto text-xs">
            {passports.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {passports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No passports yet. Describe your evidence to create one.
          </p>
        ) : (
          <div>
            {passports.map((p) => (
              <PassportRow key={p.id} passport={p} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
