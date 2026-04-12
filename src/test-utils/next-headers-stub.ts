/**
 * Vitest aliases `next/headers` here so Better Auth's nextCookies plugin and
 * `getSession()` resolve in Node without the full Next.js runtime.
 */
export const __vitestNextHeaders = { current: new Headers() };

export async function headers() {
  return __vitestNextHeaders.current;
}

export async function cookies() {
  return new Map() as any;
}
