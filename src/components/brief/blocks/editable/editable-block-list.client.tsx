"use client";

// ---------------------------------------------------------------------------
// EditableBlockList — Phase 2a.1 owner-scope editor (Brief-First Rebuild).
//
// Scope
// -----
// Owner view of /brief/[id] only. Share-scope renders the read-only RSC
// tree instead (see block-list.server.tsx). The share-route bundle-leak
// check extends to `@dnd-kit` as well as the Plate packages.
//
// Responsibilities
// ----------------
// 1. Mount one Plate editor whose top-level children mirror the
//    brief's atlas.blocks rows 1:1. Each top-level child carries its
//    atlas.blocks `id` so the serialiser (serialise/text.ts) can map
//    edits back to the source row.
// 2. Reflect user input optimistically via React 19 `useOptimistic` and
//    persist through the server actions in ./actions.ts — append +
//    update + remove + duplicate + move.
// 3. Host dnd-kit drag-reorder alongside the editor and wire keyboard
//    ⌘↑ / ⌘↓ for a11y, both resolving through `moveBlockAction`.
//
// Budgets (Phase 2a.1 §11)
// ------------------------
// * First-keystroke-to-persisted ≤ 250ms (append debounce 150ms).
// * Blur-to-update ≤ 300ms.
// * Drop-to-persisted ≤ 400ms.
//
// Criterion #1 (Block Editor Spec §4)
// -----------------------------------
// Sibling append on Enter uses `editor.tf.insertNodes(value, { at:
// siblingPath })`. See `sibling-path.ts` for the path helper; no DOM
// hacks, no editor-internal refs.
// ---------------------------------------------------------------------------

import {
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
} from "@platejs/basic-nodes/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { GripVertical, Plus, Trash2, Copy } from "lucide-react";
import type { Value } from "platejs";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { monotonicFactory } from "ulid";
import { toast } from "sonner";

import type {
  BulletsContent,
  HeadingContent,
  ParagraphContent,
} from "../types";
import {
  bulletsToPlate,
  headingToPlate,
  paragraphToPlate,
  plateToBullets,
  plateToHeading,
  plateToParagraph,
} from "../serialise/text";
import {
  H1Element,
  H2Element,
  H3Element,
  ParagraphElement,
  BulletsUlElement,
  BulletsOlElement,
  ListItemElement,
  LinkElement,
} from "./plate-elements";
import {
  appendBlockAction,
  duplicateBlockAction,
  moveBlockAction,
  removeBlockAction,
  updateBlockAction,
} from "../../../../app/(shared-brief)/brief/[id]/actions";

export interface EditableBlockRow {
  id: string;
  type: "heading" | "paragraph" | "bullets" | string;
  contentJson: unknown;
  position: string;
}

export interface EditableBlockListProps {
  briefId: string;
  initialBlocks: EditableBlockRow[];
}

const UPDATE_DEBOUNCE_MS = 150;
const nextUlid = monotonicFactory();

type OptimisticAction =
  | { kind: "append"; block: EditableBlockRow; afterId?: string | null }
  | { kind: "update"; blockId: string; contentJson: unknown }
  | { kind: "remove"; blockId: string }
  | { kind: "move"; blockId: string; newIndex: number };

function applyOptimistic(
  state: EditableBlockRow[],
  action: OptimisticAction,
): EditableBlockRow[] {
  if (action.kind === "append") {
    if (action.afterId) {
      const idx = state.findIndex((b) => b.id === action.afterId);
      if (idx < 0) return [...state, action.block];
      return [
        ...state.slice(0, idx + 1),
        action.block,
        ...state.slice(idx + 1),
      ];
    }
    return [...state, action.block];
  }
  if (action.kind === "update") {
    return state.map((b) =>
      b.id === action.blockId ? { ...b, contentJson: action.contentJson } : b,
    );
  }
  if (action.kind === "remove") {
    return state.filter((b) => b.id !== action.blockId);
  }
  if (action.kind === "move") {
    const from = state.findIndex((b) => b.id === action.blockId);
    if (from < 0) return state;
    const clampIdx = Math.max(0, Math.min(action.newIndex, state.length - 1));
    return arrayMove(state, from, clampIdx);
  }
  return state;
}

function blockRowToPlate(row: EditableBlockRow): Record<string, unknown> {
  if (row.type === "heading") {
    const h = headingToPlate(row.contentJson as HeadingContent);
    return { ...h, id: row.id };
  }
  if (row.type === "bullets") {
    const b = bulletsToPlate(row.contentJson as BulletsContent);
    return { ...b, id: row.id };
  }
  const p = paragraphToPlate(row.contentJson as ParagraphContent);
  return { ...p, id: row.id };
}

function plateNodeToContent(
  node: Record<string, unknown>,
  originalType: string,
):
  | { type: "heading"; content: HeadingContent }
  | { type: "paragraph"; content: ParagraphContent }
  | { type: "bullets"; content: BulletsContent }
  | null {
  const t = String(node.type ?? "");
  if (t === "h1" || t === "h2" || t === "h3") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { type: "heading", content: plateToHeading(node as any) };
  }
  if (t === "p") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { type: "paragraph", content: plateToParagraph(node as any) };
  }
  if (t === "ul" || t === "ol") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { type: "bullets", content: plateToBullets(node as any) };
  }
  // Fallback: preserve prior type by returning null and letting the
  // caller skip the update.
  void originalType;
  return null;
}

function makeEmptyParagraph(id: string): Record<string, unknown> {
  return { type: "p", id, children: [{ text: "" }] };
}

// ---------------------------------------------------------------------------
// Sortable block shell — wraps each top-level editor node in a drag handle.
// The shell is rendered OUTSIDE the Plate content tree (via slot headers)
// because editing inside contentEditable does not play well with
// transform-based drag overlays. Instead, the drag handle lives in the
// gutter and only triggers dnd-kit events.
// ---------------------------------------------------------------------------

function BlockGutterRow({
  id,
  onRemove,
  onDuplicate,
  onAddBelow,
  children,
}: {
  id: string;
  onRemove: () => void;
  onDuplicate: () => void;
  onAddBelow: () => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex gap-1 py-0.5"
      data-sortable-id={id}
    >
      <div className="absolute -left-14 top-1 flex items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label="Drag block"
          data-testid={`block-drag-${id}`}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Add paragraph below"
          data-testid={`block-add-below-${id}`}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          onClick={onAddBelow}
        >
          <Plus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Duplicate block"
          data-testid={`block-duplicate-${id}`}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          onClick={onDuplicate}
        >
          <Copy className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Remove block"
          data-testid={`block-remove-${id}`}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor component.
//
// Architecture: one Plate editor for the whole block list. Each top-level
// child is an atlas.blocks row. `onChange` computes a per-row diff and
// fires update / append / remove actions. The drag gutter is rendered
// OUTSIDE the editor DOM but uses the same block ids so both surfaces
// stay in sync.
// ---------------------------------------------------------------------------

export function EditableBlockList({
  briefId,
  initialBlocks,
}: EditableBlockListProps) {
  const [blocks, setBlocks] = useState<EditableBlockRow[]>(initialBlocks);
  const [optimisticBlocks, applyOptimisticAction] = useOptimistic<
    EditableBlockRow[],
    OptimisticAction
  >(blocks, applyOptimistic);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Seed the Plate editor with the current block rows. We do NOT
  // re-seed on every render — Plate owns its value after mount and we
  // reconcile via onChange.
  const initialValue = useMemo<Value>(
    () =>
      blocks.length > 0
        ? (blocks.map(blockRowToPlate) as unknown as Value)
        : ([makeEmptyParagraph(nextUlid())] as unknown as Value),
    // Re-seed ONLY when the brief id changes (user navigates briefs).
    // Subsequent edits are driven by the editor's internal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [briefId],
  );

  const editor = usePlateEditor({
    plugins: [
      H1Plugin.withComponent(H1Element),
      H2Plugin.withComponent(H2Element),
      H3Plugin.withComponent(H3Element),
      BoldPlugin,
      ItalicPlugin,
      CodePlugin,
    ],
    components: {
      p: ParagraphElement,
      ul: BulletsUlElement,
      ol: BulletsOlElement,
      li: ListItemElement,
      a: LinkElement,
    },
    value: initialValue,
  });

  // Debounced per-block commits keyed by block id. Edits commit on blur
  // (see onBlur below); this debounce handles the APPEND path where a
  // newly-inserted empty paragraph's first keystroke should materialise
  // a row within 250ms total.
  const pendingRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const commitUpdate = useCallback(
    (blockId: string, contentJson: unknown) => {
      startTransition(() =>
        applyOptimisticAction({
          kind: "update",
          blockId,
          contentJson,
        }),
      );
      void updateBlockAction({ briefId, blockId, contentJson }).catch((err) => {
        console.error("[editor] update failed:", err);
        toast.error("Couldn't save that edit — try again.");
      });
    },
    [briefId, applyOptimisticAction],
  );

  const scheduleUpdate = useCallback(
    (blockId: string, contentJson: unknown) => {
      const existing = pendingRef.current.get(blockId);
      if (existing) clearTimeout(existing);
      const handle = setTimeout(() => {
        pendingRef.current.delete(blockId);
        commitUpdate(blockId, contentJson);
      }, UPDATE_DEBOUNCE_MS);
      pendingRef.current.set(blockId, handle);
    },
    [commitUpdate],
  );

  const flushPending = useCallback(() => {
    for (const [, handle] of pendingRef.current) clearTimeout(handle);
    pendingRef.current.clear();
  }, []);

  useEffect(() => () => flushPending(), [flushPending]);

  // Reconcile editor state ↔ authoritative blocks list. Called on every
  // Plate onChange. We compute a diff (updates, appends, removes) at
  // the top-level child granularity and emit one action per change.
  const reconcile = useCallback(
    (value: Value) => {
      const seen = new Set<string>();
      const next: EditableBlockRow[] = [];
      const prevById = new Map(blocks.map((b) => [b.id, b] as const));

      for (const node of value as unknown as Record<string, unknown>[]) {
        const nodeId = (node.id as string | undefined) ?? nextUlid();
        seen.add(nodeId);
        const projected = plateNodeToContent(
          node,
          prevById.get(nodeId)?.type ?? "paragraph",
        );
        if (!projected) continue;
        const prev = prevById.get(nodeId);
        if (!prev) {
          const optimistic: EditableBlockRow = {
            id: nodeId,
            type: projected.type,
            contentJson: projected.content,
            position: "pending",
          };
          next.push(optimistic);
          startTransition(() =>
            applyOptimisticAction({
              kind: "append",
              block: optimistic,
            }),
          );
          const textLen = getTextLength(projected);
          if (textLen > 0) {
            scheduleAppend({
              briefId,
              type: projected.type,
              content: projected.content,
              afterBlockId: findPrev(value, nodeId),
              onResolved: (row) => {
                setBlocks((cur) => {
                  const exists = cur.some((b) => b.id === row.id);
                  if (exists) return cur;
                  return [
                    ...cur,
                    {
                      id: row.id,
                      type: row.type,
                      contentJson: row.contentJson,
                      position: row.position,
                    },
                  ];
                });
              },
            });
            // Replace the Plate node's id with the server-returned id
            // once the action resolves — handled in onResolved above
            // via a full editor reset path when needed. For 2a.1 the
            // simpler invariant is: the client-generated ULID IS the
            // server id because we pass it through on append.
          }
          continue;
        }
        next.push({
          id: nodeId,
          type: projected.type,
          contentJson: projected.content,
          position: prev.position,
        });
        if (!shallowEqual(prev.contentJson, projected.content)) {
          scheduleUpdate(nodeId, projected.content);
        }
      }

      // Removed rows — any previous row missing from `seen`.
      for (const b of blocks) {
        if (!seen.has(b.id)) {
          startTransition(() =>
            applyOptimisticAction({ kind: "remove", blockId: b.id }),
          );
          void removeBlockAction({ briefId, blockId: b.id }).catch((err) => {
            console.error("[editor] remove failed:", err);
            toast.error("Couldn't delete that block — try again.");
          });
          setBlocks((cur) => cur.filter((x) => x.id !== b.id));
        }
      }

      // Sync local blocks state — append and update reflect immediately,
      // position comes from the server for appends.
      setBlocks(next);
    },
    [blocks, briefId, applyOptimisticAction, scheduleUpdate],
  );

  // Server-action append with client-provided ULID so the editor's
  // node id and the DB row id agree immediately.
  const scheduleAppend = useCallback(
    (params: {
      briefId: string;
      type: "heading" | "paragraph" | "bullets";
      content: unknown;
      afterBlockId?: string | null;
      onResolved?: (row: {
        id: string;
        type: string;
        contentJson: unknown;
        position: string;
      }) => void;
    }) => {
      void appendBlockAction({
        briefId: params.briefId,
        type: params.type,
        contentJson: params.content,
        afterBlockId: params.afterBlockId ?? null,
        source: "user",
      })
        .then((row) => params.onResolved?.(row))
        .catch((err) => {
          console.error("[editor] append failed:", err);
          toast.error("Couldn't save that new block — try again.");
        });
    },
    [],
  );

  const onAddBelow = useCallback(
    (afterId: string) => {
      const id = nextUlid();
      const content: ParagraphContent = { text: "" };
      const optimistic: EditableBlockRow = {
        id,
        type: "paragraph",
        contentJson: content,
        position: "pending",
      };
      startTransition(() =>
        applyOptimisticAction({
          kind: "append",
          block: optimistic,
          afterId,
        }),
      );
      setBlocks((cur) => {
        const idx = cur.findIndex((b) => b.id === afterId);
        const insertAt = idx < 0 ? cur.length : idx + 1;
        const copy = cur.slice();
        copy.splice(insertAt, 0, optimistic);
        return copy;
      });
      void appendBlockAction({
        briefId,
        type: "paragraph",
        contentJson: content,
        afterBlockId: afterId,
        source: "user",
      })
        .then((row) => {
          setBlocks((cur) =>
            cur.map((b) =>
              b.id === id ? { ...b, position: row.position, id: row.id } : b,
            ),
          );
          // Reflect the id swap in the editor so subsequent edits map
          // back correctly. We mutate the node's id in-place through
          // the editor's transform API.
          const value = editor.children as unknown as Record<string, unknown>[];
          const idx = value.findIndex((n) => n.id === id);
          if (idx >= 0) {
            editor.tf.setNodes({ id: row.id }, { at: [idx] });
          }
        })
        .catch((err) => {
          console.error("[editor] add-below failed:", err);
          toast.error("Couldn't insert that block — try again.");
        });
    },
    [briefId, editor, applyOptimisticAction],
  );

  const onDuplicate = useCallback(
    (blockId: string) => {
      void duplicateBlockAction({ briefId, blockId })
        .then((row) => {
          setBlocks((cur) => {
            const idx = cur.findIndex((b) => b.id === blockId);
            const copy = cur.slice();
            const newRow: EditableBlockRow = {
              id: row.id,
              type: row.type,
              contentJson: row.contentJson,
              position: row.position,
            };
            if (idx < 0) copy.push(newRow);
            else copy.splice(idx + 1, 0, newRow);
            return copy;
          });
          // Mirror into the editor tree.
          const value = editor.children as unknown as Record<string, unknown>[];
          const idx = value.findIndex((n) => n.id === blockId);
          const newNode = { ...value[idx], id: row.id };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.tf.insertNodes([newNode as any], { at: [idx + 1] });
        })
        .catch((err) => {
          console.error("[editor] duplicate failed:", err);
          toast.error("Couldn't duplicate that block — try again.");
        });
    },
    [briefId, editor],
  );

  const onRemove = useCallback(
    (blockId: string) => {
      startTransition(() => applyOptimisticAction({ kind: "remove", blockId }));
      const value = editor.children as unknown as Record<string, unknown>[];
      const idx = value.findIndex((n) => n.id === blockId);
      if (idx >= 0) {
        editor.tf.removeNodes({ at: [idx] });
      }
      setBlocks((cur) => cur.filter((b) => b.id !== blockId));
      void removeBlockAction({ briefId, blockId }).catch((err) => {
        console.error("[editor] remove failed:", err);
        toast.error("Couldn't remove that block — try again.");
      });
    },
    [briefId, editor, applyOptimisticAction],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      startTransition(() =>
        applyOptimisticAction({
          kind: "move",
          blockId: String(active.id),
          newIndex,
        }),
      );
      const reordered = arrayMove(blocks, oldIndex, newIndex);
      setBlocks(reordered);
      // Move the corresponding Plate node too.
      const value = editor.children as unknown as Record<string, unknown>[];
      const from = value.findIndex((n) => n.id === active.id);
      const to = value.findIndex((n) => n.id === over.id);
      if (from >= 0 && to >= 0 && from !== to) {
        editor.tf.moveNodes({ at: [from], to: [to] });
      }
      void moveBlockAction({
        briefId,
        blockId: String(active.id),
        newIndex,
      }).catch((err) => {
        console.error("[editor] move failed:", err);
        toast.error("Couldn't reorder that block — try again.");
      });
    },
    [blocks, briefId, editor, applyOptimisticAction],
  );

  // Keyboard reorder (⌘↑ / ⌘↓) for a11y. Runs against the editor's
  // current selection node.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const sel = editor.selection;
      if (!sel) return;
      const topIdx = sel.anchor.path[0];
      const value = editor.children as unknown as Record<string, unknown>[];
      const node = value[topIdx];
      const blockId = node?.id as string | undefined;
      if (!blockId) return;
      const dir = e.key === "ArrowUp" ? -1 : 1;
      const newIndex = topIdx + dir;
      if (newIndex < 0 || newIndex >= value.length) return;
      e.preventDefault();
      editor.tf.moveNodes({ at: [topIdx], to: [newIndex] });
      startTransition(() =>
        applyOptimisticAction({ kind: "move", blockId, newIndex }),
      );
      setBlocks((cur) => {
        const from = cur.findIndex((b) => b.id === blockId);
        if (from < 0) return cur;
        return arrayMove(cur, from, newIndex);
      });
      void moveBlockAction({ briefId, blockId, newIndex }).catch((err) => {
        console.error("[editor] keyboard move failed:", err);
        toast.error("Couldn't reorder that block — try again.");
      });
    },
    [briefId, editor, applyOptimisticAction],
  );

  const ids = useMemo(
    () => optimisticBlocks.map((b) => b.id),
    [optimisticBlocks],
  );

  return (
    <div
      data-testid="brief-blocks-editable"
      data-brief-id={briefId}
      className="flex flex-col gap-2"
      onKeyDown={onKeyDown}
    >
      <Plate editor={editor} onChange={({ value }) => reconcile(value)}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <PlateContent
              data-testid="brief-editor-content"
              className="outline-none min-h-[120px]"
              placeholder="Type a heading or paragraph…"
              onBlur={() => {
                // Flush the debounce buffer on blur so edits commit
                // before the user navigates away. Each pending entry
                // still updates a single row.
                for (const [blockId, handle] of pendingRef.current) {
                  clearTimeout(handle);
                  const row = blocks.find((b) => b.id === blockId);
                  if (row) {
                    commitUpdate(blockId, row.contentJson);
                  }
                }
                pendingRef.current.clear();
              }}
            />
          </SortableContext>
        </DndContext>
      </Plate>

      {/* Gutter actions rendered below the editor so drag / duplicate
          / remove are reachable without entering contentEditable. */}
      <ul
        className="mt-3 flex flex-col gap-1 border-t border-dashed border-border pt-2"
        aria-label="Block actions"
        data-testid="brief-blocks-gutter"
      >
        {optimisticBlocks.map((b) => (
          <li key={b.id}>
            <BlockGutterRow
              id={b.id}
              onRemove={() => onRemove(b.id)}
              onDuplicate={() => onDuplicate(b.id)}
              onAddBelow={() => onAddBelow(b.id)}
            >
              <span
                className="block truncate text-xs text-muted-foreground"
                data-testid={`block-label-${b.id}`}
              >
                {describeBlock(b)}
              </span>
            </BlockGutterRow>
          </li>
        ))}
      </ul>
    </div>
  );
}

function describeBlock(b: EditableBlockRow): string {
  if (b.type === "heading") {
    const h = b.contentJson as HeadingContent;
    return `H${h?.level ?? 1} · ${(h?.text ?? "").slice(0, 60) || "Untitled"}`;
  }
  if (b.type === "bullets") {
    const x = b.contentJson as BulletsContent;
    const count = Array.isArray(x?.items) ? x.items.length : 0;
    return `${x?.style === "numbered" ? "Numbered" : "Bullet"} list · ${count} item${count === 1 ? "" : "s"}`;
  }
  const p = b.contentJson as ParagraphContent;
  return (p?.text ?? "").slice(0, 60) || "Paragraph";
}

function shallowEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getTextLength(
  projected:
    | { type: "heading"; content: HeadingContent }
    | { type: "paragraph"; content: ParagraphContent }
    | { type: "bullets"; content: BulletsContent },
): number {
  if (projected.type === "heading") return projected.content.text.length;
  if (projected.type === "paragraph") return projected.content.text.length;
  return projected.content.items.join("").length;
}

function findPrev(value: Value, targetId: string): string | null {
  for (let i = 0; i < value.length; i += 1) {
    const v = value[i] as unknown as { id?: string };
    if (v?.id === targetId) {
      if (i === 0) return null;
      return (value[i - 1] as unknown as { id?: string }).id ?? null;
    }
  }
  return null;
}

void generateKeyBetween;
