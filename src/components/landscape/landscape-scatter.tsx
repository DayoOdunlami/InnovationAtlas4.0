"use client";

import type {
  LandscapeData,
  LandscapeLiveCall,
  LandscapeOrganisation,
  LandscapeProject,
} from "@/app/api/landscape/data/route";
import { Button } from "@/components/ui/button";
import {
  inferThemeFromLive,
  inferThemeFromProject,
} from "@/lib/landscape/infer-landscape-theme";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Custom shapes ──────────────────────────────────────────────────────────

function CircleDot({
  cx,
  cy,
  fill,
  payload,
}: {
  cx?: number;
  cy?: number;
  fill?: string;
  payload?: { _opacity?: number };
}) {
  if (cx == null || cy == null) return null;
  const opacity = payload?._opacity ?? 0.75;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={fill ?? "#3b82f6"}
      fillOpacity={opacity}
      stroke="none"
    />
  );
}

function DiamondDot({
  cx,
  cy,
  fill,
  payload,
}: {
  cx?: number;
  cy?: number;
  fill?: string;
  payload?: { _opacity?: number };
}) {
  if (cx == null || cy == null) return null;
  const s = 5;
  const opacity = payload?._opacity ?? 0.9;
  const points = `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;
  return (
    <polygon
      points={points}
      fill={fill ?? "#f59e0b"}
      fillOpacity={opacity}
      stroke="none"
    />
  );
}

function TriangleDot({
  cx,
  cy,
  fill,
  payload,
}: {
  cx?: number;
  cy?: number;
  fill?: string;
  payload?: { _opacity?: number; _size?: number };
}) {
  if (cx == null || cy == null) return null;
  const s = payload?._size ?? 5;
  const opacity = payload?._opacity ?? 0.88;
  const points = `${cx},${cy - s} ${cx + s * 0.95},${cy + s * 0.55} ${cx - s * 0.95},${cy + s * 0.55}`;
  return (
    <polygon
      points={points}
      fill={fill ?? "#7F77DD"}
      fillOpacity={opacity}
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

function orgFill(orgType: string): string {
  switch (orgType) {
    case "academic":
      return "#7F77DD";
    case "industry":
      return "#1D9E75";
    case "public_sector":
      return "#D85A30";
    case "catapult":
      return "#6366f1";
    default:
      return "#6b7280";
  }
}

type TooltipPayloadItem = {
  payload: (LandscapeProject | LandscapeLiveCall | LandscapeOrganisation) & {
    _type: "project" | "live" | "org";
  };
};

function LandscapeTooltip({
  active,
  payload,
}: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const kind = d._type;

  if (kind === "org") {
    const o = d as LandscapeOrganisation & { _type: "org" };
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md max-w-xs">
        <div className="flex items-center gap-1.5 mb-1">
          <TriangleDot
            cx={8}
            cy={8}
            fill={orgFill(o.org_type)}
            payload={{ _size: 4 }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Organisation
          </span>
        </div>
        <p className="text-sm font-semibold leading-snug line-clamp-3">
          {o.name}
        </p>
        <p className="text-xs text-muted-foreground mt-1 capitalize">
          {(o.org_type || "").replaceAll("_", " ")}
        </p>
        <p className="text-xs font-medium mt-0.5">
          {o.project_count} project{o.project_count === 1 ? "" : "s"}
          {o.total_funding != null && String(o.total_funding) !== "" && (
            <> · {formatAmount(o.total_funding)}</>
          )}
        </p>
      </div>
    );
  }

  const isLive = kind === "live";
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
        {(d as LandscapeProject | LandscapeLiveCall).title}
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
  organisations,
}: { projects: number; liveCalls: number; organisations: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
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
      {organisations > 0 && (
        <span className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <polygon
              points="8,2 14,13 2,13"
              fill="#7F77DD"
              fillOpacity={0.88}
            />
          </svg>
          Organisations ({organisations})
        </span>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface LandscapeScatterProps {
  modeFilter?: string;
  showLiveCalls?: boolean;
  showOrganisations?: boolean;
  highlightTheme?: string | null;
}

export const LandscapeScatter = memo(function LandscapeScatter({
  modeFilter = "All",
  showLiveCalls = true,
  showOrganisations = false,
  highlightTheme = null,
}: LandscapeScatterProps) {
  const [data, setData] = useState<LandscapeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/landscape/data");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as LandscapeData;
      if (!json.organisations) json.organisations = [];
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const orgList = data?.organisations ?? [];
  const maxOrgProjects = useMemo(
    () => Math.max(1, ...orgList.map((o) => o.project_count ?? 0)),
    [orgList],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-sm">
          Loading projects, live calls, and organisations…
        </p>
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

  const projectPoints = data.projects.map((p) => {
    const modeMatch =
      modeFilter === "All" ||
      (p.cpc_modes ?? "").toLowerCase().includes(modeFilter.toLowerCase());
    const themeKey = inferThemeFromProject(p);
    const themeMatch = !highlightTheme || themeKey === highlightTheme;
    const baseOp = modeMatch ? 0.75 : 0.075;
    const opacity =
      highlightTheme != null && highlightTheme !== ""
        ? themeMatch && modeMatch
          ? 0.95
          : 0.06
        : baseOp;
    return {
      ...p,
      _type: "project" as const,
      x: Number(p.viz_x),
      y: Number(p.viz_y),
      _opacity: opacity,
    };
  });

  const livePoints = showLiveCalls
    ? data.liveCalls.map((c) => {
        const themeKey = inferThemeFromLive(c);
        const themeMatch = !highlightTheme || themeKey === highlightTheme;
        const opacity =
          highlightTheme != null && highlightTheme !== ""
            ? themeMatch
              ? 0.95
              : 0.06
            : 0.9;
        return {
          ...c,
          _type: "live" as const,
          x: Number(c.viz_x),
          y: Number(c.viz_y),
          _opacity: opacity,
        };
      })
    : [];

  const orgPoints =
    showOrganisations && orgList.length > 0
      ? orgList.map((o) => {
          const pc = o.project_count ?? 0;
          const size = 3.5 + (pc / maxOrgProjects) * 7;
          return {
            ...o,
            title: o.name,
            _type: "org" as const,
            x: Number(o.viz_x),
            y: Number(o.viz_y),
            _opacity: 0.88,
            _size: size,
            _fill: orgFill(o.org_type),
          };
        })
      : [];

  const legendOrgCount = showOrganisations ? orgPoints.length : 0;

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center justify-between px-1">
        <LandscapeLegend
          projects={projectPoints.length}
          liveCalls={livePoints.length}
          organisations={legendOrgCount}
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
              shape={(props: {
                cx?: number;
                cy?: number;
                fill?: string;
                payload?: { _opacity?: number };
              }) => <CircleDot {...props} />}
              isAnimationActive={false}
            />
            <Scatter
              name="Live calls"
              data={livePoints}
              fill="#f59e0b"
              shape={(props: {
                cx?: number;
                cy?: number;
                fill?: string;
                payload?: { _opacity?: number };
              }) => <DiamondDot {...props} />}
              isAnimationActive={false}
            />
            {orgPoints.length > 0 && (
              <Scatter
                name="Organisations"
                data={orgPoints}
                fill="#7F77DD"
                shape={(props: {
                  cx?: number;
                  cy?: number;
                  fill?: string;
                  payload?: {
                    _opacity?: number;
                    _size?: number;
                    _fill?: string;
                  };
                }) => (
                  <TriangleDot
                    {...props}
                    fill={props.payload?._fill ?? "#7F77DD"}
                  />
                )}
                isAnimationActive={false}
              />
            )}
            <Legend wrapperStyle={{ display: "none" }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
