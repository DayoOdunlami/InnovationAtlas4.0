import { notFound, redirect } from "next/navigation";
import { getSession } from "lib/auth/server";
import { getPassportDetail } from "@/lib/passport/queries";
import { PassportHeader } from "@/components/passport/passport-header";
import { PassportDocuments } from "@/components/passport/passport-documents";
import { PassportClaimsSection } from "@/components/passport/passport-claims-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Brain, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function PassportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const data = await getPassportDetail(id);
  if (!data) notFound();

  const { passport, documents, claims } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/passport">
          <ArrowLeft className="size-4 mr-1.5" />
          All passports
        </Link>
      </Button>

      {/* Header card */}
      <Card className="border-border/60">
        <CardContent className="pt-6">
          <PassportHeader passport={passport} />
        </CardContent>
      </Card>

      {/* Documents */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Evidence Documents
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {documents.length} file{documents.length !== 1 ? "s" : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PassportDocuments documents={documents} />
        </CardContent>
      </Card>

      {/* Claims — interactive client component */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="size-4" />
            Extracted Claims
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {claims.length} claim{claims.length !== 1 ? "s" : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PassportClaimsSection initialClaims={claims} />
        </CardContent>
      </Card>

      {/* Ask JARVIS shortcut */}
      <div className="text-center pb-4">
        <Button asChild variant="outline" size="sm">
          <Link href={`/?passport=${id}`}>
            Ask JARVIS about this passport →
          </Link>
        </Button>
      </div>
    </div>
  );
}
