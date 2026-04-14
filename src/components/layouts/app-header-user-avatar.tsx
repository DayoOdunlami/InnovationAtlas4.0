"use client";

import useSWR from "swr";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Button } from "ui/button";

import { appStore } from "@/app/store";
import { fetcher } from "@/lib/utils";
import type { BasicUser } from "app-types/user";
import { getUserAvatar } from "lib/user/utils";

export function AppHeaderUserAvatar() {
  const appStoreMutate = appStore((s) => s.mutate);
  const { data: user } = useSWR<BasicUser>(`/api/user/details`, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  if (!user) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9 shrink-0 rounded-full border border-border bg-transparent p-0"
      aria-label="User menu"
      onClick={() => appStoreMutate({ openUserSettings: true })}
    >
      <Avatar className="size-8 border-0">
        <AvatarImage
          className="object-cover"
          src={getUserAvatar(user)}
          alt={user.name || "User"}
        />
        <AvatarFallback>{user.name?.slice(0, 1) || "?"}</AvatarFallback>
      </Avatar>
    </Button>
  );
}
