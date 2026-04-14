import ChatBot from "@/components/chat-bot";
import { getSession } from "auth/server";
import { generateUUID } from "lib/utils";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Canonical entry for guided demos (`/chat`); mirrors home chat. */
export default async function ChatIndexPage() {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  const id = generateUUID();
  return <ChatBot initialMessages={[]} threadId={id} key={id} />;
}
