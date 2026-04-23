export enum AppDefaultToolkit {
  Visualization = "visualization",
  WebSearch = "webSearch",
  Research = "research",
  Http = "http",
  Code = "code",
  Passport = "passport",
  // Sprint X — registered in Commit 2. Tool implementations land in
  // Commits 5–6 (Canvas) and Commit 12 (Briefing).
  Canvas = "canvas",
  Briefing = "briefing",
}

export enum DefaultToolName {
  CreatePieChart = "createPieChart",
  CreateBarChart = "createBarChart",
  CreateLineChart = "createLineChart",
  CreateTable = "createTable",
  WebSearch = "webSearch",
  WebContent = "webContent",
  SurfaceResearch = "surfaceResearch",
  Http = "http",
  JavascriptExecution = "mini-javascript-execution",
  PythonExecution = "python-execution",
  // Passport pipeline artefacts
  ShowClaimExtraction = "showClaimExtraction",
  ShowMatchList = "showMatchList",
  ShowGapAnalysis = "showGapAnalysis",
  CreateDraftPitch = "createDraftPitch",
  // Passport selection flow
  ExtractClaimsPreview = "extractClaimsPreview",
  ListPassports = "listPassports",
  SaveClaimsToPassport = "saveClaimsToPassport",
  AddEvidenceToPassport = "addEvidenceToPassport",
  RejectClaimByDescription = "rejectClaimByDescription",
  // Matching engine
  RunMatching = "runMatching",
  // Admin / cleanup (requires admin session)
  ArchivePassport = "archivePassport",
  // Consortium discovery
  FindConsortiumPartners = "findConsortiumPartners",
  // Canvas write tools (Sprint X Commits 5–6). Each returns
  // { status, newState } so the tool call is the authoritative proof the
  // mutation happened — see Atlas Canvas State Contract.
  FocusOnProject = "focusOnProject",
  FocusOnOrg = "focusOnOrg",
  HighlightCluster = "highlightCluster",
  ColorByLensCategory = "colorByLensCategory",
  FilterByQuery = "filterByQuery",
  ResetCamera = "resetCamera",
  // Canvas read tool (Sprint X Commit 6). Lazy-called when the agent needs
  // to resolve ambiguous references like "this project". Never polled.
  GetCanvasState = "getCanvasState",
  // Canvas stage-mount tools (Sprint X Thread 2). Each mounts a specific
  // artefact into the main canvas stage, replacing the force-graph until
  // the user returns. Chart ships in commit 1; passport + table follow in
  // commits 2 and 3. Same `{ status, newState }` contract as the other
  // canvas write tools.
  MountChartInStage = "mountChartInStage",
  MountPassportInStage = "mountPassportInStage",
  MountTableInStage = "mountTableInStage",
  // Inverse of the three mount tools. Resets `stage` to
  // `{ kind: "force-graph" }` so the reducer observes every
  // stage transition — see BUG-1 in `post-demo-backlog.md`.
  ClearStage = "clearStage",
  // ---------------------------------------------------------------------
  // DEPRECATED briefing slots (Sprint X Commit 12 plan, never implemented).
  // Retained as string values for backwards compatibility with any
  // downstream code that references them by name. Do NOT add new
  // references. The Phase 2a.1 per-type tools below replace these.
  // ---------------------------------------------------------------------
  /** @deprecated Superseded by AppendHeading / AppendParagraph / AppendBullets (Phase 2a.1). */
  AppendBriefingBlock = "appendBriefingBlock",
  /** @deprecated Superseded by UpdateBlock (Phase 2a.1). */
  UpdateBriefingBlock = "updateBriefingBlock",
  /** @deprecated Superseded by RemoveBlock (Phase 2a.1). */
  RemoveBriefingBlock = "removeBriefingBlock",
  /** @deprecated Brief titles live on atlas.briefs, not as blocks (Phase 2a.1). */
  SetBriefingTitle = "setBriefingTitle",
  /** @deprecated No direct replacement — agents delete blocks individually via RemoveBlock (Phase 2a.1). */
  ClearBriefing = "clearBriefing",
  /** @deprecated Superseded by GetBrief (Phase 2a.1). */
  GetBriefing = "getBriefing",
  // ---------------------------------------------------------------------
  // Phase 2a.1 briefing block tools (spec Block Types Spec §4 —
  // authoritative names). Per-type append tools mirror the three text
  // block renderers shipped in 2a.0 / 2a.1. Universal verbs manage the
  // block list as a whole.
  // ---------------------------------------------------------------------
  AppendHeading = "appendHeading",
  AppendParagraph = "appendParagraph",
  AppendBullets = "appendBullets",
  // Phase 3b — landscape-embed block.
  AppendLandscapeEmbed = "appendLandscapeEmbed",
  UpdateBlock = "updateBlock",
  RemoveBlock = "removeBlock",
  DuplicateBlock = "duplicateBlock",
  MoveBlock = "moveBlock",
  GetBrief = "getBrief",
  ChangeHeadingLevel = "changeHeadingLevel",
  ConvertBulletsStyle = "convertBulletsStyle",
}

export const SequentialThinkingToolName = "sequential-thinking";

export const ImageToolName = "image-manager";
