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

import PromptInput from "@/components/prompt-input";
import { AppDefaultToolkit } from "@/lib/ai/tools";
import {
  DefaultChatTransport,
  type UIMessage,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { BriefShareBar } from "./brief-share-bar";
import { generateUUID } from "lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
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
  shareTokens: null | Array<{
    id: string;
    token: string;
    createdAt: string;
    expiresAt: string | null;
  }>;
  /**
   * Pre-rendered block list (Phase 2a.0 RSC / Phase 2a.1 editable).
   * Owner scope passes the Plate-powered `EditableBlockList`; share
   * scope passes the read-only `BlockList`. The shell stays a client
   * component and just renders the slot.
   */
  blocksSlot?: React.ReactNode;
  /**
   * Phase 2a.1 — reflects `atlas.briefs.is_edited`. Drives the "edited"
   * status blurb below the title; flipped to true the first time the
   * owner commits an edit.
   */
  briefIsEdited?: boolean;
}

// Convert an atlas.messages row's content JSON into the UIMessage shape
// that useChat expects. atlas.messages stores the AI SDK message parts
// array verbatim (as content_json), so the adapter is a pass-through
// with a role narrowing.
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
            // Phase 2b — brief chat opts into the briefing toolkit
            // only. `toolChoice: "auto"` lets the model call block
            // tools when it makes sense; the server-side kit is
            // scoped to the authenticated owner + this `briefId`, so
            // a hostile / stale client can't widen the blast radius.
            toolChoice: readOnly ? "none" : "auto",
            allowedAppDefaultToolkit: readOnly
              ? []
              : [AppDefaultToolkit.Briefing],
            allowedMcpServers: {},
            mentions: [],
            message: lastMessage,
            attachments: [],
            // Server validates ownership before binding tools.
            activeBriefId: readOnly ? undefined : briefId,
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
          <p
            className="mt-1 text-xs text-muted-foreground"
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
        {scopeKind === "user" && (
          <BriefShareBar
            briefId={briefId}
            tokens={shareTokens ?? []}
            previewUrl={shareUrl}
          />
        )}
      </header>

      {blocksSlot ? (
        <section
          className="border-b border-border py-4"
          aria-label="Brief blocks"
          data-testid="brief-blocks-section"
        >
          {blocksSlot}
        </section>
      ) : null}

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
        <div className="mt-3 border-t border-border pt-3">
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
