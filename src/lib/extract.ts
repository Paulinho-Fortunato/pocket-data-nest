import type { ChatMsg } from "./store";

export const MAX_FILE_CHARS = 18_000;
export const MAX_PDF_PAGES = 40;

export const TEXT_FILE_EXTENSIONS =
  /\.(txt|md|markdown|csv|json|js|ts|tsx|jsx|py|html|css)$/i;

/** Extracts a video ID from the supported YouTube URL shapes. */
export function parseYouTubeUrl(input: string): { id: string } | null {
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*\bv=)([\w-]{11})/i,
    /(?:youtu\.be\/)([\w-]{11})/i,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/i,
    /(?:youtube\.com\/embed\/)([\w-]{11})/i,
    /(?:youtube\.com\/live\/)([\w-]{11})/i,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) return { id: match[1] };
  }
  return null;
}

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Extracts plain text from a PDF in the browser using pdf.js (lazy loaded). */
export async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  let text = "";
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text +=
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim() + "\n";
  }
  if (doc.numPages > MAX_PDF_PAGES) text += `[… documento truncado em ${MAX_PDF_PAGES} páginas]\n`;
  return text;
}

/** Reads a text-like file or PDF and returns its textual content, truncated. */
export async function readAttachmentText(file: File): Promise<string> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return (await readPdfText(file)).slice(0, MAX_FILE_CHARS);
  }
  const text = await file.text();
  return text.slice(0, MAX_FILE_CHARS);
}

export function isAllowedFile(file: File): boolean {
  return (
    file.type.startsWith("text/") ||
    file.type === "application/pdf" ||
    TEXT_FILE_EXTENSIONS.test(file.name) ||
    /\.pdf$/i.test(file.name)
  );
}

/** Builds the system-side context block for an attachment or transcript. */
export function contextBlock(label: string, text: string): string {
  return `\n\n[Contexto de ${label}]\n${text}\n[/Contexto]`;
}

export function lastMessagesWithAttachment(
  msgs: ChatMsg[],
  aiMessage: ChatMsg,
): ChatMsg[] {
  return [...msgs, aiMessage].slice(-12);
}
