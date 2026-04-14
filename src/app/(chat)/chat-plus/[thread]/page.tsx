import { selectThreadWithMessagesAction } from "@/app/api/chat/actions";
import { ChatPlusLayout } from "@/components/chat-plus/chat-plus-layout";
import { getPassportDetail, getPassportList } from "@/lib/passport/queries";
import type { PassportSummary } from "@/lib/passport/types";
import { redirect, RedirectType } from "next/navigation";

export default async function ChatPlusPage({
  params,
}: { params: Promise<{ thread: string }> }) {
  const { thread: threadId } = await params;

  const thread = await selectThreadWithMessagesAction(threadId);

  if (!thread) redirect("/", RedirectType.replace);

  const allPassports = await getPassportList();
  let passportOptions: PassportSummary[] = allPassports.filter(
    (p) => !p.user_id || p.user_id === thread.userId,
  );

  const activePassportId = thread.activePassportId ?? null;
  if (
    activePassportId &&
    !passportOptions.some((p) => p.id === activePassportId)
  ) {
    const detail = await getPassportDetail(activePassportId);
    if (detail) {
      const pr = detail.passport;
      passportOptions = [
        {
          ...pr,
          claim_count: detail.claims.length,
          document_count: detail.documents.length,
          verified_count: detail.claims.filter(
            (c) => c.confidence_tier === "verified",
          ).length,
        },
        ...passportOptions,
      ];
    }
  }

  return (
    <ChatPlusLayout
      threadId={threadId}
      initialMessages={thread.messages}
      activePassportId={activePassportId}
      passportOptions={passportOptions}
    />
  );
}
