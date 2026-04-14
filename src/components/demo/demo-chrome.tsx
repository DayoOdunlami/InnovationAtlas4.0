"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { DemoNarrationBar } from "@/components/demo/demo-narration-bar";
import { DemoProvider, useDemo } from "@/lib/demo/demo-context";

function DemoEscapeListener() {
  const { isActive, waitingForContinue, stopDemo } = useDemo();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!isActive && !waitingForContinue) return;
      e.preventDefault();
      stopDemo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, waitingForContinue, stopDemo]);

  return null;
}

function DemoChromeInner({ children }: { children: ReactNode }) {
  return (
    <>
      <DemoEscapeListener />
      {children}
      <DemoNarrationBar />
    </>
  );
}

/** App shell: demo state, global Escape to stop, bottom narration bar. */
export function DemoChrome({ children }: { children: ReactNode }) {
  return (
    <DemoProvider>
      <DemoChromeInner>{children}</DemoChromeInner>
    </DemoProvider>
  );
}
