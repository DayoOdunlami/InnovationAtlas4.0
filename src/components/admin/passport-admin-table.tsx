"use client";

import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  archivePassport,
  deletePassport,
  restorePassport,
} from "@/app/actions/admin-passports";
import type { AdminPassportSummaryRow } from "@/lib/admin/passport-admin-query";
import { cn } from "lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "ui/alert-dialog";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";

function isArchived(row: AdminPassportSummaryRow): boolean {
  return row.is_archived === true;
}

function PassportTableSection({
  title,
  rows,
  duplicateIds,
}: {
  title: string;
  rows: AdminPassportSummaryRow[];
  duplicateIds: Set<string>;
}) {
  const t = useTranslations("Admin.Passports");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] =
    useState<AdminPassportSummaryRow | null>(null);

  const run = (fn: () => Promise<{ ok: true } | { error: string }>) => {
    startTransition(async () => {
      const out = await fn();
      if ("error" in out) {
        toast.error(out.error);
        return;
      }
      toast.success(t("actionSuccess"));
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {title === t("archivedSection") ? t("noArchived") : t("noActive")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colTitle")}</TableHead>
              <TableHead>{t("colProject")}</TableHead>
              <TableHead className="text-right">{t("colClaims")}</TableHead>
              <TableHead className="text-right">{t("colMatches")}</TableHead>
              <TableHead>{t("colCreated")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="text-right w-[280px]">
                {t("colActions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const archived = isArchived(row);
              const dup = duplicateIds.has(row.id);
              return (
                <TableRow
                  key={row.id}
                  className={cn(dup && "bg-amber-500/10 dark:bg-amber-500/15")}
                >
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {row.title ?? "—"}
                    {dup && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-amber-700 border-amber-600/40"
                      >
                        {t("duplicateBadge")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {row.project_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.claim_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.match_count}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {format(new Date(row.created_at), "yyyy-MM-dd HH:mm")}
                  </TableCell>
                  <TableCell>
                    {archived ? (
                      <Badge variant="secondary">{t("statusArchived")}</Badge>
                    ) : (
                      <Badge variant="default">{t("statusActive")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {!archived ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => archivePassport(row.id))}
                      >
                        {t("archive")}
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => run(() => restorePassport(row.id))}
                        >
                          {t("restore")}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={pending || row.claim_count !== 0}
                          onClick={() => setDeleteTarget(row)}
                        >
                          {t("deletePermanently")}
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialogBody", {
                title:
                  deleteTarget?.title ??
                  deleteTarget?.project_name ??
                  deleteTarget?.id ??
                  "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={
                pending || !deleteTarget || deleteTarget.claim_count !== 0
              }
              onClick={() => {
                const id = deleteTarget?.id;
                if (!id) return;
                setDeleteTarget(null);
                run(() => deletePassport(id));
              }}
            >
              {t("deletePermanently")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function PassportAdminTable({
  rows,
  duplicateIds: duplicateIdList,
}: {
  rows: AdminPassportSummaryRow[];
  duplicateIds: string[];
}) {
  const t = useTranslations("Admin.Passports");
  const duplicateIds = useMemo(
    () => new Set(duplicateIdList),
    [duplicateIdList],
  );
  const active = useMemo(() => rows.filter((r) => !isArchived(r)), [rows]);
  const archived = useMemo(() => rows.filter((r) => isArchived(r)), [rows]);

  return (
    <div className="space-y-10">
      <PassportTableSection
        title={t("activeSection")}
        rows={active}
        duplicateIds={duplicateIds}
      />
      <PassportTableSection
        title={t("archivedSection")}
        rows={archived}
        duplicateIds={duplicateIds}
      />
    </div>
  );
}
