export type DemoStepType =
  | "message"
  | "navigate"
  | "narrate"
  | "highlight"
  | "zoom"
  | "pause";

export type DemoStep = {
  /** ms after previous step fires (cumulative scheduling) */
  delay: number;
  type: DemoStepType;
  /** text, route, theme name, or nodeId */
  content: string;
};

export const SARAH_DEMO: DemoStep[] = [
  { delay: 0, type: "navigate", content: "/chat" },
  {
    delay: 600,
    type: "narrate",
    content:
      "Sarah has trial evidence from a GPS-denied autonomous navigation system tested in rail tunnels.",
  },
  {
    delay: 2500,
    type: "message",
    content:
      "I have evidence from a GPS-denied UAS navigation trial in rail tunnels. The system achieved 94.7% accuracy over 847 flight hours with NRIL HAZOP approval. Extract the key claims.",
  },
  {
    delay: 4000,
    type: "narrate",
    content:
      "JARVIS extracts structured claims — each with a confidence tier and scope conditions...",
  },
  {
    delay: 20000,
    type: "narrate",
    content:
      "Claims extracted and saved. Now running cross-sector matching against 622 funded projects...",
  },
  {
    delay: 22000,
    type: "message",
    content:
      "Run matching for my GPS-Denied Rail UAS passport against the full corpus",
  },
  {
    delay: 24000,
    type: "narrate",
    content:
      "Semantic matching surfaces opportunities Sarah would never find through keyword search...",
  },
  {
    delay: 40000,
    type: "narrate",
    content:
      "Top match: InDePTH Ports — autonomous inspection in GPS-contested port environments. 82% similarity.",
  },
  {
    delay: 42000,
    type: "message",
    content: "Show me the gap analysis for the InDePTH Ports match",
  },
  {
    delay: 44000,
    type: "narrate",
    content:
      "JARVIS identifies missing evidence, conditions mismatches, and the economic value of closing each gap...",
  },
  {
    delay: 60000,
    type: "message",
    content: "Draft a pitch for the InDePTH Ports match",
  },
  {
    delay: 62000,
    type: "narrate",
    content: "A three-paragraph Statement of Intent — ready to copy and send.",
  },
];

export const LANDSCAPE_DEMO: DemoStep[] = [
  { delay: 0, type: "navigate", content: "/landscape" },
  {
    delay: 1000,
    type: "narrate",
    content:
      "622 UK-funded transport innovation projects, positioned by semantic similarity of their research abstracts.",
  },
  {
    delay: 3500,
    type: "narrate",
    content:
      "Amber diamonds are live funding calls — open right now. Orange lines show semantic connections to historical projects.",
  },
  { delay: 6000, type: "highlight", content: "decarbonisation" },
  {
    delay: 6500,
    type: "narrate",
    content:
      "Decarbonisation cluster — clean propulsion, zero-emission vehicles, electrification across rail, maritime, and aviation.",
  },
  { delay: 11000, type: "highlight", content: "autonomy" },
  {
    delay: 11500,
    type: "narrate",
    content:
      "Autonomous systems — 47 projects spanning GPS-denied navigation, port automation, and AV integration.",
  },
  {
    delay: 16000,
    type: "narrate",
    content:
      "This is the shape of UK transport innovation funding. And the live calls show where new money is clustering right now.",
  },
];

export function demoTotalDurationMs(script: DemoStep[]): number {
  return script.reduce((acc, s) => acc + s.delay, 0);
}
