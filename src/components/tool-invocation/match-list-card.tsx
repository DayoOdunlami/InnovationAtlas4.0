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
  ExternalLink,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  MatchListOutput,
  MatchRow,
} from "lib/ai/tools/passport/match-list-tool";

// ── Score helpers ─────────────────────────────────────────────────────────
// Scores realistically range 0.25 – 0.50 for this corpus.
// Thresholds recalibrated so "good" isn't invisible.

function scoreColor(score: number) {
  if (score >= 0.4) return "text-green-600 dark:text-green-400";
  if (score >= 0.3) return "text-amber-600 dark:text-amber-400";
  return "text-orange-500 dark:text-orange-400";
}

function scoreBg(score: number) {
  if (score >= 0.4) return "bg-green-500";
  if (score >= 0.3) return "bg-amber-500";
  return "bg-orange-400";
}

// ── Formatting ────────────────────────────────────────────────────────────

function formatAmount(amount: number | null): string {
  if (!amount) return "Amount unknown";
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${(amount / 1_000).toFixed(0)}K`;
  return `£${amount.toLocaleString()}`;
}

function formatDeadline(deadline: string | null | undefined): string | null {
  if (!deadline) return null;
  try {
    const d = new Date(deadline);
    if (Number.isNaN(d.getTime())) return deadline;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return deadline;
  }
}

function daysUntil(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  try {
    const d = new Date(deadline);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  } catch {
    return null;
  }
}

// ── MatchItem ─────────────────────────────────────────────────────────────

function MatchItem({ match, rank }: { match: MatchRow; rank: number }) {
  const pct = Math.round(match.match_score * 100);
  const hasGaps = Array.isArray(match.gaps) && match.gaps.length > 0;
  const isLiveCall = match.match_type === "live_call";
  const isOpen = isLiveCall && match.status === "open";

  const deadlineFormatted = formatDeadline(match.deadline);
  const days = daysUntil(match.deadline);
  const isUrgent = days !== null && days <= 30;
  const isVerySoon = days !== null && days <= 7;

  return (
    <div
      className={cn(
        "flex gap-3 py-3 border-b last:border-b-0",
        isOpen && "bg-emerald-50/40 dark:bg-emerald-950/20 -mx-4 px-4 rounded",
      )}
    >
      {/* Score column */}
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

      {/* Content column */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start gap-2 flex-wrap">
          <p className="text-sm font-semibold leading-snug line-clamp-2 flex-1 min-w-0">
            {match.title}
          </p>
          {isOpen && (
            <Badge className="shrink-0 text-xs bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1 px-1.5">
              <span className="size-1.5 rounded-full bg-white animate-pulse inline-block" />
              OPEN
            </Badge>
          )}
          {isLiveCall && !isOpen && (
            <Badge
              variant="outline"
              className="shrink-0 text-xs text-muted-foreground flex items-center gap-1"
            >
              Closed
            </Badge>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {match.lead_funder && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="size-3 shrink-0" />
              {match.lead_funder}
            </span>
          )}
          {isLiveCall ? (
            deadlineFormatted && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  isVerySoon
                    ? "text-red-600 dark:text-red-400"
                    : isUrgent
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                )}
              >
                {isVerySoon ? (
                  <Clock className="size-3 shrink-0" />
                ) : (
                  <Calendar className="size-3 shrink-0" />
                )}
                Deadline: {deadlineFormatted}
                {days !== null && days >= 0 && (
                  <span className="text-xs opacity-75">({days}d)</span>
                )}
                {days !== null && days < 0 && (
                  <span className="text-xs opacity-75">(closed)</span>
                )}
              </span>
            )
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <PoundSterling className="size-3 shrink-0" />
              {formatAmount(match.funding_amount)}
            </span>
          )}
        </div>

        {/* Summary */}
        {match.match_summary && (
          <p className="text-xs text-foreground/70 mt-1 leading-relaxed line-clamp-3">
            {match.match_summary}
          </p>
        )}

        {/* Gaps + source link */}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {hasGaps && (
            <div className="flex items-center gap-1">
              <AlertTriangle className="size-3 text-amber-500 shrink-0" />
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {(match.gaps as unknown[]).length} gap
                {(match.gaps as unknown[]).length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {match.source_url && (
            <a
              href={match.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="size-3 shrink-0" />
              {isLiveCall ? "View funding call" : "View on GtR"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MatchListCard ─────────────────────────────────────────────────────────

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

  const openLiveCalls = data.matches.filter(
    (m) => m.match_type === "live_call" && m.status === "open",
  );
  const projectMatches = data.matches.filter((m) => m.match_type === "project");

  const totalProjectFunding = projectMatches.reduce(
    (sum, m) => sum + (m.funding_amount ?? 0),
    0,
  );

  return (
    <Card className="my-2 border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base flex-wrap">
          <TrendingUp className="size-4 shrink-0" />
          Cross-Sector Matches
          <div className="flex gap-1.5 ml-auto flex-wrap">
            {openLiveCalls.length > 0 && (
              <Badge className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white">
                {openLiveCalls.length} open call
                {openLiveCalls.length !== 1 ? "s" : ""}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {data.matches.length} total
            </Badge>
          </div>
        </CardTitle>
        {openLiveCalls.length > 0 && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            {openLiveCalls.length} live funding{" "}
            {openLiveCalls.length === 1 ? "call is" : "calls are"} open right
            now — apply before the deadline.
          </p>
        )}
        {totalProjectFunding > 0 && (
          <p className="text-xs text-muted-foreground">
            Historical funding across matched GtR projects:{" "}
            <span className="font-semibold text-foreground">
              {formatAmount(totalProjectFunding)}
            </span>
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {data.matches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No matches found above threshold. Run matching first or add more
            evidence claims.
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
