"use client";

// ---------------------------------------------------------------------------
// BriefChatShell — Phase 3c-a (layout toggle).
//
// Supports two layout variants (persisted to localStorage + URL param):
//
//   "focus"        — brief full-width, chat in a collapsible panel below
//                    (Variant B from Phase 3c spec).  Default on < 768 px.
//   "side-by-side" — brief left (flex-1), chat right (420px collapsible
//                    to 52px strip).  Default on ≥ 768 px (Variant A).
//
// Share-scope visitors always get "focus" with no layout toggle.
// ---------------------------------------------------------------------------

import PromptInput from "@/components/prompt-input";
import { BriefLayoutToggle } from "@/components/brief/layout-toggle";
import { AppDefaultToolkit } from "@/lib/ai/tools";
import { useBriefLayout } from "@/hooks/use-brief-layout";
import {
  DefaultChatTransport,
  type UIMessage,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { BriefShareBar } from "./brief-share-bar";
import { generateUUID } from "lib/utils";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export interface BriefChatShellInitialMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: unknown;
  createdAt: string;
}

interface BriefChatShellProps {
  briefId: string;
  briefTitle: string;
  scopeKind: "user" | "share";
  initialMessages: BriefChatShellInitialMessage[];
  shareTokens: null | Array<{
    id: string;
    token: string;
    createdAt: string;
    expiresAt: string | null;
  }>;
  blocksSlot?: React.ReactNode;
  briefIsEdited?: boolean;
}

function hydrateMessage(m: BriefChatShellInitialMessage): UIMessage {
  const parts = Array.isArray(m.content)
    ? (m.content as UIMessage["parts"])
    : typeof m.content === "object" && m.content !== null
      ? (((m.content as { parts?: UIMessage["parts"] }).parts ??
          []) as UIMessage["parts"])
      : [];
  return {
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: parts.length > 0 ? parts : [{ type: "text", text: "" }],
    metadata: {},
  } as UIMessage;
}

async function postBriefMessage(params: {
  briefId: string;
  role: "user" | "assistant" | "system" | "tool";
  message: UIMessage;
}) {
  const { briefId, role, message } = params;
  try {
    const res = await fetch("/api/brief-messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        briefId,
        role,
        contentJson: { parts: message.parts },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`persistMessage ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error("[brief-chat-shell] persistMessage failed:", err);
    toast.error("Couldn't save that message — try again.");
  }
}

// ---------------------------------------------------------------------------
// Chat transcript panel — shared by both layout variants
// ---------------------------------------------------------------------------
function ChatPanel({
  messages,
  error,
  isLoading,
  readOnly,
  briefId,
  input,
  setInput,
  sendMessage,
  stop,
}: {
  messages: UIMessage[];
  error: Error | undefined;
  isLoading: boolean;
  readOnly: boolean;
  briefId: string;
  input: string;
  setInput: (v: string) => void;
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  stop: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto py-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground px-4 text-center">
            {readOnly
              ? "No messages yet."
              : "Start the conversation — the agent will author blocks into the brief above."}
          </div>
        ) : (
          <ul className="flex flex-col gap-3 px-2">
            {messages.map((m) => (
              <li key={m.id} className="text-sm">
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {m.role}
                </div>
                <div className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-foreground">
                  {m.parts
                    .map((p) => (p.type === "text" ? p.text : ""))
                    .join("")}
                </div>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <div className="mx-2 mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {error.message}
          </div>
        ) : null}
      </div>

      {!readOnly && (
        <div className="border-t border-border pt-2">
          <PromptInput
            input={input}
            setInput={setInput}
            sendMessage={sendMessage}
            onStop={stop}
            isLoading={isLoading}
            threadId={briefId}
            placeholder="Message the agent about this brief…"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BriefChatShell — main export
// ---------------------------------------------------------------------------
export function BriefChatShell({
  briefId,
  briefTitle,
  scopeKind,
  initialMessages,
  shareTokens,
  blocksSlot,
  briefIsEdited = false,
}: BriefChatShellProps) {
  const hydratedInitial = useMemo(
    () => initialMessages.map(hydrateMessage),
    [initialMessages],
  );
  const persistedIdsRef = useRef<Set<string>>(
    new Set(initialMessages.map((m) => m.id)),
  );
  const persistUserInflightRef = useRef<Set<string>>(new Set());

  const readOnly = scopeKind === "share";
  const { layout, setLayout, chatCollapsed, toggleChatCollapse } =
    useBriefLayout(readOnly);

  const { messages, status, sendMessage, stop, error } = useChat({
    id: briefId,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    messages: hydratedInitial,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      prepareSendMessagesRequest: ({ messages: msgs, body, id }) => {
        const lastMessage = msgs.at(-1)!;
        return {
          body: {
            ...body,
            id,
            chatModel: undefined,
            toolChoice: readOnly ? "none" : "auto",
            allowedAppDefaultToolkit: readOnly
              ? []
              : [AppDefaultToolkit.Briefing],
            allowedMcpServers: {},
            mentions: [],
            message: lastMessage,
            attachments: [],
            activeBriefId: readOnly ? undefined : briefId,
          },
        };
      },
    }),
  });

  useEffect(() => {
    if (readOnly) return;
    if (status !== "ready") return;
    for (const m of messages) {
      if (persistedIdsRef.current.has(m.id)) continue;
      if (m.role === "user" && persistUserInflightRef.current.has(m.id)) {
        persistedIdsRef.current.add(m.id);
        persistUserInflightRef.current.delete(m.id);
        continue;
      }
      persistedIdsRef.current.add(m.id);
      void postBriefMessage({
        briefId,
        role: m.role as "user" | "assistant" | "system" | "tool",
        message: m,
      });
    }
  }, [messages, status, briefId, readOnly]);

  const [input, setInput] = useState("");
  const isLoading = status === "streaming" || status === "submitted";

  const shareUrl =
    typeof window !== "undefined" && shareTokens && shareTokens.length > 0
      ? `${window.location.origin}/brief/${briefId}?share=${shareTokens[0].token}`
      : null;

  const chatProps = {
    messages,
    error,
    isLoading,
    readOnly,
    briefId,
    input,
    setInput,
    sendMessage,
    stop,
  };

  // ---------------------------------------------------------------------------
  // Header (shared between layouts)
  // ---------------------------------------------------------------------------
  const header = (
    <header className="flex items-center justify-between border-b border-border pb-3 gap-3 flex-shrink-0">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold text-foreground">
          {briefTitle}
        </h1>
        <p
          className="mt-0.5 text-xs text-muted-foreground"
          data-testid="brief-status-line"
          data-is-edited={briefIsEdited ? "true" : "false"}
        >
          {readOnly
            ? "Shared read-only view"
            : briefIsEdited
              ? "Edited by you"
              : "Click any block to start editing."}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {!readOnly && (
          <BriefLayoutToggle layout={layout} onSelect={setLayout} />
        )}
        {scopeKind === "user" && (
          <BriefShareBar
            briefId={briefId}
            tokens={shareTokens ?? []}
            previewUrl={shareUrl}
          />
        )}
      </div>
    </header>
  );

  // ---------------------------------------------------------------------------
  // Variant A — Side-by-side
  // ---------------------------------------------------------------------------
  if (layout === "side-by-side") {
    return (
      <div className="flex h-full w-full gap-0 overflow-hidden">
        {/* Brief column */}
        <div className="flex flex-1 min-w-0 flex-col px-4 py-6 overflow-y-auto">
          {header}

          {blocksSlot ? (
            <section
              className="py-4 flex-1"
              aria-label="Brief blocks"
              data-testid="brief-blocks-section"
            >
              {blocksSlot}
            </section>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground py-4">
              No blocks yet. Ask the agent to draft a section.
            </div>
          )}
        </div>

        {/* Chat column */}
        <div
          className={cn(
            "flex flex-col border-l border-border transition-all duration-200 flex-shrink-0",
            chatCollapsed ? "w-[52px]" : "w-[420px]",
          )}
        >
          {/* Collapse toggle strip */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
            {!chatCollapsed && (
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Chat
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-6 w-6 p-0 ml-auto", chatCollapsed && "mx-auto")}
              onClick={toggleChatCollapse}
              aria-label={chatCollapsed ? "Expand chat" : "Collapse chat"}
            >
              {chatCollapsed ? (
                <PanelRightOpen className="size-3.5" />
              ) : (
                <PanelRightClose className="size-3.5" />
              )}
            </Button>
          </div>

          {!chatCollapsed && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <ChatPanel {...chatProps} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Variant B — Focus (stacked, chat below with collapsible transcript)
  // ---------------------------------------------------------------------------
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-6">
      {header}

      {blocksSlot ? (
        <section
          className="border-b border-border py-4"
          aria-label="Brief blocks"
          data-testid="brief-blocks-section"
        >
          {blocksSlot}
        </section>
      ) : null}

      {/* Chat transcript — collapsible in focus mode */}
      <div className="flex flex-col min-h-0">
        <button
          type="button"
          onClick={toggleChatCollapse}
          className={cn(
            "flex items-center gap-1.5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors",
            readOnly && "cursor-default",
          )}
          disabled={readOnly}
          aria-expanded={!chatCollapsed}
        >
          {chatCollapsed ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronUp className="size-3.5" />
          )}
          Chat {messages.length > 0 ? `(${messages.length})` : ""}
        </button>

        {!chatCollapsed && (
          <div className="overflow-y-auto" style={{ maxHeight: "40vh" }}>
            <ul className="flex flex-col gap-3">
              {messages.map((m) => (
                <li key={m.id} className="text-sm">
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {m.role}
                  </div>
                  <div className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-foreground">
                    {m.parts
                      .map((p) => (p.type === "text" ? p.text : ""))
                      .join("")}
                  </div>
                </li>
              ))}
            </ul>
            {error ? (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                {error.message}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="mt-auto pt-3 border-t border-border">
          <PromptInput
            input={input}
            setInput={setInput}
            sendMessage={sendMessage}
            onStop={stop}
            isLoading={isLoading}
            threadId={briefId}
            placeholder="Message the agent about this brief…"
          />
        </div>
      )}
    </div>
  );
}
