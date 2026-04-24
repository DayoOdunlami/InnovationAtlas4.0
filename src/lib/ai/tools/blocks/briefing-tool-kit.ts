// ---------------------------------------------------------------------------
// Briefing tool kit (Phase 2b — Brief-First Rebuild).
//
// Wraps each entry in `BLOCK_TOOL_SCHEMAS` / `dispatchBlockTool` with a
// Vercel AI SDK `tool()` descriptor that:
//
//   1. Closes over an `AccessScope` built from the authenticated chat
//      session — NEVER from model output.
//   2. Pins the tool to the `activeBriefId` the client told the chat
//      route about. Tools whose input schema takes a `briefId`
//      (AppendHeading, AppendParagraph, AppendBullets, GetBrief) have
//      that field stripped from the model-visible schema and injected
//      server-side so the model can't retarget another user's brief.
//      Tools that take a `blockId` delegate the ownership check to the
//      repository (`pgBlockRepository.getById` / `.listByBrief` both
//      permit-check against `scope` and the block's parent brief).
//   3. Emits `brief_block_tool_call` on success and
//      `brief_block_tool_rejected` on any failure (validation /
//      AccessDenied / repository error) using the typed catalogue in
//      `src/lib/telemetry/envelope.ts`.
//
// The kit is intentionally a factory. `APP_DEFAULT_TOOL_KIT` is a
// process-wide static record and cannot close over a per-request scope,
// so `loadAppDefaultTools()` (shared.chat.ts) calls this factory with
// the resolved owner scope + brief id every request.
//
// When the chat has no `activeBriefId`, the factory returns an EMPTY
// record — the model sees no briefing tools and cannot call them. This
// matches Design Constraint 4 in `docs/phase-2b-execution-prompt.md`.
// ---------------------------------------------------------------------------

import { tool as createTool, type Tool } from "ai";
import { z } from "zod";

import { AppDefaultToolkit, DefaultToolName } from "@/lib/ai/tools";
import type { AccessScope } from "@/lib/db/pg/repositories/access-scope";
import { AccessDeniedError } from "@/lib/db/pg/repositories/access-scope";
import { emitAction } from "@/lib/telemetry/emit";
import type { TelemetryEnv } from "@/lib/telemetry/envelope";

import {
  BLOCK_TOOL_SCHEMAS,
  dispatchBlockTool,
  UnknownBlockToolError,
} from "./index";

function resolveAppEnv(): TelemetryEnv {
  const raw = (process.env.APP_ENV ?? "").toLowerCase();
  if (raw === "prod" || raw === "production") return "prod";
  if (raw === "preview") return "preview";
  if (raw === "test") return "test";
  return "dev";
}

// Tools whose input schema takes a `briefId`. The factory strips that
// field from the model-visible shape and injects the pinned value at
// execute time. Anything else (blockId-scoped verbs) delegates its
// ownership check to the repository.
const BRIEF_ID_TOOLS = new Set<string>([
  DefaultToolName.AppendHeading,
  DefaultToolName.AppendParagraph,
  DefaultToolName.AppendBullets,
  DefaultToolName.AppendLandscapeEmbed,
  DefaultToolName.GetBrief,
  // Phase 3a — takes briefId + passportId; briefId is pinned server-side.
  DefaultToolName.AppendLivePassportView,
]);

function stripBriefId(schema: z.ZodTypeAny): z.ZodTypeAny {
  // BLOCK_TOOL_SCHEMAS only contains `z.object` inputSchemas. `.omit`
  // is only defined on ZodObject; narrow explicitly so we don't fall
  // back to the un-narrowed type in downstream consumers.
  if (schema instanceof z.ZodObject) {
    return schema.omit({ briefId: true });
  }
  return schema;
}

export interface BriefingToolKitOptions {
  /**
   * Owner scope resolved from the authenticated chat session in
   * `route.ts`. Must be a `{ kind: "user", userId }` scope — share /
   * system scopes are rejected before the factory is called.
   */
  scope: AccessScope;
  /**
   * The brief this chat is pinned to, already verified to be owned by
   * `scope.userId` in the caller (see `shared.chat.ts`). When absent
   * the factory returns an empty record.
   */
  briefId: string | null | undefined;
  /**
   * Stable session identifier used as `sessionId` on telemetry
   * envelopes. Matches the server-action emitters in
   * `src/app/(shared-brief)/brief/[id]/actions.ts`.
   */
  sessionId: string;
}

interface EmitPayload {
  tool: string;
  briefId: string;
  [key: string]: unknown;
}

async function emitCall(
  options: BriefingToolKitOptions,
  payload: EmitPayload,
): Promise<void> {
  await emitAction("brief_block_tool_call", {
    sessionId: options.sessionId,
    userId: options.scope.kind === "user" ? options.scope.userId : null,
    env: resolveAppEnv(),
    payload,
  });
}

async function emitRejected(
  options: BriefingToolKitOptions,
  payload: EmitPayload & { reason: string },
): Promise<void> {
  await emitAction("brief_block_tool_rejected", {
    sessionId: options.sessionId,
    userId: options.scope.kind === "user" ? options.scope.userId : null,
    env: resolveAppEnv(),
    payload,
  });
}

function errorReason(err: unknown): string {
  if (err instanceof AccessDeniedError) return "access_denied";
  if (err instanceof UnknownBlockToolError) return "unknown_tool";
  if (err instanceof z.ZodError) return "invalid_input";
  if (err instanceof Error) return err.message.slice(0, 200);
  return "unknown_error";
}

/**
 * Build the briefing tool kit for a single chat request.
 *
 * - `scope.kind` must be `"user"`.
 * - `briefId` must have been validated (owner-check) by the caller. If
 *   either precondition is not met the factory returns `{}` so the
 *   model sees no briefing tools.
 */
export function buildBriefingToolKit(
  options: BriefingToolKitOptions,
): Record<string, Tool> {
  const { scope, briefId } = options;
  if (scope.kind !== "user") return {};
  if (!briefId) return {};

  const tools: Record<string, Tool> = {};

  for (const [name, descriptor] of Object.entries(BLOCK_TOOL_SCHEMAS)) {
    const needsBriefId = BRIEF_ID_TOOLS.has(name);
    const modelSchema = needsBriefId
      ? stripBriefId(descriptor.inputSchema)
      : descriptor.inputSchema;

    tools[name] = createTool({
      description: descriptor.description,
      inputSchema: modelSchema,
      async execute(input: unknown) {
        const args =
          needsBriefId && typeof input === "object" && input !== null
            ? { ...(input as Record<string, unknown>), briefId }
            : input;
        try {
          const result = await dispatchBlockTool({
            name,
            args,
            scope,
          });
          await emitCall(options, {
            tool: name,
            briefId,
            ...(typeof result === "object" && result !== null
              ? (result as Record<string, unknown>)
              : {}),
          });
          return result;
        } catch (err) {
          await emitRejected(options, {
            tool: name,
            briefId,
            reason: errorReason(err),
          });
          // Rethrow in a JSON-friendly shape so the model sees the
          // failure reason rather than an opaque 500. The AI SDK will
          // surface this as the tool-call result.
          if (err instanceof AccessDeniedError) {
            return {
              error: "access_denied",
              message: err.message,
            };
          }
          if (err instanceof z.ZodError) {
            return {
              error: "invalid_input",
              issues: err.issues,
            };
          }
          return {
            error: "tool_error",
            message:
              err instanceof Error ? err.message : String(err ?? "error"),
          };
        }
      },
    });
  }

  // NOTE: surfaceKnowledgeBase is NOT wired here. It lives under its
  // own toolkit (`AppDefaultToolkit.KnowledgeBase`) in
  // `src/lib/ai/tools/tool-kit.ts` so users can toggle KB grounding
  // independently of block authoring and use it in any chat — not only
  // brief mode. The tool itself is read-only and enforces its own
  // scope + citation discipline, plus an internal try/catch around
  // searchKnowledgeChunks so a KB failure cannot poison the chat
  // thread on OpenAI's Responses API ("No tool output found for
  // function call …").

  return tools;
}

export const BRIEFING_TOOLKIT_ID = AppDefaultToolkit.Briefing;
