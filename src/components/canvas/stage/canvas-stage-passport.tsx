"use client";

// ---------------------------------------------------------------------------
// Canvas stage — passport variant (Sprint X Thread 2, commit 2)
//
// Fetches a passport by id via the read endpoint added in this commit
// (`GET /api/passport/[id]`) and renders the same header + evidence +
// claims sections the server-rendered /passport/[id] page uses. The
// difference is that this component is embedded *inside* the canvas
// stage and therefore never owns chrome that the /canvas workbench
// already provides (top bar, return affordance, chat rail).
//
// Loading / error / missing states render inline within the stage so the
// user always has a visible sign that a passport mount was requested.
// ---------------------------------------------------------------------------

import { PassportClaimsSection } from "@/components/passport/passport-claims-section";
import { PassportDocuments } from "@/components/passport/passport-documents";
import { PassportHeader } from "@/components/passport/passport-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PassportDetail } from "@/lib/passport/types";
import { Brain, FileText, Loader2 } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "lib/utils";

interface CanvasStagePassportProps {
  passportId: string;
}

export function CanvasStagePassport({ passportId }: CanvasStagePassportProps) {
  const { data, error, isLoading } = useSWR<PassportDetail>(
    `/api/passport/${passportId}`,
    fetcher,
    {
      revalidateOnFocus: false,
      errorRetryCount: 1,
    },
  );

  return (
    <div className="h-full w-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 space-y-6">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin mr-2" />
            Loading passport…
          </div>
        )}

        {error && !isLoading && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-6 text-sm">
              Could not load passport{" "}
              <span className="font-mono">{passportId.slice(0, 8)}…</span>. It
              may have been archived or you may not have access. Use the Return
              affordance in the top bar to go back to the force-graph.
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && data && (
          <>
            <Card className="border-border/60">
              <CardContent className="pt-6">
                <PassportHeader passport={data.passport} />
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="size-4" />
                  Evidence Documents
                  <span className="text-xs font-normal text-muted-foreground ml-auto">
                    {data.documents.length} file
                    {data.documents.length !== 1 ? "s" : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PassportDocuments documents={data.documents} />
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Brain className="size-4" />
                  Extracted Claims
                  <span className="text-xs font-normal text-muted-foreground ml-auto">
                    {data.claims.length} claim
                    {data.claims.length !== 1 ? "s" : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PassportClaimsSection initialClaims={data.claims} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
