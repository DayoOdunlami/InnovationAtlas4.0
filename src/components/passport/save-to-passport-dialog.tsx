"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, FileBadge2, Plus, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PassportSummary } from "@/lib/passport/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingBatchId: string;
  claimCount: number;
  onSaved: (passportId: string, passportTitle: string) => void;
};

export function SaveToPassportDialog({
  open,
  onOpenChange,
  pendingBatchId,
  claimCount,
  onSaved,
}: Props) {
  const [passports, setPassports] = useState<PassportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"list" | "new">("list");
  const [newTitle, setNewTitle] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newTags, setNewTags] = useState("");

  const fetchPassports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/passport/list");
      if (!res.ok) throw new Error("Failed to load passports");
      const data = await res.json();
      setPassports(data.passports ?? []);
    } catch {
      toast.error("Could not load passports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchPassports();
  }, [open, fetchPassports]);

  const saveToPassport = useCallback(
    async (passportId?: string) => {
      setSaving(true);
      try {
        const body: Record<string, unknown> = {
          pending_batch_id: pendingBatchId,
          passport_id: passportId,
        };
        if (!passportId) {
          body.title = newTitle || newProjectName || "New Passport";
          body.project_name = newProjectName || undefined;
          body.tags = newTags
            ? newTags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : undefined;
        }
        const res = await fetch("/api/passport/describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed");
        toast.success(
          `✓ ${data.claims_saved} claims saved to "${data.passport_title}"`,
        );
        onSaved(data.passport_id, data.passport_title);
        onOpenChange(false);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [pendingBatchId, newTitle, newProjectName, newTags, onSaved, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileBadge2 className="size-4" />
            Save {claimCount} claim{claimCount !== 1 ? "s" : ""} to a Passport
          </DialogTitle>
          <DialogDescription>
            Choose an existing passport or create a new one.
          </DialogDescription>
        </DialogHeader>

        {mode === "list" ? (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading passports…
              </div>
            ) : passports.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No passports yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {passports.map((p) => (
                  <button
                    key={p.id}
                    disabled={saving}
                    onClick={() => saveToPassport(p.id)}
                    className={cn(
                      "w-full text-left rounded-lg border border-border/60 px-3 py-2.5",
                      "hover:border-primary/50 hover:bg-accent/20 transition-colors",
                      "flex items-center gap-2",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {p.project_name ?? p.title ?? "Untitled"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.claim_count} claim{p.claim_count !== 1 ? "s" : ""}
                        {p.verified_count > 0 &&
                          ` · ${p.verified_count} verified`}
                      </p>
                      {p.tags && p.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {saving ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setMode("new")}
            >
              <Plus className="size-3.5" />
              Create new passport
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-title">Passport title</Label>
              <Input
                id="new-title"
                placeholder="e.g. Autonomous Shuttle Trial — Phase 2"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-proj">Project / trial name (optional)</Label>
              <Input
                id="new-proj"
                placeholder="e.g. GoShuttle Q3 2025"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-tags">Tags (comma-separated, optional)</Label>
              <Input
                id="new-tags"
                placeholder="autonomy, rail, decarbonisation"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode("list")}
                disabled={saving}
              >
                ← Back
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={saving || (!newTitle && !newProjectName)}
                onClick={() => saveToPassport(undefined)}
              >
                {saving && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                Create and save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
