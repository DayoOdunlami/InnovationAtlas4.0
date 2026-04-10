import "server-only";

export type ExtractedText = {
  text: string;
  /** Approximate character count of extracted content */
  charCount: number;
  /** Detected format */
  format: "pdf" | "docx" | "txt" | "xlsx" | "csv" | "unknown";
};

/**
 * Extract plain text from any supported document format.
 * Supports: PDF, DOCX, TXT, XLSX, CSV.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractedText> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  // PDF
  if (mimeType === "application/pdf" || ext === "pdf") {
    return extractPdf(buffer);
  }

  // DOCX
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return extractDocx(buffer);
  }

  // XLSX
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return extractXlsx(buffer);
  }

  // CSV
  if (
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    ext === "csv"
  ) {
    return extractCsv(buffer);
  }

  // TXT / plain text
  if (mimeType.startsWith("text/") || ext === "txt" || ext === "md") {
    const text = buffer.toString("utf-8");
    return { text, charCount: text.length, format: "txt" };
  }

  throw new Error(
    `Unsupported document format: ${mimeType} (${filename}). ` +
      "Supported: PDF, DOCX, TXT, XLSX, CSV.",
  );
}

async function extractPdf(buffer: Buffer): Promise<ExtractedText> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return {
    text: result.text,
    charCount: result.text.length,
    format: "pdf",
  };
}

async function extractDocx(buffer: Buffer): Promise<ExtractedText> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value,
    charCount: result.value.length,
    format: "docx",
  };
}

async function extractXlsx(buffer: Buffer): Promise<ExtractedText> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    lines.push(`--- Sheet: ${sheetName} ---`);
    lines.push(csv);
  }

  const text = lines.join("\n");
  return { text, charCount: text.length, format: "xlsx" };
}

async function extractCsv(buffer: Buffer): Promise<ExtractedText> {
  const text = buffer.toString("utf-8");
  return { text, charCount: text.length, format: "csv" };
}
