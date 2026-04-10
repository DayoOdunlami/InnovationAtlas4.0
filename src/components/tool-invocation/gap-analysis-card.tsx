"use client";

import { ToolUIPart } from "ai";
import { memo, useMemo } from "react";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Loader2,
  Microscope,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  GapAnalysisOutput,
  GapRow,
} from "lib/ai/tools/passport/gap-analysis-tool";

const GAP_TYPE_LABELS: Record<string, string> = {
  missing_evidence: "Missing evidence",
  trl_gap: "TRL gap",
  sector_gap: "Sector gap",
  certification_gap: "Certification gap",
  conditions_mismatch: "Conditions mismatch",
};

const SEVERITY_CONFIG = {
  blocking: {
    label: "Blocking",
    icon: AlertCircle,
    className: "border-red-400 bg-red-50/40 dark:bg-red-950/20",
    badge:
      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300",
    iconClass: "text-red-500",
  },
  significant: {
    label: "Significant",
    icon: AlertTriangle,
    className: "border-amber-400 bg-amber-50/40 dark:bg-amber-950/20",
    badge:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300",
    iconClass: "text-amber-500",
  },
  minor: {
    label: "Minor",
    icon: Info,
    className: "border-blue-300 bg-blue-50/30 dark:bg-blue-950/20",
    badge:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300",
    iconClass: "text-blue-500",
  },
};

function GapItem({ gap }: { gap: GapRow }) {
  const config = SEVERITY_CONFIG[gap.severity] ?? SEVERITY_CONFIG.minor;
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg border p-3", config.className)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("size-4 mt-0.5 shrink-0", config.iconClass)} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1 mb-1">
            <Badge className={cn("text-xs border", config.badge)}>
              {config.label}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {GAP_TYPE_LABELS[gap.gap_type] ?? gap.gap_type}
            </Badge>
          </div>
          <p className="text-sm leading-snug">{gap.gap_description}</p>
        </div>
      </div>
    </div>
  );
}

export const GapAnalysisCard = memo(function GapAnalysisCard({
  part,
}: { part: ToolUIPart }) {
  const data = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return part.output as GapAnalysisOutput;
  }, [part.state, part.output]);

  if (!data && part.state === "input-available") {
    return (
      <Card className="my-2">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Analysing gaps…
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const blocking = data.gaps.filter((g) => g.severity === "blocking");
  const significant = data.gaps.filter((g) => g.severity === "significant");
  const minor = data.gaps.filter((g) => g.severity === "minor");

  return (
    <Card className="my-2 border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Microscope className="size-4" />
          Gap Analysis
        </CardTitle>
        <div className="flex flex-wrap gap-2 text-xs">
          {blocking.length > 0 && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
              <AlertCircle className="size-3" /> {blocking.length} blocking
            </span>
          )}
          {significant.length > 0 && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3" /> {significant.length}{" "}
              significant
            </span>
          )}
          {minor.length > 0 && (
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <Info className="size-3" /> {minor.length} minor
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {data.gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No gaps recorded. Run match analysis to identify evidence gaps.
          </p>
        ) : (
          data.gaps.map((gap) => <GapItem key={gap.id} gap={gap} />)
        )}
      </CardContent>
    </Card>
  );
});
