"use client";

// ---------------------------------------------------------------------------
// useBriefLayout — Phase 3c-a
//
// Manages which brief layout variant is active.
//
// Variants:
//   "focus"      — Brief full-width, chat pinned at the bottom (Variant B).
//                  This is the current default pattern and works on all
//                  screen sizes.
//   "side-by-side" — Brief left (flex-1), chat right (420px fixed), chat
//                    column collapses to 52px strip on click (Variant A).
//                    Requires ≥ 768px.
//
// Persistence: localStorage key `atlas.briefLayout`.
// URL override: `?layout=focus|side-by-side` (read on mount, ignored on
// share scope — share always stays "focus").
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

export type BriefLayoutVariant = "focus" | "side-by-side";

const STORAGE_KEY = "atlas.briefLayout";
const DEFAULT_LAYOUT: BriefLayoutVariant = "side-by-side";

function detectDefaultFromViewport(): BriefLayoutVariant {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  return window.innerWidth >= 768 ? "side-by-side" : "focus";
}

function readUrlParam(): BriefLayoutVariant | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search).get("layout");
  if (p === "focus" || p === "side-by-side") return p;
  return null;
}

function readStored(): BriefLayoutVariant | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "focus" || v === "side-by-side") return v;
  } catch {
    // private browsing / quota
  }
  return null;
}

function persist(v: BriefLayoutVariant) {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // ignore
  }
}

export function useBriefLayout(readOnly: boolean) {
  const [layout, setLayoutState] = useState<BriefLayoutVariant>(DEFAULT_LAYOUT);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  useEffect(() => {
    if (readOnly) {
      setLayoutState("focus");
      return;
    }
    const fromUrl = readUrlParam();
    const fromStorage = readStored();
    setLayoutState(fromUrl ?? fromStorage ?? detectDefaultFromViewport());
  }, [readOnly]);

  const setLayout = (v: BriefLayoutVariant) => {
    setLayoutState(v);
    setChatCollapsed(false);
    persist(v);
  };

  const toggleChatCollapse = () => setChatCollapsed((c) => !c);

  return { layout, setLayout, chatCollapsed, toggleChatCollapse };
}
