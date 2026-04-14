import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser client — uses anon key, respects RLS.
 * Safe to use in client components.
 */
export function createBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}
