"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Textarea } from "ui/textarea";
import type { AtlasKnowledgeDocumentEntity } from "@/lib/db/pg/schema.pg";
import {
  approveKnowledgeDocumentAction,
  createKnowledgeDocumentAction,
  retireKnowledgeDocumentAction,
} from "@/app/(chat)/(admin)/admin/knowledge-base/actions";

const MODES = ["rail", "aviation", "maritime", "hit", "data_digital"] as const;
const THEMES = [
  "autonomy",
  "decarbonisation",
  "people_experience",
  "hubs_clusters",
  "planning_operation",
  "industry",
  "data_infrastructure",
  "assurance_trust",
  "interoperability",
  "testbeds_innovation",
  "governance_stewardship",
] as const;
const SOURCE_TYPES = [
  "white_paper",
  "policy_doc",
  "govt_report",
  "industry_report",
  "guidance_doc",
  "web_article",
  "internal",
  "doctrine",
] as const;
const TIERS = ["primary", "secondary", "tertiary"] as const;

const MODE_LABELS: Record<string, string> = {
  rail: "rail",
  aviation: "aviation",
  maritime: "maritime",
  hit: "hit",
  data_digital: "Data & Digital",
};

function labelFor(value: string): string {
  return MODE_LABELS[value] ?? value.replace(/_/g, " ");
}

type CoverageCell = { mode: string; theme: string; count: number };

interface Props {
  documents: AtlasKnowledgeDocumentEntity[];
  coverageMatrix: CoverageCell[];
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default";
  if (status === "retired") return "destructive";
  return "secondary";
}

function CoverageMatrix({ matrix }: { matrix: CoverageCell[] }) {
  const themes = THEMES as readonly string[];
  const modes = MODES as readonly string[];
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className="text-left p-2 font-medium border-b bg-muted/40">
              Mode \ Theme
            </th>
            {themes.map((t) => (
              <th
                key={t}
                className="p-2 font-medium border-b bg-muted/40 text-center min-w-[90px]"
              >
                {labelFor(t)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modes.map((mode) => (
            <tr key={mode} className="border-b">
              <td className="p-2 font-medium">{labelFor(mode)}</td>
              {themes.map((theme) => {
                const cell = matrix.find(
                  (c) => c.mode === mode && c.theme === theme,
                );
                const count = cell?.count ?? 0;
                return (
                  <td
                    key={theme}
                    className={`p-2 text-center font-mono ${
                      count === 0
                        ? "text-destructive bg-destructive/10"
                        : count < 3
                          ? "text-yellow-700 bg-yellow-50"
                          : "text-green-700 bg-green-50"
                    }`}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">
        Red = no coverage · Yellow = thin (&lt;3) · Green = adequate (≥3)
      </p>
    </div>
  );
}

function AddDocumentForm({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);

  function toggleMode(m: string) {
    setSelectedModes((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  }
  function toggleTheme(t: string) {
    setSelectedThemes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    selectedModes.forEach((m) => fd.append("modes", m));
    selectedThemes.forEach((t) => fd.append("themes", t));

    startTransition(async () => {
      const result = await createKnowledgeDocumentAction(fd);
      if (result.success) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">Add Source Document</CardTitle>
        <CardDescription>
          New documents enter as <code>proposed</code> and must be approved
          before agents can retrieve them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                name="title"
                required
                placeholder="e.g. DfT Transport Decarbonisation Plan 2021"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sourceType">Source type *</Label>
              <select
                id="sourceType"
                name="sourceType"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {SOURCE_TYPES.map((st) => (
                  <option key={st} value={st}>
                    {labelFor(st)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tier">Tier *</Label>
              <select
                id="tier"
                name="tier"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="sourceUrl">Source URL</Label>
              <Input
                id="sourceUrl"
                name="sourceUrl"
                type="url"
                placeholder="https://www.gov.uk/…"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="publisher">Publisher</Label>
              <Input
                id="publisher"
                name="publisher"
                placeholder="DfT, ORR, Network Rail, …"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="publishedOn">Published date</Label>
              <Input id="publishedOn" name="publishedOn" type="date" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Transport modes</Label>
            <div className="flex gap-2 flex-wrap">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMode(m)}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                    selectedModes.includes(m)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 border-border"
                  }`}
                >
                  {labelFor(m)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Themes</Label>
            <div className="flex gap-2 flex-wrap">
              {THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTheme(t)}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                    selectedThemes.includes(t)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 border-border"
                  }`}
                >
                  {labelFor(t)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="summary">Summary (optional)</Label>
            <Textarea
              id="summary"
              name="summary"
              rows={3}
              placeholder="Brief description of the document's relevance and coverage."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? "Adding…" : "Add document"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DocumentRow({
  doc,
}: {
  doc: AtlasKnowledgeDocumentEntity;
}) {
  const [isPending, startTransition] = useTransition();
  const [retireReason, setRetireReason] = useState("");
  const [showRetire, setShowRetire] = useState(false);

  function handleApprove() {
    startTransition(async () => {
      await approveKnowledgeDocumentAction(doc.id);
    });
  }

  function handleRetire() {
    if (!retireReason.trim()) return;
    startTransition(async () => {
      await retireKnowledgeDocumentAction(doc.id, retireReason);
      setShowRetire(false);
      setRetireReason("");
    });
  }

  const modes = (doc.modes ?? []) as string[];
  const themes = (doc.themes ?? []) as string[];

  return (
    <div className="border rounded-lg p-4 space-y-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{doc.title}</p>
          <p className="text-xs text-muted-foreground">
            {doc.publisher && <span>{doc.publisher} · </span>}
            {doc.publishedOn && (
              <span>{String(doc.publishedOn).slice(0, 4)} · </span>
            )}
            <span className="capitalize">{labelFor(doc.sourceType ?? "")}</span>
            {" · "}
            <span className="capitalize">{doc.tier}</span>
          </p>
        </div>
        <Badge variant={statusBadgeVariant(doc.status ?? "proposed")}>
          {doc.status}
        </Badge>
      </div>

      {(modes.length > 0 || themes.length > 0) && (
        <div className="flex gap-1 flex-wrap">
          {modes.map((m) => (
            <span
              key={m}
              className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
            >
              {labelFor(m)}
            </span>
          ))}
          {themes.map((t) => (
            <span
              key={t}
              className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200"
            >
              {labelFor(t)}
            </span>
          ))}
        </div>
      )}

      {doc.sourceUrl && (
        <p className="text-xs text-muted-foreground truncate">
          <a
            href={doc.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {doc.sourceUrl}
          </a>
        </p>
      )}

      {doc.chunksRefreshedAt && (
        <p className="text-xs text-muted-foreground">
          Chunks embedded:{" "}
          {new Date(doc.chunksRefreshedAt).toLocaleDateString()}
        </p>
      )}

      {doc.status === "proposed" && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handleApprove}
            disabled={isPending}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowRetire((v) => !v)}
            disabled={isPending}
          >
            Retire
          </Button>
        </div>
      )}

      {doc.status === "approved" && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowRetire((v) => !v)}
            disabled={isPending}
          >
            Retire
          </Button>
        </div>
      )}

      {showRetire && (
        <div className="flex gap-2 items-center pt-1">
          <Input
            value={retireReason}
            onChange={(e) => setRetireReason(e.target.value)}
            placeholder="Reason for retirement (required)"
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            variant="destructive"
            onClick={handleRetire}
            disabled={isPending || !retireReason.trim()}
          >
            Confirm
          </Button>
        </div>
      )}
    </div>
  );
}

export function KnowledgeBaseAdminPanel({ documents, coverageMatrix }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);

  const proposed = documents.filter((d) => d.status === "proposed");
  const approved = documents.filter((d) => d.status === "approved");
  const retired = documents.filter((d) => d.status === "retired");

  return (
    <div className="space-y-6">
      {/* Coverage matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage Matrix</CardTitle>
          <CardDescription>
            Approved document count per mode × theme. Gaps are visible and
            actionable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CoverageMatrix matrix={coverageMatrix} />
        </CardContent>
      </Card>

      {/* Add document */}
      <div>
        {!showAddForm ? (
          <Button onClick={() => setShowAddForm(true)} size="sm">
            + Add document
          </Button>
        ) : (
          <AddDocumentForm onClose={() => setShowAddForm(false)} />
        )}
      </div>

      {/* Documents table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Documents ({documents.length})
          </CardTitle>
          <CardDescription>
            {approved.length} approved · {proposed.length} proposed ·{" "}
            {retired.length} retired
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No documents yet. Add the first one using the button above.
            </p>
          )}
          {documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
