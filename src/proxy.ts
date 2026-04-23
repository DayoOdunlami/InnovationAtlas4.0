import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname === "/admin") {
    return NextResponse.redirect(new URL("/admin/users", request.url));
  }

  // Allow internal tool-to-API calls authenticated by shared secret
  const toolSecret = request.headers.get("x-tool-secret");
  if (
    toolSecret &&
    toolSecret === process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_SECRET
  ) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    // Phase 1 brief share links: `/brief/[id]?share=<token>` is
    // deliberately accessible without a session. The repository layer
    // is the authoritative gate — a bogus/expired/revoked token
    // surfaces as an in-page "not available" notice rather than a
    // redirect. See /brief/[id]/page.tsx for the scope resolution.
    if (
      /^\/brief\/[0-9a-f-]{36}\/?$/.test(pathname) &&
      searchParams.has("share")
    ) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|export|sign-in|sign-up|spike).*)",
  ],
};
