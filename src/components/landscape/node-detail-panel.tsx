"use client";

import { useEffect, useRef } from "react";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  LandscapeProject,
  LandscapeLiveCall,
} from "@/app/api/landscape/data/route";

export type SelectedNode =
  | ({ _type: "project" } & LandscapeProject)
  | ({ _type: "live" } & LandscapeLiveCall);

function formatProjectAmount(val: number | null | undefined): string | null {
  if (val == null) return null;
  if (val >= 1_000_000) return `£${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `£${(val / 1_000).toFixed(0)}K`;
  return `£${val.toLocaleString()}`;
}

function formatLiveCallAmount(
  val: string | null | undefined,
  funder: string | null | undefined,
): string {
  const s = val == null ? "" : String(val).trim();
  const funderLower = (funder ?? "").toLowerCase();

  // Horizon Europe JSON blobs or null with a Horizon/EC funder
  const isHorizonEurope =
    s.startsWith("{") ||
    s.startsWith("[") ||
    (s === "" &&
      (funderLower.includes("european commission") ||
        funderLower.includes("horizon europe")));

  if (isHorizonEurope) return "Multi-topic call — budgets vary by strand";
  if (s === "") return "Not disclosed";

  // Numeric amount — format as £xM / £xK
  const n = parseFloat(s);
  if (!isNaN(n)) {
    if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
    return `£${n.toLocaleString()}`;
  }

  // Plain-text amount (e.g. "a share of up to £121 million") — truncate at 60 chars
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function liveCallLinkLabel(sourceUrl: string): string {
  if (
    sourceUrl.includes("find-a-tender") ||
    sourceUrl.includes("findatender")
  ) {
    return "View tender notice →";
  }
  return "View opportunity →";
}

interface NodeDetailPanelProps {
  node: SelectedNode | null;
  onClose: () => void;
}

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!node) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [node, onClose]);

  if (!node) return null;

  const isLive = node._type === "live";
  const liveNode = isLive
    ? (node as { _type: "live" } & LandscapeLiveCall)
    : null;
  const projectNode = !isLive
    ? (node as { _type: "project" } & LandscapeProject)
    : null;

  const funder = isLive ? liveNode!.funder : projectNode!.lead_funder;
  const fundingDisplay = isLive
    ? formatLiveCallAmount(liveNode!.funding_amount, liveNode!.funder)
    : formatProjectAmount(projectNode!.funding_amount);
  const rawText = isLive
    ? (liveNode!.description ?? "")
    : (projectNode!.abstract ?? "");
  const excerpt = rawText.length > 300 ? `${rawText.slice(0, 300)}…` : rawText;

  const sourceUrl = isLive ? liveNode!.source_url : projectNode!.source_url;

  return (
    <div
      ref={panelRef}
      className="absolute top-0 right-0 h-full w-80 z-20 bg-card border-l border-border shadow-xl flex flex-col animate-in slide-in-from-right duration-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 border-b border-border">
        <h2 className="text-sm font-semibold leading-snug line-clamp-4 flex-1">
          {node.title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 -mt-0.5"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        {/* Funder */}
        {funder && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
              Lead funder
            </p>
            <p className="text-foreground">{funder}</p>
          </div>
        )}

        {/* Funding amount */}
        {fundingDisplay && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
              Funding
            </p>
            <p className="font-medium text-sm">{fundingDisplay}</p>
          </div>
        )}

        {/* Status badge */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">
            Status
          </p>
          {isLive ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                OPEN
              </span>
              {liveNode!.deadline && (
                <span className="text-xs text-muted-foreground">
                  Deadline: {liveNode!.deadline}
                </span>
              )}
            </div>
          ) : (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                (projectNode!.status ?? "").toLowerCase() === "active"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {(projectNode!.status ?? "CLOSED").toUpperCase()}
            </span>
          )}
        </div>

        {/* Abstract / description — visual centrepiece of the panel */}
        {excerpt && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
              {isLive ? "Description" : "Abstract"}
            </p>
            <p className="text-[13px] leading-relaxed text-foreground/90">
              {excerpt}
            </p>
          </div>
        )}
      </div>

      {/* Footer — source URL link */}
      {sourceUrl && (
        <div className="p-4 border-t border-border">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <ExternalLink className="size-3" />
            {isLive ? liveCallLinkLabel(sourceUrl) : "View on GtR →"}
          </a>
        </div>
      )}
    </div>
  );
}
