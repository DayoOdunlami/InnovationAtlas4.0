"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useDemo } from "@/lib/demo/demo-context";
import {
  DEMO_ADVANCE_MODE_LABELS,
  DEMO_NARRATION_MODE_LABELS,
} from "@/lib/demo/demo-options";
import { cn } from "@/lib/utils";

export function DemoNarrationBar() {
  const pathname = usePathname();
  const {
    isActive,
    narrationText,
    progress,
    stopDemo,
    waitingForContinue,
    acknowledgePause,
    runOptions,
    requestDemoSkip,
  } = useDemo();

  const [visibleText, setVisibleText] = useState("");
  const [textOpacity, setTextOpacity] = useState(1);
  const prevTextRef = useRef<string | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const stopOpenAiPlayback = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isActive && !waitingForContinue) {
      setVisibleText("");
      prevTextRef.current = null;
      return;
    }
    if (prevTextRef.current === narrationText) return;
    prevTextRef.current = narrationText;

    setTextOpacity(0);
    const t = window.setTimeout(() => {
      setVisibleText(narrationText);
      requestAnimationFrame(() => setTextOpacity(1));
    }, 150);
    return () => window.clearTimeout(t);
  }, [narrationText, isActive, waitingForContinue]);

  const speakBrowser = useCallback(() => {
    const mode = runOptions.narrationMode;
    if (mode !== "web_speech") return;
    const line = visibleText.trim();
    if (
      !line ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    )
      return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.lang = "en-GB";
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }, [visibleText, runOptions.narrationMode]);

  useEffect(() => {
    if (!isActive || runOptions.narrationMode !== "web_speech") {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }
    speakBrowser();
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speakBrowser, isActive, runOptions.narrationMode]);

  useEffect(() => {
    if (!isActive || runOptions.narrationMode !== "openai_tts") {
      stopOpenAiPlayback();
      return;
    }

    const line = visibleText.trim();
    if (!line) {
      stopOpenAiPlayback();
      return;
    }

    stopOpenAiPlayback();
    const ac = new AbortController();
    ttsAbortRef.current = ac;

    void (async () => {
      try {
        const res = await fetch("/api/demo/narration-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: line.slice(0, 4000) }),
          signal: ac.signal,
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || res.statusText);
        }
        const blob = await res.blob();
        if (ac.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        ttsObjectUrlRef.current = url;
        const audio = new Audio(url);
        audioElRef.current = audio;
        audio.addEventListener(
          "ended",
          () => {
            URL.revokeObjectURL(url);
            if (ttsObjectUrlRef.current === url) {
              ttsObjectUrlRef.current = null;
            }
          },
          { once: true },
        );
        await audio.play();
      } catch (e) {
        if (ac.signal.aborted) return;
        toast.error(
          e instanceof Error ? e.message : "Demo narration (OpenAI TTS) failed",
        );
      }
    })();

    return () => {
      ac.abort();
    };
  }, [visibleText, isActive, runOptions.narrationMode, stopOpenAiPlayback]);

  const onBarClick = useCallback(() => {
    if (waitingForContinue) {
      acknowledgePause();
    }
  }, [waitingForContinue, acknowledgePause]);

  if (!isActive && !waitingForContinue) return null;

  const isLandscape = pathname?.includes("/landscape") ?? false;
  const modeSummary = `${DEMO_ADVANCE_MODE_LABELS[runOptions.advanceMode].title} · ${DEMO_NARRATION_MODE_LABELS[runOptions.narrationMode].title}`;

  return (
    <div
      role="status"
      className={cn(
        "fixed left-0 right-0 z-[50] px-4 py-3 text-white shadow-lg",
        waitingForContinue && "cursor-pointer",
        isLandscape ? "bottom-20" : "bottom-0",
      )}
      style={{ backgroundColor: "rgba(0, 0, 0, 0.88)" }}
      onClick={onBarClick}
    >
      <p className="mx-auto mb-1 max-w-4xl truncate text-[10px] text-white/50">
        {modeSummary}
      </p>
      <div className="mx-auto flex w-full max-w-4xl flex-row items-center justify-between gap-3">
        <p
          className="min-w-0 flex-1 text-left text-sm leading-snug transition-opacity duration-150"
          style={{
            opacity: textOpacity,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {visibleText}
        </p>
        {isActive && (
          <button
            type="button"
            className="shrink-0 rounded-md border border-white/40 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              requestDemoSkip();
            }}
          >
            Skip →
          </button>
        )}
        <div className="hidden h-0.5 w-20 shrink-0 sm:block" aria-hidden>
          <div
            className="h-full w-full rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.3)" }}
          >
            <div
              className="h-full rounded-full bg-white transition-[width] duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 text-sm text-white transition-opacity hover:opacity-70"
          onClick={(e) => {
            e.stopPropagation();
            stopDemo();
          }}
        >
          Stop ×
        </button>
      </div>
      <div
        className="mx-auto mt-2 h-0.5 w-full max-w-4xl sm:hidden"
        aria-hidden
      >
        <div
          className="h-full w-full rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.3)" }}
        >
          <div
            className="h-full rounded-full bg-white transition-[width] duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
