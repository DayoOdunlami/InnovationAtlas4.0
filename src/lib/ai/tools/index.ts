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
  // Briefing write tools (Sprint X Commit 12). Block IDs are stable across
  // updates so update/remove never race with append.
  AppendBriefingBlock = "appendBriefingBlock",
  UpdateBriefingBlock = "updateBriefingBlock",
  RemoveBriefingBlock = "removeBriefingBlock",
  SetBriefingTitle = "setBriefingTitle",
  ClearBriefing = "clearBriefing",
  // Briefing read tool (Sprint X Commit 12). Same lazy-call contract as
  // getCanvasState.
  GetBriefing = "getBriefing",
}

export const SequentialThinkingToolName = "sequential-thinking";

export const ImageToolName = "image-manager";
