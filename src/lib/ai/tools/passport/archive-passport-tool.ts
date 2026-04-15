import { archivePassport } from "@/app/actions/admin-passports";
import { tool as createTool } from "ai";
import { z } from "zod";

export const archivePassportTool = createTool({
  description:
    "Archive a passport to remove it from the active list. " +
    "Use when the user asks to clean up, archive, or remove a test passport. " +
    "Archived passports are not deleted and can be restored. " +
    "Requires admin access. Use listPassports first to obtain the passport UUID.",
  inputSchema: z.object({
    passport_id: z.string().uuid().describe("UUID of the passport to archive"),
  }),
  execute: async ({
    passport_id,
  }): Promise<{ ok: true } | { error: string }> => {
    return archivePassport(passport_id);
  },
});
