/** How the runner advances after each step (especially around JARVIS). */
export type DemoAdvanceMode = "timer" | "on_response" | "hybrid";

/** How narration is delivered (text bar always shows copy). */
export type DemoNarrationMode = "text" | "web_speech" | "openai_tts";

export type DemoRunOptions = {
  advanceMode: DemoAdvanceMode;
  narrationMode: DemoNarrationMode;
  /** When true (default), the first chat thread after start pins the JARVIS agent mention. */
  forceJarvis: boolean;
  /** Used with `hybrid`: max ms to wait for JARVIS after a `message` step. */
  hybridAssistantMaxMs: number;
  /** Used with `on_response` / safety inside `hybrid`: max ms to wait for assistant. */
  assistantSafetyMaxMs: number;
};

export const DEFAULT_DEMO_OPTIONS: DemoRunOptions = {
  advanceMode: "timer",
  narrationMode: "text",
  forceJarvis: true,
  hybridAssistantMaxMs: 120_000,
  assistantSafetyMaxMs: 180_000,
};

export const DEMO_ADVANCE_MODE_LABELS: Record<
  DemoAdvanceMode,
  { title: string; description: string }
> = {
  timer: {
    title: "Timer only",
    description:
      "Original behaviour: fixed delays from the script (good for rehearsed pacing).",
  },
  on_response: {
    title: "After JARVIS responds",
    description:
      "After each injected message, wait until the assistant stream finishes (ignores that step’s script delay for the wait).",
  },
  hybrid: {
    title: "Hybrid (response or cap)",
    description:
      "After each message, continue as soon as JARVIS is ready or when the cap is reached — whichever comes first.",
  },
};

export const DEMO_NARRATION_MODE_LABELS: Record<
  DemoNarrationMode,
  { title: string; description: string }
> = {
  text: {
    title: "Text only",
    description: "Narration in the bottom bar only (no audio).",
  },
  web_speech: {
    title: "Browser speak",
    description:
      "Uses the device Web Speech API to read narration lines (free, quick to try).",
  },
  openai_tts: {
    title: "OpenAI TTS",
    description:
      "Server-side OpenAI speech for narration (skips to the next clip when the line changes, or use Skip in the bar).",
  },
};

export function mergeDemoOptions(
  partial?: Partial<DemoRunOptions>,
): DemoRunOptions {
  return { ...DEFAULT_DEMO_OPTIONS, ...partial };
}
