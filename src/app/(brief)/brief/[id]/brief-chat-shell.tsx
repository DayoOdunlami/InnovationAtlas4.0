"use client";

// ---------------------------------------------------------------------------
// BriefChatShell — Phase 1 brief surface (Brief-First Rebuild).
//
// Server-rendered page hands this component the loaded brief + hydrated
// messages from atlas.messages, and the client takes over.
//
// Phase 1 is a shell: it renders the brief title, a minimal chat
// transcript loaded from atlas.messages, and a text input. When the
// owner submits a message, the client streams from /api/chat (reused
// per APPROVED DEFAULT #3, empty tool registry per #2) and, as each
// user + assistant message settles, POSTs it to /api/brief-messages
// which persists into atlas.messages.
//
// Share-scope visitors get the same chat transcript read-only (no
// input, no actions) — APPROVED DEFAULT #13 says share readers see
// chat history.
//
// Later phases will replace this shell with block rendering + the
// canvas co-view. Today's deliberate scope: a brief that retains its
// chat history across reloads.
// ---------------------------------------------------------------------------

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DefaultChatTransport,
  type UIMessage,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { BriefShareBar } from "./brief-share-bar";
import { generateUUID } from "lib/utils";
import { Loader, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
  shareTokens:
    | null
    | Array<{
        id: string;
        token: string;
        createdAt: string;
        expiresAt: string | null;
      }>;
}

// Convert an atlas.messages row's content JSON into the UIMessage shape
// that useChat expects. atlas.messages stores the AI SDK message parts
// array verbatim (as content_json), so the adapter is a pass-through
// with a role narrowing.
function hydrateMessage(m: BriefChatShellInitialMessage): UIMessage {
  const parts = Array.isArray(m.content)
    ? (m.content as UIMessage["parts"])
    : typeof m.content === "object" && m.content !== null
      ? (((m.content as { parts?: UIMessage["parts"] }).parts ?? []) as UIMessage["parts"])
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

export function BriefChatShell({
  briefId,
  briefTitle,
  scopeKind,
  initialMessages,
  shareTokens,
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

  const { messages, status, sendMessage, error } = useChat({
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
            toolChoice: "none",
            // Phase 1 brief surface: empty tool registry (APPROVED
            // DEFAULT #2). Passport + research + canvas toolkits ship
            // back in Phase 2a.0 with the block tools.
            allowedAppDefaultToolkit: [],
            allowedMcpServers: {},
            mentions: [],
            message: lastMessage,
            attachments: [],
          },
        };
      },
    }),
  });

  // Persist any newly-settled messages to atlas.messages. Fires once
  // per message id; relies on `persistedIdsRef` for deduplication.
  useEffect(() => {
    if (readOnly) return;
    if (status !== "ready") return;
    for (const m of messages) {
      if (persistedIdsRef.current.has(m.id)) continue;
      if (m.role === "user" && persistUserInflightRef.current.has(m.id)) {
        // Already flushed eagerly in handleSubmit; remember on settle.
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || isLoading || readOnly) return;
      setInput("");
      // Eagerly persist the user message so refresh-before-first-token
      // still keeps it. The sdk will assign an id; we re-use by
      // generating ahead of time. useChat also generates one; we let
      // it generate and persist on settle instead. Simpler.
      await sendMessage({
        role: "user",
        parts: [{ type: "text", text }],
      });
    },
    [input, isLoading, readOnly, sendMessage],
  );

  const shareUrl =
    typeof window !== "undefined" && shareTokens && shareTokens.length > 0
      ? `${window.location.origin}/brief/${briefId}?share=${shareTokens[0].token}`
      : null;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-6">
      <header className="flex items-baseline justify-between border-b border-border pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-foreground">
            {briefTitle}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {readOnly
              ? "Shared read-only view"
              : "Phase 1 preview — chat history persists across reloads."}
          </p>
        </div>
        {scopeKind === "user" && (
          <BriefShareBar
            briefId={briefId}
            tokens={shareTokens ?? []}
            previewUrl={shareUrl}
          />
        )}
      </header>

      <section className="flex-1 overflow-y-auto py-4" aria-label="Chat">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {readOnly
              ? "No messages yet."
              : "Start the conversation — your messages are saved with this brief."}
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m) => (
              <li key={m.id} className="text-sm">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {m.role}
                </div>
                <div className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-foreground">
                  {m.parts
                    .map((p) => (p.type === "text" ? p.text : ""))
                    .join("")}
                </div>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {error.message}
          </div>
        ) : null}
      </section>

      {!readOnly && (
        <form
          onSubmit={handleSubmit}
          className="mt-3 flex items-center gap-2 border-t border-border pt-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the agent about this brief…"
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || input.trim() === ""}>
            {isLoading ? (
              <Loader className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            Send
          </Button>
        </form>
      )}
    </div>
  );
}
