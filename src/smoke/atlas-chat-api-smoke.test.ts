/**
 * Live POST /api/chat smoke: Better Auth session, JARVIS agent, mocked model via
 * stream-text-adapter. Ephemeral user when seeded admin is absent.
 */
import "load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getPassportPool } from "@/lib/passport/db";
import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
} from "ai";
import { auth } from "auth/auth-instance";
import { TEST_USERS } from "../../tests/constants/test-users";

let smokeHeaders = new Headers();

function smokesReady() {
  return Boolean(
    (process.env.POSTGRES_URL || process.env.DATABASE_URL) &&
      process.env.BETTER_AUTH_SECRET,
  );
}

function setCookieHeaderToCookiePair(setCookieHeader: string | null) {
  if (!setCookieHeader) return "";
  return setCookieHeader
    .split(", ")
    .map((part) => part.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function ensureChatSmokeSession(): Promise<boolean> {
  const jsonHeaders = new Headers({ "content-type": "application/json" });

  const tryApplySessionFromSignIn = async (
    email: string,
    password: string,
  ): Promise<boolean> => {
    const signed = await auth.api.signInEmail({
      body: { email, password },
      headers: jsonHeaders,
      returnHeaders: true,
    });
    const hdrs = (signed as { headers?: Headers }).headers;
    const cookiePair = setCookieHeaderToCookiePair(
      hdrs?.get("set-cookie") ?? null,
    );
    if (!cookiePair) return false;
    smokeHeaders = new Headers({ Cookie: cookiePair });
    const { __vitestNextHeaders } = await import(
      "../test-utils/next-headers-stub"
    );
    __vitestNextHeaders.current = smokeHeaders;
    return true;
  };

  try {
    if (
      await tryApplySessionFromSignIn(
        TEST_USERS.admin.email,
        TEST_USERS.admin.password,
      )
    ) {
      return true;
    }
  } catch {
    // fall through to ephemeral user
  }

  const email = `smoke-chat-${randomUUID()}@innovation-atlas-smoke.local`;
  const password = "SmokeChatPass123!";
  try {
    await auth.api.signUpEmail({
      body: { email, password, name: "Atlas Smoke Chat" },
      headers: jsonHeaders,
    });
  } catch {
    // may already exist
  }

  try {
    return tryApplySessionFromSignIn(email, password);
  } catch {
    return false;
  }
}

describe.skipIf(!smokesReady())("Atlas /api/chat smoke", () => {
  /** Cold import of /api/chat + MCP manager init can exceed 45s on some Windows CI runs. */
  const t = 90_000;
  let jarvisAgentId: string | null = null;
  let threadId: string | null = null;
  let sessionOk = false;

  beforeAll(async () => {
    const pool = getPassportPool();
    try {
      const jarvis = await pool.query<{ id: string }>(
        `SELECT id FROM agent WHERE name = 'JARVIS' LIMIT 1`,
      );
      jarvisAgentId = jarvis.rows[0]?.id ?? null;
    } finally {
      await pool.end();
    }

    if (!jarvisAgentId) return;

    sessionOk = await ensureChatSmokeSession();
  }, t);

  afterAll(async () => {
    if (!threadId) return;
    const { chatRepository } = await import("lib/db/repository");
    try {
      await chatRepository.deleteThread(threadId);
    } catch {
      // ignore cleanup errors
    }
  });

  it(
    "POST /api/chat binds passport tools for JARVIS (streamText tools + UI stream)",
    async () => {
      if (!jarvisAgentId) {
        throw new Error(
          "JARVIS agent not found — run: pnpm seed:jarvis (needs an admin user)",
        );
      }
      if (!sessionOk) {
        throw new Error(
          "Could not establish Better Auth session (seeded admin or ephemeral signup/sign-in failed)",
        );
      }

      (
        globalThis as { __atlasSmokeLastTools?: Record<string, unknown> }
      ).__atlasSmokeLastTools = undefined;
      threadId = randomUUID();
      const messageId = randomUUID();

      vi.resetModules();

      const { __vitestNextHeaders } = await import(
        "../test-utils/next-headers-stub"
      );
      __vitestNextHeaders.current = smokeHeaders;

      const { streamText: realStreamText } = await import("ai");

      function smokeProviderStream() {
        const chunks: unknown[] = [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "smoke" },
          { type: "text-end", id: "t1" },
          {
            type: "tool-call",
            toolCallId: "smoke-tc-1",
            toolName: "listPassports",
            input: "{}",
          },
          {
            type: "finish",
            finishReason: "tool-calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          },
        ];
        let index = 0;
        return new ReadableStream({
          pull(controller) {
            if (index < chunks.length) {
              controller.enqueue(chunks[index] as any);
              index += 1;
            } else {
              controller.close();
            }
          },
        });
      }

      const smokeMockLanguageModel = {
        specificationVersion: "v2" as const,
        provider: "smoke-mock",
        modelId: "smoke-mock",
        supportedUrls: {},
        doGenerate: async () => {
          throw new Error("smoke mock: use streaming");
        },
        doStream: async () => ({ stream: smokeProviderStream() }),
      };

      const g = globalThis as {
        __atlasSmokeLastTools?: Record<string, unknown>;
        __ATLAS_CHAT_STREAM_TEXT_OVERRIDE?: (opts: any) => unknown;
      };
      try {
        g.__ATLAS_CHAT_STREAM_TEXT_OVERRIDE = (opts) => {
          g.__atlasSmokeLastTools = opts.tools as Record<string, unknown>;
          const { experimental_transform: _t, model: _m, ...rest } = opts;
          return realStreamText({
            ...rest,
            model: smokeMockLanguageModel as any,
            maxRetries: 0,
          });
        };

        const { POST } = await import("@/app/api/chat/route");
        const res = await POST(
          new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: threadId,
              toolChoice: "auto",
              chatModel: { provider: "anthropic", model: "sonnet-4-6" },
              message: {
                id: messageId,
                role: "user",
                parts: [{ type: "text", text: "list my passports" }],
              },
              allowedAppDefaultToolkit: ["passport", "code", "visualization"],
              mentions: [
                {
                  type: "agent",
                  name: "JARVIS",
                  agentId: jarvisAgentId,
                },
              ],
            }),
          }),
        );

        expect(res.status).toBe(200);

        const body = res.body;
        expect(body).toBeTruthy();

        const uiChunkStream = parseJsonEventStream({
          stream: body as ReadableStream<Uint8Array>,
          schema: uiMessageChunkSchema,
        }).pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              if (!chunk.success) {
                controller.error(chunk.error);
                return;
              }
              controller.enqueue(chunk.value);
            },
          }),
        );

        let sawListPassportsTool = false;
        let finishMetaToolCount: number | undefined;

        function toolNameFromUiPart(part: {
          type?: string;
          toolName?: string;
          toolInvocation?: { toolName?: string };
        }): string | undefined {
          if (
            part.type === "dynamic-tool" &&
            typeof part.toolName === "string"
          ) {
            return part.toolName;
          }
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            return part.type.slice("tool-".length);
          }
          if (part.type === "tool-invocation" || part.type === "tool-call") {
            return part.toolName ?? part.toolInvocation?.toolName;
          }
          return undefined;
        }

        const stream = readUIMessageStream({
          stream: uiChunkStream as ReadableStream<any>,
        });
        for await (const msg of stream) {
          for (const part of msg.parts ?? []) {
            const name = toolNameFromUiPart(
              part as {
                type?: string;
                toolName?: string;
                toolInvocation?: { toolName?: string };
              },
            );
            if (name === "listPassports") {
              sawListPassportsTool = true;
            }
          }
          const meta = (msg as { metadata?: { toolCount?: number } }).metadata;
          if (typeof meta?.toolCount === "number") {
            finishMetaToolCount = meta.toolCount;
          }
        }

        const lastTools = (
          globalThis as { __atlasSmokeLastTools?: Record<string, unknown> }
        ).__atlasSmokeLastTools;
        expect(lastTools).toBeDefined();
        const toolKeys = Object.keys(lastTools ?? {});
        expect(toolKeys.length).toBeGreaterThan(0);
        expect(lastTools).toHaveProperty("listPassports");

        expect(sawListPassportsTool).toBe(true);
        expect(
          finishMetaToolCount !== undefined && finishMetaToolCount > 0,
        ).toBe(true);
      } finally {
        delete g.__ATLAS_CHAT_STREAM_TEXT_OVERRIDE;
      }
    },
    t,
  );
});
