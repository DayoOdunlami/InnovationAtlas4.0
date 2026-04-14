"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDemo } from "@/lib/demo/demo-context";
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
  } = useDemo();

  const [visibleText, setVisibleText] = useState("");
  const [textOpacity, setTextOpacity] = useState(1);
  const prevTextRef = useRef<string | null>(null);

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

  const onBarClick = useCallback(() => {
    if (waitingForContinue) acknowledgePause();
  }, [waitingForContinue, acknowledgePause]);

  if (!isActive && !waitingForContinue) return null;

  const isLandscape = pathname?.includes("/landscape") ?? false;

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
      <div className="mx-auto flex w-full max-w-4xl flex-row items-center justify-between gap-4">
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
        <div className="hidden h-0.5 w-28 shrink-0 sm:block" aria-hidden>
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
