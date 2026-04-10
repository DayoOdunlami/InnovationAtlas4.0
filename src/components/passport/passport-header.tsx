import { Badge } from "@/components/ui/badge";
import {
  FileBadge2,
  ArrowRight,
  CalendarCheck,
  ShieldCheck,
} from "lucide-react";
import type { PassportRow } from "@/lib/passport/types";

const TYPE_LABELS: Record<string, string> = {
  technology: "Technology",
  product: "Product",
  service: "Service",
  process: "Process",
  system: "System",
};

export function PassportHeader({ passport }: { passport: PassportRow }) {
  return (
    <div className="space-y-3">
      {/* Title row */}
      <div className="flex items-start gap-3">
        <FileBadge2 className="size-6 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold leading-tight">
            {passport.title ?? "Untitled Passport"}
          </h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {passport.passport_type && (
              <Badge variant="secondary">
                {TYPE_LABELS[passport.passport_type] ?? passport.passport_type}
              </Badge>
            )}
            {passport.trl_level != null && (
              <Badge variant="outline" className="font-mono">
                TRL {passport.trl_level}
                {passport.trl_target != null && (
                  <span className="flex items-center gap-0.5 ml-1">
                    <ArrowRight className="size-3" />
                    {passport.trl_target}
                  </span>
                )}
              </Badge>
            )}
            {passport.owner_org && (
              <Badge variant="outline">{passport.owner_org}</Badge>
            )}
            {passport.owner_name &&
              passport.owner_name !== passport.owner_org && (
                <span className="text-sm text-muted-foreground self-center">
                  {passport.owner_name}
                </span>
              )}
          </div>
        </div>
      </div>

      {/* Sectors */}
      {((passport.sector_origin?.length ?? 0) > 0 ||
        (passport.sector_target?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 ml-9">
          <span className="text-xs text-muted-foreground font-medium mr-1">
            Sectors:
          </span>
          {passport.sector_origin?.map((s) => (
            <Badge
              key={s}
              variant="outline"
              className="text-xs bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
            >
              {s}
            </Badge>
          ))}
          {(passport.sector_target?.length ?? 0) > 0 && (
            <>
              <ArrowRight className="size-3 text-muted-foreground mx-1" />
              {passport.sector_target?.map((s) => (
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

      {/* Summary */}
      {passport.summary && (
        <p className="text-sm text-muted-foreground ml-9 leading-relaxed">
          {passport.summary}
        </p>
      )}

      {/* Context + conditions */}
      {passport.context && (
        <p className="text-sm text-foreground/80 ml-9 leading-relaxed border-l-2 border-muted pl-3">
          {passport.context}
        </p>
      )}

      {/* Approval info */}
      {(passport.approval_body || passport.approval_ref) && (
        <div className="flex items-center gap-2 ml-9 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-green-500" />
          {passport.approval_body && <span>{passport.approval_body}</span>}
          {passport.approval_ref && <span>Ref: {passport.approval_ref}</span>}
          {passport.approval_date && (
            <span className="flex items-center gap-1">
              <CalendarCheck className="size-3" />
              {new Date(passport.approval_date).toLocaleDateString("en-GB")}
            </span>
          )}
        </div>
      )}

      {/* Valid conditions */}
      {passport.valid_conditions && (
        <p className="text-xs text-amber-700 dark:text-amber-400 ml-9 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
          <span className="font-semibold">Conditions: </span>
          {passport.valid_conditions}
        </p>
      )}
    </div>
  );
}
