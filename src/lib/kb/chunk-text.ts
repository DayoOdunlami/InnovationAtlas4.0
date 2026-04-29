/**
 * Chunk plain text for KB ingestion (~500 tokens target with overlap).
 * Character windows with soft boundaries at blank lines or sentence ends.
 */

const DEFAULT_TARGET_CHARS = 2000; // ~500 tokens
const DEFAULT_OVERLAP_CHARS = 200; // ~50 tokens

export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function chunkPlainText(
  raw: string,
  options?: { targetChars?: number; overlapChars?: number },
): string[] {
  const targetChars = options?.targetChars ?? DEFAULT_TARGET_CHARS;
  const overlapChars = options?.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + targetChars, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const paraBreak = window.lastIndexOf("\n\n");
      const sentenceBreak = window.lastIndexOf(". ");
      const soft = Math.max(
        paraBreak > targetChars * 0.35 ? paraBreak + 2 : -1,
        sentenceBreak > targetChars * 0.35 ? sentenceBreak + 2 : -1,
      );
      if (soft > targetChars * 0.35) {
        end = start + soft;
      }
    }

    const piece = text.slice(start, end).trim();
    if (piece.length > 0) chunks.push(piece);

    if (end >= text.length) break;
    const nextStart = end - overlapChars;
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}
