"use client";

// ---------------------------------------------------------------------------
// JARVIS viewport modal — POC transfer.
//
// When the user clicks "Ask JARVIS", we:
//   1. capture the current canvas via `canvas.toDataURL()` (POC's
//      `captureViewport` — preserveDrawingBuffer is implicit with the
//      2D context). Phase 3b prompt line 62: keep the primitive.
//   2. POST { image, context } to /api/landscape/jarvis which routes
//      through the real AI SDK chat model.
//   3. Stream-typewriter the response; render suggestion pills.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

type JarvisContext = {
  mode: "explore" | "gravity" | "compare";
  zAxis?: "score" | "time" | "funding" | "flat";
  queryA?: string | null;
  queryB?: string | null;
  focused?: string | null;
  cameraDistance?: number;
  visibleClusterLabels?: boolean;
  nodeCount?: number;
};

export type JarvisModalProps = {
  open: boolean;
  screenshot: string | null;
  context: JarvisContext | null;
  onClose: () => void;
};

export function JarvisModal(props: JarvisModalProps) {
  const { open, screenshot, context, onClose } = props;
  const [text, setText] = useState<string>("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !screenshot || !context) return;
    let cancelled = false;
    setText("");
    setSuggestions([]);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/landscape/jarvis", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: screenshot, context }),
        });
        const body = (await res.json()) as {
          text?: string;
          suggestions?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? `jarvis ${res.status}`);
          setLoading(false);
          return;
        }
        setSuggestions(body.suggestions ?? []);
        setLoading(false);
        // Typewriter effect (POC-style, 12ms step).
        const full = body.text ?? "";
        let i = 0;
        const step = () => {
          if (cancelled) return;
          i = Math.min(i + 3, full.length);
          setText(full.slice(0, i));
          if (i < full.length) setTimeout(step, 12);
        };
        step();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "jarvis failed");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, screenshot, context]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="JARVIS viewport"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(10,14,19,0.85)] p-10 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="grid max-h-[85vh] w-full max-w-[860px] grid-cols-1 overflow-hidden border border-[#ff6b4a] bg-[#101620] md:grid-cols-2">
        <div className="hidden items-center justify-center overflow-hidden border-r border-[#253040] bg-[#0a0e13] p-4 md:flex">
          {screenshot ? (
            <img
              src={screenshot}
              alt="viewport"
              className="max-h-full max-w-full border border-[#253040]"
            />
          ) : (
            <span className="text-xs text-[#4a5566]">no viewport captured</span>
          )}
        </div>
        <div className="flex flex-col overflow-y-auto px-5 py-4 text-[#e8ecf1]">
          <div className="mb-3 flex items-center justify-between border-b border-[#253040] pb-3">
            <h2 className="font-['Fraunces'] text-base italic text-[#ff6b4a]">
              JARVIS sees your view
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close JARVIS modal"
              className="h-[26px] w-[26px] border border-[#253040] text-[#8a96a8] hover:text-[#e8ecf1]"
            >
              ×
            </button>
          </div>
          {context && (
            <div className="mb-3 border-l-2 border-[#ff6b4a] bg-[#1a2230] px-3 py-2 text-[10px] text-[#8a96a8]">
              <div>
                <span className="text-[#4a5566]">mode</span>{" "}
                <span className="text-[#e8ecf1]">{context.mode}</span>
              </div>
              {context.queryA && (
                <div>
                  <span className="text-[#4a5566]">query A</span>{" "}
                  <span className="text-[#e8ecf1]">"{context.queryA}"</span>
                </div>
              )}
              {context.queryB && (
                <div>
                  <span className="text-[#4a5566]">query B</span>{" "}
                  <span className="text-[#e8ecf1]">"{context.queryB}"</span>
                </div>
              )}
              {context.focused && (
                <div>
                  <span className="text-[#4a5566]">focused</span>{" "}
                  <span className="text-[#e8ecf1]">{context.focused}</span>
                </div>
              )}
              <div className="mt-1 text-[#4a5566]">
                image + context → vision model
              </div>
            </div>
          )}
          <div className="flex-1 font-['Fraunces'] text-[13px] leading-[1.55] text-[#e8ecf1]">
            {error ? (
              <p className="text-[#ff6b4a]">Error: {error}</p>
            ) : loading && !text ? (
              <p className="text-[#8a96a8]">Looking at your view…</p>
            ) : (
              <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
            )}
          </div>
          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#253040] pt-3">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="border border-[#253040] bg-transparent px-2 py-1.5 text-[9px] text-[#e8ecf1] hover:border-[#ff6b4a] hover:text-[#ff6b4a]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
