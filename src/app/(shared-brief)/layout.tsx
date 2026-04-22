// ---------------------------------------------------------------------------
// Shared-brief layout (Phase 1, Brief-First Rebuild).
//
// Hosts `/brief/[id]` only. Unlike the (brief) group, this layout does
// NOT redirect anonymous callers to /sign-in — the page itself decides
// between owner-scope (signed in) and share-scope (unauthenticated,
// but carrying a ?share=<token> query string). This keeps share links
// usable without an account while still rendering the full app chrome
// for signed-in owners.
//
// The app sidebar / header are conditionally rendered: signed-in users
// see them; share-scope visitors see a minimal chrome.
// ---------------------------------------------------------------------------

import { AppHeader } from "@/components/layouts/app-header";
import { AppPopupProvider } from "@/components/layouts/app-popup-provider";
import { AppSidebar } from "@/components/layouts/app-sidebar";
import { DemoChrome } from "@/components/demo/demo-chrome";
import { SWRConfigProvider } from "@/app/(chat)/swr-config";
import { UserDetailContent } from "@/components/user/user-detail/user-detail-content";
import { UserDetailContentSkeleton } from "@/components/user/user-detail/user-detail-content-skeleton";
import { getSession } from "lib/auth/server";
import { COOKIE_KEY_SIDEBAR_STATE } from "lib/const";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { SidebarProvider } from "ui/sidebar";

export const experimental_ppr = true;

export default async function SharedBriefLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    // Anonymous / share-scope viewer. Minimal chrome — no sidebar
    // (which would otherwise crash because the session user is null).
    return (
      <DemoChrome>
        <main className="flex min-h-screen w-full flex-col bg-background">
          <div className="flex-1 overflow-y-auto">{children}</div>
        </main>
      </DemoChrome>
    );
  }

  const cookieStore = await cookies();
  const isCollapsed =
    cookieStore.get(COOKIE_KEY_SIDEBAR_STATE)?.value !== "true";
  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <DemoChrome>
        <SWRConfigProvider user={session.user}>
          <AppPopupProvider
            userSettingsComponent={
              <Suspense fallback={<UserDetailContentSkeleton />}>
                <UserDetailContent view="user" />
              </Suspense>
            }
          />
          <AppSidebar user={session.user} />
          <main className="relative flex h-screen w-full flex-col bg-background">
            <AppHeader />
            <div className="flex-1 overflow-y-auto">{children}</div>
          </main>
        </SWRConfigProvider>
      </DemoChrome>
    </SidebarProvider>
  );
}
