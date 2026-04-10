"use client";

import { ToolUIPart } from "ai";
import { memo, useMemo } from "react";
import {
  TrendingUp,
  AlertTriangle,
  Loader2,
  Building2,
  PoundSterling,
  Calendar,
  Radio,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  MatchListOutput,
  MatchRow,
} from "lib/ai/tools/passport/match-list-tool";

function scoreColor(score: number) {
  if (score >= 0.75) return "text-green-600 dark:text-green-400";
  if (score >= 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function scoreBg(score: number) {
  if (score >= 0.75) return "bg-green-500";
  if (score >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

function formatAmount(amount: number | null): string {
  if (!amount) return "Amount unknown";
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${(amount / 1_000).toFixed(0)}K`;
  return `£${amount.toLocaleString()}`;
}

function MatchItem({ match, rank }: { match: MatchRow; rank: number }) {
  const pct = Math.round(match.match_score * 100);
  const hasGaps = Array.isArray(match.gaps) && match.gaps.length > 0;
  const isLiveCall = match.match_type === "live_call";

  return (
    <div className="flex gap-3 py-3 border-b last:border-b-0">
      <div className="flex flex-col items-center gap-1 pt-0.5 w-8 shrink-0">
        <span className="text-xs font-bold text-muted-foreground">#{rank}</span>
        <div
          className={cn(
            "text-sm font-bold tabular-nums",
            scoreColor(match.match_score),
          )}
        >
          {pct}%
        </div>
        <div className="w-1 flex-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("w-full rounded-full", scoreBg(match.match_score))}
            style={{ height: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="text-sm font-semibold leading-snug line-clamp-2 flex-1">
            {match.title}
          </p>
          {isLiveCall && (
            <Badge
              variant="outline"
              className="shrink-0 text-xs border-emerald-500 text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
            >
              <Radio className="size-2.5" />
              Live Call
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-1">
          {match.lead_funder && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="size-3" />
              {match.lead_funder}
            </span>
          )}
          {isLiveCall && match.deadline ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              Deadline: {match.deadline}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <PoundSterling className="size-3" />
              {formatAmount(match.funding_amount)}
            </span>
          )}
        </div>
        {match.match_summary && (
          <p className="text-xs text-foreground/70 mt-1 leading-relaxed line-clamp-3">
            {match.match_summary}
          </p>
        )}
        {hasGaps && (
          <div className="flex items-center gap-1 mt-1">
            <AlertTriangle className="size-3 text-amber-500 shrink-0" />
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {(match.gaps as unknown[]).length} gap
              {(match.gaps as unknown[]).length !== 1 ? "s" : ""} identified
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export const MatchListCard = memo(function MatchListCard({
  part,
}: { part: ToolUIPart }) {
  const data = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return part.output as MatchListOutput;
  }, [part.state, part.output]);

  if (!data && part.state === "input-available") {
    return (
      <Card className="my-2">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading matches…
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const totalFunding = data.matches.reduce(
    (sum, m) => sum + (m.funding_amount ?? 0),
    0,
  );

  return (
    <Card className="my-2 border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4" />
          Cross-Sector Matches
          <Badge variant="secondary" className="ml-auto text-xs">
            {data.matches.length} found
          </Badge>
        </CardTitle>
        {totalFunding > 0 && (
          <p className="text-xs text-muted-foreground">
            Total eligible funding across matches:{" "}
            <span className="font-semibold text-foreground">
              {formatAmount(totalFunding)}
            </span>
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {data.matches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No matches found. Upload evidence documents and run claim extraction
            first.
          </p>
        ) : (
          <div>
            {data.matches.map((match, i) => (
              <MatchItem key={match.id} match={match} rank={i + 1} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
