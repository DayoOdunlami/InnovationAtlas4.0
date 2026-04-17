"use client";

import { TextPart, ToolUIPart } from "ai";
import { generateUUID } from "lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_VOICE_TOOLS,
  UIMessageWithCompleted,
  VoiceChatOptions,
  VoiceChatSession,
} from "..";
import {
  OPENAI_REALTIME_WEBRTC_SDP_URL,
  OpenAIRealtimeServerEvent,
  OpenAIRealtimeSession,
} from "./openai-realtime-event";

import { executeVoiceDefaultToolAction } from "@/app/actions/execute-voice-default-tool";
import { callMcpToolByServerNameAction } from "@/app/api/mcp/actions";
import { appStore } from "@/app/store";
import { extractMCPToolId } from "lib/ai/mcp/mcp-tool-id";
import { voiceDefaultToolNamesAllowlist } from "lib/ai/speech/voice-default-tools";
import { useTheme } from "next-themes";

export const OPENAI_VOICE = {
  Alloy: "alloy",
  Ballad: "ballad",
  Sage: "sage",
  Shimmer: "shimmer",
  Verse: "verse",
  Echo: "echo",
  Coral: "coral",
  Ash: "ash",
};

type Content =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "tool-invocation";
      name: string;
      arguments: any;
      state: "call" | "result";
      toolCallId: string;
      result?: any;
    };

const createUIPart = (content: Content): TextPart | ToolUIPart => {
  if (content.type == "tool-invocation") {
    const part: ToolUIPart = {
      type: `tool-${content.name}`,
      input: content.arguments,
      state: "output-available",
      toolCallId: content.toolCallId,
      output: content.result,
    };
    return part;
  }
  return {
    type: "text",
    text: content.text,
  };
};

const createUIMessage = (m: {
  id?: string;
  role: "user" | "assistant";
  content: Content;
  completed?: boolean;
}): UIMessageWithCompleted => {
  const id = m.id ?? generateUUID();
  return {
    id,
    role: m.role,
    parts: [createUIPart(m.content)],
    completed: m.completed ?? false,
  };
};

export function useOpenAIVoiceChat(props?: VoiceChatOptions): VoiceChatSession {
  const { model = "gpt-4o-realtime-preview", voice = OPENAI_VOICE.Ash } =
    props || {};

  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<UIMessageWithCompleted[]>([]);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const audioStream = useRef<MediaStream | null>(null);

  const { setTheme } = useTheme();
  const tracks = useRef<RTCRtpSender[]>([]);
  /** True after we send `response.create` until the model finishes that response. */
  const realtimeResponseInFlightRef = useRef(false);

  const startListening = useCallback(async () => {
    try {
      if (!audioStream.current) {
        audioStream.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }
      if (tracks.current.length) {
        const micTrack = audioStream.current.getAudioTracks()[0];
        tracks.current.forEach((sender) => {
          sender.replaceTrack(micTrack);
        });
      }
      setIsListening(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const stopListening = useCallback(async () => {
    try {
      if (audioStream.current) {
        audioStream.current.getTracks().forEach((track) => track.stop());
        audioStream.current = null;
      }
      if (tracks.current.length) {
        const placeholderTrack = createEmptyAudioTrack();
        tracks.current.forEach((sender) => {
          sender.replaceTrack(placeholderTrack);
        });
      }
      setIsListening(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const createSession =
    useCallback(async (): Promise<OpenAIRealtimeSession> => {
      const response = await fetch(
        `/api/chat/openai-realtime?model=${model}&voice=${voice}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            voice,
            agentId: props?.agentId,
            mentions: props?.toolMentions ?? [],
            allowedMcpServers: props?.allowedMcpServers,
          }),
        },
      );
      if (response.status !== 200) {
        throw new Error(await response.text());
      }
      const session = await response.json();
      if (session.error) {
        throw new Error(session.error.message);
      }

      return session;
    }, [
      model,
      voice,
      props?.toolMentions,
      props?.agentId,
      props?.allowedMcpServers,
    ]);

  const updateUIMessage = useCallback(
    (
      id: string,
      action:
        | Partial<UIMessageWithCompleted>
        | ((
            message: UIMessageWithCompleted,
          ) => Partial<UIMessageWithCompleted>),
    ) => {
      setMessages((prev) => {
        if (prev.length) {
          const lastMessage = prev.find((m) => m.id == id);
          if (!lastMessage) return prev;
          const nextMessage =
            typeof action === "function" ? action(lastMessage) : action;
          if (lastMessage == nextMessage) return prev;
          return prev.map((m) => (m.id == id ? { ...m, ...nextMessage } : m));
        }
        return prev;
      });
    },
    [],
  );

  const clientFunctionCall = useCallback(
    async ({
      callId,
      toolName,
      args,
      id,
    }: { callId: string; toolName: string; args: string; id: string }) => {
      let payloadForRealtime: unknown = "success";
      let payloadForUi: unknown = "success";
      // NOTE: We intentionally do NOT call stopListening() here. Disabling the
      // mic during tool calls (a) breaks barge-in, and (b) creates
      // `conversation_already_has_active_response` errors when the user
      // speaks again before the in-flight response resolves. The mic stays
      // hot; barge-in is handled via `response.cancel` on
      // `input_audio_buffer.speech_started` below.
      const toolArgs = JSON.parse(args);
      if (DEFAULT_VOICE_TOOLS.some((t) => t.name === toolName)) {
        switch (toolName) {
          case "changeBrowserTheme":
            setTheme(toolArgs?.theme);
            break;
          case "endConversation":
            await stop();
            setError(null);
            setMessages([]);
            appStore.setState((prev) => ({
              voiceChat: {
                ...prev.voiceChat,
                agentId: undefined,
                isOpen: false,
              },
            }));
            break;
        }
      } else if (voiceDefaultToolNamesAllowlist.has(toolName)) {
        const { cardPayload, realtimePayload } =
          await executeVoiceDefaultToolAction(toolName, toolArgs);
        payloadForRealtime = realtimePayload;
        payloadForUi = cardPayload;
      } else {
        const toolId = extractMCPToolId(toolName);

        const mcpResult = await callMcpToolByServerNameAction(
          toolId.serverName,
          toolId.toolName,
          toolArgs,
        );
        payloadForRealtime = mcpResult;
        payloadForUi = mcpResult;
      }
      // NOTE: No startListening() here — see the matching note above where
      // stopListening() was removed. The mic is never cut during tool calls.
      const resultText = JSON.stringify(payloadForRealtime).trim();

      const event = {
        type: "conversation.item.create",
        previous_item_id: id,
        item: {
          type: "function_call_output",
          call_id: callId,
          output: resultText.slice(0, 15000),
        },
      };
      updateUIMessage(id, (prev) => {
        const prevPart = prev.parts.find((p) => p.type == `tool-${toolName}`);
        if (!prevPart) return prev;
        const part: ToolUIPart = {
          state: "output-available",
          output: payloadForUi,
          toolCallId: callId,
          input: toolArgs,
          type: `tool-${toolName}`,
        };
        return {
          parts: [part],
        };
      });
      dataChannel.current?.send(JSON.stringify(event));

      const dc = dataChannel.current;
      if (dc && dc.readyState === "open") {
        if (realtimeResponseInFlightRef.current) {
          if (process.env.NODE_ENV === "development") {
            console.debug(
              "[voice] skip response.create — assistant response still in flight",
            );
          }
        } else {
          realtimeResponseInFlightRef.current = true;
          dc.send(JSON.stringify({ type: "response.create" }));
        }
      }
    },
    [updateUIMessage],
  );

  const handleServerEvent = useCallback(
    (event: OpenAIRealtimeServerEvent) => {
      switch (event.type) {
        case "input_audio_buffer.speech_started": {
          // Barge-in: if the model is currently speaking (response still in
          // flight) and the user starts talking, cancel the active response
          // immediately so we don't talk over them. The server responds with
          // `response.cancelled` which we handle below to clear the flag.
          if (
            realtimeResponseInFlightRef.current &&
            dataChannel.current?.readyState === "open"
          ) {
            if (process.env.NODE_ENV === "development") {
              console.debug(
                "[voice] barge-in detected — sending response.cancel",
              );
            }
            dataChannel.current.send(
              JSON.stringify({ type: "response.cancel" }),
            );
          }
          const message = createUIMessage({
            role: "user",
            id: event.item_id,
            content: {
              type: "text",
              text: "",
            },
          });
          setIsUserSpeaking(true);
          setMessages((prev) => [...prev, message]);
          break;
        }
        case "response.cancelled": {
          realtimeResponseInFlightRef.current = false;
          setIsAssistantSpeaking(false);
          break;
        }
        case "session.updated": {
          if (process.env.NODE_ENV === "development") {
            console.debug(
              "[voice] session.updated confirmed by server",
              event.session?.turn_detection,
            );
          }
          break;
        }
        case "input_audio_buffer.committed": {
          updateUIMessage(event.item_id, {
            parts: [
              {
                type: "text",
                text: "",
              },
            ],
            completed: true,
          });
          break;
        }
        case "conversation.item.input_audio_transcription.completed": {
          updateUIMessage(event.item_id, {
            parts: [
              {
                type: "text",
                text: event.transcript || "...speaking",
              },
            ],
            completed: true,
          });
          break;
        }
        case "response.audio_transcript.delta": {
          setIsAssistantSpeaking(true);
          setMessages((prev) => {
            const message = prev.findLast((m) => m.id == event.item_id)!;
            if (message) {
              return prev.map((m) =>
                m.id == event.item_id
                  ? {
                      ...m,
                      parts: [
                        {
                          type: "text",
                          text:
                            (message.parts[0] as TextPart).text! + event.delta,
                        },
                      ],
                    }
                  : m,
              );
            }
            return [
              ...prev,
              createUIMessage({
                role: "assistant",
                id: event.item_id,
                content: {
                  type: "text",
                  text: event.delta,
                },
                completed: true,
              }),
            ];
          });
          break;
        }
        case "response.audio_transcript.done": {
          updateUIMessage(event.item_id, (prev) => {
            const textPart = prev.parts.find((p) => p.type == "text");
            if (!textPart) return prev;
            (textPart as TextPart).text = event.transcript || "";
            return {
              ...prev,
              completed: true,
            };
          });
          break;
        }
        case "response.function_call_arguments.done": {
          const message = createUIMessage({
            role: "assistant",
            id: event.item_id,
            content: {
              type: "tool-invocation",
              name: event.name,
              arguments: JSON.parse(event.arguments),
              state: "call",
              toolCallId: event.call_id,
            },
            completed: true,
          });
          setMessages((prev) => [...prev, message]);
          clientFunctionCall({
            callId: event.call_id,
            toolName: event.name,
            args: event.arguments,
            id: event.item_id,
          });
          break;
        }
        case "input_audio_buffer.speech_stopped": {
          setIsUserSpeaking(false);
          break;
        }
        case "output_audio_buffer.stopped": {
          setIsAssistantSpeaking(false);
          break;
        }
        case "error": {
          const detail = event.error;
          const msg = [detail?.message, detail?.code && `(${detail.code})`]
            .filter(Boolean)
            .join(" ");
          console.error("[realtime-dc] error", detail ?? event);
          if (
            detail?.code === "conversation_already_has_active_response" ||
            detail?.message?.includes(
              "conversation_already_has_active_response",
            )
          ) {
            realtimeResponseInFlightRef.current = false;
          }
          setError(
            new Error(
              msg.trim() || "OpenAI Realtime reported an error on the session.",
            ),
          );
          break;
        }
        default: {
          const t = (event as { type?: string }).type;
          if (t === "response.done" || t === "response.completed") {
            realtimeResponseInFlightRef.current = false;
          }
          break;
        }
      }
    },
    [clientFunctionCall, updateUIMessage],
  );

  const start = useCallback(async () => {
    if (isActive || isLoading) return;
    setIsLoading(true);
    setError(null);
    setMessages([]);
    realtimeResponseInFlightRef.current = false;
    try {
      const session = await createSession();
      const sessionToken = session.client_secret.value;
      const pc = new RTCPeerConnection();
      if (!audioElement.current) {
        audioElement.current = document.createElement("audio");
      }
      audioElement.current.autoplay = true;
      pc.ontrack = (e) => {
        if (audioElement.current) {
          audioElement.current.srcObject = e.streams[0];
        }
      };
      if (!audioStream.current) {
        audioStream.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }
      tracks.current = [];
      audioStream.current.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, audioStream.current!);
        if (sender) tracks.current.push(sender);
      });

      const dc = pc.createDataChannel("oai-events");
      dataChannel.current = dc;
      dc.addEventListener("message", async (e) => {
        try {
          const event = JSON.parse(e.data) as OpenAIRealtimeServerEvent;
          if (process.env.NODE_ENV === "development") {
            const eventType = event.type ?? "unknown";
            if (eventType.includes("delta") || eventType.includes("partial")) {
              console.debug("[realtime-dc]", eventType);
            } else {
              console.debug("[realtime-dc]", event);
            }
          }
          handleServerEvent(event);
        } catch (err) {
          console.error({
            data: e.data,
            error: err,
          });
        }
      });
      dc.addEventListener("open", () => {
        // Configure VAD + noise reduction as soon as the data channel is up.
        // `semantic_vad` with `eagerness: "low"` drastically reduces mid-
        // sentence cut-offs compared to the default `server_vad`. Noise
        // reduction cleans up near-field mic audio. Set
        // `NEXT_PUBLIC_VOICE_VAD_MODE=server_vad` to roll back instantly.
        const vadMode =
          process.env.NEXT_PUBLIC_VOICE_VAD_MODE === "server_vad"
            ? "server_vad"
            : "semantic_vad";
        try {
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                turn_detection: {
                  type: vadMode,
                  ...(vadMode === "semantic_vad"
                    ? { eagerness: "low", interrupt_response: true }
                    : { create_response: true, interrupt_response: true }),
                },
                input_audio_noise_reduction: { type: "near_field" },
              },
            }),
          );
          if (process.env.NODE_ENV === "development") {
            console.debug(
              `[voice] session.update sent (turn_detection=${vadMode})`,
            );
          }
        } catch (err) {
          console.error("[voice] failed to send session.update", err);
        }
        setIsActive(true);
        setIsListening(true);
        setIsLoading(false);
        const greeting = props?.connectedGreeting?.trim();
        if (greeting) {
          setMessages((prev) => [
            ...prev,
            createUIMessage({
              role: "assistant",
              content: { type: "text", text: greeting },
              completed: true,
            }),
          ]);
        }
      });
      dc.addEventListener("close", () => {
        setIsActive(false);
        setIsListening(false);
        setIsLoading(false);
      });
      dc.addEventListener("error", (errorEvent) => {
        console.error(errorEvent);
        setError(
          errorEvent instanceof Error
            ? errorEvent
            : new Error(String(errorEvent)),
        );
        setIsActive(false);
        setIsListening(false);
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch(OPENAI_REALTIME_WEBRTC_SDP_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/sdp",
        },
      });
      const answerSdp = await sdpResponse.text();
      if (!sdpResponse.ok) {
        throw new Error(
          answerSdp ||
            `OpenAI Realtime SDP failed with HTTP ${sdpResponse.status}`,
        );
      }
      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: answerSdp,
      };
      await pc.setRemoteDescription(answer);
      peerConnection.current = pc;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsActive(false);
      setIsListening(false);
      setIsLoading(false);
    }
  }, [
    isActive,
    isLoading,
    createSession,
    handleServerEvent,
    voice,
    props?.connectedGreeting,
  ]);

  const stop = useCallback(async () => {
    try {
      if (dataChannel.current) {
        dataChannel.current.close();
        dataChannel.current = null;
      }
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
      tracks.current = [];
      stopListening();
      realtimeResponseInFlightRef.current = false;
      setIsActive(false);
      setIsListening(false);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [stopListening]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  function createEmptyAudioTrack(): MediaStreamTrack {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    return destination.stream.getAudioTracks()[0];
  }

  return {
    isActive,
    isUserSpeaking,
    isAssistantSpeaking,
    isListening,
    isLoading,
    error,
    messages,
    start,
    stop,
    startListening,
    stopListening,
  };
}
