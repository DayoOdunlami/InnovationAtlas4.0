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

export function LandscapeScatterLazy() {
  return <LandscapeScatter />;
}
