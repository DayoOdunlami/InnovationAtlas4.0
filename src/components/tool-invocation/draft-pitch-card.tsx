"use client";

import { ToolUIPart } from "ai";
import { memo, useMemo } from "react";
import {
  FileSignature,
  Copy,
  Check,
  Building2,
  PoundSterling,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCopy } from "@/hooks/use-copy";

type DraftPitchInput = {
  title: string;
  paragraph1: string;
  paragraph2: string;
  paragraph3: string;
  passport_id?: string;
  funder?: string;
  funding_amount?: string;
};

export const DraftPitchCard = memo(function DraftPitchCard({
  part,
}: { part: ToolUIPart }) {
  const input = useMemo(() => part.input as DraftPitchInput, [part.input]);

  const fullText = useMemo(
    () =>
      [input?.paragraph1, input?.paragraph2, input?.paragraph3]
        .filter(Boolean)
        .join("\n\n"),
    [input],
  );

  const { copied, copy } = useCopy();

  if (!part.state.startsWith("output") || !input?.paragraph1) return null;

  return (
    <Card className="my-2 border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="size-4" />
          Draft Statement of Intent
        </CardTitle>
        {input.title && (
          <p className="text-sm font-semibold text-foreground/80">
            {input.title}
          </p>
        )}
        {(input.funder || input.funding_amount) && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {input.funder && (
              <span className="flex items-center gap-1">
                <Building2 className="size-3" />
                {input.funder}
              </span>
            )}
            {input.funding_amount && (
              <span className="flex items-center gap-1">
                <PoundSterling className="size-3" />
                {input.funding_amount}
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 text-sm leading-relaxed text-foreground/90 rounded-md bg-muted/30 p-4 border">
          <p>{input.paragraph1}</p>
          <p>{input.paragraph2}</p>
          <p>{input.paragraph3}</p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Ready to send — review before copying
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copy(fullText)}
            className="gap-1.5 h-8"
          >
            {copied ? (
              <>
                <Check className="size-3 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3" />
                Copy
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
