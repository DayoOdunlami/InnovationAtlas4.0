"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

const LandscapeScatter = dynamic(
  () =>
    import("@/components/landscape/landscape-scatter").then(
      (mod) => mod.LandscapeScatter,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading landscape…
      </div>
    ),
  },
);

interface LandscapeScatterLazyProps {
  modeFilter?: string;
  showLiveCalls?: boolean;
  /** When set, emphasises nodes whose inferred theme matches (guided demo). */
  highlightTheme?: string | null;
}

export function LandscapeScatterLazy({
  modeFilter = "All",
  showLiveCalls = true,
  highlightTheme = null,
}: LandscapeScatterLazyProps) {
  return (
    <LandscapeScatter
      modeFilter={modeFilter}
      showLiveCalls={showLiveCalls}
      highlightTheme={highlightTheme}
    />
  );
}
