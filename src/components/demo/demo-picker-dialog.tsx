"use client";

import { FileText, Map } from "lucide-react";
import { useState } from "react";

import { Button } from "ui/button";
import { Checkbox } from "ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Label } from "ui/label";
import { RadioGroup, RadioGroupItem } from "ui/radio-group";

import { useDemo } from "@/lib/demo/demo-context";
import {
  DEMO_ADVANCE_MODE_LABELS,
  DEMO_NARRATION_MODE_LABELS,
  type DemoAdvanceMode,
  type DemoNarrationMode,
} from "@/lib/demo/demo-options";
import { LANDSCAPE_DEMO, SARAH_DEMO } from "@/lib/demo/demo-runner";

type DemoPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ADVANCE_ORDER: DemoAdvanceMode[] = ["timer", "on_response", "hybrid"];

const NARRATION_ORDER: DemoNarrationMode[] = [
  "text",
  "web_speech",
  "openai_tts",
];

export function DemoPickerDialog({
  open,
  onOpenChange,
}: DemoPickerDialogProps) {
  const { startDemo } = useDemo();
  const [advanceMode, setAdvanceMode] = useState<DemoAdvanceMode>("timer");
  const [narrationMode, setNarrationMode] = useState<DemoNarrationMode>("text");
  const [forceJarvis, setForceJarvis] = useState(true);

  const options = { advanceMode, narrationMode, forceJarvis };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a demo</DialogTitle>
          <DialogDescription className="sr-only">
            Pick a script, how steps advance, and how narration is spoken.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-foreground">
              When to move on
            </h4>
            <RadioGroup
              value={advanceMode}
              onValueChange={(v) => setAdvanceMode(v as DemoAdvanceMode)}
              className="gap-3"
            >
              {ADVANCE_ORDER.map((id) => {
                const { title, description } = DEMO_ADVANCE_MODE_LABELS[id];
                return (
                  <div key={id} className="flex items-start gap-3">
                    <RadioGroupItem
                      value={id}
                      id={`advance-${id}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <Label
                        htmlFor={`advance-${id}`}
                        className="cursor-pointer text-sm font-medium leading-snug"
                      >
                        {title}
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <Checkbox
              id="demo-force-jarvis"
              checked={forceJarvis}
              onCheckedChange={(v) => setForceJarvis(v === true)}
            />
            <div className="min-w-0 flex-1">
              <Label
                htmlFor="demo-force-jarvis"
                className="cursor-pointer text-sm font-medium leading-snug"
              >
                Pre-select JARVIS on chat
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Pins the JARVIS agent on the thread so injected demo messages
                use the JARVIS pipeline instead of the default model.
              </p>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-foreground">
              Narration voice
            </h4>
            <RadioGroup
              value={narrationMode}
              onValueChange={(v) => setNarrationMode(v as DemoNarrationMode)}
              className="gap-3"
            >
              {NARRATION_ORDER.map((id) => {
                const { title, description } = DEMO_NARRATION_MODE_LABELS[id];
                return (
                  <div key={id} className="flex items-start gap-3">
                    <RadioGroupItem
                      value={id}
                      id={`narr-${id}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <Label
                        htmlFor={`narr-${id}`}
                        className="cursor-pointer text-sm font-medium leading-snug"
                      >
                        {title}
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

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
                  startDemo(SARAH_DEMO, options);
                }}
              >
                Start Sarah demo
              </Button>
            </div>
            <div className="flex flex-col rounded-lg border border-border bg-card/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-foreground">
                <Map className="size-5 shrink-0 text-muted-foreground" />
                <h3 className="font-semibold">Innovation Landscape</h3>
              </div>
              <p className="mb-1 text-xs text-muted-foreground">~2 minutes</p>
              <p className="mb-4 flex-1 text-sm text-muted-foreground leading-relaxed">
                JARVIS highlights thematic clusters and live funding calls
                across the semantic map of UK transport innovation.
              </p>
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  startDemo(LANDSCAPE_DEMO, options);
                }}
              >
                Start landscape demo
              </Button>
            </div>
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
