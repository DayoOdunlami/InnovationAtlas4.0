"use client";

// Thin client form that POSTs into the createBriefAction server action.
// Kept minimal: a single button + loading state. The action itself
// redirects to /brief/[id] on success, so we don't need a client-side
// router.push here.

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTransition } from "react";
import { createBriefAction } from "./actions";

export function NewBriefButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => {
        startTransition(() => {
          void createBriefAction(fd);
        });
      }}
    >
      <Button type="submit" size="sm" disabled={isPending}>
        <Plus className="size-4" aria-hidden />
        {isPending ? "Creating…" : "New brief"}
      </Button>
    </form>
  );
}
