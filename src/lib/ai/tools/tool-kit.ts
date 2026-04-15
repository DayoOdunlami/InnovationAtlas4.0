import { Tool } from "ai";
import { AppDefaultToolkit, DefaultToolName } from ".";
import { jsExecutionTool } from "./code/js-run-tool";
import { pythonExecutionTool } from "./code/python-run-tool";
import { httpFetchTool } from "./http/fetch";
import { addEvidenceToPassportTool } from "./passport/add-evidence-to-passport-tool";
import { archivePassportTool } from "./passport/archive-passport-tool";
import { showClaimExtractionTool } from "./passport/claim-extraction-tool";
import { createDraftPitchTool } from "./passport/draft-pitch-tool";
import { extractClaimsPreviewTool } from "./passport/extract-claims-preview-tool";
import { findConsortiumPartnersTool } from "./passport/find-consortium-partners";
import { showGapAnalysisTool } from "./passport/gap-analysis-tool";
import { listPassportsTool } from "./passport/list-passports-tool";
import { showMatchListTool } from "./passport/match-list-tool";
import { rejectClaimByDescriptionTool } from "./passport/reject-claim-by-description-tool";
import { runMatchingTool } from "./passport/run-matching-tool";
import { saveClaimsToPassportTool } from "./passport/save-claims-to-passport-tool";
import { createBarChartTool } from "./visualization/create-bar-chart";
import { createLineChartTool } from "./visualization/create-line-chart";
import { createPieChartTool } from "./visualization/create-pie-chart";
import { createTableTool } from "./visualization/create-table";
import { exaContentsTool, exaSearchTool } from "./web/web-search";

export const APP_DEFAULT_TOOL_KIT: Record<
  AppDefaultToolkit,
  Record<string, Tool>
> = {
  [AppDefaultToolkit.Visualization]: {
    [DefaultToolName.CreatePieChart]: createPieChartTool,
    [DefaultToolName.CreateBarChart]: createBarChartTool,
    [DefaultToolName.CreateLineChart]: createLineChartTool,
    [DefaultToolName.CreateTable]: createTableTool,
  },
  [AppDefaultToolkit.WebSearch]: {
    [DefaultToolName.WebSearch]: exaSearchTool,
    [DefaultToolName.WebContent]: exaContentsTool,
  },
  [AppDefaultToolkit.Http]: {
    [DefaultToolName.Http]: httpFetchTool,
  },
  [AppDefaultToolkit.Code]: {
    [DefaultToolName.JavascriptExecution]: jsExecutionTool,
    [DefaultToolName.PythonExecution]: pythonExecutionTool,
  },
  [AppDefaultToolkit.Passport]: {
    [DefaultToolName.ShowClaimExtraction]: showClaimExtractionTool,
    [DefaultToolName.ShowMatchList]: showMatchListTool,
    [DefaultToolName.ShowGapAnalysis]: showGapAnalysisTool,
    [DefaultToolName.CreateDraftPitch]: createDraftPitchTool,
    [DefaultToolName.ExtractClaimsPreview]: extractClaimsPreviewTool,
    [DefaultToolName.ListPassports]: listPassportsTool,
    [DefaultToolName.SaveClaimsToPassport]: saveClaimsToPassportTool,
    [DefaultToolName.AddEvidenceToPassport]: addEvidenceToPassportTool,
    [DefaultToolName.RejectClaimByDescription]: rejectClaimByDescriptionTool,
    [DefaultToolName.RunMatching]: runMatchingTool,
    [DefaultToolName.ArchivePassport]: archivePassportTool,
    [DefaultToolName.FindConsortiumPartners]: findConsortiumPartnersTool,
  },
};
