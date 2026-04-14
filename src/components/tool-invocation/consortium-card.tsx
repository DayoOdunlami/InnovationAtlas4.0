"use client";

import { ToolUIPart } from "ai";
import { memo, useMemo } from "react";
import {
  Building2,
  Users,
  PoundSterling,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ConsortiumPartnersOutput,
  ConsortiumPartner,
} from "lib/ai/tools/passport/find-consortium-partners";

function formatFunding(amount: number | null): string {
  if (!amount) return "Funding unknown";
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${(amount / 1_000).toFixed(0)}K`;
  return `£${amount.toLocaleString()}`;
}

const SECTOR_COLORS: Record<string, string> = {
  rail: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  aviation: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  maritime: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  highways:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  autonomy:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  decarbonisation:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  built_environment:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

function sectorColor(sector: string): string {
  const key = sector.toLowerCase().replace(/\s+/g, "_");
  return SECTOR_COLORS[key] ?? "bg-muted text-muted-foreground";
}

function PartnerCard({ partner }: { partner: ConsortiumPartner }) {
  const topSectors = (partner.sectors ?? []).slice(0, 4);

  return (
    <div className="flex flex-col gap-1.5 py-3 border-b last:border-b-0">
      <div className="flex items-start gap-2">
        <Building2 className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-snug line-clamp-2">
            {partner.name}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge
              variant="secondary"
              className="text-xs px-1.5 py-0 flex items-center gap-1"
            >
              <Users className="size-2.5" />
              {partner.project_count}{" "}
              {partner.project_count === 1 ? "project" : "projects"}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <PoundSterling className="size-3" />
              {formatFunding(partner.total_funding)}
            </span>
            {partner.companies_house_status && (
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0 capitalize"
              >
                {partner.companies_house_status}
              </Badge>
            )}
          </div>
          {topSectors.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {topSectors.map((s) => (
                <span
                  key={s}
                  className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${sectorColor(s)}`}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {partner.most_recent_project_title && (
            <p className="text-xs text-foreground/60 mt-1 line-clamp-1 italic">
              Most recent: {partner.most_recent_project_title}
            </p>
          )}
          {partner.most_recent_funder && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Funder: {partner.most_recent_funder}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const ConsortiumCard = memo(function ConsortiumCard({
  part,
}: {
  part: ToolUIPart;
}) {
  const data = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return part.output as ConsortiumPartnersOutput;
  }, [part.state, part.output]);

  const queryText = useMemo(() => {
    const input = part.input as { query?: string } | undefined;
    return input?.query ?? "";
  }, [part.input]);

  if (!data && part.state === "input-available") {
    return (
      <Card className="my-2">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Searching consortium partners…
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const displayQuery = data.query || queryText;

  return (
    <Card className="my-2 border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base flex-wrap">
          <Users className="size-4 shrink-0" />
          <span className="flex-1 min-w-0">
            Consortium Partners
            {displayQuery ? (
              <span className="text-muted-foreground font-normal ml-1">
                — {displayQuery}
              </span>
            ) : null}
          </span>
          <Badge variant="secondary" className="text-xs ml-auto shrink-0">
            {data.total_organisations} found
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {data.partners.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No organisations found matching this query. Try broadening the
            technology area or removing the sector filter.
          </p>
        ) : (
          <>
            <div>
              {data.partners.map((partner) => (
                <PartnerCard key={partner.name} partner={partner} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 pt-2 border-t flex items-center gap-1">
              <ExternalLink className="size-3 shrink-0" />
              Based on {data.total_organisations} organisation
              {data.total_organisations !== 1 ? "s" : ""} from the GtR funded
              projects corpus
              {data.sector ? ` — filtered to sector: ${data.sector}` : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
});
