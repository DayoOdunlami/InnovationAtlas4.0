import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { FileNotFoundError } from "lib/errors";
import { generateUUID } from "lib/utils";
import type {
  FileMetadata,
  FileStorage,
  UploadOptions,
} from "./file-storage.interface";
import { sanitizeFilename, toBuffer } from "./storage-utils";

/** Same bucket as `/api/passport/upload`; server-side keys use `ai/` prefix. */
const BUCKET = "passport-documents";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

async function signPath(storagePath: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create signed URL");
  }
  return data.signedUrl;
}

export const createSupabasePassportStorage = (): FileStorage => {
  return {
    async upload(content, options: UploadOptions = {}) {
      const buffer = await toBuffer(content);
      const safeName = sanitizeFilename(options.filename ?? "file");
      const key = `ai/${generateUUID()}/${safeName}`;
      const contentType = options.contentType ?? "application/octet-stream";

      const supabase = createAdminClient();
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(key, buffer, {
          contentType,
          upsert: false,
        });
      if (error) {
        throw new Error(`Supabase storage upload failed: ${error.message}`);
      }

      const sourceUrl = await signPath(key);
      const metadata: FileMetadata = {
        key,
        filename: safeName,
        contentType,
        size: buffer.byteLength,
        uploadedAt: new Date(),
      };

      return { key, sourceUrl, metadata };
    },

    async createUploadUrl() {
      return null;
    },

    async download(key) {
      const supabase = createAdminClient();
      const { data, error } = await supabase.storage.from(BUCKET).download(key);
      if (error || !data) {
        throw new FileNotFoundError(key, error);
      }
      return Buffer.from(await data.arrayBuffer());
    },

    async delete(key) {
      const supabase = createAdminClient();
      const { error } = await supabase.storage.from(BUCKET).remove([key]);
      if (error) {
        throw new Error(error.message);
      }
    },

    async exists(key) {
      const supabase = createAdminClient();
      const slash = key.lastIndexOf("/");
      const folder = slash > 0 ? key.slice(0, slash) : "";
      const name = slash >= 0 ? key.slice(slash + 1) : key;
      const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
        limit: 1000,
      });
      if (error) {
        return false;
      }
      return data?.some((o) => o.name === name) ?? false;
    },

    async getMetadata(key) {
      try {
        const buf = await this.download(key);
        return {
          key,
          filename: key.split("/").pop() ?? "file",
          contentType: "application/octet-stream",
          size: buf.byteLength,
        } satisfies FileMetadata;
      } catch (e) {
        if (e instanceof FileNotFoundError) {
          return null;
        }
        throw e;
      }
    },

    async getSourceUrl(key) {
      try {
        return await signPath(key);
      } catch {
        return null;
      }
    },
  } satisfies FileStorage;
};
