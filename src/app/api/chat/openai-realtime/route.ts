import { AllowedMCPServer, VercelAIMcpTool } from "app-types/mcp";
import { getSession } from "auth/server";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildSpeechSystemPrompt,
  buildVoiceRealtimeAppendix,
} from "lib/ai/prompts";
import { NextRequest } from "next/server";
import {
  filterMcpServerCustomizations,
  loadMcpTools,
  mergeSystemPrompt,
} from "../shared.chat";

import { ChatMention } from "app-types/chat";
import { colorize } from "consola/utils";
import { DEFAULT_VOICE_TOOLS } from "lib/ai/speech";
import { VOICE_VOICE_DEFAULT_PASSPORT_TOOLS } from "lib/ai/speech/voice-default-tools";
import globalLogger from "lib/logger";
import { getUserPreferences } from "lib/user/server";
import { safe } from "ts-safe";
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "../actions";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `OpenAI Realtime API: `),
});

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is not set" }),
        {
          status: 500,
        },
      );
    }

    const session = await getSession();

    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { voice, mentions, agentId, allowedMcpServers } =
      (await request.json()) as {
        model: string;
        voice: string;
        agentId?: string;
        mentions: ChatMention[];
        allowedMcpServers?: Record<string, AllowedMCPServer>;
      };

    const agent = await rememberAgentAction(agentId, session.user.id);

    agentId && logger.info(`[${agentId}] Agent: ${agent?.name}`);

    const agentMentions = agent?.instructions.mentions ?? [];
    const useAgentMentions = Boolean(agent && agentMentions.length > 0);
    const mentionsPayload = useAgentMentions ? agentMentions : mentions;

    const allowedMcpTools = await loadMcpTools(
      mentionsPayload.length > 0
        ? { mentions: mentionsPayload }
        : { allowedMcpServers },
    );

    const toolNames = Object.keys(allowedMcpTools ?? {});

    if (toolNames.length > 0) {
      logger.info(`${toolNames.length} tools found`);
    } else {
      logger.info(`No tools found`);
    }

    const userPreferences = await getUserPreferences(session.user.id);

    const mcpServerCustomizations = await safe()
      .map(() => {
        if (Object.keys(allowedMcpTools ?? {}).length === 0)
          throw new Error("No tools found");
        return rememberMcpServerCustomizationsAction(session.user.id);
      })
      .map((v) => filterMcpServerCustomizations(allowedMcpTools!, v))
      .orElse({});

    const openAITools = Object.entries(allowedMcpTools ?? {}).map(
      ([name, tool]) => {
        return vercelAIToolToOpenAITool(tool, name);
      },
    );

    const systemPrompt = mergeSystemPrompt(
      buildSpeechSystemPrompt(
        session.user,
        userPreferences ?? undefined,
        agent,
      ),
      buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
      buildVoiceRealtimeAppendix(agent),
    );

    const voiceDefaultToolsForSlice =
      process.env.ENABLE_VOICE_DEFAULT_TOOLS !== "0"
        ? VOICE_VOICE_DEFAULT_PASSPORT_TOOLS
        : [];

    const bindingTools = [
      ...openAITools,
      ...DEFAULT_VOICE_TOOLS,
      ...voiceDefaultToolsForSlice,
    ];

    // Model is env-flagged so we can A/B `gpt-4o-realtime-preview` (beta) vs
    // `gpt-realtime` (GA) without redeploying. Voice must be compatible with
    // the chosen model: `marin` is GA-only; preview still uses `ash`.
    const realtimeModel =
      process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-realtime-preview";
    const defaultVoiceForModel =
      realtimeModel === "gpt-realtime" ? "marin" : "ash";
    // `gpt-4o-mini-transcribe` is only safe once we move to the GA endpoint
    // (`/v1/realtime/calls`). On the beta `/v1/realtime/sessions` path we
    // stay on `whisper-1` unless explicitly overridden. Always pin language.
    const transcribeModel =
      process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL ?? "whisper-1";

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: realtimeModel,
        voice: voice || defaultVoiceForModel,
        input_audio_transcription: {
          model: transcribeModel,
          language: "en",
        },
        instructions: systemPrompt,
        tools: bindingTools,
      }),
    });

    return new Response(r.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}

function vercelAIToolToOpenAITool(tool: VercelAIMcpTool, name: string) {
  return {
    name,
    type: "function",
    description: tool.description,
    parameters: (tool.inputSchema as any).jsonSchema ?? {
      type: "object",
      properties: {},
      required: [],
    },
  };
}
