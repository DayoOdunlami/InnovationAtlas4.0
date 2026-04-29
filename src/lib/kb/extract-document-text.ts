/**
 * Plain-text extraction for KB ingestion (PDF, DOCX, TXT, XLSX, CSV).
 * Same behaviour as `passport/text-extractor` but without `server-only` so
 * CLI scripts (tsx) and API routes can import it.
 */

export type ExtractedKbText = {
  text: string;
  charCount: number;
  format: "pdf" | "docx" | "txt" | "xlsx" | "csv" | "unknown";
};

export async function extractKbDocumentText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractedKbText> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (mimeType === "application/pdf" || ext === "pdf") {
    return extractPdf(buffer);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return extractDocx(buffer);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return extractXlsx(buffer);
  }

  if (
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    ext === "csv"
  ) {
    return extractCsv(buffer);
  }

  if (mimeType.startsWith("text/") || ext === "txt" || ext === "md") {
    const text = buffer.toString("utf-8");
    return { text, charCount: text.length, format: "txt" };
  }

  throw new Error(
    `Unsupported document format: ${mimeType} (${filename}). ` +
      "Supported: PDF, DOCX, TXT, XLSX, CSV.",
  );
}

async function extractPdf(buffer: Buffer): Promise<ExtractedKbText> {
  // pdf-parse v2.x exports `PDFParse` class (not a default function).
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text;
    return {
      text,
      charCount: text.length,
      format: "pdf",
    };
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractedKbText> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value,
    charCount: result.value.length,
    format: "docx",
  };
}

async function extractXlsx(buffer: Buffer): Promise<ExtractedKbText> {
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

async function extractCsv(buffer: Buffer): Promise<ExtractedKbText> {
  const text = buffer.toString("utf-8");
  return { text, charCount: text.length, format: "csv" };
}
