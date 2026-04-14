"use client";

import { UploadedFile, appStore } from "@/app/store";
import { useFileUpload } from "@/hooks/use-presigned-upload";
import { generateUUID } from "@/lib/utils";
import { useCallback } from "react";
import { toast } from "sonner";

/** Silently registers a PDF with the passport pipeline (fire-and-forget). */
async function registerPassportDocument(
  file: File,
  threadId: string,
): Promise<void> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("threadId", threadId);
    const res = await fetch("/api/passport/upload", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn("[passport/upload]", body.error ?? res.statusText);
    } else {
      const data = await res.json();
      console.info(
        `[passport] Document registered — passport: ${data.passportId}, doc: ${data.documentId}`,
      );
    }
  } catch (err) {
    console.warn("[passport/upload] fire-and-forget failed", err);
  }
}

export function useThreadFileUploader(threadId?: string) {
  const appStoreMutate = appStore((s) => s.mutate);
  const { upload, storageType } = useFileUpload();

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!threadId || files.length === 0) return;
      const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per file

      for (const file of files) {
        if (file.size > MAX_SIZE_BYTES) {
          toast.error(`${file.name}: file too large (>50MB)`);
          continue;
        }

        const previewUrl = file.type?.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        const fileId = generateUUID();
        const abortController = new AbortController();

        const uploadingFile: UploadedFile = {
          id: fileId,
          url: "",
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          isUploading: true,
          progress: 0,
          previewUrl,
          abortController,
        };

        appStoreMutate((prev) => ({
          threadFiles: {
            ...prev.threadFiles,
            [threadId]: [...(prev.threadFiles[threadId] ?? []), uploadingFile],
          },
        }));

        // PDF → side-channel passport registration when using Vercel Blob / S3
        // (supabase-passport already hits /api/passport/upload)
        if (
          file.type === "application/pdf" &&
          threadId &&
          storageType !== "supabase-passport"
        ) {
          registerPassportDocument(file, threadId);
        }

        try {
          const uploaded = await upload(file, { threadId });
          if (uploaded) {
            appStoreMutate((prev) => ({
              threadFiles: {
                ...prev.threadFiles,
                [threadId]: (prev.threadFiles[threadId] ?? []).map((f) =>
                  f.id === fileId
                    ? {
                        ...f,
                        url: uploaded.url,
                        isUploading: false,
                        progress: 100,
                      }
                    : f,
                ),
              },
            }));
          } else {
            appStoreMutate((prev) => ({
              threadFiles: {
                ...prev.threadFiles,
                [threadId]: (prev.threadFiles[threadId] ?? []).filter(
                  (f) => f.id !== fileId,
                ),
              },
            }));
          }
        } catch (_err) {
          appStoreMutate((prev) => ({
            threadFiles: {
              ...prev.threadFiles,
              [threadId]: (prev.threadFiles[threadId] ?? []).filter(
                (f) => f.id !== fileId,
              ),
            },
          }));
        } finally {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
        }
      }
    },
    [threadId, appStoreMutate, upload, storageType],
  );

  return { uploadFiles };
}
