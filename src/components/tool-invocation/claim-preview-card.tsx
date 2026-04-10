"use client";

import { ToolUIPart } from "ai";
import { memo, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Save,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SaveToPassportDialog } from "@/components/passport/save-to-passport-dialog";
import type { ClaimsPreviewOutput } from "lib/ai/tools/passport/extract-claims-preview-tool";
import type { ExtractedClaim } from "lib/ai/tools/passport/extract-claims-preview-tool";

// Re-export for tool-kit usage
export type { ClaimsPreviewOutput };

// ── Config (mirrors claim-extraction-card) ─────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  capability: "Capability",
  evidence: "Evidence",
  certification: "Certification",
  performance: "Performance",
  regulatory: "Regulatory",
};

const TIER_CONFIG = {
  self_reported: {
    label: "Self-reported",
    dot: "bg-blue-500",
    className: "border-blue-300 bg-blue-50/30 dark:bg-blue-950/20",
    badge:
      "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300",
  },
  ai_inferred: {
    label: "AI inferred",
    dot: "bg-amber-500",
    className: "border-amber-300 bg-amber-50/30 dark:bg-amber-950/20",
    badge:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300",
  },
  verified: {
    label: "Verified",
    dot: "bg-green-500",
    className: "border-green-300 bg-green-50/30 dark:bg-green-950/20",
    badge:
      "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300",
  },
};

// ── Individual claim row ───────────────────────────────────────────────────

function PreviewClaimRow({ claim }: { claim: ExtractedClaim }) {
  const [expanded, setExpanded] = useState(false);
  const tier = TIER_CONFIG[claim.confidence_tier] ?? TIER_CONFIG.ai_inferred;

  return (
    <div
      className={cn("rounded-lg border p-3 transition-colors", tier.className)}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", tier.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1 mb-1">
            <Badge variant="outline" className="text-xs capitalize">
              {claim.claim_role}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {DOMAIN_LABELS[claim.claim_domain] ?? claim.claim_domain}
            </Badge>
            <Badge className={cn("text-xs border", tier.badge)}>
              {tier.label}
            </Badge>
          </div>
          <p className="text-sm leading-snug">{claim.claim_text}</p>
          {claim.conditions && (
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium">Conditions: </span>
              {claim.conditions}
            </p>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t space-y-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Source excerpt
            </p>
            <blockquote className="text-xs italic border-l-2 border-muted pl-2 mt-1 text-foreground/80">
              {claim.source_excerpt}
            </blockquote>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Confidence reason
            </p>
            <p className="text-xs mt-1 text-foreground/80">
              {claim.confidence_reason}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main card ──────────────────────────────────────────────────────────────

export const ClaimPreviewCard = memo(function ClaimPreviewCard({
  part,
}: {
  part: ToolUIPart;
}) {
  const data = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return part.output as ClaimsPreviewOutput;
  }, [part.state, part.output]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [savedInfo, setSavedInfo] = useState<{
    passportId: string;
    title: string;
  } | null>(null);

  if (!data && part.state === "input-available") {
    return (
      <Card className="my-2">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Extracting claims…
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const byDomain = data.claims.reduce<Record<string, ExtractedClaim[]>>(
    (acc, c) => {
      (acc[c.claim_domain] ??= []).push(c);
      return acc;
    },
    {},
  );

  return (
    <>
      <Card className="my-2 border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Extracted Claims — Preview
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {data.claims.length} claim{data.claims.length !== 1 ? "s" : ""} ·
              not yet saved
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-blue-500" />
              {
                data.claims.filter((c) => c.confidence_tier === "self_reported")
                  .length
              }{" "}
              self-reported
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-amber-500" />
              {
                data.claims.filter((c) => c.confidence_tier === "ai_inferred")
                  .length
              }{" "}
              AI inferred
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(byDomain).map(([domain, claims]) => (
            <div key={domain}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {DOMAIN_LABELS[domain] ?? domain}
              </p>
              <div className="space-y-2">
                {claims.map((claim, i) => (
                  <PreviewClaimRow key={i} claim={claim} />
                ))}
              </div>
            </div>
          ))}

          {/* Save / saved state */}
          {savedInfo ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 px-3 py-2">
              <CheckCircle2 className="size-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-sm text-green-700 dark:text-green-300">
                Saved to <strong>{savedInfo.title}</strong>
              </span>
              <a
                href={`/passport/${savedInfo.passportId}`}
                className="ml-auto text-xs text-green-700 dark:text-green-400 underline flex items-center gap-0.5"
              >
                Review <ExternalLink className="size-3" />
              </a>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
              onClick={() => setDialogOpen(true)}
            >
              <Save className="size-3.5" />
              Save to Passport
            </Button>
          )}
        </CardContent>
      </Card>

      <SaveToPassportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pendingBatchId={data.pending_batch_id}
        claimCount={data.claims.length}
        onSaved={(id, title) => setSavedInfo({ passportId: id, title })}
      />
    </>
  );
});
