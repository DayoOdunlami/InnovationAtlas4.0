"use client";

import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { appStore } from "@/app/store";
import { cn, generateUUID, truncateString } from "lib/utils";
import { useShallow } from "zustand/shallow";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  TextUIPart,
  UIMessage,
} from "ai";
import { mutate } from "swr";
import {
  ChatApiSchemaRequestBody,
  ChatAttachment,
  ChatModel,
} from "app-types/chat";
import { useToRef } from "@/hooks/use-latest";
import { isShortcutEvent, Shortcuts } from "lib/keyboard-shortcuts";
import { Button } from "ui/button";
import {
  MessageSquare,
  Columns2,
  Map,
  ChevronRight,
  ChevronLeft,
  FilePlus,
  Clipboard,
  Printer,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setThreadActivePassportAction } from "@/app/api/chat/actions";
import type { PassportSummary } from "@/lib/passport/types";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Think } from "ui/think";
import { useGenerateThreadTitle } from "@/hooks/queries/use-generate-thread-title";
import { AnimatePresence, motion } from "framer-motion";

import { useThreadFileUploader } from "@/hooks/use-thread-file-uploader";
import { useFileDragOverlay } from "@/hooks/use-file-drag-overlay";
import { getStorageManager } from "lib/browser-stroage";
import { PreviewMessage, ErrorMessage } from "@/components/message";
import PromptInput from "@/components/prompt-input";
import { SessionDocument } from "@/components/passport/session-document";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

const rightPanelStorage = getStorageManager("atlas-right-panel-open");
const panelModeStorage = getStorageManager<"auto" | "canvas">(
  "atlas-right-panel-mode",
);
const NO_PASSPORT = "__none__";

type Props = {
  threadId: string;
  initialMessages: Array<UIMessage>;
  activePassportId: string | null;
  passportOptions: PassportSummary[];
};

export function ChatPlusLayout({
  threadId,
  initialMessages,
  activePassportId,
  passportOptions,
}: Props) {
  const router = useRouter();
  const [bindingPassport, startBindTransition] = useTransition();
  const { uploadFiles } = useThreadFileUploader(threadId);

  const onPassportChange = useCallback(
    (value: string) => {
      const passportId = value === NO_PASSPORT ? null : value;
      startBindTransition(async () => {
        try {
          await setThreadActivePassportAction(threadId, passportId);
          router.refresh();
          toast.success(
            passportId ? "Passport bound to this chat" : "Passport cleared",
          );
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Could not update passport",
          );
        }
      });
    },
    [threadId, router],
  );

  // Right panel collapse — persists in localStorage
  // Note: getStorageManager.get() returns undefined (not null) when unset,
  // so we use loose != null to catch both null and undefined.
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(() => {
    const stored = rightPanelStorage.get();
    return stored != null ? (stored as boolean) : true;
  });

  const toggleRightPanel = useCallback(() => {
    setRightPanelOpen((prev) => {
      const next = !prev;
      rightPanelStorage.set(next);
      return next;
    });
  }, []);

  // Right panel mode: "auto" shows the live session document; "canvas" shows placeholder
  const [panelMode, setPanelModeState] = useState<"auto" | "canvas">(() => {
    return panelModeStorage.get() ?? "auto";
  });

  const setPanelMode = useCallback((mode: "auto" | "canvas") => {
    panelModeStorage.set(mode);
    setPanelModeState(mode);
  }, []);

  const handleFileDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      await uploadFiles(files);
    },
    [uploadFiles],
  );

  const { isDragging } = useFileDragOverlay({ onDropFiles: handleFileDrop });

  // ── Draft Pitch: derive from live chat messages ──────────────────────────
  const [isCopying, setIsCopying] = useState(false);

  const [
    appStoreMutate,
    model,
    toolChoice,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    threadList,
    threadMentions,
    pendingThreadMention,
    threadImageToolModel,
  ] = appStore(
    useShallow((state) => [
      state.mutate,
      state.chatModel,
      state.toolChoice,
      state.allowedAppDefaultToolkit,
      state.allowedMcpServers,
      state.threadList,
      state.threadMentions,
      state.pendingThreadMention,
      state.threadImageToolModel,
    ]),
  );

  const generateTitle = useGenerateThreadTitle({ threadId });

  const onFinish = useCallback(() => {
    const messages = latestRef.current.messages;
    const prevThread = latestRef.current.threadList.find(
      (v) => v.id === threadId,
    );
    const isNewThread =
      !prevThread?.title &&
      messages.filter((v) => v.role === "user" || v.role === "assistant")
        .length < 3;
    if (isNewThread) {
      const part = messages
        .slice(0, 2)
        .flatMap((m) =>
          m.parts
            .filter((v) => v.type === "text")
            .map(
              (p) =>
                `${m.role}: ${truncateString((p as TextUIPart).text, 500)}`,
            ),
        );
      if (part.length > 0) generateTitle(part.join("\n\n"));
    } else if (latestRef.current.threadList[0]?.id !== threadId) {
      mutate("/api/thread");
    }
  }, []);

  const [input, setInput] = useState("");

  const {
    messages,
    status,
    setMessages,
    addToolResult: _addToolResult,
    error,
    sendMessage,
    stop,
  } = useChat({
    id: threadId,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new DefaultChatTransport({
      prepareSendMessagesRequest: ({ messages, body, id }) => {
        if (window.location.pathname !== `/chat-plus/${threadId}`) {
          window.history.replaceState({}, "", `/chat-plus/${threadId}`);
        }
        const lastMessage = messages.at(-1)!;
        const attachments: ChatAttachment[] = lastMessage.parts.reduce(
          (acc: ChatAttachment[], part: any) => {
            if (part?.type === "file") {
              acc.push({
                type: "file",
                url: part.url,
                mediaType: part.mediaType,
                filename: part.filename,
              });
            } else if (part?.type === "source-url") {
              acc.push({
                type: "source-url",
                url: part.url,
                mediaType: part.mediaType,
                filename: part.title,
              });
            }
            return acc;
          },
          [],
        );

        const sanitizedLastMessage = {
          ...lastMessage,
          parts: lastMessage.parts.filter((p: any) => p?.type !== "source-url"),
        } as typeof lastMessage;
        const hasFilePart = lastMessage.parts?.some(
          (p) => (p as any)?.type === "file",
        );

        const requestBody: ChatApiSchemaRequestBody = {
          ...body,
          id,
          chatModel:
            (body as { model: ChatModel })?.model ?? latestRef.current.model,
          toolChoice: latestRef.current.toolChoice,
          allowedAppDefaultToolkit:
            latestRef.current.mentions?.filter((m) => m.type !== "agent")
              .length || hasFilePart
              ? []
              : latestRef.current.allowedAppDefaultToolkit,
          allowedMcpServers: latestRef.current.mentions?.filter(
            (m) => m.type !== "agent",
          ).length
            ? {}
            : latestRef.current.allowedMcpServers,
          mentions: latestRef.current.mentions,
          message: sanitizedLastMessage,
          imageTool: {
            model: latestRef.current.threadImageToolModel[threadId],
          },
          attachments,
        };
        return { body: requestBody };
      },
    }),
    messages: initialMessages,
    generateId: generateUUID,
    experimental_throttle: 100,
    onFinish,
  });

  const addToolResult = useCallback(
    async (result: Parameters<typeof _addToolResult>[0]) => {
      await _addToolResult(result);
    },
    [_addToolResult],
  );

  const latestRef = useToRef({
    toolChoice,
    model,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    messages,
    threadList,
    threadId,
    mentions: threadMentions[threadId],
    threadImageToolModel,
  });

  const isLoading = useMemo(
    () => status === "streaming" || status === "submitted",
    [status],
  );

  // Scan live messages for the most recent completed createDraftPitch tool call
  const livePitchText = useMemo<string | null>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      for (let j = msg.parts.length - 1; j >= 0; j--) {
        const part = msg.parts[j];
        if (
          isToolUIPart(part) &&
          (part as any).toolName === "createDraftPitch" &&
          (part as any).state?.startsWith("output") &&
          (part as any).input?.paragraph1
        ) {
          const { title, paragraph1, paragraph2, paragraph3 } = (part as any)
            .input;
          return (
            [title ? `# ${title}` : null, paragraph1, paragraph2, paragraph3]
              .filter(Boolean)
              .join("\n\n") || null
          );
        }
      }
    }
    return null;
  }, [messages]);

  const handleCopySessionDoc = useCallback(async () => {
    if (!activePassportId) return;
    setIsCopying(true);
    try {
      const sb = createBrowserClient();
      const [claimsRes, matchesRes, gapsRes] = await Promise.all([
        sb
          .schema("atlas")
          .from("passport_claims")
          .select("claim_role, claim_domain, claim_text, confidence_tier")
          .eq("passport_id", activePassportId)
          .eq("rejected", false)
          .order("claim_domain"),
        sb
          .schema("atlas")
          .from("matches")
          .select("id, match_score, project_id")
          .eq("passport_id", activePassportId)
          .order("match_score", { ascending: false })
          .limit(5),
        sb
          .schema("atlas")
          .from("passport_gaps")
          .select("gap_description, severity, what_closes_it")
          .eq("evidence_passport_id", activePassportId),
      ]);

      const lines: string[] = ["INNOVATION ATLAS — SESSION DOCUMENT", ""];

      lines.push("── EVIDENCE CLAIMS ──");
      const claims = (claimsRes.data ?? []) as Array<{
        claim_role: string;
        confidence_tier: string;
        claim_text: string;
      }>;
      if (claims.length === 0) {
        lines.push("No claims yet.");
      } else {
        for (const c of claims) {
          lines.push(
            `[${c.claim_role}] [${c.confidence_tier}] ${c.claim_text}`,
          );
        }
      }
      lines.push("");

      lines.push("── CROSS-SECTOR MATCHES ──");
      const matchRows = (matchesRes.data ?? []) as Array<{
        id: string;
        match_score: number | null;
        project_id: string | null;
      }>;
      if (matchRows.length === 0) {
        lines.push("No matches yet.");
      } else {
        const projectIds = matchRows
          .map((m) => m.project_id)
          .filter(Boolean) as string[];
        const projRes = await sb
          .schema("atlas")
          .from("projects")
          .select("id, title, lead_funder")
          .in("id", projectIds);
        const projectMap = new Map(
          (
            (projRes.data ?? []) as Array<{
              id: string;
              title: string | null;
              lead_funder: string | null;
            }>
          ).map((p) => [p.id, p]),
        );
        matchRows.forEach((m, idx) => {
          const proj = projectMap.get(m.project_id ?? "");
          const score =
            m.match_score != null
              ? `${Math.round(m.match_score * 100)}%`
              : "N/A";
          lines.push(
            `${idx + 1}. ${proj?.title ?? "Unknown"} (${proj?.lead_funder ?? "Unknown funder"}) — ${score} match`,
          );
        });
      }
      lines.push("");

      lines.push("── GAP ANALYSIS ──");
      const gaps = (gapsRes.data ?? []) as Array<{
        gap_description: string;
        severity: string | null;
        what_closes_it: string | null;
      }>;
      if (gaps.length === 0) {
        lines.push("No gaps identified yet.");
      } else {
        for (const g of gaps) {
          const sev = g.severity ? `[${g.severity.toUpperCase()}]` : "";
          lines.push(
            `${sev} ${g.gap_description}${g.what_closes_it ? ` → Closes with: ${g.what_closes_it}` : ""}`,
          );
        }
      }
      lines.push("");

      lines.push("── DRAFT PITCH ──");
      lines.push(livePitchText ?? "No draft pitch generated yet.");

      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Session document copied to clipboard");
    } catch {
      toast.error("Failed to copy session document");
    } finally {
      setIsCopying(false);
    }
  }, [activePassportId, livePitchText]);

  const emptyMessage = useMemo(
    () => messages.length === 0 && !error,
    [messages.length, error],
  );

  const isPendingToolCall = useMemo(() => {
    if (status !== "ready") return false;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role !== "assistant") return false;
    const lastPart = lastMessage.parts.at(-1);
    if (!lastPart) return false;
    if (!isToolUIPart(lastPart)) return false;
    if (lastPart.state.startsWith("output")) return false;
    return true;
  }, [status, messages]);

  const space = useMemo(() => {
    if (!isLoading || error) return false;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role === "user") return "think";
    const lastPart = lastMessage?.parts.at(-1);
    if (!lastPart) return "think";
    const secondPart = lastMessage?.parts[1];
    if (secondPart?.type === "text" && secondPart.text.length === 0)
      return "think";
    if (lastPart?.type === "step-start") {
      return lastMessage?.parts.length === 1 ? "think" : "space";
    }
    return false;
  }, [isLoading, messages.at(-1)]);

  useEffect(() => {
    appStoreMutate({ currentThreadId: threadId });
    return () => {
      appStoreMutate({ currentThreadId: null });
    };
  }, [threadId]);

  useEffect(() => {
    if (pendingThreadMention && threadId) {
      appStoreMutate((prev) => ({
        threadMentions: {
          ...prev.threadMentions,
          [threadId]: [pendingThreadMention],
        },
        pendingThreadMention: undefined,
      }));
    }
  }, [pendingThreadMention, threadId, appStoreMutate]);

  // StickToBottom handles auto-scroll on initial load

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const messages = latestRef.current.messages;
      if (messages.length === 0) return;
      const isLastMessageCopy = isShortcutEvent(e, Shortcuts.lastMessageCopy);
      if (!isLastMessageCopy) return;
      e.preventDefault();
      e.stopPropagation();
      const lastMessage = messages.at(-1);
      const lastMessageText = lastMessage!.parts
        .filter((part): part is TextUIPart => part.type === "text")
        ?.at(-1)?.text;
      if (!lastMessageText) return;
      navigator.clipboard.writeText(lastMessageText);
      toast.success("Last message copied to clipboard");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex flex-row h-full overflow-hidden">
      {/* ── LEFT PANEL (60%) ─────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col min-w-0 relative transition-all duration-200 print:hidden",
          rightPanelOpen ? "w-[60%]" : "w-full",
        )}
      >
        {/* Slim header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-background/80 backdrop-blur-sm shrink-0 gap-2">
          <div className="flex flex-col min-w-0 flex-1 max-w-[min(100%,280px)] gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Session passport
            </span>
            <Select
              value={activePassportId ?? NO_PASSPORT}
              onValueChange={onPassportChange}
              disabled={bindingPassport}
            >
              <SelectTrigger
                size="sm"
                className="h-7 text-xs w-full border-muted-foreground/25"
              >
                <SelectValue
                  placeholder={
                    passportOptions.length
                      ? "Choose a passport…"
                      : "No passports yet"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PASSPORT}>
                  <span className="text-muted-foreground italic">
                    No passport (session doc empty)
                  </span>
                </SelectItem>
                {passportOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title ?? p.project_name ?? p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            {/* Surface mode buttons */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/chat/${threadId}`}>
                  <Button variant="ghost" size="icon" className="size-7">
                    <MessageSquare className="size-3.5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">Chat only</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-7 bg-primary/10"
                  aria-current="page"
                >
                  <Columns2 className="size-3.5 text-primary" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Split view (active)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/landscape">
                  <Button variant="ghost" size="icon" className="size-7">
                    <Map className="size-3.5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Innovation Landscape
              </TooltipContent>
            </Tooltip>

            {/* Collapse toggle */}
            <div className="w-px h-4 bg-border mx-0.5" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={toggleRightPanel}
                >
                  {rightPanelOpen ? (
                    <ChevronRight className="size-3.5" />
                  ) : (
                    <ChevronLeft className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {rightPanelOpen
                  ? "Collapse session document"
                  : "Open session document"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Chat messages area */}
        {isDragging && (
          <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="rounded-2xl px-6 py-5 bg-background/80 shadow-xl border border-border flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <FilePlus className="size-6" />
              </div>
              <span className="text-sm text-muted-foreground">
                Drop files to upload
              </span>
            </div>
          </div>
        )}

        <div
          className={cn(
            "flex flex-col flex-1 relative overflow-hidden",
            emptyMessage && "justify-center",
          )}
        >
          {emptyMessage ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <p className="text-muted-foreground text-sm max-w-md">
                I&apos;m JARVIS, your strategic intelligence assistant. Upload
                trial evidence to extract structured claims, ask about
                cross-sector funding opportunities, or explore the innovation
                landscape.
              </p>
            </div>
          ) : (
            <Conversation className="flex-1 relative">
              <ConversationContent className="py-6 px-2 [scrollbar-gutter:stable_both-edges]">
                {messages.map((message, index) => {
                  const isLastMessage = messages.length - 1 === index;
                  return (
                    <PreviewMessage
                      threadId={threadId}
                      messageIndex={index}
                      prevMessage={messages[index - 1]}
                      key={message.id}
                      message={message}
                      status={status}
                      addToolResult={addToolResult}
                      isLoading={isLoading || isPendingToolCall}
                      isLastMessage={isLastMessage}
                      setMessages={setMessages}
                      sendMessage={sendMessage}
                      className={
                        isLastMessage &&
                        message.role !== "user" &&
                        !space &&
                        message.parts.length > 1
                          ? "min-h-[calc(55dvh-40px)]"
                          : ""
                      }
                    />
                  );
                })}
                {space && (
                  <>
                    <div className="w-full mx-auto max-w-3xl px-6 relative">
                      <div className={space === "space" ? "opacity-0" : ""}>
                        <Think />
                      </div>
                    </div>
                    <div className="min-h-[calc(55dvh-56px)]" />
                  </>
                )}
                {error && <ErrorMessage error={error} />}
                <div className="min-w-0 min-h-52" />
              </ConversationContent>
              <ConversationScrollButton className="bottom-16" />
            </Conversation>
          )}

          {/* Input */}
          <div className="shrink-0 w-full z-10">
            <PromptInput
              input={input}
              threadId={threadId}
              sendMessage={sendMessage}
              setInput={setInput}
              isLoading={isLoading || isPendingToolCall}
              onStop={stop}
            />
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL (40%) ────────────────────────────────────────────── */}
      <AnimatePresence>
        {rightPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "40%", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="border-l border-border bg-muted/20 flex flex-col overflow-hidden shrink-0"
          >
            <div className="px-3 py-2 border-b border-border/50 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Session Document
                </p>
                {/* Auto / Canvas mode toggle */}
                <div className="flex items-center rounded-md border border-border/50 overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setPanelMode("auto")}
                    className={cn(
                      "px-2 py-0.5 text-[10px] font-medium transition-colors",
                      panelMode === "auto"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanelMode("canvas")}
                    className={cn(
                      "px-2 py-0.5 text-[10px] font-medium transition-colors",
                      panelMode === "canvas"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )}
                  >
                    Canvas
                  </button>
                </div>
              </div>
              {activePassportId && panelMode === "auto" && (
                <Link
                  href={`/passport/${activePassportId}`}
                  className="text-[10px] text-primary hover:underline"
                >
                  Open full passport →
                </Link>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {panelMode === "canvas" ? (
                <div className="flex h-full min-h-[200px] items-center justify-center p-8">
                  <div className="max-w-xs rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
                    <p className="text-sm font-medium text-foreground/80 mb-2">
                      Canvas coming soon
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      You'll be able to pin elements from the chat here —
                      claims, matches, pitch paragraphs — and arrange them into
                      your own layout.
                    </p>
                  </div>
                </div>
              ) : (
                <SessionDocument
                  passportId={activePassportId}
                  pitchText={livePitchText}
                />
              )}
            </div>

            {/* ── Export bar ────────────────────────────────────────────── */}
            <div className="border-t border-border/50 px-3.5 py-2.5 flex items-center gap-2 shrink-0 bg-background/80 backdrop-blur-sm">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs gap-1.5"
                onClick={handleCopySessionDoc}
                disabled={!activePassportId || isCopying}
              >
                {isCopying ? (
                  <LoaderCircle className="size-3 animate-spin" />
                ) : (
                  <Clipboard className="size-3" />
                )}
                Copy session doc
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs gap-1.5"
                onClick={() => window.print()}
              >
                <Printer className="size-3" />
                Export PDF
              </Button>
              {activePassportId && (
                <Link
                  href={`/passport/${activePassportId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs gap-1.5"
                  >
                    <ExternalLink className="size-3" />
                    Open passport →
                  </Button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
