export const OPENAI_REALTIME_URL =
  "https://api.openai.com/v1/realtime/sessions";

/**
 * WebRTC SDP POST with ephemeral secret from {@link OPENAI_REALTIME_URL}.
 * Must stay on `/v1/realtime` while sessions are minted via `/v1/realtime/sessions`
 * (beta secret). `/v1/realtime/calls` is the GA path and requires a GA client secret
 * (e.g. `/v1/realtime/client_secrets`) — mixing GA + beta causes `api_version_mismatch`.
 */
export const OPENAI_REALTIME_WEBRTC_SDP_URL =
  "https://api.openai.com/v1/realtime";

export type OpenAIRealtimeSession = {
  id: string;
  object: string;
  model: string;
  modalities: string[];
  instructions: string;
  voice: string;
  input_audio_format: string;
  output_audio_format: string;
  input_audio_transcription: {
    model: string;
  };
  tools: any[];
  tool_choice: string;
  temperature: number;
  max_response_output_tokens: number;
  client_secret: {
    value: string;
    expires_at: number;
  };
  [key: string]: any;
};

export type OpenAIRealtimeClientEvent =
  | {
      type: "session.update";
      session: Partial<OpenAIRealtimeSession> & {
        turn_detection?: {
          type?: "server_vad" | "semantic_vad";
          eagerness?: "low" | "medium" | "high" | "auto";
          interrupt_response?: boolean;
          create_response?: boolean;
          threshold?: number;
          prefix_padding_ms?: number;
          silence_duration_ms?: number;
        };
        input_audio_noise_reduction?: {
          type?: "near_field" | "far_field";
        };
      };
    }
  | {
      type: "response.cancel";
    }
  | {
      type: "conversation.item.create";
      previous_item_id?: string;
      item: {
        id: string;
        type: string;
        role: string;
        content: [
          {
            type: string;
            text: string;
          },
        ];
      };
    };

export type OpenAIRealtimeServerEvent =
  | {
      type:
        | "input_audio_buffer.speech_started"
        | "input_audio_buffer.speech_stopped"
        | "input_audio_buffer.committed"
        | "output_audio_buffer.stopped";
      event_id: string;
      item_id: string;
    }
  | {
      type: "conversation.item.input_audio_transcription.completed";
      event_id: string;
      item_id: string;
      content_index: number;
      transcript?: string;
    }
  | {
      type: "conversation.item.input_audio_transcription.delta";
      event_id: string;
      item_id: string;
      content_index: number;
      delta: string;
    }
  | {
      type: "response.audio_transcript.delta";
      event_id: string;
      response_id: string;
      item_id: string;
      output_index: number;
      content_index: number;
      delta: string;
    }
  | {
      type: "response.audio_transcript.done";
      event_id: string;
      response_id: string;
      item_id: string;
      output_index: number;
      content_index: number;
      transcript: string;
    }
  | {
      type: "response.audio.done";
      event_id: string;
      response_id: string;
      item_id: string;
      output_index: number;
      content_index: number;
    }
  | {
      type: "response.function_call_arguments.done";
      event_id: string;
      response_id: string;
      item_id: string;
      output_index: number;
      name: string;
      call_id: string;
      arguments: string;
    }
  | {
      type: "session.updated";
      event_id: string;
      session: Partial<OpenAIRealtimeSession> & {
        turn_detection?: Record<string, unknown>;
        input_audio_noise_reduction?: Record<string, unknown>;
      };
    }
  | {
      type: "response.cancelled";
      event_id: string;
      response_id?: string;
    }
  | {
      type: "error";
      event_id: string;
      error: {
        type?: string;
        code?: string;
        message?: string;
        param?: string | null;
      };
    };
