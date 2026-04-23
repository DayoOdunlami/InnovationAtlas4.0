"use client";

// ---------------------------------------------------------------------------
// Realtime subscriber island (Phase 3a — Brief-First Rebuild).
//
// Wraps <LivePassportCard> with a Supabase Realtime subscription on the
// `atlas.passports` table (filtered by `id=eq.<passportId>`). When the
// server pushes a postgres_changes event, the local snapshot is replaced in
// place — no stale-SWR cross-tab window.
//
// Fallback: if the Realtime channel is ever CLOSED or CHANNEL_ERROR, a
// 60-second interval poll re-fetches via GET /api/passport/[id] so the card
// never stays permanently stale. The interval is cleared on unmount.
//
// Bundle leak guard: this file is imported ONLY from
// live-passport-view-mount.client.tsx via `next/dynamic({ ssr: false })`.
// It MUST NOT be imported directly from any server-component or from any
// path reachable by the share-route bundle. The check-share-bundle.ts script
// asserts that `@supabase/realtime-js` is absent from all share-reachable
// chunks.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { PassportRow } from "@/lib/passport/types";
import type { LivePassportCardProps } from "./live-passport-card";
import { LivePassportCard } from "./live-passport-card";

const POLL_INTERVAL_MS = 60_000;

async function fetchPassport(
  passportId: string,
): Promise<{ passport: PassportRow; claimsCount: number } | null> {
  try {
    const res = await fetch(`/api/passport/${passportId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      passport: data.passport as PassportRow,
      claimsCount: (data.claims as unknown[]).length,
    };
  } catch {
    return null;
  }
}

type Props = Omit<LivePassportCardProps, "passport" | "claimsCount"> & {
  passportId: string;
  initialPassport: PassportRow;
  initialClaimsCount: number;
};

export function LivePassportViewRealtime({
  blockId,
  passportId,
  initialPassport,
  initialClaimsCount,
}: Props) {
  const [passport, setPassport] = useState<PassportRow>(initialPassport);
  const [claimsCount, setClaimsCount] = useState(initialClaimsCount);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startPolling() {
    if (pollRef.current !== null) return;
    pollRef.current = setInterval(async () => {
      const fresh = await fetchPassport(passportId);
      if (fresh) {
        setPassport(fresh.passport);
        setClaimsCount(fresh.claimsCount);
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel(`live-passport-view:${passportId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "atlas",
          table: "passports",
          filter: `id=eq.${passportId}`,
        },
        async () => {
          // The payload from Realtime may not include all columns, so we
          // re-fetch the full row via the API to keep the card consistent
          // with what getPassportDetail returns.
          const fresh = await fetchPassport(passportId);
          if (fresh) {
            setPassport(fresh.passport);
            setClaimsCount(fresh.claimsCount);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          stopPolling();
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          startPolling();
        }
      });

    return () => {
      stopPolling();
      supabase.removeChannel(channel);
    };
    // passportId is stable for the lifetime of this block instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passportId]);

  return (
    <LivePassportCard
      passport={passport}
      claimsCount={claimsCount}
      blockId={blockId}
    />
  );
}
