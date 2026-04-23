// ---------------------------------------------------------------------------
// Sibling-path helper (Phase 2a.1 — Block Editor Spec §4, Plate
// criterion #1).
//
// When user input ("Enter on empty bullet", "Enter in paragraph") or
// agent input (`appendParagraph(text, afterBlockId)`) asks the editor
// to insert a new block immediately after an existing one, the caller
// needs a Plate `Path` that places the new node as a TOP-LEVEL sibling
// of the reference block. No editor internals, no DOM hacks — just
// `[indexOfRef + 1]`.
//
// This module intentionally contains no React or Plate runtime imports
// so that the rule is trivially testable.
// ---------------------------------------------------------------------------

export type Path = number[];

export interface EditorValue {
  readonly children: ReadonlyArray<{ id?: string } & Record<string, unknown>>;
}

/**
 * Returns the path for appending a sibling immediately after the node
 * whose top-level `id` equals `afterBlockId`. Returns `null` when the
 * reference block is not found — the caller should treat that as an
 * "append at end" fallback.
 */
export function siblingAppendPath(
  editor: EditorValue,
  afterBlockId: string,
): Path | null {
  const children = editor.children ?? [];
  for (let i = 0; i < children.length; i += 1) {
    const node = children[i];
    if (node && node.id === afterBlockId) {
      return [i + 1];
    }
  }
  return null;
}

/**
 * Returns the top-level index of the block with the given id, or -1
 * when no such block exists.
 */
export function topLevelIndexOf(editor: EditorValue, blockId: string): number {
  const children = editor.children ?? [];
  for (let i = 0; i < children.length; i += 1) {
    if (children[i]?.id === blockId) return i;
  }
  return -1;
}
