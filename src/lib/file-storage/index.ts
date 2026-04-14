import "server-only";
import { createRequire } from "node:module";
import { IS_DEV } from "lib/const";
import logger from "logger";
import type { FileStorage } from "./file-storage.interface";

/** Sync lazy requires keep heavy drivers (e.g. @vercel/blob) off the module graph until used. */
const requireDriver = createRequire(import.meta.url);

export type FileStorageDriver = "vercel-blob" | "s3" | "supabase-passport";

const resolveDriver = (): FileStorageDriver => {
  const candidate = process.env.FILE_STORAGE_TYPE;

  const normalized = candidate?.trim().toLowerCase();
  if (
    normalized === "vercel-blob" ||
    normalized === "s3" ||
    normalized === "supabase-passport"
  ) {
    return normalized;
  }

  // Default: Supabase Storage (same bucket as passport uploads; no Vercel Blob token)
  return "supabase-passport";
};

declare global {
  // eslint-disable-next-line no-var
  var __server__file_storage__: FileStorage | undefined;
}

const storageDriver = resolveDriver();

const createFileStorage = (driver: FileStorageDriver): FileStorage => {
  logger.info(`Creating file storage: ${driver}`);
  switch (driver) {
    case "vercel-blob": {
      const { createVercelBlobStorage } = requireDriver(
        "./vercel-blob-storage",
      ) as typeof import("./vercel-blob-storage");
      return createVercelBlobStorage();
    }
    case "s3": {
      const { createS3FileStorage } = requireDriver(
        "./s3-file-storage",
      ) as typeof import("./s3-file-storage");
      return createS3FileStorage();
    }
    case "supabase-passport": {
      const { createSupabasePassportStorage } = requireDriver(
        "./supabase-passport-storage",
      ) as typeof import("./supabase-passport-storage");
      return createSupabasePassportStorage();
    }
    default: {
      const exhaustiveCheck: never = driver;
      throw new Error(`Unsupported file storage driver: ${exhaustiveCheck}`);
    }
  }
};

function getOrCreateServerFileStorage(): FileStorage {
  const cached = globalThis.__server__file_storage__;
  if (cached) {
    return cached;
  }
  const storage = createFileStorage(storageDriver);
  if (IS_DEV) {
    globalThis.__server__file_storage__ = storage;
  }
  return storage;
}

/** Lazy proxy so importing this module does not construct storage (tests can load with missing S3/Blob env). */
const serverFileStorage = new Proxy({} as FileStorage, {
  get(_target, prop, receiver) {
    const storage = getOrCreateServerFileStorage();
    const value = Reflect.get(storage, prop, receiver);
    if (typeof value === "function") {
      return (value as (...a: unknown[]) => unknown).bind(storage);
    }
    return value;
  },
});

export { serverFileStorage, storageDriver };
