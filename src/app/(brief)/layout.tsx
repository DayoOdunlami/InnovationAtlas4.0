// ---------------------------------------------------------------------------
// Brief route-group layout (Phase 1, Brief-First Rebuild).
//
// Cloned from `src/app/(chat)/layout.tsx` — same auth-redirect, same
// chrome. The only difference is the route group name; sharing the
// (chat) layout directly would require moving the brief pages under
// /app/(chat)/, which mixes two very different product surfaces.
//
// Minimal so that later phases (block rendering, live passport, canvas
// reuse) can layer on top without rewriting layout code.
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
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SidebarProvider } from "ui/sidebar";

export const experimental_ppr = true;

export default async function BriefLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
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
          <main className="relative bg-background w-full flex flex-col h-screen">
            <AppHeader />
            <div className="flex-1 overflow-y-auto">{children}</div>
          </main>
        </SWRConfigProvider>
      </DemoChrome>
    </SidebarProvider>
  );
}
