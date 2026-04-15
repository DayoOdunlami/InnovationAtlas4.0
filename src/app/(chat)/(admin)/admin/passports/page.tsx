import { getTranslations } from "next-intl/server";

import { PassportAdminTable } from "@/components/admin/passport-admin-table";
import {
  duplicatePassportIds,
  loadPassportsForAdmin,
} from "@/lib/admin/passport-admin-query";

export const dynamic = "force-dynamic";

export default async function AdminPassportsPage() {
  const t = await getTranslations("Admin.Passports");
  const rows = await loadPassportsForAdmin();
  const dup = duplicatePassportIds(rows);

  return (
    <div className="relative bg-background w-full flex flex-col min-h-screen">
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="space-y-6 w-full max-w-7xl">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {t("description")}
            </p>
          </div>
          <PassportAdminTable rows={rows} duplicateIds={[...dup]} />
        </div>
      </div>
    </div>
  );
}
