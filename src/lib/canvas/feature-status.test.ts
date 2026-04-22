import { describe, expect, it } from "vitest";
import {
  FEATURE_STATUS,
  type FeatureEntry,
  formatFeatureStatusForPrompt,
  groupByStatus,
  groupBySurface,
  hasActiveWipOnCanvas,
} from "./feature-status";

describe("FEATURE_STATUS registry", () => {
  it("has no duplicate ids", () => {
    const ids = FEATURE_STATUS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has a valid status and surface", () => {
    const validStatus = new Set(["ready", "wip", "planned"]);
    const validSurface = new Set([
      "canvas",
      "landscape",
      "passport",
      "voice",
      "tool",
      "briefing",
    ]);
    for (const e of FEATURE_STATUS) {
      expect(validStatus.has(e.status)).toBe(true);
      expect(validSurface.has(e.surface)).toBe(true);
      expect(e.label.length).toBeGreaterThan(0);
    }
  });

  it("groupByStatus partitions the array completely", () => {
    const grouped = groupByStatus();
    const total =
      grouped.ready.length + grouped.wip.length + grouped.planned.length;
    expect(total).toBe(FEATURE_STATUS.length);
  });

  it("groupBySurface partitions the array completely", () => {
    const grouped = groupBySurface();
    const total = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(FEATURE_STATUS.length);
  });

  it("hasActiveWipOnCanvas reflects the current registry", () => {
    const manual = FEATURE_STATUS.some(
      (e) => e.surface === "canvas" && e.status === "wip",
    );
    expect(hasActiveWipOnCanvas()).toBe(manual);
  });
});

describe("formatFeatureStatusForPrompt", () => {
  it("returns a non-empty bulleted block with all three sections", () => {
    const out = formatFeatureStatusForPrompt();
    expect(out.length).toBeGreaterThan(100);
    expect(out).toContain("READY:");
    expect(out).toContain("IN PROGRESS:");
    expect(out).toContain("PLANNED:");
  });

  it("includes every promptNote verbatim", () => {
    const out = formatFeatureStatusForPrompt();
    for (const e of FEATURE_STATUS) {
      if (e.promptNote) {
        expect(out).toContain(e.promptNote);
      }
    }
  });

  it("includes every label", () => {
    const out = formatFeatureStatusForPrompt();
    for (const e of FEATURE_STATUS) {
      expect(out).toContain(e.label);
    }
  });

  it("contains the behavioural rule about WIP/PLANNED redirection", () => {
    const out = formatFeatureStatusForPrompt();
    expect(out).toContain("offer the closest READY alternative from this list");
    expect(out).toContain("Do not attempt to simulate or fake the feature");
  });

  it("is stable across calls (pure function)", () => {
    expect(formatFeatureStatusForPrompt()).toBe(formatFeatureStatusForPrompt());
  });

  it("honours a custom entries argument", () => {
    const custom: FeatureEntry[] = [
      { id: "x.one", label: "Only one", status: "ready", surface: "tool" },
    ];
    const out = formatFeatureStatusForPrompt(custom);
    expect(out).toContain("Only one");
    // WIP and PLANNED sections still render (empty), but no other entries leak.
    expect(out).not.toContain("Force-graph lens");
  });
});
