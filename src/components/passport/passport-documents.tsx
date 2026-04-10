import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PassportDocumentRow } from "@/lib/passport/types";

const STATUS_CONFIG: Record<
  PassportDocumentRow["processing_status"],
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  complete: {
    label: "Complete",
    icon: CheckCircle2,
    className:
      "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    className:
      "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/40 dark:text-slate-300",
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    className:
      "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    className:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300",
  },
};

export function PassportDocuments({
  documents,
}: {
  documents: PassportDocumentRow[];
}) {
  if (documents.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No documents uploaded yet. Upload via chat.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {documents.map((doc) => {
        const cfg =
          STATUS_CONFIG[doc.processing_status] ?? STATUS_CONFIG.pending;
        const Icon = cfg.icon;

        return (
          <div key={doc.id} className="flex items-center gap-3 py-2.5 text-sm">
            <FileText className="size-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate" title={doc.filename}>
                {doc.filename}
              </p>
              {doc.document_type && (
                <p className="text-xs text-muted-foreground">
                  {doc.document_type}
                </p>
              )}
            </div>
            <Badge
              variant="outline"
              className={`text-xs border flex items-center gap-1 shrink-0 ${cfg.className}`}
            >
              <Icon
                className={`size-3 ${doc.processing_status === "processing" ? "animate-spin" : ""}`}
              />
              {cfg.label}
            </Badge>
            {doc.claims_extracted != null && doc.claims_extracted > 0 && (
              <span className="text-xs text-muted-foreground shrink-0">
                {doc.claims_extracted} claim
                {doc.claims_extracted !== 1 ? "s" : ""}
              </span>
            )}
            <span className="text-xs text-muted-foreground shrink-0">
              {new Date(doc.uploaded_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
