"use server";

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
import { runListPassportsQuery } from "lib/ai/tools/passport/list-passports-tool";
import {
  runShowMatchListRunner,
  showMatchListInputSchema,
} from "lib/ai/tools/passport/match-list-tool";
import { runMatchingRunner } from "lib/ai/tools/passport/run-matching-tool";
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
