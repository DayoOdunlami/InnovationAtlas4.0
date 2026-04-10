// Shared types for the passport pipeline — used by both server pages and client components.

export type PassportRow = {
  id: string;
  passport_type: string | null;
  title: string | null;
  owner_org: string | null;
  owner_name: string | null;
  summary: string | null;
  context: string | null;
  trl_level: number | null;
  trl_target: number | null;
  sector_origin: string[] | null;
  sector_target: string[] | null;
  approval_body: string | null;
  approval_ref: string | null;
  approval_date: string | null;
  valid_conditions: string | null;
  created_at: string;
  updated_at: string;
};

export type PassportDocumentRow = {
  id: string;
  passport_id: string;
  filename: string;
  document_type: string | null;
  uploaded_at: string;
  processed_at: string | null;
  processing_status: "pending" | "processing" | "complete" | "failed";
  claims_extracted: number | null;
  storage_path: string;
};

export type PassportClaimRow = {
  id: string;
  passport_id: string;
  claim_role: "asserts" | "requires" | "constrains";
  claim_domain:
    | "capability"
    | "evidence"
    | "certification"
    | "performance"
    | "regulatory";
  claim_text: string;
  conditions: string | null;
  confidence_tier: "ai_inferred" | "self_reported" | "verified";
  confidence_reason: string;
  source_excerpt: string;
  source_document_id: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejected: boolean;
  user_note: string | null;
  created_at: string;
};

export type PassportDetail = {
  passport: PassportRow;
  documents: PassportDocumentRow[];
  claims: PassportClaimRow[];
};
