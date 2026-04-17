import "server-only";

import { and, count, desc, eq, gte, sql } from "drizzle-orm";

import { pgDb as db } from "@/lib/db/pg/db.pg";
import {
  ChatMessageTable,
  ChatThreadTable,
  UserTable,
} from "@/lib/db/pg/schema.pg";

const usageTotalExpr = sql<number>`COALESCE(
  SUM((${ChatMessageTable.metadata}->'usage'->>'totalTokens')::numeric),
  0
)`;

const usageInExpr = sql<number>`COALESCE(
  SUM((${ChatMessageTable.metadata}->'usage'->>'inputTokens')::numeric),
  0
)`;

const usageOutExpr = sql<number>`COALESCE(
  SUM((${ChatMessageTable.metadata}->'usage'->>'outputTokens')::numeric),
  0
)`;

function hasUsageWhere(since: Date) {
  return and(
    gte(ChatMessageTable.createdAt, since),
    eq(ChatMessageTable.role, "assistant"),
    sql`${ChatMessageTable.metadata}->'usage'->>'totalTokens' IS NOT NULL`,
  );
}

/** USD per 1M input / output tokens — rough public-order-of-magnitude only. */
function approxUsdPerMillion(
  modelKey: string,
): { input: number; output: number } | null {
  const k = modelKey.toLowerCase();
  if (k.includes("gpt-4o-realtime") || k.includes("realtime"))
    return { input: 5, output: 20 };
  if (k.includes("gpt-4o-mini")) return { input: 0.15, output: 0.6 };
  if (k.includes("gpt-4o")) return { input: 2.5, output: 10 };
  if (k.includes("gpt-4-turbo")) return { input: 10, output: 30 };
  if (k.includes("gpt-3.5")) return { input: 0.5, output: 1.5 };
  if (k.includes("claude")) return { input: 3, output: 15 };
  return null;
}

export function estimateUsd(
  modelKey: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const rates = approxUsdPerMillion(modelKey);
  if (!rates) return null;
  return (
    (inputTokens / 1_000_000) * rates.input +
    (outputTokens / 1_000_000) * rates.output
  );
}

export type AtlasUsageOverview = {
  sinceIso: string;
  days: number;
  totals: {
    assistantMessagesWithUsage: number;
    distinctThreads: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    approxUsdTotal: number | null;
  };
  byModel: Array<{
    modelKey: string;
    messageCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    approxUsd: number | null;
  }>;
  byDay: Array<{
    day: string;
    messageCount: number;
    totalTokens: number;
  }>;
  topUsers: Array<{
    userId: string;
    email: string;
    name: string;
    messageCount: number;
    totalTokens: number;
  }>;
};

export async function loadAtlasUsageOverview(
  days = 30,
): Promise<AtlasUsageOverview> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  const whereUsage = hasUsageWhere(since);

  const modelKeyExpr = sql<string>`TRIM(BOTH '/' FROM CONCAT(
    COALESCE(${ChatMessageTable.metadata}->'chatModel'->>'provider', ''),
    '/',
    COALESCE(${ChatMessageTable.metadata}->'chatModel'->>'model', 'unknown')
  ))`;

  const [totAgg] = await db
    .select({
      assistantMessagesWithUsage: count(),
      distinctThreads: sql<number>`COUNT(DISTINCT ${ChatMessageTable.threadId})`,
      inputTokens: usageInExpr,
      outputTokens: usageOutExpr,
      totalTokens: usageTotalExpr,
    })
    .from(ChatMessageTable)
    .where(whereUsage);

  const byModelRows = await db
    .select({
      modelKey: modelKeyExpr,
      messageCount: count(),
      inputTokens: usageInExpr,
      outputTokens: usageOutExpr,
      totalTokens: usageTotalExpr,
    })
    .from(ChatMessageTable)
    .where(whereUsage)
    .groupBy(modelKeyExpr)
    .orderBy(desc(usageTotalExpr))
    .limit(25);

  const dayExpr = sql<string>`to_char(
    date_trunc('day', ${ChatMessageTable.createdAt} AT TIME ZONE 'UTC'),
    'YYYY-MM-DD'
  )`;

  const byDayRows = await db
    .select({
      day: dayExpr,
      messageCount: count(),
      totalTokens: usageTotalExpr,
    })
    .from(ChatMessageTable)
    .where(whereUsage)
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  const topUserRows = await db
    .select({
      userId: ChatThreadTable.userId,
      email: UserTable.email,
      name: UserTable.name,
      messageCount: count(ChatMessageTable.id),
      totalTokens: usageTotalExpr,
    })
    .from(ChatMessageTable)
    .innerJoin(
      ChatThreadTable,
      eq(ChatMessageTable.threadId, ChatThreadTable.id),
    )
    .innerJoin(UserTable, eq(ChatThreadTable.userId, UserTable.id))
    .where(whereUsage)
    .groupBy(ChatThreadTable.userId, UserTable.email, UserTable.name)
    .orderBy(desc(usageTotalExpr))
    .limit(15);

  const byModel = byModelRows.map((r) => {
    const inputTokens = Number(r.inputTokens ?? 0);
    const outputTokens = Number(r.outputTokens ?? 0);
    const totalTokens = Number(r.totalTokens ?? 0);
    return {
      modelKey: r.modelKey || "unknown",
      messageCount: Number(r.messageCount ?? 0),
      inputTokens,
      outputTokens,
      totalTokens,
      approxUsd: estimateUsd(r.modelKey || "", inputTokens, outputTokens),
    };
  });

  let approxUsdTotal: number | null = null;
  for (const row of byModel) {
    if (row.approxUsd != null) {
      approxUsdTotal = (approxUsdTotal ?? 0) + row.approxUsd;
    }
  }

  return {
    sinceIso: since.toISOString(),
    days,
    totals: {
      assistantMessagesWithUsage: Number(
        totAgg?.assistantMessagesWithUsage ?? 0,
      ),
      distinctThreads: Number(totAgg?.distinctThreads ?? 0),
      inputTokens: Number(totAgg?.inputTokens ?? 0),
      outputTokens: Number(totAgg?.outputTokens ?? 0),
      totalTokens: Number(totAgg?.totalTokens ?? 0),
      approxUsdTotal,
    },
    byModel,
    byDay: byDayRows.map((r) => ({
      day: r.day,
      messageCount: Number(r.messageCount ?? 0),
      totalTokens: Number(r.totalTokens ?? 0),
    })),
    topUsers: topUserRows.map((r) => ({
      userId: r.userId,
      email: r.email,
      name: r.name,
      messageCount: Number(r.messageCount ?? 0),
      totalTokens: Number(r.totalTokens ?? 0),
    })),
  };
}
