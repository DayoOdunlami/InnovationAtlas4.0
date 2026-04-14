"use client";

import { useRouter } from "next/navigation";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  armDemoAssistantReadyGate,
  disarmDemoAssistantReadyGate,
  waitForDemoAssistantReadyEvent,
} from "@/lib/demo/demo-assistant-bridge";
import { sendDemoMessage } from "@/lib/demo/demo-chat-bridge";
import {
  armDemoJarvisForChat,
  disarmDemoJarvisForChat,
} from "@/lib/demo/demo-jarvis-bridge";
import {
  DEFAULT_DEMO_OPTIONS,
  type DemoRunOptions,
  mergeDemoOptions,
} from "@/lib/demo/demo-options";
import { type DemoStep, demoTotalDurationMs } from "@/lib/demo/demo-runner";

type DemoContextValue = {
  isActive: boolean;
  currentScript: DemoStep[] | null;
  currentStep: number;
  narrationText: string;
  progress: number;
  /** Script `pause` step — click bar to continue. */
  waitingForContinue: boolean;
  runOptions: DemoRunOptions;
  startDemo: (script: DemoStep[], options?: Partial<DemoRunOptions>) => void;
  stopDemo: () => void;
  acknowledgePause: () => void;
  /** Ends the current script delay or assistant wait so the runner moves on. */
  requestDemoSkip: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

function cumulativeDelayThrough(script: DemoStep[], lastIndex: number): number {
  let sum = 0;
  for (let j = 0; j <= lastIndex && j < script.length; j++) {
    sum += script[j]!.delay;
  }
  return sum;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const runEpochRef = useRef(0);
  const pauseResumeRef = useRef<(() => void) | null>(null);
  const runOptionsRef = useRef<DemoRunOptions>(DEFAULT_DEMO_OPTIONS);
  const abortAssistantWaitRef = useRef<AbortController | null>(null);
  /** Resolves the active skippable wait (step delay or assistant wait). */
  const skipWaitRef = useRef<(() => void) | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [currentScript, setCurrentScript] = useState<DemoStep[] | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [narrationText, setNarrationText] = useState("");
  const [progress, setProgress] = useState(0);
  const [waitingForContinue, setWaitingForContinue] = useState(false);
  const [runOptions, setRunOptions] =
    useState<DemoRunOptions>(DEFAULT_DEMO_OPTIONS);

  const requestDemoSkip = useCallback(() => {
    skipWaitRef.current?.();
  }, []);

  const waitSkippableDelay = useCallback((ms: number, myEpoch: number) => {
    return new Promise<void>((resolve) => {
      if (runEpochRef.current !== myEpoch) {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        skipWaitRef.current = null;
        resolve();
      };
      const timer = setTimeout(finish, ms);
      skipWaitRef.current = () => {
        if (done) return;
        clearTimeout(timer);
        finish();
      };
    });
  }, []);

  const stopDemo = useCallback(() => {
    runEpochRef.current += 1;
    pauseResumeRef.current?.();
    pauseResumeRef.current = null;
    skipWaitRef.current?.();
    skipWaitRef.current = null;
    abortAssistantWaitRef.current?.abort();
    abortAssistantWaitRef.current = null;
    disarmDemoAssistantReadyGate();
    disarmDemoJarvisForChat();
    setIsActive(false);
    setCurrentScript(null);
    setCurrentStep(0);
    setNarrationText("");
    setProgress(0);
    setWaitingForContinue(false);
  }, []);

  const acknowledgePause = useCallback(() => {
    if (!waitingForContinue) return;
    pauseResumeRef.current?.();
    pauseResumeRef.current = null;
    setWaitingForContinue(false);
  }, [waitingForContinue]);

  const waitAfterMessageForAssistant = useCallback(
    async (opts: DemoRunOptions, myEpoch: number) => {
      if (runEpochRef.current !== myEpoch) {
        disarmDemoAssistantReadyGate();
        return;
      }

      abortAssistantWaitRef.current?.abort();
      const ac = new AbortController();
      abortAssistantWaitRef.current = ac;

      const capMs =
        opts.advanceMode === "hybrid"
          ? opts.hybridAssistantMaxMs
          : opts.assistantSafetyMaxMs;

      const assistantPromise = waitForDemoAssistantReadyEvent(ac.signal).catch(
        () => undefined,
      );

      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          skipWaitRef.current = null;
          ac.abort();
          resolve();
        };
        const timer = setTimeout(finish, capMs);
        void assistantPromise.then(finish);
        skipWaitRef.current = () => {
          if (done) return;
          clearTimeout(timer);
          finish();
        };
      });

      disarmDemoAssistantReadyGate();
    },
    [],
  );

  const executeStep = useCallback(
    async (step: DemoStep, opts: DemoRunOptions, myEpoch: number) => {
      switch (step.type) {
        case "narrate":
          setNarrationText(step.content);
          break;
        case "message":
          if (
            opts.advanceMode === "on_response" ||
            opts.advanceMode === "hybrid"
          ) {
            armDemoAssistantReadyGate();
          }
          sendDemoMessage(step.content);
          if (runEpochRef.current !== myEpoch) return;
          if (
            opts.advanceMode === "on_response" ||
            opts.advanceMode === "hybrid"
          ) {
            await waitAfterMessageForAssistant(opts, myEpoch);
          }
          break;
        case "navigate":
          router.push(step.content);
          break;
        case "highlight":
          window.dispatchEvent(
            new CustomEvent("demo:highlight", {
              detail: { theme: step.content },
            }),
          );
          break;
        case "zoom":
          window.dispatchEvent(
            new CustomEvent("demo:zoom", {
              detail: { nodeId: step.content },
            }),
          );
          break;
        case "pause":
          setNarrationText("Click to continue →");
          setWaitingForContinue(true);
          await new Promise<void>((resolve) => {
            pauseResumeRef.current = resolve;
          });
          break;
        default:
          break;
      }
    },
    [router, waitAfterMessageForAssistant],
  );

  const startDemo = useCallback(
    (script: DemoStep[], partial?: Partial<DemoRunOptions>) => {
      stopDemo();
      const opts = mergeDemoOptions(partial);
      runOptionsRef.current = opts;
      setRunOptions(opts);

      if (opts.forceJarvis) {
        armDemoJarvisForChat();
      }

      const myEpoch = runEpochRef.current;
      setCurrentScript(script);
      setIsActive(true);
      setCurrentStep(0);
      setNarrationText("");
      setProgress(0);

      const totalMs = demoTotalDurationMs(script);

      void (async () => {
        let skipNextScriptDelay = false;

        for (let i = 0; i < script.length; i++) {
          if (runEpochRef.current !== myEpoch) return;
          const step = script[i]!;

          if (!skipNextScriptDelay) {
            await waitSkippableDelay(step.delay, myEpoch);
          } else {
            skipNextScriptDelay = false;
          }
          if (runEpochRef.current !== myEpoch) return;

          setCurrentStep(i);
          await executeStep(step, opts, myEpoch);
          if (runEpochRef.current !== myEpoch) return;

          if (
            step.type === "message" &&
            (opts.advanceMode === "on_response" ||
              opts.advanceMode === "hybrid")
          ) {
            skipNextScriptDelay = true;
          }

          if (totalMs > 0) {
            setProgress(
              Math.min(1, cumulativeDelayThrough(script, i) / totalMs),
            );
          }
        }
        if (runEpochRef.current !== myEpoch) return;
        setProgress(1);
        setIsActive(false);
        setCurrentScript(null);
        setNarrationText("");
        disarmDemoAssistantReadyGate();
        disarmDemoJarvisForChat();
      })();
    },
    [executeStep, stopDemo, waitSkippableDelay],
  );

  const value = useMemo(
    () => ({
      isActive,
      currentScript,
      currentStep,
      narrationText,
      progress,
      waitingForContinue,
      runOptions,
      startDemo,
      stopDemo,
      acknowledgePause,
      requestDemoSkip,
    }),
    [
      isActive,
      currentScript,
      currentStep,
      narrationText,
      progress,
      waitingForContinue,
      runOptions,
      startDemo,
      stopDemo,
      acknowledgePause,
      requestDemoSkip,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    throw new Error("useDemo must be used within DemoProvider");
  }
  return ctx;
}
