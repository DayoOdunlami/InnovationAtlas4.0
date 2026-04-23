// ---------------------------------------------------------------------------
// Public layout dispatcher — `buildLayout(mode, ...)`.
//
// The renderer never imports individual layouts; it calls this seam so
// adding a new layout mode (for example future `scatter` or `timeline`
// lenses sharing this pipeline) is one switch case.
// ---------------------------------------------------------------------------

import type {
  LayoutOptions,
  LayoutResult,
  LensLink,
  LensNode,
  LensLayoutMode,
  SimilarityMap,
} from "../types";
import { umapLayout } from "./umap";
import { webLayout } from "./web";
import { ringsLayout } from "./rings";

export { umapLayout } from "./umap";
export { webLayout } from "./web";
export { ringsLayout } from "./rings";
export { finaliseLayout } from "./finalise";
export { buildQueryAnchor, buildQueryLinks } from "./query-anchor";

export type BuildLayoutInput = {
  mode: LensLayoutMode;
  nodes: LensNode[];
  links: LensLink[];
  similarity: SimilarityMap | null;
  queryText: string | null;
  options?: LayoutOptions;
};

export function buildLayout(input: BuildLayoutInput): LayoutResult {
  const { mode, nodes, links, similarity, queryText, options } = input;
  if (mode === "umap") {
    return umapLayout(nodes, links, similarity, options);
  }
  if (mode === "web") {
    if (!similarity || !queryText) {
      return umapLayout(nodes, links, null, options);
    }
    return webLayout(nodes, links, similarity, queryText, options);
  }
  if (mode === "rings") {
    if (!similarity || !queryText) {
      return umapLayout(nodes, links, null, options);
    }
    return ringsLayout(nodes, links, similarity, queryText, options);
  }
  return umapLayout(nodes, links, similarity, options);
}
