import { UsageAdminOverview } from "@/components/admin/usage-admin-overview";
import { loadAtlasUsageOverview } from "@/lib/admin/usage-admin-query";
import { requireAdminPermission } from "auth/permissions";
import { getTranslations } from "next-intl/server";
import { unauthorized } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ days?: string }>;
};

export default async function AdminUsagePage({ searchParams }: PageProps) {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const t = await getTranslations("Admin.Usage");
  const sp = await searchParams;
  const raw = Number.parseInt(sp.days ?? "30", 10);
  const days = Number.isFinite(raw) && raw > 0 && raw <= 365 ? raw : 30;

  const overview = await loadAtlasUsageOverview(days);

  return (
    <div className="relative bg-background w-full flex flex-col min-h-screen">
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="space-y-6 w-full max-w-7xl">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              {t("description")}
            </p>
          </div>
          <UsageAdminOverview
            overview={overview}
            labels={{
              period: t("period"),
              summaryHeading: t("summaryHeading"),
              assistantMessages: t("assistantMessages"),
              threadsTouched: t("threadsTouched"),
              inputTokens: t("inputTokens"),
              outputTokens: t("outputTokens"),
              totalTokens: t("totalTokens"),
              approxCost: t("approxCost"),
              approxCostUnknown: t("approxCostUnknown"),
              externalBilling: t("externalBilling"),
              externalBillingBody: t("externalBillingBody"),
              byModelHeading: t("byModelHeading"),
              byDayHeading: t("byDayHeading"),
              topUsersHeading: t("topUsersHeading"),
              colModel: t("colModel"),
              colMessages: t("colMessages"),
              colIn: t("colIn"),
              colOut: t("colOut"),
              colTotal: t("colTotal"),
              colApprox: t("colApprox"),
              colDay: t("colDay"),
              colUser: t("colUser"),
              colEmail: t("colEmail"),
              noData: t("noData"),
              disclaimer: t("disclaimer"),
            }}
          />
        </div>
      </div>
    </div>
  );
}
