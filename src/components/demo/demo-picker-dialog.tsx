"use client";

import { FileText, Map } from "lucide-react";

import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";

import { useDemo } from "@/lib/demo/demo-context";
import { LANDSCAPE_DEMO, SARAH_DEMO } from "@/lib/demo/demo-runner";

type DemoPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DemoPickerDialog({
  open,
  onOpenChange,
}: DemoPickerDialogProps) {
  const { startDemo } = useDemo();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose a demo</DialogTitle>
          <DialogDescription className="sr-only">
            Pick Sarah&apos;s Journey or Innovation Landscape to run a guided
            tour with narration.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col rounded-lg border border-border bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <h3 className="font-semibold">Sarah&apos;s Journey</h3>
            </div>
            <p className="mb-1 text-xs text-muted-foreground">~3 minutes</p>
            <p className="mb-4 flex-1 text-sm text-muted-foreground leading-relaxed">
              JARVIS extracts claims from trial evidence, matches against 622
              funded projects, surfaces cross-sector gaps, and drafts a pitch.
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                startDemo(SARAH_DEMO);
              }}
            >
              Start
            </Button>
          </div>
          <div className="flex flex-col rounded-lg border border-border bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <Map className="size-5 shrink-0 text-muted-foreground" />
              <h3 className="font-semibold">Innovation Landscape</h3>
            </div>
            <p className="mb-1 text-xs text-muted-foreground">~2 minutes</p>
            <p className="mb-4 flex-1 text-sm text-muted-foreground leading-relaxed">
              JARVIS highlights thematic clusters and live funding calls across
              the semantic map of UK transport innovation.
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                startDemo(LANDSCAPE_DEMO);
              }}
            >
              Start
            </Button>
          </div>
        </div>
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
