"use server";

import { archivePassport } from "@/app/actions/admin-passports";
import { getSession } from "auth/server";
import { voiceDefaultToolNamesAllowlist } from "lib/ai/speech/voice-default-tools";
import { DefaultToolName } from "lib/ai/tools";
import {
  runShowClaimExtraction,
  showClaimExtractionInputSchema,
} from "lib/ai/tools/passport/claim-extraction-tool";
import {
  extractClaimsPreviewInputSchema,
  runExtractClaimsPreview,
} from "lib/ai/tools/passport/extract-claims-preview-tool";
import {
  runShowGapAnalysisRunner,
  showGapAnalysisInputSchema,
} from "lib/ai/tools/passport/gap-analysis-tool";
import { runListPassportsQuery } from "lib/ai/tools/passport/list-passports-tool";
import {
  runShowMatchListRunner,
  showMatchListInputSchema,
} from "lib/ai/tools/passport/match-list-tool";
import { runMatchingRunner } from "lib/ai/tools/passport/run-matching-tool";
import {
  type SaveClaimsInput,
  runSaveClaimsToPassportRunner,
} from "lib/ai/tools/passport/save-claims-to-passport-tool";
import { z } from "zod";

export type VoiceDefaultToolResult = {
  cardPayload: unknown;
  realtimePayload: { ok: boolean; spoken: string; type: string };
};

function spokenSnippet(text: string, max = 72): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 3)}...`;
}

export async function executeVoiceDefaultToolAction(
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<VoiceDefaultToolResult> {
  const session = await getSession();
  if (!session?.user) {
    return {
      cardPayload: null,
      realtimePayload: {
        ok: false,
        spoken: "Please sign in to use passport tools in voice.",
        type: toolName,
      },
    };
  }

  if (!voiceDefaultToolNamesAllowlist.has(toolName)) {
    return {
      cardPayload: null,
      realtimePayload: {
        ok: false,
        spoken: "That tool is not available in voice yet.",
        type: toolName,
      },
    };
  }

  switch (toolName) {
    case DefaultToolName.ListPassports: {
      z.object({})
        .strict()
        .parse(toolArgs ?? {});
      const cardPayload = await runListPassportsQuery();
      const list = cardPayload.passports ?? [];
      const n = list.length;
      const title0 =
        list[0]?.title ?? list[0]?.project_name ?? (n ? "Untitled" : "");
      const spoken =
        n === 0
          ? "You have no passports yet. You can create one from the app or describe evidence in chat."
          : n === 1
            ? `You have one passport: ${title0}.`
            : `You have ${n} passports. The most recently updated is ${title0}.`;
      return {
        cardPayload,
        realtimePayload: { ok: true, spoken, type: toolName },
      };
    }
    case DefaultToolName.ArchivePassport: {
      const parsed = z
        .object({ passport_id: z.string().uuid() })
        .strict()
        .safeParse(toolArgs ?? {});
      if (!parsed.success) {
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken:
              "I need a valid passport UUID to archive. Call list passports first.",
            type: toolName,
          },
        };
      }
      const out = await archivePassport(parsed.data.passport_id);
      if ("error" in out) {
        const spoken =
          out.error === "Unauthorized"
            ? "Only admins can archive passports."
            : spokenSnippet(out.error);
        return {
          cardPayload: out,
          realtimePayload: { ok: false, spoken, type: toolName },
        };
      }
      return {
        cardPayload: { archived_passport_id: parsed.data.passport_id },
        realtimePayload: {
          ok: true,
          spoken:
            "That passport is now archived. You can restore it from the admin passports page if needed.",
          type: toolName,
        },
      };
    }
    case DefaultToolName.ExtractClaimsPreview: {
      const parsed = extractClaimsPreviewInputSchema.safeParse(toolArgs ?? {});
      if (!parsed.success) {
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken:
              "I need at least twenty characters of description or transcript to extract claims.",
            type: toolName,
          },
        };
      }
      try {
        const cardPayload = await runExtractClaimsPreview(parsed.data);
        const claims = cardPayload.claims ?? [];
        const n = claims.length;
        const firstText =
          claims[0]?.claim_text ?? claims[0]?.source_excerpt ?? "";
        const spoken =
          n === 0
            ? "No claims were extracted. Try adding more concrete evidence or detail."
            : n === 1
              ? `I extracted one claim: ${spokenSnippet(firstText)}. Check the preview card to save to a passport.`
              : `I extracted ${n} claims. First: ${spokenSnippet(firstText)}. Open the preview card to review and save.`;
        return {
          cardPayload,
          realtimePayload: { ok: true, spoken, type: toolName },
        };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Claim preview failed.";
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken: spokenSnippet(msg, 140),
            type: toolName,
          },
        };
      }
    }
    case DefaultToolName.ShowClaimExtraction: {
      const parsed = showClaimExtractionInputSchema.safeParse(toolArgs ?? {});
      if (!parsed.success) {
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken:
              "I need a passport ID to show saved claims. Call listPassports first if unsure.",
            type: toolName,
          },
        };
      }
      try {
        const cardPayload = await runShowClaimExtraction(parsed.data);
        const claims = cardPayload.claims ?? [];
        const n = claims.length;
        const firstText =
          claims[0]?.claim_text ?? claims[0]?.source_excerpt ?? "";
        const spoken =
          n === 0
            ? "That passport has no active saved claims in the database yet."
            : n === 1
              ? `Showing one saved claim: ${spokenSnippet(firstText)}.`
              : `Showing ${n} saved claims on this passport. First: ${spokenSnippet(firstText)}.`;
        return {
          cardPayload,
          realtimePayload: { ok: true, spoken, type: toolName },
        };
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Could not load passport claims.";
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken: spokenSnippet(msg, 140),
            type: toolName,
          },
        };
      }
    }
    case DefaultToolName.RunMatching: {
      const passportId = String(toolArgs?.passport_id ?? "");
      if (!passportId) {
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken:
              "I need a passport ID to run matching. Call listPassports first if unsure.",
            type: toolName,
          },
        };
      }
      try {
        const cardPayload = await runMatchingRunner(passportId);
        const matches = cardPayload.matches ?? [];
        const n = matches.length;
        const top = matches[0];
        const topScore = top ? Math.round((top.match_score ?? 0) * 100) : 0;
        const funderPart = top?.lead_funder ? ` from ${top.lead_funder}` : "";
        const spoken =
          n === 0
            ? "No matches found for this passport. Try adding more evidence claims first."
            : `Found ${n} cross-sector ${n === 1 ? "match" : "matches"}. Top result is ${top?.title ?? "Untitled"} at ${topScore}%${funderPart}. Full match list is in the voice panel.`;
        return {
          cardPayload,
          realtimePayload: { ok: true, spoken, type: toolName },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Matching failed.";
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken: spokenSnippet(msg, 140),
            type: toolName,
          },
        };
      }
    }
    case DefaultToolName.ShowMatchList: {
      const parsed = showMatchListInputSchema.safeParse(toolArgs ?? {});
      if (!parsed.success) {
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken:
              "I need a passport ID to show matches. Call listPassports first if unsure.",
            type: toolName,
          },
        };
      }
      try {
        const cardPayload = await runShowMatchListRunner(
          parsed.data.passport_id,
          parsed.data.limit,
        );
        const matches = cardPayload.matches ?? [];
        const n = matches.length;
        const top2 = matches.slice(0, 2);
        const score0 = Math.round((top2[0]?.match_score ?? 0) * 100);
        const spoken =
          n === 0
            ? "No matches found. Run matching first to generate cross-sector results."
            : n === 1
              ? `Showing one match: ${top2[0]?.title ?? "Untitled"} at ${score0}%.`
              : `Showing ${n} matches. Leading with ${top2[0]?.title ?? "Untitled"} at ${score0}%${top2[1] ? `, followed by ${top2[1].title}` : ""}.`;
        return {
          cardPayload,
          realtimePayload: { ok: true, spoken, type: toolName },
        };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not load matches.";
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken: spokenSnippet(msg, 140),
            type: toolName,
          },
        };
      }
    }
    case DefaultToolName.ShowGapAnalysis: {
      const parsed = showGapAnalysisInputSchema.safeParse(toolArgs ?? {});
      if (!parsed.success) {
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken:
              "I need a passport ID to show gap analysis. Call listPassports first if unsure.",
            type: toolName,
          },
        };
      }
      try {
        const cardPayload = await runShowGapAnalysisRunner(
          parsed.data.passport_id,
        );
        const gaps = cardPayload.gaps ?? [];
        const count = gaps.length;
        const blocking = gaps.filter((g) => g.severity === "blocking");
        const spoken =
          count === 0
            ? "No gaps identified yet. Run matching first to generate gap analysis."
            : blocking.length > 0
              ? `Found ${count} gap${count > 1 ? "s" : ""}. ${blocking.length} blocking — ${spokenSnippet(blocking[0].gap_description, 80)}. Full analysis in the voice panel.`
              : `Found ${count} gap${count > 1 ? "s" : ""} — no blocking issues. Full analysis in the voice panel.`;
        return {
          cardPayload,
          realtimePayload: { ok: true, spoken, type: toolName },
        };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not load gap analysis.";
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken: spokenSnippet(msg, 140),
            type: toolName,
          },
        };
      }
    }
    case DefaultToolName.CreateDraftPitch: {
      // createDraftPitch is display-only — the model wrote the pitch as toolArgs.
      // No runner call, no DB query, no Claude call — just package and return.
      const title = String(toolArgs?.title ?? "");
      const p1 = String(toolArgs?.paragraph1 ?? "");
      const firstSentence = p1.split(/[.!?]/)[0]?.trim() ?? "";
      const cardPayload = toolArgs;
      const spoken = title
        ? `Pitch ready: "${spokenSnippet(title, 60)}". It opens: "${spokenSnippet(firstSentence, 100)}." Full text in the voice panel.`
        : "Draft pitch generated. Full text is in the voice panel.";
      return {
        cardPayload,
        realtimePayload: { ok: true, spoken, type: toolName },
      };
    }
    case DefaultToolName.CreateBarChart: {
      // Display-only — the model generated chart data as toolArgs.
      const cardPayload = toolArgs;
      const title = String(toolArgs?.title ?? "chart");
      const data = toolArgs?.data as Array<{ xAxisLabel?: string }> | undefined;
      const seriesCount = data?.length ?? 0;
      const topLabel = data?.[0]?.xAxisLabel ?? "";
      const spoken = `Bar chart ready: "${spokenSnippet(title, 60)}". ${
        seriesCount > 0
          ? `Showing ${seriesCount} ${seriesCount === 1 ? "category" : "categories"}${topLabel ? `, starting with ${spokenSnippet(topLabel, 40)}` : ""}.`
          : ""
      } Full chart in the voice panel.`.trim();
      return {
        cardPayload,
        realtimePayload: { ok: true, spoken, type: toolName },
      };
    }
    case DefaultToolName.CreateTable: {
      // Display-only — the model generated table data as toolArgs.
      const cardPayload = toolArgs;
      const title = String(toolArgs?.title ?? "table");
      const rows = toolArgs?.data as unknown[] | undefined;
      const rowCount = rows?.length ?? 0;
      const spoken = `Table ready: "${spokenSnippet(title, 60)}" with ${rowCount} ${rowCount === 1 ? "row" : "rows"}. Full table in the voice panel.`;
      return {
        cardPayload,
        realtimePayload: { ok: true, spoken, type: toolName },
      };
    }
    case DefaultToolName.CreatePieChart: {
      // Display-only — the model generated pie data as toolArgs.
      const cardPayload = toolArgs;
      const segments = Array.isArray(toolArgs?.data)
        ? (toolArgs.data as Array<{ label?: unknown; value?: unknown }>)
        : [];
      const total = segments.reduce(
        (s: number, x) => s + (Number(x.value) || 0),
        0,
      );
      const top = segments[0];
      const topPct =
        total > 0 && top?.value
          ? Math.round((Number(top.value) / total) * 100)
          : 0;
      const spoken =
        segments.length > 0
          ? `Pie chart: "${String(toolArgs?.title ?? "chart")}". ${segments.length} segments. Largest: ${String(top?.label ?? "")} at ${topPct}%. Full chart in the voice panel.`
          : `Pie chart created. Full chart in the voice panel.`;
      return {
        cardPayload,
        realtimePayload: { ok: true, spoken, type: toolName },
      };
    }
    case DefaultToolName.CreateLineChart: {
      // Display-only — the model generated line chart data as toolArgs.
      const cardPayload = toolArgs;
      const dataRows = Array.isArray(toolArgs?.data)
        ? (toolArgs.data as Array<{
            xAxisLabel?: unknown;
            series?: Array<{ seriesName?: unknown }>;
          }>)
        : [];
      const firstSeriesName = dataRows[0]?.series?.[0]?.seriesName ?? null;
      const spoken = `Line chart: "${String(toolArgs?.title ?? "chart")}". ${dataRows.length} data point${dataRows.length !== 1 ? "s" : ""}${firstSeriesName ? `, series: ${String(firstSeriesName)}` : ""}. Full chart in the voice panel.`;
      return {
        cardPayload,
        realtimePayload: { ok: true, spoken, type: toolName },
      };
    }
    case DefaultToolName.SaveClaimsToPassport: {
      const pendingBatchId = String(toolArgs?.pending_batch_id ?? "");
      if (!pendingBatchId) {
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken:
              "I need a pending_batch_id to save claims. Run extractClaimsPreview first and use the batch ID it returns.",
            type: toolName,
          },
        };
      }
      try {
        const args: SaveClaimsInput = {
          pending_batch_id: pendingBatchId,
          passport_id: toolArgs?.passport_id
            ? String(toolArgs.passport_id)
            : undefined,
          title: toolArgs?.title ? String(toolArgs.title) : undefined,
          project_name: toolArgs?.project_name
            ? String(toolArgs.project_name)
            : undefined,
        };
        const result = await runSaveClaimsToPassportRunner(args);
        const claimCount = result.claims_saved ?? 0;
        const passportTitle = result.passport_title ?? "your passport";
        const spoken = `Saved ${claimCount} ${claimCount === 1 ? "claim" : "claims"} to "${spokenSnippet(passportTitle, 60)}". You can review and verify them on the passport page.`;
        return {
          cardPayload: result,
          realtimePayload: { ok: true, spoken, type: toolName },
        };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not save claims.";
        return {
          cardPayload: null,
          realtimePayload: {
            ok: false,
            spoken: spokenSnippet(msg, 140),
            type: toolName,
          },
        };
      }
    }
    default:
      return {
        cardPayload: null,
        realtimePayload: {
          ok: false,
          spoken: "That voice tool is not implemented.",
          type: toolName,
        },
      };
  }
}
