import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";

export const dynamic = "force-dynamic";

export default async function AdminTestingPage() {
  const t = await getTranslations("Admin.Testing");

  return (
    <div className="relative bg-background w-full flex flex-col min-h-screen">
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="space-y-4 w-full max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{t("title")}</CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>{t("requirements")}</p>
              <div>
                <p className="font-medium text-foreground mb-1">
                  {t("commandLabel")}
                </p>
                <pre className="rounded-md border bg-muted/40 p-3 text-xs text-foreground overflow-x-auto">
                  pnpm test:smoke
                </pre>
              </div>
              <p>{t("implementationNote")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
