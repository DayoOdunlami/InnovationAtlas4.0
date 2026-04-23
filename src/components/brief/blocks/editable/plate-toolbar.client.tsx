"use client";

// ---------------------------------------------------------------------------
// Minimal floating toolbar — Phase 2a.1 inline editing.
//
// Scope (per spec §4.1 / §5.2):
//   * Bold (Ctrl+B)
//   * Italic (Ctrl+I)
//   * Inline code
//   * Link (paragraph only)
//
// The toolbar is a thin wrapper that calls out to Plate's mark / node
// transforms. It is rendered above a selected paragraph / heading once
// a text range is highlighted. Heavier toolbars (block-type picker,
// colour, etc.) are explicitly out of 2a.1 scope — adding them blows
// the shared-brief bundle size audit and is scoped to a later phase.
// ---------------------------------------------------------------------------

import { Bold, Code, Italic, Link as LinkIcon } from "lucide-react";
import { useCallback } from "react";
import type { PlateEditor } from "platejs/react";

export interface PlateToolbarProps {
  editor: PlateEditor;
  /** True when the current selection is inside a paragraph. Link button
   * is only rendered in that case per Block Types Spec §3.2. */
  canLink: boolean;
}

function toggleMark(editor: PlateEditor, mark: "bold" | "italic" | "code") {
  // Prefer the marks-plugin API; falls back to the low-level slate
  // addMark/removeMark transforms via `editor.tf.toggleMark` (Plate
  // v52 shape). No DOM hacks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tf = editor.tf as any;
  if (typeof tf.toggleMark === "function") {
    tf.toggleMark(mark);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = editor.api as any;
  if (api?.marks?.()?.[mark]) {
    tf.removeMark(mark);
  } else {
    tf.addMark(mark, true);
  }
}

export function PlateToolbar({ editor, canLink }: PlateToolbarProps) {
  const addLink = useCallback(() => {
    if (!editor.selection) return;
    const url =
      typeof window !== "undefined" ? window.prompt("Link URL") : null;
    if (!url) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tf = editor.tf as any;
    if (typeof tf.insertLink === "function") {
      tf.insertLink({ url });
    } else if (typeof tf.wrapNodes === "function") {
      tf.wrapNodes({ type: "a", url, children: [] }, { split: true });
    }
  }, [editor]);

  return (
    <div
      role="toolbar"
      aria-label="Format"
      data-testid="plate-toolbar"
      className="inline-flex gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-sm"
    >
      <button
        type="button"
        aria-label="Bold"
        data-testid="tool-bold"
        onMouseDown={(e) => {
          e.preventDefault();
          toggleMark(editor, "bold");
        }}
        className="rounded p-1 hover:bg-muted"
      >
        <Bold className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Italic"
        data-testid="tool-italic"
        onMouseDown={(e) => {
          e.preventDefault();
          toggleMark(editor, "italic");
        }}
        className="rounded p-1 hover:bg-muted"
      >
        <Italic className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Inline code"
        data-testid="tool-code"
        onMouseDown={(e) => {
          e.preventDefault();
          toggleMark(editor, "code");
        }}
        className="rounded p-1 hover:bg-muted"
      >
        <Code className="size-4" aria-hidden />
      </button>
      {canLink ? (
        <button
          type="button"
          aria-label="Insert link"
          data-testid="tool-link"
          onMouseDown={(e) => {
            e.preventDefault();
            addLink();
          }}
          className="rounded p-1 hover:bg-muted"
        >
          <LinkIcon className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
