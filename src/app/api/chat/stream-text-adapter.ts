import { streamText } from "ai";

type StreamTextParams = Parameters<typeof streamText>[0];
type StreamTextReturn = ReturnType<typeof streamText>;

/**
 * Indirection for /api/chat. Vitest smoke sets
 * `globalThis.__ATLAS_CHAT_STREAM_TEXT_OVERRIDE` to inject a mock model without
 * `vi.mock` path quirks.
 */
export function chatStreamText(opts: StreamTextParams): StreamTextReturn {
  const override = (
    globalThis as {
      __ATLAS_CHAT_STREAM_TEXT_OVERRIDE?: (
        o: StreamTextParams,
      ) => StreamTextReturn;
    }
  ).__ATLAS_CHAT_STREAM_TEXT_OVERRIDE;
  if (typeof override === "function") {
    return override(opts);
  }
  return streamText(opts);
}
