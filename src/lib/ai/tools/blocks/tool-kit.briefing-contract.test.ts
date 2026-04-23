// ---------------------------------------------------------------------------
// Briefing toolkit registration contract (isolated test file).
//
// Verifies that the static `APP_DEFAULT_TOOL_KIT[briefing]` slot is empty.
// The per-request factory (`buildBriefingToolKit`) is the only place
// briefing tools are bound, because the factory closes over an
// authenticated owner scope + a verified `activeBriefId` — the static
// slot can't do either, so any entry there would be an un-scoped leak.
//
// Split out from `briefing-tool-kit.test.ts` because dynamic-importing
// `tool-kit.ts` triggers cold-load of the full tool graph (Canvas,
// Research, Passport, KB, visualization) which transitively pulls in
// drizzle + pg. On Windows that import regularly takes ~60–120s, which
// starves the other (fast) factory tests when they share the same file.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { AppDefaultToolkit } from "@/lib/ai/tools";

describe("briefing toolkit registration contract", () => {
  it(
    "APP_DEFAULT_TOOL_KIT[briefing] stays empty so the static kit can't leak un-scoped tools",
    { timeout: 180_000 },
    async () => {
      const { APP_DEFAULT_TOOL_KIT } = await import("@/lib/ai/tools/tool-kit");
      const slot = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Briefing];
      expect(Object.keys(slot)).toHaveLength(0);
    },
  );
});
