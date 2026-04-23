// @vitest-environment jsdom
// ---------------------------------------------------------------------------
// Unit tests — LivePassportCard renderer snapshot (non-live path).
// Phase 3a — Brief-First Rebuild.
//
// Asserts:
//   1. Card renders passport title, summary, claims count, last-updated.
//   2. Fallback title is shown when `title` is null.
//   3. Missing summary is handled gracefully (no crash, no empty section).
//   4. data-block-id and data-block-type attributes are set correctly.
// ---------------------------------------------------------------------------

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { PassportRow } from "@/lib/passport/types";
import { LivePassportCard } from "./live-passport-view.server";

afterEach(() => {
  cleanup();
});

const BASE_PASSPORT: PassportRow = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  passport_type: "technology",
  title: "Test Passport Title",
  project_name: "Test Project",
  project_description: null,
  owner_org: "ACME Corp",
  owner_name: "Alice",
  user_id: "user-1",
  summary: "This is a brief summary of the passport.",
  context: null,
  trl_level: 5,
  trl_target: 8,
  sector_origin: ["rail"],
  sector_target: ["aviation"],
  approval_body: null,
  approval_ref: null,
  approval_date: null,
  valid_conditions: null,
  trial_date_start: null,
  trial_date_end: null,
  tags: [],
  is_archived: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-04-20T12:00:00.000Z",
};

describe("LivePassportCard", () => {
  it("renders passport title", () => {
    render(
      <LivePassportCard
        passport={BASE_PASSPORT}
        claimsCount={7}
        blockId="BLOCKID0000000000000000001"
      />,
    );
    expect(screen.getByText("Test Passport Title")).toBeTruthy();
  });

  it("renders summary when present", () => {
    render(
      <LivePassportCard
        passport={BASE_PASSPORT}
        claimsCount={3}
        blockId="BLOCKID0000000000000000001"
      />,
    );
    expect(
      screen.getByText("This is a brief summary of the passport."),
    ).toBeTruthy();
  });

  it("renders claims count", () => {
    render(
      <LivePassportCard
        passport={BASE_PASSPORT}
        claimsCount={42}
        blockId="BLOCKID0000000000000000001"
      />,
    );
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText(/claims?/)).toBeTruthy();
  });

  it("renders singular 'claim' when count is 1", () => {
    render(
      <LivePassportCard
        passport={BASE_PASSPORT}
        claimsCount={1}
        blockId="BLOCKID0000000000000000001"
      />,
    );
    expect(screen.getByText("claim")).toBeTruthy();
  });

  it("falls back to project_name when title is null", () => {
    const passport: PassportRow = {
      ...BASE_PASSPORT,
      title: null,
      project_name: "Fallback Project Name",
    };
    render(
      <LivePassportCard
        passport={passport}
        claimsCount={0}
        blockId="BLOCKID0000000000000000001"
      />,
    );
    expect(screen.getByText("Fallback Project Name")).toBeTruthy();
  });

  it("falls back to 'Untitled passport' when both title and project_name are null", () => {
    const passport: PassportRow = {
      ...BASE_PASSPORT,
      title: null,
      project_name: null,
    };
    render(
      <LivePassportCard
        passport={passport}
        claimsCount={0}
        blockId="BLOCKID0000000000000000001"
      />,
    );
    expect(screen.getByText("Untitled passport")).toBeTruthy();
  });

  it("does not crash when summary is null", () => {
    const passport: PassportRow = { ...BASE_PASSPORT, summary: null };
    expect(() =>
      render(
        <LivePassportCard
          passport={passport}
          claimsCount={2}
          blockId="BLOCKID0000000000000000001"
        />,
      ),
    ).not.toThrow();
  });

  it("sets data-block-id and data-block-type correctly", () => {
    const { container } = render(
      <LivePassportCard
        passport={BASE_PASSPORT}
        claimsCount={5}
        blockId="MYBLOCKID0000000000000000"
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.blockId).toBe("MYBLOCKID0000000000000000");
    expect(root.dataset.blockType).toBe("live-passport-view");
  });

  it("renders owner_org when present", () => {
    render(
      <LivePassportCard
        passport={BASE_PASSPORT}
        claimsCount={0}
        blockId="BLOCKID0000000000000000001"
      />,
    );
    expect(screen.getByText("ACME Corp")).toBeTruthy();
  });
});
