// @vitest-environment jsdom
// ---------------------------------------------------------------------------
// Unit tests — LivePassportViewRealtime hook behaviour.
// Phase 3a — Brief-First Rebuild.
//
// Strategy: mock Supabase browser client and `fetch`. Verify that:
//   1. Component renders the initial passport card on mount.
//   2. When a Realtime `postgres_changes` callback fires, the component
//      re-renders with fresh data (after a mocked fetch call).
//   3. On unmount, `removeChannel` is called (cleanup / unsubscribe).
//   4. When the channel reports CLOSED status, fallback polling is
//      started (setInterval is called).
//   5. When the channel later reports SUBSCRIBED, the interval is cleared
//      (stopPolling called).
// ---------------------------------------------------------------------------

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import type { PassportRow } from "@/lib/passport/types";

// ---------------------------------------------------------------------------
// Helpers — track channel callbacks so tests can invoke them.
// ---------------------------------------------------------------------------

type ChangeHandler = () => Promise<void>;
type StatusHandler = (status: string) => void;

interface FakeChannel {
  _changeHandlers: ChangeHandler[];
  _statusHandlers: StatusHandler[];
  on: (event: string, filter: unknown, handler: ChangeHandler) => FakeChannel;
  subscribe: (handler: StatusHandler) => FakeChannel;
}

function makeFakeChannel(): FakeChannel {
  const ch: FakeChannel = {
    _changeHandlers: [],
    _statusHandlers: [],
    on(_event, _filter, handler) {
      this._changeHandlers.push(handler);
      return this;
    },
    subscribe(handler) {
      this._statusHandlers.push(handler);
      return this;
    },
  };
  return ch;
}

let fakeChannel: FakeChannel;
const removeChannelMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: vi.fn(() => ({
    channel: (_name: string) => {
      fakeChannel = makeFakeChannel();
      return fakeChannel;
    },
    removeChannel: removeChannelMock,
  })),
}));

const PASSPORT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const BASE_PASSPORT: PassportRow = {
  id: PASSPORT_ID,
  passport_type: null,
  title: "Initial Title",
  project_name: null,
  project_description: null,
  owner_org: null,
  owner_name: null,
  user_id: null,
  summary: "Initial summary",
  context: null,
  trl_level: null,
  trl_target: null,
  sector_origin: null,
  sector_target: null,
  approval_body: null,
  approval_ref: null,
  approval_date: null,
  valid_conditions: null,
  trial_date_start: null,
  trial_date_end: null,
  tags: [],
  is_archived: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-04-20T00:00:00Z",
};

const UPDATED_PASSPORT: PassportRow = {
  ...BASE_PASSPORT,
  title: "Updated Title",
  summary: "Updated summary",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Default fetch returns updated data
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      passport: UPDATED_PASSPORT,
      claims: [1, 2, 3],
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Import after mocks are established
const { LivePassportViewRealtime } = await import(
  "./live-passport-view-realtime.client"
);

describe("LivePassportViewRealtime", () => {
  it("renders initial passport title on mount", () => {
    render(
      <LivePassportViewRealtime
        blockId="BLOCKID0000000000000000001"
        passportId={PASSPORT_ID}
        initialPassport={BASE_PASSPORT}
        initialClaimsCount={5}
      />,
    );
    expect(screen.getByText("Initial Title")).toBeTruthy();
  });

  it("re-renders with fresh data when Realtime change fires", async () => {
    render(
      <LivePassportViewRealtime
        blockId="BLOCKID0000000000000000001"
        passportId={PASSPORT_ID}
        initialPassport={BASE_PASSPORT}
        initialClaimsCount={5}
      />,
    );
    expect(screen.getByText("Initial Title")).toBeTruthy();

    // Simulate the Realtime postgres_changes event
    await act(async () => {
      for (const handler of fakeChannel._changeHandlers) {
        await handler();
      }
      // Flush remaining microtasks so React re-renders
      await Promise.resolve();
    });

    expect(screen.getByText("Updated Title")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith(`/api/passport/${PASSPORT_ID}`);
  });

  it("calls removeChannel on unmount", () => {
    const { unmount } = render(
      <LivePassportViewRealtime
        blockId="BLOCKID0000000000000000001"
        passportId={PASSPORT_ID}
        initialPassport={BASE_PASSPORT}
        initialClaimsCount={2}
      />,
    );
    unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
  });

  it("starts polling when channel reports CLOSED", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    render(
      <LivePassportViewRealtime
        blockId="BLOCKID0000000000000000001"
        passportId={PASSPORT_ID}
        initialPassport={BASE_PASSPORT}
        initialClaimsCount={2}
      />,
    );
    act(() => {
      for (const handler of fakeChannel._statusHandlers) {
        handler("CLOSED");
      }
    });
    expect(setIntervalSpy).toHaveBeenCalled();
  });

  it("stops polling when channel later reports SUBSCRIBED", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    render(
      <LivePassportViewRealtime
        blockId="BLOCKID0000000000000000001"
        passportId={PASSPORT_ID}
        initialPassport={BASE_PASSPORT}
        initialClaimsCount={2}
      />,
    );
    act(() => {
      for (const handler of fakeChannel._statusHandlers) {
        handler("CLOSED"); // start polling first
      }
    });
    act(() => {
      for (const handler of fakeChannel._statusHandlers) {
        handler("SUBSCRIBED"); // should stop polling
      }
    });
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("updates claims count from Realtime payload fetch", async () => {
    // Returns 3 claims in the mock fetch
    render(
      <LivePassportViewRealtime
        blockId="BLOCKID0000000000000000001"
        passportId={PASSPORT_ID}
        initialPassport={BASE_PASSPORT}
        initialClaimsCount={5}
      />,
    );

    // Trigger the Realtime change handler and let async effects settle
    await act(async () => {
      for (const handler of fakeChannel._changeHandlers) {
        await handler();
      }
      // Flush remaining microtasks
      await Promise.resolve();
    });

    // The fetch resolved with 3 claims; React should re-render
    expect(screen.getByText("3")).toBeTruthy();
  });
});
