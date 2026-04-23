"use client";

// ---------------------------------------------------------------------------
// BriefLayoutToggle — Phase 3c-a
//
// Three icon buttons: Focus (B) | Side-by-Side (A).
// Rendered in the brief header for owner scope only.
// ---------------------------------------------------------------------------

import { cn } from "@/lib/utils";
import type { BriefLayoutVariant } from "@/hooks/use-brief-layout";
import { AlignLeft, Columns2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { Button } from "ui/button";

interface BriefLayoutToggleProps {
  layout: BriefLayoutVariant;
  onSelect: (v: BriefLayoutVariant) => void;
}

const OPTIONS: {
  value: BriefLayoutVariant;
  icon: React.ReactNode;
  label: string;
}[] = [
  {
    value: "focus",
    icon: <AlignLeft className="size-3.5" />,
    label: "Focus — brief full-width, chat below",
  },
  {
    value: "side-by-side",
    icon: <Columns2 className="size-3.5" />,
    label: "Side-by-side — brief left, chat right",
  },
];

export function BriefLayoutToggle({
  layout,
  onSelect,
}: BriefLayoutToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5">
      {OPTIONS.map((opt) => (
        <Tooltip key={opt.value}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelect(opt.value)}
              className={cn(
                "h-6 w-6 p-0 rounded-md transition-colors",
                layout === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={layout === opt.value}
              aria-label={opt.label}
            >
              {opt.icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {opt.label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
