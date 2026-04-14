/**
 * When the demo runner is waiting for JARVIS to finish a turn, ChatBot arms
 * this bridge; on `status === "ready"` after streaming it resolves so
 * `on_response` / `hybrid` can advance.
 */

let armed = false;

export function armDemoAssistantReadyGate(): void {
  armed = true;
}

export function disarmDemoAssistantReadyGate(): void {
  armed = false;
}

export function signalDemoAssistantReadyIfArmed(): void {
  if (!armed) return;
  armed = false;
  window.dispatchEvent(new CustomEvent("demo:assistant-ready"));
}

export function waitForDemoAssistantReadyEvent(
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onReady = () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      window.removeEventListener("demo:assistant-ready", onReady);
      reject(new DOMException("Aborted", "AbortError"));
    };
    window.addEventListener("demo:assistant-ready", onReady, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
