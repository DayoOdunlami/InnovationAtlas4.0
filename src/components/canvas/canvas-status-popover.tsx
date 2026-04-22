"use client";

// ---------------------------------------------------------------------------
// Canvas status popover (Thread 1)
//
// Hex/Linear pattern — a small "Status" chip in the /canvas top bar. Clicking
// opens a popover listing every feature grouped by status (Ready / In progress
// / Planned). Pure consumer of `FEATURE_STATUS` — no props, no state mutation,
// no network. The chip dot turns amber when any canvas-surface feature is WIP,
// emerald when everything on the canvas surface is ready.
// ---------------------------------------------------------------------------

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FEATURE_STATUS,
  type FeatureEntry,
  type FeatureStatus,
  STATUS_LABEL,
  SURFACE_LABEL,
  groupByStatus,
  hasActiveWipOnCanvas,
} from "@/lib/canvas/feature-status";
import { cn } from "lib/utils";
import {
  CircleCheck,
  CircleDashed,
  FlaskConical,
  Loader,
  MessageSquareWarning,
} from "lucide-react";
import { useMemo } from "react";

const STATUS_ORDER: FeatureStatus[] = ["ready", "alpha", "wip", "planned"];

const STATUS_ICON: Record<
  FeatureStatus,
  React.ComponentType<{ className?: string }>
> = {
  ready: CircleCheck,
  alpha: FlaskConical,
  wip: Loader,
  planned: CircleDashed,
};

const STATUS_COLOUR: Record<FeatureStatus, string> = {
  ready: "text-emerald-500",
  alpha: "text-sky-500",
  wip: "text-amber-500",
  planned: "text-muted-foreground",
};

function EntryRow({ entry }: { entry: FeatureEntry }) {
  const Icon = STATUS_ICON[entry.status];
  return (
    <li className="flex items-start gap-2 py-1 text-xs">
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          STATUS_COLOUR[entry.status],
          entry.status === "wip" && "animate-[spin_3s_linear_infinite]",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-foreground">
            {entry.label}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
            {SURFACE_LABEL[entry.surface]}
          </span>
        </div>
        {entry.note ? (
          <div className="mt-0.5 text-muted-foreground">{entry.note}</div>
        ) : null}
      </div>
    </li>
  );
}

export function CanvasStatusPopover() {
  const grouped = useMemo(() => groupByStatus(FEATURE_STATUS), []);
  const amber = hasActiveWipOnCanvas();

  const counts = {
    ready: grouped.ready.length,
    alpha: grouped.alpha.length,
    wip: grouped.wip.length,
    planned: grouped.planned.length,
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs font-medium"
          aria-label="Show canvas feature status"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              amber ? "bg-amber-500" : "bg-emerald-500",
            )}
            aria-hidden
          />
          Status
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-80 max-h-[70vh] overflow-y-auto p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold text-foreground">
            Feature status
          </span>
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CircleCheck className="size-3 text-emerald-500" />
              {counts.ready}
            </span>
            <span className="flex items-center gap-1">
              <FlaskConical className="size-3 text-sky-500" />
              {counts.alpha}
            </span>
            <span className="flex items-center gap-1">
              <Loader className="size-3 text-amber-500" />
              {counts.wip}
            </span>
            <span className="flex items-center gap-1">
              <CircleDashed className="size-3 text-muted-foreground" />
              {counts.planned}
            </span>
          </span>
        </div>

        <div className="px-3 py-2">
          {STATUS_ORDER.map((status) => {
            const entries = grouped[status];
            if (entries.length === 0) return null;
            return (
              <section key={status} className="mb-3 last:mb-0">
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {STATUS_LABEL[status]}
                </h4>
                <ul className="space-y-0.5">
                  {entries.map((e) => (
                    <EntryRow key={e.id} entry={e} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="flex items-start gap-2 border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <MessageSquareWarning
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden
          />
          <span>
            This list is the truth. The assistant sees the same statuses and
            will not promise features marked in progress or planned.
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
