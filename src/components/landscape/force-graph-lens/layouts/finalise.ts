// ---------------------------------------------------------------------------
// finalise — drop links whose endpoints aren't in the final node set.
//
// This is the single most impactful fix from the lost gravity-mode patch
// (see `docs/force-graph-lens-plan.md` §5): d3-force crashes with
// `node not found` the moment a link references an id that was filtered
// out. Every layout MUST pipe its output through this helper before
// handing it to the renderer.
// ---------------------------------------------------------------------------

import type { LensLink, LensNode } from "../types";

export function finaliseLayout(
  nodes: LensNode[],
  links: LensLink[],
): { nodes: LensNode[]; links: LensLink[] } {
  if (nodes.length === 0) return { nodes, links: [] };
  const ids = new Set<string>();
  for (const n of nodes) ids.add(n.id);
  const kept: LensLink[] = [];
  for (const l of links) {
    if (ids.has(l.source_id) && ids.has(l.target_id)) kept.push(l);
  }
  return { nodes, links: kept };
}
