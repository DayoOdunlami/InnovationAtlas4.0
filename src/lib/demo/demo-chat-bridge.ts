export type DemoChatSendFn = (text: string) => void;

let sendDemoMessageImpl: DemoChatSendFn | null = null;

/** Called from ChatBot mount — only active chat surface should register. */
export function registerDemoChatSender(fn: DemoChatSendFn | null): void {
  sendDemoMessageImpl = fn;
}

/** Invoked by the demo runner; no-ops when no chat is mounted. */
export function sendDemoMessage(text: string): void {
  sendDemoMessageImpl?.(text);
}
