"use client";

import { memo, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PassportClaimRow } from "@/lib/passport/types";

// ── Constants ──────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  capability: "Capability",
  evidence: "Evidence",
  certification: "Certification",
  performance: "Performance",
  regulatory: "Regulatory",
};

const DOMAIN_ORDER = [
  "capability",
  "evidence",
  "performance",
  "certification",
  "regulatory",
];

const TIER_CONFIG = {
  verified: {
    label: "Verified",
    dot: "bg-green-500",
    border: "border-green-300 bg-green-50/40 dark:bg-green-950/20",
    badge:
      "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300",
  },
  self_reported: {
    label: "Self-reported",
    dot: "bg-blue-500",
    border: "border-blue-300 bg-blue-50/30 dark:bg-blue-950/20",
    badge:
      "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300",
  },
  ai_inferred: {
    label: "AI inferred",
    dot: "bg-amber-500",
    border: "border-amber-300 bg-amber-50/30 dark:bg-amber-950/20",
    badge:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300",
  },
};

// ── ClaimCard ──────────────────────────────────────────────────────────────

function ClaimCard({
  claim,
  onVerify,
  onReject,
}: {
  claim: PassportClaimRow;
  onVerify: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localTier, setLocalTier] = useState<
    PassportClaimRow["confidence_tier"]
  >(claim.confidence_tier);
  const [acting, setActing] = useState<"verify" | "reject" | null>(null);

  const cfg = TIER_CONFIG[localTier] ?? TIER_CONFIG.ai_inferred;

  const handleVerify = async () => {
    setActing("verify");
    try {
      await onVerify(claim.id);
      setLocalTier("verified");
    } finally {
      setActing(null);
    }
  };

  const handleReject = async () => {
    setActing("reject");
    try {
      await onReject(claim.id);
    } finally {
      setActing(null);
    }
  };

  return (
    <div className={cn("rounded-lg border p-3 transition-colors", cfg.border)}>
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", cfg.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1 mb-1">
            <Badge variant="outline" className="text-xs capitalize">
              {claim.claim_role}
            </Badge>
            <Badge
              variant="outline"
              className={cn("text-xs border", cfg.badge)}
            >
              {cfg.label}
            </Badge>
            {claim.verified_by && (
              <span className="text-xs text-muted-foreground">
                · {claim.verified_by}
              </span>
            )}
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
          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
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
        <div className="mt-2 pt-2 border-t border-border/60 space-y-2">
          {claim.source_excerpt && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Source excerpt
              </p>
              <blockquote className="text-xs italic border-l-2 border-muted pl-2 mt-1 text-foreground/80">
                {claim.source_excerpt}
              </blockquote>
            </div>
          )}
          {claim.confidence_reason && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Confidence reason
              </p>
              <p className="text-xs mt-1 text-foreground/80">
                {claim.confidence_reason}
              </p>
            </div>
          )}
          {claim.user_note && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Note
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
            disabled={acting !== null}
          >
            {acting === "verify" ? (
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
            disabled={acting !== null}
          >
            {acting === "reject" ? (
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

// ── Summary bar ────────────────────────────────────────────────────────────

function ClaimSummary({
  claims,
  rejectedIds,
}: {
  claims: PassportClaimRow[];
  rejectedIds: Set<string>;
}) {
  const visible = claims.filter((c) => !rejectedIds.has(c.id));
  const verified = visible.filter(
    (c) => c.confidence_tier === "verified",
  ).length;
  const selfReported = visible.filter(
    (c) => c.confidence_tier === "self_reported",
  ).length;
  const aiInferred = visible.filter(
    (c) => c.confidence_tier === "ai_inferred",
  ).length;

  return (
    <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/30 border border-border/60">
      <span className="flex items-center gap-1.5 text-sm">
        <span className="size-2 rounded-full bg-green-500" />
        <span className="font-semibold">{verified}</span>
        <span className="text-muted-foreground">verified</span>
      </span>
      <span className="flex items-center gap-1.5 text-sm">
        <span className="size-2 rounded-full bg-blue-500" />
        <span className="font-semibold">{selfReported}</span>
        <span className="text-muted-foreground">self-reported</span>
      </span>
      <span className="flex items-center gap-1.5 text-sm">
        <span className="size-2 rounded-full bg-amber-500" />
        <span className="font-semibold">{aiInferred}</span>
        <span className="text-muted-foreground">
          AI-inferred — click Verify to confirm
        </span>
      </span>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

export const PassportClaimsSection = memo(function PassportClaimsSection({
  initialClaims,
}: {
  initialClaims: PassportClaimRow[];
}) {
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
    toast.success("Claim rejected and removed");
  }, []);

  const visibleClaims = initialClaims.filter((c) => !rejectedIds.has(c.id));

  // Group by domain in preferred order
  const grouped = DOMAIN_ORDER.reduce<Record<string, PassportClaimRow[]>>(
    (acc, domain) => {
      const items = visibleClaims.filter((c) => c.claim_domain === domain);
      if (items.length) acc[domain] = items;
      return acc;
    },
    {},
  );

  // Any domains not in DOMAIN_ORDER
  visibleClaims.forEach((c) => {
    if (!grouped[c.claim_domain]) {
      (grouped[c.claim_domain] ??= []).push(c);
    }
  });

  if (initialClaims.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No claims extracted yet. Upload a document to start.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ClaimSummary claims={initialClaims} rejectedIds={rejectedIds} />
      {Object.entries(grouped).map(([domain, claims]) => (
        <div key={domain}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {DOMAIN_LABELS[domain] ?? domain}
          </h3>
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
    </div>
  );
});
