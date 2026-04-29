/**
 * Shared KB retrieval helpers (Phase 6 harness + production surfaceKnowledgeBase).
 * Kept free of server-only / DB imports so scripts and tests can import safely.
 */

export const KB_RETRIEVAL_RAW_TOP_K = 20;
export const KB_RETRIEVAL_FINAL_TOP_K = 6;
export const KB_RETRIEVAL_CAP_PER_DOC = 2;

const CROSS_CUTTING_MODES = ["rail", "aviation", "maritime", "hit"] as const;

export const modeLexicon = {
  rail: /\brail|cp7|network rail|orr\b/i,
  aviation: /\baviation|airport|jet zero|saf|caa|flight|aam|evtol\b/i,
  maritime: /\bmaritime\b|\bports?\b|shipping|vessel|mca|harbour/i,
  hit: /\bhighways?|integrated transport|ris3|road|vehicles?|self-driving|automated vehicles?\b/i,
  data_digital:
    /\bdata\b|\bdigital\b|\btestbed britain\b|\binnovation passport(s)?\b|\bjustin anderson\b|\bportable trust\b|\binteroperab/i,
} as const;

export const themeLexicon = {
  autonomy: /\bautonom|automation|driverless|self-driving|drone|cav\b/i,
  decarbonisation: /\bdecarbon|net zero|hydrogen|saf|electrification|emission/i,
  people_experience: /\bpassenger|accessib|inclusion|safety|customer|people\b/i,
  hubs_clusters: /\bhub|cluster|intermodal|place|placemaking|region\b/i,
  planning_operation:
    /\bplanning|operations?|delivery plan|system integration|resilience\b/i,
  industry: /\bindustry|supply chain|commercial|market|investment|funding\b/i,
  data_infrastructure: /\bdata infrastructure|data layer|data platform\b/i,
  assurance_trust:
    /\bassurance|trust|portable trust|conformance|verification|provenance\b/i,
  interoperability:
    /\binteroperab|standards?|exchange|semantic|schema|federat/i,
  testbeds_innovation:
    /\btestbed|pilot|demonstrat|trial|sandbox|innovation passport/i,
  governance_stewardship:
    /\bgovernance|stewardship|policy boundary|sovereign|accountability\b/i,
} as const;

export type InferModesResult = {
  modes: string[];
  fallbackApplied: boolean;
  fallbackReason: "cross_cutting_phrase" | "generic_innovation";
};

export function inferModesFromQuery(query: string): InferModesResult {
  const lower = query.toLowerCase();
  const modes = Object.entries(modeLexicon)
    .filter(([, rx]) => rx.test(query))
    .map(([mode]) => mode);
  if (modes.length > 0) {
    return {
      modes,
      fallbackApplied: false,
      fallbackReason: "cross_cutting_phrase",
    };
  }

  if (
    /\btransport policy\b|\btransport innovation\b|\bacross modes\b/i.test(
      lower,
    )
  ) {
    return {
      modes: [...CROSS_CUTTING_MODES],
      fallbackApplied: true,
      fallbackReason: "cross_cutting_phrase",
    };
  }

  if (/\bevidence\b|\binnovation\b|\bscaling\b/i.test(lower)) {
    return {
      modes: [...CROSS_CUTTING_MODES],
      fallbackApplied: true,
      fallbackReason: "generic_innovation",
    };
  }

  return {
    modes: [...CROSS_CUTTING_MODES],
    fallbackApplied: true,
    fallbackReason: "cross_cutting_phrase",
  };
}

export function inferThemesFromQuery(query: string): string[] {
  return Object.entries(themeLexicon)
    .filter(([, rx]) => rx.test(query))
    .map(([theme]) => theme);
}

export function bridgedModesFromInferred(modes: string[]): string[] {
  if (modes.includes("data_digital")) return [...new Set(modes)];
  const shouldBridge = modes.length > 0;
  return shouldBridge ? [...new Set([...modes, "data_digital"])] : [];
}

export type KbRetrievalEnrichedChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentModes: string[];
  documentThemes: string[];
  chunkIndex: number;
  chunkText: string;
  similarity: number;
  rawRank: number;
  promotedByCap: boolean;
};

export function applyDiversityCap(
  chunks: KbRetrievalEnrichedChunk[],
  capPerDoc: number | null,
  finalTopK: number = KB_RETRIEVAL_FINAL_TOP_K,
): KbRetrievalEnrichedChunk[] {
  if (!capPerDoc) {
    return chunks.slice(0, finalTopK).map((c) => ({
      ...c,
      promotedByCap: c.rawRank > finalTopK,
    }));
  }

  const perDocCount = new Map<string, number>();
  const result: KbRetrievalEnrichedChunk[] = [];
  for (const chunk of chunks) {
    if (result.length >= finalTopK) break;
    const docCount = perDocCount.get(chunk.documentId) ?? 0;
    if (docCount < capPerDoc) {
      result.push({
        ...chunk,
        promotedByCap: chunk.rawRank > finalTopK,
      });
      perDocCount.set(chunk.documentId, docCount + 1);
    }
  }
  return result;
}

export type KbRetrievalBranch = "strategy2_bridged" | "strategy5_mode_theme";

/**
 * Demo defaults (Phase 7): JARVIS → Strategy 5 (mode + theme).
 * Everyone else (ATLAS, HYVE, unnamed) → Strategy 2 (bridged + D&D).
 */
export function kbRetrievalBranchForAgent(agent?: {
  id: string;
  name?: string | null;
}): KbRetrievalBranch {
  const n = agent?.name?.trim();
  if (n?.toUpperCase() === "JARVIS") return "strategy5_mode_theme";
  return "strategy2_bridged";
}

export function buildSearchParamsForBranch(
  query: string,
  branch: KbRetrievalBranch,
): {
  modes: string[] | undefined;
  themes: string[] | undefined;
} {
  const inferredModes = inferModesFromQuery(query).modes;
  const inferredThemes = inferThemesFromQuery(query);

  if (branch === "strategy2_bridged") {
    const bridged = bridgedModesFromInferred(inferredModes);
    return {
      modes: bridged.length ? bridged : undefined,
      themes: undefined,
    };
  }

  return {
    modes: inferredModes.length ? inferredModes : undefined,
    themes: inferredThemes.length ? inferredThemes : undefined,
  };
}
