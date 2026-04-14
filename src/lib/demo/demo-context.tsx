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

import { sendDemoMessage } from "@/lib/demo/demo-chat-bridge";
import { type DemoStep, demoTotalDurationMs } from "@/lib/demo/demo-runner";

type DemoContextValue = {
  isActive: boolean;
  currentScript: DemoStep[] | null;
  currentStep: number;
  narrationText: string;
  progress: number;
  waitingForContinue: boolean;
  startDemo: (script: DemoStep[]) => void;
  stopDemo: () => void;
  acknowledgePause: () => void;
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

  const [isActive, setIsActive] = useState(false);
  const [currentScript, setCurrentScript] = useState<DemoStep[] | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [narrationText, setNarrationText] = useState("");
  const [progress, setProgress] = useState(0);
  const [waitingForContinue, setWaitingForContinue] = useState(false);

  const delay = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }, []);

  const stopDemo = useCallback(() => {
    runEpochRef.current += 1;
    pauseResumeRef.current?.();
    pauseResumeRef.current = null;
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

  const executeStep = useCallback(
    async (step: DemoStep) => {
      switch (step.type) {
        case "narrate":
          setNarrationText(step.content);
          break;
        case "message":
          sendDemoMessage(step.content);
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
    [router],
  );

  const startDemo = useCallback(
    (script: DemoStep[]) => {
      stopDemo();
      const myEpoch = runEpochRef.current;
      setCurrentScript(script);
      setIsActive(true);
      setCurrentStep(0);
      setNarrationText("");
      setProgress(0);

      const totalMs = demoTotalDurationMs(script);

      void (async () => {
        for (let i = 0; i < script.length; i++) {
          if (runEpochRef.current !== myEpoch) return;
          const step = script[i]!;
          await delay(step.delay);
          if (runEpochRef.current !== myEpoch) return;
          setCurrentStep(i);
          await executeStep(step);
          if (runEpochRef.current !== myEpoch) return;
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
      })();
    },
    [delay, executeStep, stopDemo],
  );

  const value = useMemo(
    () => ({
      isActive,
      currentScript,
      currentStep,
      narrationText,
      progress,
      waitingForContinue,
      startDemo,
      stopDemo,
      acknowledgePause,
    }),
    [
      isActive,
      currentScript,
      currentStep,
      narrationText,
      progress,
      waitingForContinue,
      startDemo,
      stopDemo,
      acknowledgePause,
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
