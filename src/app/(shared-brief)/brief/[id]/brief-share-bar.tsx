"use client";

// Minimal share controls for the Phase 1 brief owner view.
// Calls mintBriefShareTokenAction / revokeBriefShareTokenAction.

import { Button } from "@/components/ui/button";
import { Loader, Link2, Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  mintBriefShareTokenAction,
  revokeBriefShareTokenAction,
} from "./actions";

interface TokenRow {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
}

interface BriefShareBarProps {
  briefId: string;
  tokens: TokenRow[];
  previewUrl: string | null;
}

export function BriefShareBar({
  briefId,
  tokens,
  previewUrl,
}: BriefShareBarProps) {
  const [isPending, startTransition] = useTransition();
  const [justCopied, setJustCopied] = useState(false);

  const activeCount = tokens.length;
  const latestToken = tokens[0] ?? null;
  const latestUrl =
    previewUrl ??
    (latestToken && typeof window !== "undefined"
      ? `${window.location.origin}/brief/${briefId}?share=${latestToken.token}`
      : null);

  return (
    <div className="flex items-center gap-2">
      {activeCount === 0 ? (
        <form
          action={(fd) => {
            startTransition(async () => {
              await mintBriefShareTokenAction(fd);
            });
          }}
        >
          <input type="hidden" name="briefId" value={briefId} />
          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
            {isPending ? (
              <Loader className="size-4 animate-spin" aria-hidden />
            ) : (
              <Link2 className="size-4" aria-hidden />
            )}
            Share
          </Button>
        </form>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!latestUrl || justCopied}
            onClick={async () => {
              if (!latestUrl) return;
              await navigator.clipboard.writeText(latestUrl);
              setJustCopied(true);
              toast.success("Share link copied.");
              setTimeout(() => setJustCopied(false), 1500);
            }}
          >
            {justCopied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Link2 className="size-4" aria-hidden />
            )}
            Copy link
          </Button>
          <form
            action={(fd) => {
              startTransition(async () => {
                await revokeBriefShareTokenAction(fd);
              });
            }}
          >
            <input type="hidden" name="tokenId" value={latestToken?.id ?? ""} />
            <input type="hidden" name="briefId" value={briefId} />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={isPending || !latestToken}
              aria-label="Revoke share link"
            >
              <X className="size-4" aria-hidden />
              Revoke
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
