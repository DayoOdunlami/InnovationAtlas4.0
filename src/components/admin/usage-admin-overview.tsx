import type { AtlasUsageOverview } from "@/lib/admin/usage-admin-query";
import { format } from "date-fns";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";

type Props = {
  overview: AtlasUsageOverview;
  labels: {
    period: string;
    summaryHeading: string;
    assistantMessages: string;
    threadsTouched: string;
    inputTokens: string;
    outputTokens: string;
    totalTokens: string;
    approxCost: string;
    approxCostUnknown: string;
    externalBilling: string;
    externalBillingBody: string;
    byModelHeading: string;
    byDayHeading: string;
    topUsersHeading: string;
    colModel: string;
    colMessages: string;
    colIn: string;
    colOut: string;
    colTotal: string;
    colApprox: string;
    colDay: string;
    colUser: string;
    colEmail: string;
    noData: string;
    disclaimer: string;
  };
};

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtUsd(n: number | null) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

export function UsageAdminOverview({ overview, labels }: Props) {
  const sinceLabel = format(new Date(overview.sinceIso), "MMM d, yyyy");

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {labels.period}: {sinceLabel} → today ({overview.days} days).
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {labels.summaryHeading}
        </h2>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="text-muted-foreground">
                  {labels.assistantMessages}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(overview.totals.assistantMessagesWithUsage)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">
                  {labels.threadsTouched}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(overview.totals.distinctThreads)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">
                  {labels.inputTokens}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(overview.totals.inputTokens)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">
                  {labels.outputTokens}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(overview.totals.outputTokens)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  {labels.totalTokens}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {fmt(overview.totals.totalTokens)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">
                  {labels.approxCost}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {overview.totals.approxUsdTotal != null
                    ? fmtUsd(overview.totals.approxUsdTotal)
                    : labels.approxCostUnknown}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground max-w-3xl">
          {labels.disclaimer}
        </p>
      </section>

      <section className="rounded-lg border bg-muted/20 p-4 space-y-2 max-w-3xl">
        <h3 className="text-sm font-semibold">{labels.externalBilling}</h3>
        <p className="text-sm text-muted-foreground">
          {labels.externalBillingBody}
        </p>
        <Link
          href="https://platform.openai.com/usage"
          className="text-sm text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          OpenAI — Usage
        </Link>
        {" · "}
        <Link
          href="https://platform.openai.com/account/billing"
          className="text-sm text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          OpenAI — Billing
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {labels.byModelHeading}
        </h2>
        {overview.byModel.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.noData}</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.colModel}</TableHead>
                  <TableHead className="text-right">
                    {labels.colMessages}
                  </TableHead>
                  <TableHead className="text-right">{labels.colIn}</TableHead>
                  <TableHead className="text-right">{labels.colOut}</TableHead>
                  <TableHead className="text-right">
                    {labels.colTotal}
                  </TableHead>
                  <TableHead className="text-right">
                    {labels.colApprox}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.byModel.map((row) => (
                  <TableRow key={row.modelKey}>
                    <TableCell className="font-mono text-xs max-w-[240px] truncate">
                      {row.modelKey}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(row.messageCount)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(row.inputTokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(row.outputTokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(row.totalTokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtUsd(row.approxUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {labels.byDayHeading}
        </h2>
        {overview.byDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.noData}</p>
        ) : (
          <div className="rounded-md border overflow-x-auto max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.colDay}</TableHead>
                  <TableHead className="text-right">
                    {labels.colMessages}
                  </TableHead>
                  <TableHead className="text-right">
                    {labels.colTotal}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.byDay.map((row) => (
                  <TableRow key={row.day}>
                    <TableCell className="font-mono text-sm">
                      {row.day}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(row.messageCount)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(row.totalTokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {labels.topUsersHeading}
        </h2>
        {overview.topUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.noData}</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.colUser}</TableHead>
                  <TableHead>{labels.colEmail}</TableHead>
                  <TableHead className="text-right">
                    {labels.colMessages}
                  </TableHead>
                  <TableHead className="text-right">
                    {labels.colTotal}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.topUsers.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="text-sm">{row.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.email}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(row.messageCount)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(row.totalTokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
