import { MCPToolInfo, McpServerCustomizationsPrompt } from "app-types/mcp";

import { Agent } from "app-types/agent";
import { UserPreferences } from "app-types/user";
import { User } from "better-auth";
import { format } from "date-fns";
import { createMCPToolId } from "./mcp/mcp-tool-id";

export const CREATE_THREAD_TITLE_PROMPT = `
You are a chat title generation expert.

Critical rules:
- Generate a concise title based on the first user message
- Title must be under 80 characters (absolutely no more than 80 characters)
- Summarize only the core content clearly
- Do not use quotes, colons, or special characters
- Use the same language as the user's message`;

export const buildAgentGenerationPrompt = (toolNames: string[]) => {
  const toolsList = toolNames.map((name) => `- ${name}`).join("\n");

  return `
You are an elite AI agent architect. Your mission is to translate user requirements into robust, high-performance agent configurations. Follow these steps for every request:

1. Extract Core Intent: Carefully analyze the user's input to identify the fundamental purpose, key responsibilities, and success criteria for the agent. Consider both explicit and implicit needs.

2. Design Expert Persona: Define a compelling expert identity for the agent, ensuring deep domain knowledge and a confident, authoritative approach to decision-making.

3. Architect Comprehensive Instructions: Write a system prompt that:
- Clearly defines the agent's behavioral boundaries and operational parameters
- Specifies methodologies, best practices, and quality control steps for the task
- Anticipates edge cases and provides guidance for handling them
- Incorporates any user-specified requirements or preferences
- Defines output format expectations when relevant

4. Strategic Tool Selection: Select only tools crucially necessary for achieving the agent's mission effectively from available tools:
${toolsList}

5. Optimize for Performance: Include decision-making frameworks, self-verification steps, efficient workflow patterns, and clear escalation or fallback strategies.

6. Output Generation: Return a structured object with these fields:
- name: Concise, descriptive name reflecting the agent's primary function
- description: 1-2 sentences capturing the unique value and primary benefit to users  
- role: Precise domain-specific expertise area
- instructions: The comprehensive system prompt from steps 2-5
- tools: Array of selected tool names from step 4

CRITICAL: Generate all output content in the same language as the user's request. Be specific and comprehensive. Proactively seek clarification if requirements are ambiguous. Your output should enable the new agent to operate autonomously and reliably within its domain.`.trim();
};

export const buildUserSystemPrompt = (
  user?: User,
  userPreferences?: UserPreferences,
  agent?: Agent,
) => {
  const assistantName =
    agent?.name || userPreferences?.botName || "Innovation Atlas";
  const currentTime = format(new Date(), "EEEE, MMMM d, yyyy 'at' h:mm:ss a");

  let prompt = `You are ${assistantName}`;

  if (agent?.instructions?.role) {
    prompt += `. You are an expert in ${agent.instructions.role}`;
  }

  prompt += `. The current date and time is ${currentTime}.`;

  // Agent-specific instructions as primary core
  if (agent?.instructions?.systemPrompt) {
    prompt += `
  # Core Instructions
  <core_capabilities>
  ${agent.instructions.systemPrompt}
  </core_capabilities>`;
  }

  // User context section (first priority)
  const userInfo: string[] = [];
  if (user?.name) userInfo.push(`Name: ${user.name}`);
  if (user?.email) userInfo.push(`Email: ${user.email}`);
  if (userPreferences?.profession)
    userInfo.push(`Profession: ${userPreferences.profession}`);

  if (userInfo.length > 0) {
    prompt += `

<user_information>
${userInfo.join("\n")}
</user_information>`;
  }

  // General capabilities (secondary)
  prompt += `

<general_capabilities>
You can assist with:
- Analysis and problem-solving across various domains
- Using available tools and resources to complete tasks
- Adapting communication to user preferences and context
</general_capabilities>`;

  // Communication preferences
  const displayName = userPreferences?.displayName || user?.name;
  const hasStyleExample = userPreferences?.responseStyleExample;

  if (displayName || hasStyleExample) {
    prompt += `

<communication_preferences>`;

    if (displayName) {
      prompt += `
- Address the user as "${displayName}" when appropriate to personalize interactions`;
    }

    if (hasStyleExample) {
      prompt += `
- Match this communication style and tone:
"""
${userPreferences.responseStyleExample}
"""`;
    }

    prompt += `

- When using tools, briefly mention which tool you'll use with natural phrases
- Examples: "I'll search for that information", "Let me check the weather", "I'll run some calculations"
- Use \`mermaid\` code blocks for diagrams and charts when helpful
</communication_preferences>`;
  }

  return prompt.trim();
};

/**
 * Prepended to every voice-mode system prompt. Tight rules the model must obey
 * across ALL agents before anything agent-specific kicks in.
 *
 * Kept short on purpose — the realtime model weighs the first tokens heavily.
 */
export const VOICE_MODE_PREAMBLE = `
<voice_mode_preamble>
You are currently operating in VOICE MODE over OpenAI Realtime.

Hard rules (apply to every turn):
- Speak English only, unless the user explicitly asks for another language.
- Never read markdown, lists, headers, bullets, tables, or raw JSON aloud. They do not survive text-to-speech.
- Never read tool output JSON, SQL, UUIDs, table names, or other raw payload fields aloud. Summarise the meaning in plain English instead.
- Keep each spoken turn conversational: 1–3 short paragraphs, or roughly 120–150 spoken words, then stop and let the user respond.
- Lead with the insight. Evidence and reasoning come after.
- If you need to run a tool, announce it naturally first ("Let me check the corpus on that…"), then call it. Never leave silence while a tool runs.
- If the user starts speaking while you are talking, stop immediately and listen. Do not talk over them.
- If you are unsure what the user means, ask ONE short clarifying question instead of guessing.
</voice_mode_preamble>
`.trim();

export const buildSpeechSystemPrompt = (
  user: User,
  userPreferences?: UserPreferences,
  agent?: Agent,
) => {
  const assistantName = agent?.name || userPreferences?.botName || "Assistant";
  const currentTime = format(new Date(), "EEEE, MMMM d, yyyy 'at' h:mm:ss a");

  let prompt = `${VOICE_MODE_PREAMBLE}\n\nYou are ${assistantName}`;

  if (agent?.instructions?.role) {
    prompt += `. You are an expert in ${agent.instructions.role}`;
  }

  prompt += `. The current date and time is ${currentTime}.`;

  // Agent-specific instructions as primary core
  if (agent?.instructions?.systemPrompt) {
    prompt += `# Core Instructions
    <core_capabilities>
    ${agent.instructions.systemPrompt}
    </core_capabilities>`;
  }

  // User context section (first priority)
  const userInfo: string[] = [];
  if (user?.name) userInfo.push(`Name: ${user.name}`);
  if (user?.email) userInfo.push(`Email: ${user.email}`);
  if (userPreferences?.profession)
    userInfo.push(`Profession: ${userPreferences.profession}`);

  if (userInfo.length > 0) {
    prompt += `

<user_information>
${userInfo.join("\n")}
</user_information>`;
  }

  // Voice-specific capabilities
  prompt += `

<voice_capabilities>
You excel at conversational voice interactions by:
- Providing clear, natural spoken responses
- Using available tools to gather information and complete tasks
- Adapting communication to user preferences and context
</voice_capabilities>`;

  // Communication preferences
  const displayName = userPreferences?.displayName || user?.name;
  const hasStyleExample = userPreferences?.responseStyleExample;

  if (displayName || hasStyleExample) {
    prompt += `

<communication_preferences>`;

    if (displayName) {
      prompt += `
- Address the user as "${displayName}" when appropriate to personalize interactions`;
    }

    if (hasStyleExample) {
      prompt += `
- Match this communication style and tone:
"""
${userPreferences.responseStyleExample}
"""`;
    }

    prompt += `
</communication_preferences>`;
  }

  // Voice-specific guidelines
  prompt += `

<voice_interaction_guidelines>
- Speak in short, conversational sentences (one or two per reply)
- Use simple words; avoid jargon unless the user uses it first
- Never use lists, markdown, or code blocks—just speak naturally
- When using tools, briefly mention what you're doing: "Let me search for that" or "I'll check the weather"
- If a request is ambiguous, ask a brief clarifying question instead of guessing
</voice_interaction_guidelines>`;

  return prompt.trim();
};

/**
 * Shared voice appendix — appended to EVERY agent's realtime session instructions.
 * Contains rules that apply regardless of which agent is loaded
 * (chart fabrication, tool-output truncation, lists-aloud, etc.).
 */
export const VOICE_REALTIME_RESPONSE_APPENDIX_SHARED = `
<voice_realtime_output_rules_shared>
When responding by voice: give a spoken summary of maximum 3 sentences, then
say exactly: 'I have rendered the full details in the voice panel.'
Never read lists aloud — say the count and the top item only, then stop.
Tool outputs are capped at 15,000 characters — treat any truncated JSON as
incomplete and tell the user to check the voice panel for the full result.
Never attempt to read or summarise raw JSON output, SQL, or UUIDs aloud.

CHART AND TABLE DATA RULE: When calling createBarChart, createLineChart,
createPieChart, or createTable, only include data you have actually received
from a prior tool call in this conversation.
Do NOT invent, estimate, or fabricate row labels, segment names, series values,
or any data points. If you do not have real data from a prior tool call to
populate the chart, say so verbally and ask the user to request the data first.
</voice_realtime_output_rules_shared>`.trim();

/**
 * JARVIS-only voice appendix — passport workflow safeguards. Only appended
 * when the active agent is JARVIS, to keep ATLAS and HYVE prompts clean.
 */
export const VOICE_REALTIME_RESPONSE_APPENDIX_JARVIS = `
<voice_realtime_output_rules_jarvis>
When calling runMatching, say "Running cross-sector matching now — this
typically takes around 30 seconds, please wait" BEFORE invoking the tool.
Do not leave silence while matching runs.

PASSPORT ID RULE: passport_id parameters must always be UUIDs in the format
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx — never passport names or titles.
Before calling runMatching, showMatchList, showGapAnalysis, showClaimExtraction,
archivePassport, or createDraftPitch, you MUST call listPassports first if you do not already have
the UUID for the requested passport in this conversation.
Extract the UUID from the listPassports result, then use it in the subsequent call.
Never attempt to guess, construct, or infer a UUID.

CLAIM SAVING: After extractClaimsPreview, you will receive a pending_batch_id.
Always ask the user which passport to save to before calling saveClaimsToPassport.
Say: "I extracted N claims. Which passport should I save them to?"
Then call listPassports to show the options. Wait for the user to confirm.
If the user wants a new passport, ask for a name then omit passport_id
and provide the title parameter instead. Never save claims without explicit
user confirmation of which passport to use.

CLAIM VERIFICATION: Never attempt to verify claims programmatically.
When the user asks to verify a claim, say:
"Only you can verify evidence — tap the Verify button on the claim card to mark
it as confirmed. This is a deliberate safeguard: AI cannot self-verify evidence
in Innovation Atlas."
Do not call any verify tool. The Verify button in the chat UI is the only valid path.
</voice_realtime_output_rules_jarvis>`.trim();

/**
 * @deprecated Kept as an alias for backward compatibility. Prefer
 * {@link VOICE_REALTIME_RESPONSE_APPENDIX_SHARED} (all agents) and
 * {@link VOICE_REALTIME_RESPONSE_APPENDIX_JARVIS} (JARVIS only).
 */
export const VOICE_REALTIME_RESPONSE_APPENDIX =
  VOICE_REALTIME_RESPONSE_APPENDIX_SHARED;

/**
 * Returns the correct voice appendix stack for the active agent. Always
 * includes the shared rules; JARVIS gets an extra passport-safety layer.
 */
export const buildVoiceRealtimeAppendix = (agent?: Agent): string => {
  if (agent?.name === "JARVIS") {
    return `${VOICE_REALTIME_RESPONSE_APPENDIX_SHARED}\n\n${VOICE_REALTIME_RESPONSE_APPENDIX_JARVIS}`;
  }
  return VOICE_REALTIME_RESPONSE_APPENDIX_SHARED;
};

export const buildMcpServerCustomizationsSystemPrompt = (
  instructions: Record<string, McpServerCustomizationsPrompt>,
) => {
  const prompt = Object.values(instructions).reduce((acc, v) => {
    if (!v.prompt && !Object.keys(v.tools ?? {}).length) return acc;
    acc += `
<${v.name}>
${v.prompt ? `- ${v.prompt}\n` : ""}
${
  v.tools
    ? Object.entries(v.tools)
        .map(
          ([toolName, toolPrompt]) =>
            `- **${createMCPToolId(v.name, toolName)}**: ${toolPrompt}`,
        )
        .join("\n")
    : ""
}
</${v.name}>
`.trim();
    return acc;
  }, "");
  if (prompt) {
    return `
### Tool Usage Guidelines
- When using tools, please follow the guidelines below unless the user provides specific instructions otherwise.
- These customizations help ensure tools are used effectively and appropriately for the current context.
${prompt}
`.trim();
  }
  return prompt;
};

export const generateExampleToolSchemaPrompt = (options: {
  toolInfo: MCPToolInfo;
  prompt?: string;
}) => `\n
You are given a tool with the following details:
- Tool Name: ${options.toolInfo.name}
- Tool Description: ${options.toolInfo.description}

${
  options.prompt ||
  `
Step 1: Create a realistic example question or scenario that a user might ask to use this tool.
Step 2: Based on that question, generate a valid JSON input object that matches the input schema of the tool.
`.trim()
}
`;

export const MANUAL_REJECT_RESPONSE_PROMPT = `\n
The user has declined to run the tool. Please respond with the following three approaches:

1. Ask 1-2 specific questions to clarify the user's goal.

2. Suggest the following three alternatives:
   - A method to solve the problem without using tools
   - A method utilizing a different type of tool
   - A method using the same tool but with different parameters or input values

3. Guide the user to choose their preferred direction with a friendly and clear tone.
`.trim();

export const buildToolCallUnsupportedModelSystemPrompt = `
### Tool Call Limitation
- You are using a model that does not support tool calls. 
- When users request tool usage, simply explain that the current model cannot use tools and that they can switch to a model that supports tool calling to use tools.
`.trim();
