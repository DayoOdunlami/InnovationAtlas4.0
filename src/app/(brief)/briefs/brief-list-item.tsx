"use client";

// ---------------------------------------------------------------------------
// Single row in the /briefs list. Renders the title (clickable link to
// /brief/[id]) plus an inline rename form and a delete button. Both
// actions post into server actions in `./actions.ts`; the server
// handles revalidation.
// ---------------------------------------------------------------------------

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteBriefAction, renameBriefAction } from "./actions";

interface BriefListItemProps {
  id: string;
  title: string;
  updatedAt: string;
}

export function BriefListItem({ id, title, updatedAt }: BriefListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [isPending, startTransition] = useTransition();

  const formatted = (() => {
    try {
      return new Date(updatedAt).toLocaleString();
    } catch {
      return updatedAt;
    }
  })();

  if (isEditing) {
    return (
      <form
        className="flex items-center gap-2 px-4 py-3"
        action={(fd) => {
          startTransition(async () => {
            await renameBriefAction(fd);
            setIsEditing(false);
          });
        }}
      >
        <input type="hidden" name="id" value={id} />
        <Input
          name="title"
          defaultValue={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          className="h-8 text-sm"
          maxLength={200}
          autoFocus
        />
        <Button type="submit" size="sm" variant="default" disabled={isPending}>
          <Check className="size-4" aria-hidden />
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setIsEditing(false);
            setDraftTitle(title);
          }}
        >
          <X className="size-4" aria-hidden />
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3">
      <Link
        href={`/brief/${id}`}
        className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline"
      >
        {title}
      </Link>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Updated {formatted}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setIsEditing(true)}
          aria-label={`Rename ${title}`}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
        <form
          action={(fd) => {
            if (
              typeof window !== "undefined" &&
              !window.confirm(`Delete "${title}"? This can't be undone.`)
            ) {
              return;
            }
            startTransition(() => {
              void deleteBriefAction(fd);
            });
          }}
        >
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            disabled={isPending}
            aria-label={`Delete ${title}`}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </form>
      </div>
    </div>
  );
}
