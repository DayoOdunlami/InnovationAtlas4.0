"use client";

// ---------------------------------------------------------------------------
// Canvas workbench (Sprint X Commit 7 — Brief X §7)
//
// The unified /canvas shell. Three panels from left to right:
//
//   [icon rail] [main stage] [chat rail]
//
// The icon rail is a thin lens switcher (force-graph active today; scatter,
// sankey, timeline and coverage-matrix are visible-but-disabled stubs that
// will light up as their lenses land in Commits 8–9 and beyond).
//
// The main stage embeds the force-graph lens (currently the whole
// Landscape3DPage component; Commit 9 will extract a shared <ForceGraphLens/>
// so /landscape-3d and /canvas stop duplicating chrome).
//
// The chat rail hosts the existing ChatBot. Because both /landscape-3d and
// /canvas share `appStore.canvas`, tool calls made here mutate the same
// state that any open /landscape-3d tab already observes — the dispatcher
// wired in Commit 6 applies them.
//
// A floating bottom-centre mic button is included as a placeholder for the
// voice entry point (Sprint B). It toasts on click today so the affordance
// is discoverable without tripping the voice stack.
// ---------------------------------------------------------------------------

import { appStore } from "@/app/store";
import type { CanvasLensId } from "@/app/store";
import { CanvasStatusPopover } from "@/components/canvas/canvas-status-popover";
import ChatBot from "@/components/chat-bot";
import { AppDefaultToolkit } from "@/lib/ai/tools";
import { cn } from "lib/utils";
import {
  CircleDot,
  GitBranch,
  Grid3x3,
  Layers,
  Mic,
  Timer,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Defer the heavy force-graph component (uses react-force-graph-3d + three)
// to the client-only bundle so /canvas SSR is cheap and predictable.
const Landscape3DPage = dynamic(
  () => import("@/app/(chat)/landscape-3d/page"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        Loading force-graph lens…
      </div>
    ),
  },
);

interface LensOption {
  id: CanvasLensId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
}

const LENSES: LensOption[] = [
  { id: "force-graph", label: "Force graph", icon: GitBranch, enabled: true },
  { id: "scatter", label: "Scatter", icon: CircleDot, enabled: false },
  { id: "sankey", label: "Sankey", icon: Layers, enabled: false },
  { id: "timeline", label: "Timeline", icon: Timer, enabled: false },
  { id: "coverage-matrix", label: "Coverage", icon: Grid3x3, enabled: false },
];

interface CanvasWorkbenchProps {
  threadId: string;
  initialPassportId?: string | null;
}

export function CanvasWorkbench({
  threadId,
  initialPassportId,
}: CanvasWorkbenchProps) {
  // Single-fire passport hydration (R2 of the confirmed refinements). The
  // actual filter resolution will land in Commit 10 with the demo
  // choreography — for now we just log the intent and drop a toast so we
  // can verify URL params reach the page.
  // Merge-in the Canvas toolkit once on mount so the agent can see the
  // canvas tools without the user having to toggle them in the tool
  // selector. Other user-enabled toolkits are left untouched.
  useEffect(() => {
    const current = appStore.getState().allowedAppDefaultToolkit;
    const list = current ?? [
      AppDefaultToolkit.Code,
      AppDefaultToolkit.Visualization,
      AppDefaultToolkit.Passport,
      AppDefaultToolkit.Research,
    ];
    if (!list.includes(AppDefaultToolkit.Canvas)) {
      appStore.setState({
        allowedAppDefaultToolkit: [...list, AppDefaultToolkit.Canvas],
      });
    }
  }, []);

  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (hasHydratedRef.current) return;
    if (!initialPassportId) return;
    hasHydratedRef.current = true;
    // Commit 10: resolve passport → canvas.filter via filterByQuery dispatch.
    console.info(
      "[canvas] passport hydration pending (Commit 10):",
      initialPassportId,
    );
    toast.message(
      `Passport hydration pending — id ${initialPassportId.slice(0, 8)}…`,
    );
  }, [initialPassportId]);

  const [activeLens, setActiveLens] = useState<CanvasLensId>(
    () => appStore.getState().canvas.activeLens,
  );

  const handleLensChange = useCallback((next: LensOption) => {
    if (!next.enabled) {
      toast.message(`${next.label} lens lands in a later sprint.`);
      return;
    }
    setActiveLens(next.id);
    appStore.setState((prev) => ({
      canvas: {
        ...prev.canvas,
        activeLens: next.id,
        lastAction: {
          type: "setActiveLens",
          payload: { lens: next.id },
          result: { activeLens: next.id },
          at: Date.now(),
          source: "user",
        },
      },
    }));
  }, []);

  const handleMicClick = useCallback(() => {
    toast.message("Voice mode ships in Sprint B.");
  }, []);

  return (
    <div className="flex h-full min-h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden">
      {/* Top bar — thin header with the status popover (Thread 1). Lives
          outside the three-column grid so the stage keeps its full width. */}
      <header className="flex h-9 flex-none items-center justify-between border-b border-border bg-background/95 px-3">
        <span className="text-xs font-medium text-muted-foreground">
          Canvas
        </span>
        <CanvasStatusPopover />
      </header>

      {/* Three-column body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Icon rail — lens switcher */}
        <aside
          aria-label="Canvas lens switcher"
          className="flex w-14 flex-col items-center gap-1 border-r border-border bg-muted/10 py-3"
        >
          {LENSES.map((lens) => {
            const Icon = lens.icon;
            const isActive = activeLens === lens.id && lens.enabled;
            return (
              <button
                key={lens.id}
                type="button"
                onClick={() => handleLensChange(lens)}
                title={
                  lens.enabled
                    ? `Switch to ${lens.label} lens`
                    : `${lens.label} (coming soon)`
                }
                aria-pressed={isActive}
                className={cn(
                  "flex size-10 items-center justify-center rounded-md transition-colors",
                  lens.enabled
                    ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                    : "cursor-not-allowed text-muted-foreground/40",
                  isActive && "bg-primary/10 text-primary",
                )}
              >
                <Icon className="size-5" />
                <span className="sr-only">{lens.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main stage — force-graph lens today */}
        <section className="relative flex-1 overflow-hidden bg-background">
          <Landscape3DPage />

          {/* Floating mic (voice entry point — Sprint B) */}
          <button
            type="button"
            onClick={handleMicClick}
            title="Voice mode (Sprint B)"
            className={cn(
              "absolute bottom-6 left-1/2 z-30 -translate-x-1/2",
              "flex size-12 items-center justify-center rounded-full",
              "border border-border bg-background/90 backdrop-blur",
              "shadow-lg transition-colors hover:bg-muted",
            )}
          >
            <Mic className="size-5 text-muted-foreground" />
            <span className="sr-only">Open voice mode</span>
          </button>
        </section>

        {/* Chat rail — fixed width 420px today; resizable in a later sprint */}
        <aside
          aria-label="Canvas chat rail"
          className="flex w-[420px] flex-none flex-col border-l border-border bg-background"
        >
          <ChatBot initialMessages={[]} threadId={threadId} />
        </aside>
      </div>
    </div>
  );
}
