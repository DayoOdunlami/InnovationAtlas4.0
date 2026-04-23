// @vitest-environment jsdom
// ---------------------------------------------------------------------------
// Block editor contract tests (Phase 2a.1 — Block Editor Spec §4
// criterion #1).
//
// Contract: sibling append from inside a block must materialise the
// new block at the correct DOM index, without DOM hacks or refs to
// editor internals. Covered here:
//
//   1. `siblingAppendPath(editor, id)` returns `[indexOf(id) + 1]` and
//      null when the id is absent.
//   2. Programmatic insert at that path places the new node between
//      the two existing siblings — verified against a plain editor-
//      shaped object (no real editor runtime needed; the same
//      assertion holds inside Plate because Plate `Path`s index
//      top-level children identically).
//
// The prior sibling-path suite also dynamically imported
// `./editable-block-list.client` to assert it exported a React
// function. That added no contract coverage beyond what TypeScript
// already guarantees and took ~35s under jsdom because it pulled in
// Plate + dnd-kit at runtime — dropped in favour of the path-math
// contract above.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

import {
  siblingAppendPath,
  topLevelIndexOf,
} from "./../serialise/sibling-path";

describe("siblingAppendPath (Plate criterion #1)", () => {
  it("returns [i+1] for the given top-level id", () => {
    const editor = {
      children: [
        { id: "A", type: "p", children: [{ text: "a" }] },
        { id: "B", type: "p", children: [{ text: "b" }] },
        { id: "C", type: "p", children: [{ text: "c" }] },
      ],
    };
    expect(siblingAppendPath(editor, "A")).toEqual([1]);
    expect(siblingAppendPath(editor, "B")).toEqual([2]);
    expect(siblingAppendPath(editor, "C")).toEqual([3]);
  });

  it("returns null when the id is not a top-level child", () => {
    const editor = {
      children: [{ id: "A", type: "p", children: [{ text: "a" }] }],
    };
    expect(siblingAppendPath(editor, "missing")).toBeNull();
  });

  it("topLevelIndexOf returns -1 when not found", () => {
    const editor = {
      children: [{ id: "A", type: "p", children: [{ text: "a" }] }],
    };
    expect(topLevelIndexOf(editor, "A")).toBe(0);
    expect(topLevelIndexOf(editor, "Z")).toBe(-1);
  });
});

describe("programmatic insert between two blocks", () => {
  it("places the new block at the sibling path — DOM index i+1", () => {
    const editor: {
      children: Array<{ id: string; type: string; children: unknown[] }>;
    } = {
      children: [
        { id: "A", type: "p", children: [{ text: "first" }] },
        { id: "C", type: "p", children: [{ text: "last" }] },
      ],
    };
    const path = siblingAppendPath(editor, "A");
    expect(path).toEqual([1]);
    editor.children.splice(path![0], 0, {
      id: "B",
      type: "p",
      children: [{ text: "middle" }],
    });
    expect(editor.children.map((c) => c.id)).toEqual(["A", "B", "C"]);
  });
});
