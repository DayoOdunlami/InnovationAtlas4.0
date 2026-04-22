"use client";

// ---------------------------------------------------------------------------
// Legacy route banner (Thread 1)
//
// Small dismissible amber strip rendered at the top of legacy /landscape and
// /landscape-v2 routes so users and demo-watchers know the page is a parked
// exploratory variant superseded by /landscape-3d. Dismissal is session-only
// (useState) — it returns on the next page load, which is what we want for a
// persistent "this is legacy" signal during the stakeholder demo period.
// ---------------------------------------------------------------------------

import { cn } from "lib/utils";
import { ArrowUpRight, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export interface LegacyBannerProps {
  message: string;
  /** Optional link to the canonical replacement route. */
  docHref?: string;
  docLabel?: string;
  className?: string;
}

export function LegacyBanner({
  message,
  docHref,
  docLabel = "Open canonical view",
  className,
}: LegacyBannerProps) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex w-full items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-950 dark:text-amber-100",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{message}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {docHref ? (
          <Link
            href={docHref}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium underline-offset-2 hover:underline"
          >
            {docLabel}
            <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-0.5 hover:bg-amber-500/20"
          aria-label="Dismiss legacy route banner"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
