export enum AppDefaultToolkit {
  Visualization = "visualization",
  WebSearch = "webSearch",
  Research = "research",
  Http = "http",
  Code = "code",
  Passport = "passport",
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
}

export const SequentialThinkingToolName = "sequential-thinking";

export const ImageToolName = "image-manager";
