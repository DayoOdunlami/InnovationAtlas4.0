import type { ChatMention } from "app-types/chat";

/**
 * When opening voice from chat, carry the thread's selected @agent into the
 * Realtime session so the server can load agent.instructions.mentions (e.g.
 * JARVIS mcpServer → supabase-atlas tools).
 */
export function agentIdForVoiceFromThreadMentions(
  threadMentions: Record<string, ChatMention[]>,
  threadId: string | null | undefined,
): string | undefined {
  if (!threadId) return undefined;
  const mentions = threadMentions[threadId] ?? [];
  const agent = mentions.find(
    (m): m is Extract<ChatMention, { type: "agent" }> => m.type === "agent",
  );
  return agent?.agentId;
}
