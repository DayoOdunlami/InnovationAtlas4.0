import { LandscapeScatterLazy } from "@/components/landscape/landscape-scatter-lazy";
import { Map } from "lucide-react";

export default function LandscapePage() {
  return (
    <div className="flex flex-col h-full px-4 py-4">
      <div className="flex items-center gap-2 mb-4">
        <Map className="size-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Innovation Landscape</h1>
        <p className="text-sm text-muted-foreground ml-2 hidden sm:block">
          Semantic map of 622 cross-sector projects + live Horizon Europe calls
        </p>
      </div>
      <div className="flex-1 min-h-0 rounded-xl border border-border/60 bg-card/60 p-4">
        <LandscapeScatterLazy />
      </div>
    </div>
  );
}
