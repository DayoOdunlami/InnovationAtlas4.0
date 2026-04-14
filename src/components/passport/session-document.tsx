"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "lib/utils";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Circle,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ClaimRow = {
  id: string;
  claim_role: "asserts" | "requires" | "constrains";
  claim_domain:
    | "capability"
    | "evidence"
    | "certification"
    | "performance"
    | "regulatory";
  claim_text: string;
  confidence_tier: "verified" | "ai_inferred" | "self_reported";
  conditions: string | null;
};

type MatchDbRow = {
  id: string;
  match_score: number | null;
  project_id: string | null;
};

type MatchWithProject = {
  id: string;
  match_score: number | null;
  title: string | null;
  lead_funder: string | null;
  funding_amount: string | null;
};

type GapRow = {
  id: string;
  gap_description: string;
  severity: "blocking" | "significant" | "minor" | null;
  what_closes_it: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DOMAIN_ORDER: ClaimRow["claim_domain"][] = [
  "capability",
  "performance",
  "certification",
  "regulatory",
  "evidence",
];

const ROLE_COLOURS: Record<ClaimRow["claim_role"], string> = {
  asserts: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  requires:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  constrains:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

const TIER_COLOURS: Record<ClaimRow["confidence_tier"], string> = {
  verified:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  ai_inferred:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  self_reported:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const TIER_LABELS: Record<ClaimRow["confidence_tier"], string> = {
  verified: "Verified",
  ai_inferred: "AI Inferred",
  self_reported: "Self Reported",
};

const SEVERITY_ICONS: Record<
  NonNullable<GapRow["severity"]>,
  React.ReactElement
> = {
  blocking: <span title="Blocking">🔴</span>,
  significant: <span title="Significant">🟡</span>,
  minor: <span title="Minor">🟢</span>,
};

const RANK_MEDALS = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

function formatFunding(raw: string | null | number): string {
  if (raw === null || raw === undefined) return "amount not recorded";
  const num =
    typeof raw === "string"
      ? Number.parseFloat(raw.replace(/[^0-9.]/g, ""))
      : raw;
  if (Number.isNaN(num)) return String(raw);
  if (num >= 1_000_000)
    return `£${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (num >= 1_000) return `£${(num / 1_000).toFixed(0)}K`;
  return `£${num.toFixed(0)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible Section
// ─────────────────────────────────────────────────────────────────────────────

function useCollapsibleSection(key: string, defaultOpen = true) {
  const storageKey = `atlas-section-${key}`;
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = sessionStorage.getItem(storageKey);
    return stored !== null ? stored === "true" : defaultOpen;
  });

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  return { isOpen, toggle };
}

function SectionHeader({
  title,
  count,
  isOpen,
  onToggle,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between py-2 text-left"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title} <span className="text-foreground font-bold">({count})</span>
      </span>
      {isOpen ? (
        <ChevronDown className="size-3.5 text-muted-foreground" />
      ) : (
        <ChevronRight className="size-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Evidence Claims
// ─────────────────────────────────────────────────────────────────────────────

function EvidenceClaimsSection({
  passportId,
  initialClaims,
}: {
  passportId: string;
  initialClaims: ClaimRow[];
}) {
  const [claims, setClaims] = useState<ClaimRow[]>(initialClaims);
  const { isOpen, toggle } = useCollapsibleSection(
    `claims-${passportId}`,
    true,
  );

  const grouped = useMemo(() => {
    const map = new Map<ClaimRow["claim_domain"], ClaimRow[]>();
    for (const domain of DOMAIN_ORDER) {
      map.set(domain, []);
    }
    for (const c of claims) {
      map.get(c.claim_domain)?.push(c);
    }
    return map;
  }, [claims]);

  const handleVerify = useCallback(async (claimId: string) => {
    try {
      const res = await fetch("/api/passport/verify-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, action: "verify" }),
      });
      if (!res.ok) throw new Error("Failed");
      setClaims((prev) =>
        prev.map((c) =>
          c.id === claimId ? { ...c, confidence_tier: "verified" as const } : c,
        ),
      );
      toast.success("Claim verified");
    } catch {
      toast.error("Failed to verify claim");
    }
  }, []);

  return (
    <div className="border-b border-border/50 pb-3">
      <SectionHeader
        title="Evidence Claims"
        count={claims.length}
        isOpen={isOpen}
        onToggle={toggle}
      />
      {isOpen && (
        <div className="mt-2 space-y-3">
          {claims.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No claims yet. Ask JARVIS to extract claims from your evidence.
            </p>
          ) : (
            DOMAIN_ORDER.map((domain) => {
              const domainClaims = grouped.get(domain) ?? [];
              if (domainClaims.length === 0) return null;
              return (
                <div key={domain}>
                  <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1 capitalize">
                    {domain}
                  </p>
                  <div className="space-y-2">
                    {domainClaims.map((claim) => (
                      <div
                        key={claim.id}
                        className="rounded-md border border-border/40 bg-card/50 p-2 text-xs"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                              ROLE_COLOURS[claim.claim_role],
                            )}
                          >
                            {claim.claim_role}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                              TIER_COLOURS[claim.confidence_tier],
                            )}
                          >
                            {TIER_LABELS[claim.confidence_tier]}
                          </span>
                        </div>
                        <p className="text-foreground leading-snug mb-1.5">
                          {claim.claim_text}
                        </p>
                        {claim.conditions && (
                          <p className="text-muted-foreground italic text-[10px] mb-1.5">
                            {claim.conditions}
                          </p>
                        )}
                        {claim.confidence_tier !== "verified" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-5 text-[10px] px-2"
                            onClick={() => handleVerify(claim.id)}
                          >
                            Verify
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Cross-Sector Matches
// ─────────────────────────────────────────────────────────────────────────────

function MatchesSection({
  passportId,
  initialMatches,
}: {
  passportId: string;
  initialMatches: MatchWithProject[];
}) {
  const matches = initialMatches;
  const { isOpen, toggle } = useCollapsibleSection(
    `matches-${passportId}`,
    true,
  );

  return (
    <div className="border-b border-border/50 pb-3">
      <SectionHeader
        title="Cross-Sector Matches"
        count={matches.length}
        isOpen={isOpen}
        onToggle={toggle}
      />
      {isOpen && (
        <div className="mt-2 space-y-2">
          {matches.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No matches yet. Ask JARVIS to run matching for this passport.
            </p>
          ) : (
            matches.map((match, idx) => (
              <div
                key={match.id}
                className="rounded-md border border-border/40 bg-card/50 p-2 text-xs"
              >
                <div className="flex items-start gap-1.5">
                  <span className="text-sm leading-none">
                    {RANK_MEDALS[idx]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground leading-snug truncate">
                      {match.title ?? "Untitled project"}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      {match.lead_funder ?? "Unknown funder"} ·{" "}
                      {formatFunding(match.funding_amount)}
                      {match.match_score !== null && (
                        <span className="ml-1 font-semibold text-foreground">
                          {Math.round(match.match_score * 100)}% match
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Gap Analysis
// ─────────────────────────────────────────────────────────────────────────────

function GapAnalysisSection({
  passportId,
  initialGaps,
}: {
  passportId: string;
  initialGaps: GapRow[];
}) {
  const gaps = initialGaps;
  const { isOpen, toggle } = useCollapsibleSection(`gaps-${passportId}`, true);

  return (
    <div className="border-b border-border/50 pb-3">
      <SectionHeader
        title="Gap Analysis"
        count={gaps.length}
        isOpen={isOpen}
        onToggle={toggle}
      />
      {isOpen && (
        <div className="mt-2 space-y-2">
          {gaps.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No gaps identified yet. Ask JARVIS for a gap analysis.
            </p>
          ) : (
            gaps.map((gap) => (
              <div
                key={gap.id}
                className="rounded-md border border-border/40 bg-card/50 p-2 text-xs"
              >
                <div className="flex items-start gap-1.5">
                  {gap.severity ? (
                    SEVERITY_ICONS[gap.severity]
                  ) : (
                    <Circle className="size-3 text-muted-foreground mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="text-foreground leading-snug">
                      {gap.gap_description}
                    </p>
                    {gap.what_closes_it && (
                      <p className="text-muted-foreground mt-0.5 italic">
                        Closes with: {gap.what_closes_it}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Draft Pitch
// ─────────────────────────────────────────────────────────────────────────────

function DraftPitchSection({
  passportId,
  pitchText,
}: {
  passportId: string;
  pitchText: string | null;
}) {
  const { isOpen, toggle } = useCollapsibleSection(`pitch-${passportId}`, true);

  const handleCopy = useCallback(() => {
    if (!pitchText) return;
    navigator.clipboard.writeText(pitchText);
    toast.success("Pitch copied to clipboard");
  }, [pitchText]);

  return (
    <div className="pb-3">
      <SectionHeader
        title="Draft Pitch"
        count={pitchText ? 1 : 0}
        isOpen={isOpen}
        onToggle={toggle}
      />
      {isOpen && (
        <div className="mt-2">
          {pitchText ? (
            <div className="relative rounded-md border border-border/40 bg-card/50 p-3">
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {pitchText}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-6 text-[10px] px-2 gap-1"
                onClick={handleCopy}
              >
                <Copy className="size-3" />
                Copy to clipboard
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Ask JARVIS to 'draft a pitch' to generate your Statement of Intent
              here.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main SessionDocument Component
// ─────────────────────────────────────────────────────────────────────────────

export type SessionDocumentProps = {
  passportId: string | null;
  /** Latest draft pitch text extracted from chat messages by the parent. */
  pitchText?: string | null;
};

export function SessionDocument({
  passportId,
  pitchText = null,
}: SessionDocumentProps) {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [matches, setMatches] = useState<MatchWithProject[]>([]);
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createBrowserClient());

  const fetchClaims = useCallback(async (pid: string) => {
    const { data } = await supabaseRef.current
      .schema("atlas")
      .from("passport_claims")
      .select(
        "id, claim_role, claim_domain, claim_text, confidence_tier, conditions",
      )
      .eq("passport_id", pid)
      .eq("rejected", false)
      .order("claim_domain");
    setClaims((data as ClaimRow[]) ?? []);
  }, []);

  const fetchMatches = useCallback(async (pid: string) => {
    const { data: matchRows } = await supabaseRef.current
      .schema("atlas")
      .from("matches")
      .select("id, match_score, project_id")
      .eq("passport_id", pid)
      .order("match_score", { ascending: false })
      .limit(5);

    if (!matchRows?.length) {
      setMatches([]);
      return;
    }

    const typedMatchRows = matchRows as MatchDbRow[];
    const projectIds = typedMatchRows
      .map((m) => m.project_id)
      .filter(Boolean) as string[];
    const { data: projectRows } = await supabaseRef.current
      .schema("atlas")
      .from("projects")
      .select("id, title, lead_funder, funding_amount")
      .in("id", projectIds);

    type ProjectRow = {
      id: string;
      title: string | null;
      lead_funder: string | null;
      funding_amount: string | null;
    };
    const projectMap = new Map(
      ((projectRows ?? []) as ProjectRow[]).map((p) => [p.id, p]),
    );

    const enriched: MatchWithProject[] = typedMatchRows.map((m) => {
      const proj = projectMap.get(m.project_id ?? "");
      return {
        id: m.id,
        match_score: m.match_score,
        title: proj?.title ?? null,
        lead_funder: proj?.lead_funder ?? null,
        funding_amount: proj?.funding_amount ?? null,
      };
    });

    setMatches(enriched);
  }, []);

  const fetchGaps = useCallback(async (pid: string) => {
    const { data } = await supabaseRef.current
      .schema("atlas")
      .from("passport_gaps")
      .select("id, gap_description, severity, what_closes_it")
      .eq("evidence_passport_id", pid);
    setGaps((data as GapRow[]) ?? []);
  }, []);

  // Initial load
  useEffect(() => {
    if (!passportId) {
      setClaims([]);
      setMatches([]);
      setGaps([]);
      return;
    }

    setIsLoading(true);
    Promise.all([
      fetchClaims(passportId),
      fetchMatches(passportId),
      fetchGaps(passportId),
    ]).finally(() => setIsLoading(false));
  }, [passportId, fetchClaims, fetchMatches, fetchGaps]);

  // Supabase Realtime subscriptions
  useEffect(() => {
    if (!passportId) {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      return;
    }

    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`session-doc-${passportId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "atlas",
          table: "passport_claims",
          filter: `passport_id=eq.${passportId}`,
        },
        () => fetchClaims(passportId),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "atlas",
          table: "matches",
          filter: `passport_id=eq.${passportId}`,
        },
        () => fetchMatches(passportId),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "atlas",
          table: "passport_gaps",
          filter: `evidence_passport_id=eq.${passportId}`,
        },
        () => fetchGaps(passportId),
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [passportId, fetchClaims, fetchMatches, fetchGaps]);

  if (!passportId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-xs rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <CheckCircle className="size-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Select a passport to see your session document build here in
            real-time.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-1">
      <EvidenceClaimsSection passportId={passportId} initialClaims={claims} />
      <MatchesSection passportId={passportId} initialMatches={matches} />
      <GapAnalysisSection passportId={passportId} initialGaps={gaps} />
      <DraftPitchSection passportId={passportId} pitchText={pitchText} />
    </div>
  );
}
