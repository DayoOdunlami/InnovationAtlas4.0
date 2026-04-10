"use client";

import { useEffect, useState, useCallback, memo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type {
  LandscapeData,
  LandscapeProject,
  LandscapeLiveCall,
} from "@/app/api/landscape/data/route";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Custom shapes ──────────────────────────────────────────────────────────

function CircleDot({
  cx,
  cy,
  fill,
}: { cx?: number; cy?: number; fill?: string }) {
  if (cx == null || cy == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={fill ?? "#3b82f6"}
      fillOpacity={0.75}
      stroke="none"
    />
  );
}

function DiamondDot({
  cx,
  cy,
  fill,
}: { cx?: number; cy?: number; fill?: string }) {
  if (cx == null || cy == null) return null;
  const s = 5;
  const points = `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;
  return (
    <polygon
      points={points}
      fill={fill ?? "#f59e0b"}
      fillOpacity={0.9}
      stroke="none"
    />
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────

function formatAmount(val: number | string | null | undefined): string {
  if (val == null || val === "") return "";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return typeof val === "string" ? val.slice(0, 60) : "";
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n.toLocaleString()}`;
}

type TooltipPayloadItem = {
  payload: (LandscapeProject | LandscapeLiveCall) & {
    _type: "project" | "live";
  };
};

function LandscapeTooltip({
  active,
  payload,
}: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isLive = d._type === "live";
  const funder = isLive
    ? (d as LandscapeLiveCall).funder
    : (d as LandscapeProject).lead_funder;
  const amount = isLive
    ? (d as LandscapeLiveCall).funding_amount
    : (d as LandscapeProject).funding_amount;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md max-w-xs">
      <div className="flex items-center gap-1.5 mb-1">
        {isLive ? (
          <DiamondDot cx={8} cy={8} fill="#f59e0b" />
        ) : (
          <CircleDot cx={8} cy={8} fill="#3b82f6" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {isLive ? "Live call" : "Project"}
        </span>
        {isLive && (d as LandscapeLiveCall).status === "open" && (
          <span className="ml-auto text-[10px] font-bold text-green-600 dark:text-green-400">
            OPEN
          </span>
        )}
      </div>
      <p className="text-sm font-semibold leading-snug line-clamp-3">
        {d.title}
      </p>
      {funder && <p className="text-xs text-muted-foreground mt-1">{funder}</p>}
      {amount != null && String(amount) !== "" && (
        <p className="text-xs font-medium mt-0.5">{formatAmount(amount)}</p>
      )}
      {isLive && (d as LandscapeLiveCall).deadline && (
        <p className="text-xs text-muted-foreground mt-0.5">
          Deadline: {(d as LandscapeLiveCall).deadline}
        </p>
      )}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────

function LandscapeLegend({
  projects,
  liveCalls,
}: { projects: number; liveCalls: number }) {
  return (
    <div className="flex items-center gap-5 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="5" fill="#3b82f6" fillOpacity={0.75} />
        </svg>
        Historical projects ({projects})
      </span>
      <span className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <polygon
            points="8,2 14,8 8,14 2,8"
            fill="#f59e0b"
            fillOpacity={0.9}
          />
        </svg>
        Live calls ({liveCalls})
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export const LandscapeScatter = memo(function LandscapeScatter() {
  const [data, setData] = useState<LandscapeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/landscape/data");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-sm">Loading {622} projects + live calls…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm">{error ?? "No data"}</p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="size-3 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  // Annotate _type so tooltip can distinguish
  const projectPoints = data.projects.map((p) => ({
    ...p,
    _type: "project" as const,
    x: Number(p.viz_x),
    y: Number(p.viz_y),
  }));

  const livePoints = data.liveCalls.map((c) => ({
    ...c,
    _type: "live" as const,
    x: Number(c.viz_x),
    y: Number(c.viz_y),
  }));

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center justify-between px-1">
        <LandscapeLegend
          projects={projectPoints.length}
          liveCalls={livePoints.length}
        />
        <Button variant="ghost" size="icon" onClick={load} title="Refresh data">
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "← UMAP X →",
                position: "insideBottomRight",
                offset: -4,
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "← UMAP Y →",
                angle: -90,
                position: "insideTopLeft",
                offset: 8,
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
            <Tooltip
              content={<LandscapeTooltip />}
              cursor={{ strokeDasharray: "3 3", strokeOpacity: 0.4 }}
              isAnimationActive={false}
            />
            <Scatter
              name="Projects"
              data={projectPoints}
              fill="#3b82f6"
              shape={(props: { cx?: number; cy?: number; fill?: string }) => (
                <CircleDot {...props} />
              )}
              isAnimationActive={false}
            />
            <Scatter
              name="Live calls"
              data={livePoints}
              fill="#f59e0b"
              shape={(props: { cx?: number; cy?: number; fill?: string }) => (
                <DiamondDot {...props} />
              )}
              isAnimationActive={false}
            />
            <Legend wrapperStyle={{ display: "none" }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
