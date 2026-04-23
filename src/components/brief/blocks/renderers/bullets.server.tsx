// ---------------------------------------------------------------------------
// Read-only bullets renderer (Phase 2a.1 — Block Types Spec §3.3).
//
// Shared by the share route (RSC dispatch) and any owner fallback paths
// that want a zero-client-JS render. Renders `<ul>` (bullet style) or
// `<ol>` (numbered style), with nested `<ul>` / `<ol>` per `indent[]`.
// Inline formatting per item is deliberately NOT supported in v1 to
// keep content_json flat and to avoid the extra mark-sanitisation
// surface on the share route.
//
// Algorithm
// ---------
// Walk items sequentially. Maintain a stack of open list levels (one
// `<ul>` or `<ol>` per indent level). When the next item's indent is
// deeper, open one new list per level. When it's shallower, close the
// extra levels. At indent `n` items become `<li>` children of the list
// at stack[n].
//
// Caps
// ----
// * items.length       ≤ 50
// * indent[i]          ∈ {0, 1, 2}   (>2 clamped, <0 clamped)
// * text per item      ≤ 10,000 chars (defensive)
// ---------------------------------------------------------------------------

import type { BulletsContent } from "../types";

const MAX_ITEMS = 50;
const MAX_INDENT = 2;
const MAX_ITEM_CHARS = 10_000;

function normaliseStyle(style: unknown): "bullet" | "numbered" {
  return style === "numbered" ? "numbered" : "bullet";
}

function clampIndent(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > MAX_INDENT) return MAX_INDENT;
  return Math.floor(n);
}

function clampItem(text: unknown): string {
  if (typeof text !== "string") return "";
  return text.length > MAX_ITEM_CHARS ? text.slice(0, MAX_ITEM_CHARS) : text;
}

type TreeNode = {
  children: TreeNode[];
  text?: string;
};

// Build a nested list tree from the flat items + indent[] arrays.
// Items at indent n become children of the nearest preceding item at
// indent n-1. Orphaned deeper items (no parent at previous level) are
// promoted to sit at the current stack top, preserving a sensible DOM.
function buildTree(items: string[], indent: number[]): TreeNode {
  const root: TreeNode = { children: [] };
  const stack: TreeNode[] = [root];
  const indentStack: number[] = [-1];

  for (let i = 0; i < items.length; i += 1) {
    const level = indent[i] ?? 0;
    while (indentStack[indentStack.length - 1] >= level) {
      stack.pop();
      indentStack.pop();
    }
    while (indentStack[indentStack.length - 1] < level - 1) {
      const bridge: TreeNode = { children: [] };
      stack[stack.length - 1].children.push(bridge);
      stack.push(bridge);
      indentStack.push(indentStack[indentStack.length - 1] + 1);
    }
    const node: TreeNode = { text: items[i], children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
    indentStack.push(level);
  }
  return root;
}

function renderTree(
  node: TreeNode,
  style: "bullet" | "numbered",
  depth: number,
  keyPrefix: string,
): React.ReactNode {
  if (node.children.length === 0) return null;
  const Tag = style === "numbered" ? "ol" : "ul";
  const className =
    depth === 0
      ? style === "numbered"
        ? "list-decimal pl-6 text-foreground"
        : "list-disc pl-6 text-foreground"
      : style === "numbered"
        ? "list-decimal pl-6 mt-1"
        : "list-disc pl-6 mt-1";
  return (
    <Tag className={className}>
      {node.children.map((child, idx) => {
        const key = `${keyPrefix}-${idx}`;
        return (
          <li key={key}>
            {child.text ?? ""}
            {renderTree(child, style, depth + 1, key)}
          </li>
        );
      })}
    </Tag>
  );
}

export function BulletsBlockRenderer({
  id,
  content,
}: {
  id: string;
  content: unknown;
}) {
  const c = (content ?? {}) as Partial<BulletsContent>;
  const style = normaliseStyle(c.style);
  const rawItems = Array.isArray(c.items) ? c.items : [];
  const items = rawItems.slice(0, MAX_ITEMS).map(clampItem);
  const rawIndent = Array.isArray(c.indent) ? c.indent : [];
  const indent = items.map((_, i) => clampIndent(rawIndent[i] ?? 0));
  const tree = buildTree(items, indent);
  return (
    <div
      data-block-id={id}
      data-block-type="bullets"
      className="leading-relaxed"
    >
      {renderTree(tree, style, 0, id)}
    </div>
  );
}
