"use client";

// ---------------------------------------------------------------------------
// useFlythrough — sequential camera tour runner for Phase 3d brief
// blocks. Reads a Zod-validated `flythrough` descriptor (see
// `LandscapeEmbedContentV2.flythrough` in
// `src/lib/ai/tools/blocks/index.ts`) and drives an imperative
// `LensRenderHandle` through each stop.
//
// Design:
//   - Pure hook, no direct DOM/THREE touches. The lens wrapper owns
//     the handle ref and passes it in.
//   - Autoplay only fires when the block is in the viewport to respect
//     narrative pacing (no autoplay on scroll-past).
//   - `prefers-reduced-motion: reduce` collapses `transition` to 0ms
//     (§13 accessibility — shortened transitions). Caption hold
//     duration is preserved so the user still has reading time.
//   - TTS is opt-in: when a stop has `narration`, we POST to
//     `/api/landscape/tts` and queue audio playback. Failures fall
//     back to silent caption — the tour never blocks on audio.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FlythroughStopTarget,
  LensRenderHandle,
} from "../force-graph-3d-native";

export type FlythroughStop = {
  kind: "node" | "cluster" | "compare" | "camera";
  nodeId?: string;
  clusterId?: number;
  query?: string;
  queryB?: string;
  caption: string;
  narration?: string;
  duration: number;
  transition: number;
  cameraTarget?: { x: number; y: number; z: number };
  cameraTheta?: number;
  cameraPhi?: number;
  cameraDistance?: number;
};

export type FlythroughConfig = {
  autoplay: boolean;
  loop: boolean;
  stops: FlythroughStop[];
};

export type FlythroughState = {
  playing: boolean;
  stopIndex: number;
  caption: string | null;
  totalStops: number;
};

export type FlythroughControls = {
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  restart: () => void;
  seek: (index: number) => void;
};

export type UseFlythroughArgs = {
  config: FlythroughConfig | null | undefined;
  handle: React.MutableRefObject<LensRenderHandle | null>;
  containerRef: React.RefObject<HTMLElement | null>;
  /** Optional TTS endpoint; omit to skip audio. */
  ttsEndpoint?: string | null;
  onStopChange?: (stop: FlythroughStop | null, index: number) => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function toRenderTarget(stop: FlythroughStop): FlythroughStopTarget {
  if (stop.kind === "node" && stop.nodeId)
    return {
      kind: "node",
      nodeId: stop.nodeId,
      distance: stop.cameraDistance,
    };
  if (stop.kind === "cluster" && typeof stop.clusterId === "number")
    return {
      kind: "cluster",
      clusterId: stop.clusterId,
      distance: stop.cameraDistance,
    };
  if (stop.kind === "compare")
    return { kind: "compare", distance: stop.cameraDistance };
  return {
    kind: "camera",
    target: stop.cameraTarget,
    theta: stop.cameraTheta,
    phi: stop.cameraPhi,
    distance: stop.cameraDistance,
  };
}

export function useFlythrough({
  config,
  handle,
  containerRef,
  ttsEndpoint,
  onStopChange,
}: UseFlythroughArgs): [FlythroughState, FlythroughControls] {
  const [playing, setPlaying] = useState(false);
  const [stopIndex, setStopIndex] = useState(0);
  const [caption, setCaption] = useState<string | null>(null);
  const startedOnceRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stops = config?.stops ?? [];
  const totalStops = stops.length;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runStop = useCallback(
    async (idx: number) => {
      if (idx < 0 || idx >= totalStops) return;
      const stop = stops[idx];
      if (!stop) return;
      const reduced = prefersReducedMotion();
      const transition = reduced ? 0 : stop.transition;
      handle.current?.tweenTo(toRenderTarget(stop), transition);
      setCaption(stop.caption);
      onStopChange?.(stop, idx);

      if (stop.narration && ttsEndpoint) {
        try {
          const res = await fetch(ttsEndpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: stop.narration }),
          });
          if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            if (audioRef.current) audioRef.current.pause();
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.play().catch(() => undefined);
          }
        } catch {
          /* silent — captions still render */
        }
      }
    },
    [handle, onStopChange, stops, totalStops, ttsEndpoint],
  );

  // Advance timer — fires `duration + transition` after the current
  // stop started.
  useEffect(() => {
    if (!playing || totalStops === 0) return;
    const stop = stops[stopIndex];
    if (!stop) return;
    runStop(stopIndex);
    const reduced = prefersReducedMotion();
    const holdMs = (reduced ? 0 : stop.transition) + stop.duration;
    timerRef.current = setTimeout(() => {
      const next = stopIndex + 1;
      if (next >= totalStops) {
        if (config?.loop) setStopIndex(0);
        else {
          setPlaying(false);
          setStopIndex(totalStops - 1);
        }
      } else {
        setStopIndex(next);
      }
    }, holdMs);
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stopIndex, totalStops, config?.loop]);

  // IntersectionObserver-driven autoplay (first time only).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !config?.autoplay) return;
    if (startedOnceRef.current) return;
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !startedOnceRef.current) {
            startedOnceRef.current = true;
            const t = setTimeout(() => {
              setPlaying(true);
              setStopIndex(0);
            }, 1000);
            return () => clearTimeout(t);
          }
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [config?.autoplay, containerRef]);

  const play = useCallback(() => {
    if (totalStops === 0) return;
    setPlaying(true);
  }, [totalStops]);
  const pause = useCallback(() => {
    setPlaying(false);
    clearTimer();
    if (audioRef.current) audioRef.current.pause();
  }, [clearTimer]);
  const next = useCallback(() => {
    if (totalStops === 0) return;
    clearTimer();
    setStopIndex((i) => Math.min(totalStops - 1, i + 1));
  }, [clearTimer, totalStops]);
  const prev = useCallback(() => {
    clearTimer();
    setStopIndex((i) => Math.max(0, i - 1));
  }, [clearTimer]);
  const restart = useCallback(() => {
    clearTimer();
    setStopIndex(0);
    setPlaying(true);
  }, [clearTimer]);
  const seek = useCallback(
    (i: number) => {
      clearTimer();
      if (i < 0 || i >= totalStops) return;
      setStopIndex(i);
    },
    [clearTimer, totalStops],
  );

  const state = useMemo<FlythroughState>(
    () => ({ playing, stopIndex, caption, totalStops }),
    [playing, stopIndex, caption, totalStops],
  );
  const controls = useMemo<FlythroughControls>(
    () => ({ play, pause, next, prev, restart, seek }),
    [play, pause, next, prev, restart, seek],
  );
  return [state, controls];
}
