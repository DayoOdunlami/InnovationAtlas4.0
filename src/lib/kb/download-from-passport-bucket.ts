/**
 * Download an object from the Supabase `passport-documents` bucket by storage key.
 * Does not use `server-only` so tsx scripts can call it (same bucket as
 * `supabase-passport-storage.ts`).
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "passport-documents";

export async function downloadFromPassportBucket(key: string): Promise<Buffer> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required to download from storage",
    );
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error || !data) {
    throw new Error(error?.message ?? `Download failed for ${BUCKET}/${key}`);
  }
  return Buffer.from(await data.arrayBuffer());
}
