"use client";

import { ToolUIPart } from "ai";
import { memo, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  ClaimExtractionOutput,
  ClaimRow,
} from "lib/ai/tools/passport/claim-extraction-tool";

const DOMAIN_LABELS: Record<string, string> = {
  capability: "Capability",
  evidence: "Evidence",
  certification: "Certification",
  performance: "Performance",
  regulatory: "Regulatory",
};

const TIER_CONFIG = {
  verified: {
    label: "Verified",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-300",
    dot: "bg-green-500",
  },
  self_reported: {
    label: "Self-reported",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300",
    dot: "bg-blue-500",
  },
  ai_inferred: {
    label: "AI inferred",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300",
    dot: "bg-amber-500",
  },
};

function ClaimCard({
  claim,
  onVerify,
  onReject,
}: {
  claim: ClaimRow;
  onVerify: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localTier, setLocalTier] = useState(claim.confidence_tier);
  const [isActing, setIsActing] = useState(false);

  const tier = TIER_CONFIG[localTier] ?? TIER_CONFIG.ai_inferred;

  const handleVerify = async () => {
    setIsActing(true);
    try {
      await onVerify(claim.id);
      setLocalTier("verified");
    } finally {
      setIsActing(false);
    }
  };

  const handleReject = async () => {
    setIsActing(true);
    try {
      await onReject(claim.id);
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        localTier === "verified" &&
          "border-green-300 bg-green-50/30 dark:bg-green-950/20",
        localTier === "self_reported" &&
          "border-blue-300 bg-blue-50/30 dark:bg-blue-950/20",
        localTier === "ai_inferred" &&
          "border-amber-300 bg-amber-50/30 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span
            className={cn("mt-1.5 size-2 shrink-0 rounded-full", tier.dot)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1 mb-1">
              <Badge variant="outline" className="text-xs capitalize">
                {claim.claim_role}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {DOMAIN_LABELS[claim.claim_domain] ?? claim.claim_domain}
              </Badge>
              <Badge className={cn("text-xs border", tier.className)}>
                {tier.label}
              </Badge>
            </div>
            <p className="text-sm font-medium leading-snug">
              {claim.claim_text}
            </p>
            {claim.conditions && (
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-medium">Conditions: </span>
                {claim.conditions}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Toggle details"
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Source excerpt
            </p>
            <blockquote className="text-xs italic border-l-2 border-muted pl-2 mt-1 text-foreground/80">
              {claim.source_excerpt}
            </blockquote>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Confidence reason
            </p>
            <p className="text-xs mt-1 text-foreground/80">
              {claim.confidence_reason}
            </p>
          </div>
          {claim.user_note && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Your note
              </p>
              <p className="text-xs mt-1 text-foreground/80">
                {claim.user_note}
              </p>
            </div>
          )}
        </div>
      )}

      {localTier !== "verified" && (
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40"
            onClick={handleVerify}
            disabled={isActing}
          >
            {isActing ? (
              <Loader2 className="size-3 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="size-3 mr-1" />
            )}
            Verify
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-red-400 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={handleReject}
            disabled={isActing}
          >
            {isActing ? (
              <Loader2 className="size-3 animate-spin mr-1" />
            ) : (
              <XCircle className="size-3 mr-1" />
            )}
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export const ClaimExtractionCard = memo(function ClaimExtractionCard({
  part,
}: { part: ToolUIPart }) {
  const data = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return part.output as ClaimExtractionOutput;
  }, [part.state, part.output]);

  const passportId = useMemo(
    () => (part.input as { passport_id?: string })?.passport_id,
    [part.input],
  );

  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  const handleVerify = useCallback(async (claimId: string) => {
    const res = await fetch("/api/passport/verify-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_id: claimId, action: "verify" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Verify failed");
      throw new Error(body.error);
    }
    toast.success("Claim verified");
  }, []);

  const handleReject = useCallback(async (claimId: string) => {
    const res = await fetch("/api/passport/verify-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_id: claimId, action: "reject" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Reject failed");
      throw new Error(body.error);
    }
    setRejectedIds((prev) => new Set([...prev, claimId]));
    toast.success("Claim rejected");
  }, []);

  if (!data && part.state === "input-available") {
    return (
      <Card className="my-2">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading claims…
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const visibleClaims = data.claims.filter((c) => !rejectedIds.has(c.id));

  const byDomain = visibleClaims.reduce<Record<string, ClaimRow[]>>(
    (acc, c) => {
      (acc[c.claim_domain] ??= []).push(c);
      return acc;
    },
    {},
  );

  const verifiedCount = visibleClaims.filter(
    (c) => c.confidence_tier === "verified",
  ).length;
  const inferredCount = visibleClaims.filter(
    (c) => c.confidence_tier === "ai_inferred",
  ).length;
  const selfCount = visibleClaims.filter(
    (c) => c.confidence_tier === "self_reported",
  ).length;

  return (
    <Card className="my-2 border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          Extracted Claims
          {passportId && (
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              Passport {passportId.slice(0, 8)}…
            </span>
          )}
        </CardTitle>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-green-500" />
            {verifiedCount} verified
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-blue-500" />
            {selfCount} self-reported
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-500" />
            {inferredCount} AI inferred — click Verify to confirm
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
              {claims.map((claim) => (
                <ClaimCard
                  key={claim.id}
                  claim={claim}
                  onVerify={handleVerify}
                  onReject={handleReject}
                />
              ))}
            </div>
          </div>
        ))}
        {visibleClaims.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No claims found for this passport.
          </p>
        )}
      </CardContent>
    </Card>
  );
});
