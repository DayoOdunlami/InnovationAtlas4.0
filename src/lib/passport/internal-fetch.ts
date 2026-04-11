/**
 * Internal API fetch helper for passport tool execute functions.
 *
 * Tool execute() functions run server-side but do not have access to the HTTP
 * request context (no cookies, no session object). This helper adds an internal
 * shared-secret header so API routes can authenticate tool-originated calls
 * without a user session.
 *
 * The shared secret is BETTER_AUTH_SECRET — it is already in the environment
 * and is never exposed to the client.
 *
 * API routes that accept internal calls must check:
 *   request.headers.get("x-tool-secret") === process.env.BETTER_AUTH_SECRET
 */

function getBaseUrl(): string {
  // Server-side: BETTER_AUTH_URL is the canonical app origin
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function internalApiFetch<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set — internal tool API calls cannot be authenticated",
    );
  }

  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tool-secret": secret,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const json = (await response.json()) as { error?: string };
      detail = json.error ?? "";
    } catch {
      // ignore
    }
    throw new Error(
      `Internal API call to ${path} failed (${response.status}): ${detail}`,
    );
  }

  return response.json() as Promise<T>;
}
