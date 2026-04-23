// ---------------------------------------------------------------------------
// Silent placeholder for unrendered block types (Phase 2a.0 — brief
// spec §4.1).
//
// Phase 2a.0 renders only `heading` and `paragraph`. Every other v1
// block type (bullets / citation / project-card / chart / live-
// passport-view / landscape-embed / table) emits a production-shaped
// aria-hidden `<div>` so that:
//
//   * Share recipients see an empty slot where 2b / 3a renderers
//     will land, rather than "coming soon" chrome.
//   * The DOM remains debuggable in devtools via `data-block-id` /
//     `data-block-type`.
//   * Assistive tech skips the placeholder (aria-hidden).
//
// The backing row stays intact — only the visible renderer is deferred.
// ---------------------------------------------------------------------------

export function PlaceholderBlockRenderer({
  id,
  type,
}: {
  id: string;
  type: string;
}) {
  return <div data-block-type={type} data-block-id={id} aria-hidden="true" />;
}
