"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_LANDSCAPE_GRAPH_DEV_SETTINGS,
  type LandscapeGraphDevSettings,
  type LandscapePhysicsMode,
} from "@/components/landscape/landscape-graph-dev-settings";

function Num({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 items-center text-xs">
      <Label className="text-[11px] text-muted-foreground font-normal">
        {label}
      </Label>
      <Input
        type="number"
        className="h-7 w-24 text-xs"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </div>
  );
}

interface LandscapeGraphDevPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  physicsMode: LandscapePhysicsMode;
  onPhysicsModeChange: (m: LandscapePhysicsMode) => void;
  settings: LandscapeGraphDevSettings;
  onSettingsChange: (patch: Partial<LandscapeGraphDevSettings>) => void;
}

export function LandscapeGraphDevPanel({
  open,
  onOpenChange,
  physicsMode,
  onPhysicsModeChange,
  settings,
  onSettingsChange,
}: LandscapeGraphDevPanelProps) {
  const s = settings;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <div className="p-4 pb-2 border-b border-border shrink-0">
          <DialogHeader>
            <DialogTitle className="text-base">Force graph (dev)</DialogTitle>
            <DialogDescription className="text-xs">
              Session-only tweaks — saved in{" "}
              <code className="text-[10px]">sessionStorage</code>. Use to find
              values that feel right, then we can promote them to defaults.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-4 text-xs">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
              Physics mode
            </p>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["umap", "UMAP instant"],
                  ["hybrid", "Hybrid (short sim → pin)"],
                  ["live", "Live (long sim)"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPhysicsModeChange(id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                    physicsMode === id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 border-border/60 hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              UMAP & load
            </p>
            <Num
              label="UMAP scale"
              value={s.umapScale}
              min={1}
              max={40}
              step={0.5}
              onChange={(v) => onSettingsChange({ umapScale: v })}
            />
            <Num
              label="Edge load delay (ms)"
              value={s.progressiveEdgeDelayMs}
              min={0}
              max={5000}
              step={50}
              onChange={(v) => onSettingsChange({ progressiveEdgeDelayMs: v })}
            />
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              LOD (set 0 on a threshold to disable that cut)
            </p>
            <label className="flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={s.lodEnabled}
                onChange={(e) =>
                  onSettingsChange({ lodEnabled: e.target.checked })
                }
              />
              LOD enabled
            </label>
            <Num
              label="Node dots below scale"
              value={s.lodNodeDotBelow}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => onSettingsChange({ lodNodeDotBelow: v })}
            />
            <Num
              label="Hide layout links below"
              value={s.lodHideLinksBelow}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => onSettingsChange({ lodHideLinksBelow: v })}
            />
            <Num
              label="Hide display edges below"
              value={s.lodHideDisplayBelow}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => onSettingsChange({ lodHideDisplayBelow: v })}
            />
            <Num
              label="Labels above scale"
              value={s.lodLabelAbove}
              min={0}
              max={10}
              step={0.1}
              onChange={(v) => onSettingsChange({ lodLabelAbove: v })}
            />
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              Forces
            </p>
            <Num
              label="Charge strength"
              value={s.chargeStrength}
              min={-400}
              max={0}
              step={5}
              onChange={(v) => onSettingsChange({ chargeStrength: v })}
            />
            <Num
              label="Link distance base"
              value={s.linkDistanceBase}
              min={10}
              max={200}
              step={5}
              onChange={(v) => onSettingsChange({ linkDistanceBase: v })}
            />
            <Num
              label="Collision +px"
              value={s.collisionExtra}
              min={0}
              max={30}
              step={1}
              onChange={(v) => onSettingsChange({ collisionExtra: v })}
            />
            <Num
              label="Cluster pull"
              value={s.clusterPull}
              min={0}
              max={1.5}
              step={0.05}
              onChange={(v) => onSettingsChange({ clusterPull: v })}
            />
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              Engine — UMAP / Live / Hybrid
            </p>
            <Num
              label="UMAP warmup ticks"
              value={s.warmupTicksUmap}
              min={0}
              max={500}
              step={10}
              onChange={(v) => onSettingsChange({ warmupTicksUmap: v })}
            />
            <Num
              label="UMAP cooldown ticks"
              value={s.cooldownTicksUmap}
              min={0}
              max={200}
              step={1}
              onChange={(v) => onSettingsChange({ cooldownTicksUmap: v })}
            />
            <Num
              label="UMAP cooldown time (ms)"
              value={s.cooldownTimeUmap}
              min={0}
              max={10_000}
              step={50}
              onChange={(v) => onSettingsChange({ cooldownTimeUmap: v })}
            />
            <Num
              label="Live cooldown time (ms)"
              value={s.cooldownTimeLive}
              min={1000}
              max={120_000}
              step={1000}
              onChange={(v) => onSettingsChange({ cooldownTimeLive: v })}
            />
            <Num
              label="Hybrid warmup ticks"
              value={s.warmupTicksHybrid}
              min={0}
              max={400}
              step={10}
              onChange={(v) => onSettingsChange({ warmupTicksHybrid: v })}
            />
            <Num
              label="Hybrid cooldown ticks"
              value={s.cooldownTicksHybrid}
              min={0}
              max={200}
              step={1}
              onChange={(v) => onSettingsChange({ cooldownTicksHybrid: v })}
            />
            <Num
              label="Hybrid cooldown time (ms)"
              value={s.cooldownTimeHybrid}
              min={500}
              max={20_000}
              step={100}
              onChange={(v) => onSettingsChange({ cooldownTimeHybrid: v })}
            />
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              Zoom fit
            </p>
            <Num
              label="Initial fit duration (ms)"
              value={s.zoomFitDurationMs}
              min={0}
              max={3000}
              step={50}
              onChange={(v) => onSettingsChange({ zoomFitDurationMs: v })}
            />
            <Num
              label="Initial fit padding (px)"
              value={s.zoomFitPaddingPx}
              min={0}
              max={120}
              step={5}
              onChange={(v) => onSettingsChange({ zoomFitPaddingPx: v })}
            />
            <Num
              label="Manual fit padding (px)"
              value={s.manualZoomFitPaddingPx}
              min={0}
              max={120}
              step={5}
              onChange={(v) => onSettingsChange({ manualZoomFitPaddingPx: v })}
            />
          </div>
        </div>

        <DialogFooter className="p-4 pt-2 border-t border-border shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() =>
              onSettingsChange(DEFAULT_LANDSCAPE_GRAPH_DEV_SETTINGS)
            }
          >
            Reset tuning defaults
          </Button>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
