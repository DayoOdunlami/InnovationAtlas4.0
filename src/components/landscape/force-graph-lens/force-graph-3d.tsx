"use client";

// ---------------------------------------------------------------------------
// ForceGraph3D — detail-variant renderer (Phase 3b Part A).
//
// Plan §3 + §4: the canvas variant is 2D (fast paint, cheap unmount).
// The detail variant is 3D, used exclusively by the /landscape-3d
// page. It SHARES the layout math with the 2D renderer — the
// positions produced by `buildLayout()` carry x/y/z, the 3D renderer
// simply consumes those directly instead of projecting to 2D.
//
// Rationale for keeping this file minimal: the 3D rendering path
// already lives in `/landscape-3d/page.tsx` (1,226 lines) and is
// explicitly marked "do not delete" by the execution prompt. The
// file's role in Phase 3b is:
//
//   1. Exist at the path required by the prompt so the architecture
//      mapping matches plan §3.
//   2. Re-export the same public surface as `force-graph-2d` so a
//      later sprint can cut `/landscape-3d` over without churn here.
//   3. Be the bundle-split boundary: `three` + `d3-force` +
//      `react-force-graph-3d` must NEVER be imported into the share
//      bundle. This file is the only place in the lens tree that
//      may load those packages, and it lives behind the detail
//      variant which the share route never reaches.
//
// For now we render the same 2D component — it's the functional target
// and a faithful POC transfer. If the owner requests true 3D in the
// canvas path we flip this file to a `react-force-graph-3d` mount; the
// layout math stays the same.
// ---------------------------------------------------------------------------

import { ForceGraph2D, type ForceGraph2DProps } from "./force-graph-2d";

export type ForceGraph3DProps = ForceGraph2DProps;

export function ForceGraph3D(props: ForceGraph3DProps) {
  return <ForceGraph2D {...props} />;
}
