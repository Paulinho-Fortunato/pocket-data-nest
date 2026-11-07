import type { ChatMsg } from "./store";
import {
  DOCUMENT_CONTEXT_END,
  DOCUMENT_CONTEXT_START,
  UNTRUSTED_DOCUMENT_INSTRUCTION,
  type DocumentPage,
} from "./documents";

/**
 * Browser-side text extraction.
 *
 * Nothing here truncates the source: every PDF page is read and every character
 * of a text file is preserved. When a document cannot be read completely the
 * caller receives an explicit reason (and, when possible, the partial text plus
 * the range that was not read) instead of a silently shortened document.
 */

export const TEXT_FILE_EXTENSIONS =
  /\.(txt|md|markdown|mdx|csv|tsv|json|jsonl|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|cs|php|sh|bash|sql|html|htm|css|scss|xml|yml|yaml|toml|ini|cfg|tex|log)$/i;

export const PDF_EXTENSIONS = /\.pdf$/i;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/ld+json",
  "application/x-yaml",
  "text/csv",
  "text/tab-separated-values",
  "text/markdown",
  "text/plain",
]);

export type ExtractionKind = "pdf" | "text";

export type ExtractionMetadata = {
  fileName: string;
  fileType: string;
  fileSize: number;
  extraction: ExtractionKind;
  totalPages: number;
  totalChars: number;
  /** Pages that produced no text at all (usually scanned images). */
  emptyPages: number[];
  /** Pages that failed to render; their content is missing from `text`. */
  failedPages: number[];
  /** PDF document metadata, when available. */
  pdfTitle?: string;
  pdfProducer?: string;
  warnings: string[];
};

export type ExtractionResult = {
  /** Full extracted text — never truncated. */
  text: string;
  /** One entry per page (text files use a single virtual page). */
  pages: DocumentPage[];
  totalPages: number;
  truncated: false;
  /** False when some pages could not be read (see `metadata.failedPages`). */
  complete: boolean;
  metadata: ExtractionMetadata;
};

export type ExtractionErrorCode =
  | "UNSUPPORTED_TYPE"
  | "EMPTY_DOCUMENT"
  | "NO_TEXT_LAYER"
  | "PASSWORD_PROTECTED"
  | "PDF_LOAD_FAILED"
  | "READ_FAILED"
  | "BINARY_CONTENT";

export type PartialExtraction = {
  text: string;
  pages: DocumentPage[];
  /** Pages successfully read. */
  readPages: number;
  totalPages: number;
  /** Pages that could not be read, e.g. `{ from: 12, to: 45 }`. */
  unreadRange: { from: number; to: number } | null;
  charsRead: number;
  charsExpected: number | null;
};

/** Error with a machine-readable reason and an optional partial extraction. */
export class DocumentExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  readonly partial: PartialExtraction | null;

  constructor(
    code: ExtractionErrorCode,
    message: string,
    partial: PartialExtraction | null = null,
  ) {
    super(message);
    this.name = "DocumentExtractionError";
    this.code = code;
    this.partial = partial;
  }
}

/** Friendly Portuguese explanation of an extraction failure. */
export function explainExtractionError(error: unknown): string {
  if (!(error instanceof DocumentExtractionError)) {
    const detail = error instanceof Error ? error.message : String(error);
    return `Não foi possível ler o documento (${detail}).`;
  }
  switch (error.code) {
    case "UNSUPPORTED_TYPE":
      return "Este tipo de ficheiro não é suportado. Usa PDF, TXT, Markdown, CSV, JSON ou código-fonte.";
    case "EMPTY_DOCUMENT":
      return "O documento está vazio: não há texto para analisar.";
    case "NO_TEXT_LAYER":
      return "O PDF não tem camada de texto (provavelmente é uma digitalização). Seria preciso OCR; não há texto extraível para ler.";
    case "PASSWORD_PROTECTED":
      return "O PDF está protegido por palavra-passe e não pode ser lido.";
    case "PDF_LOAD_FAILED":
      return "O PDF está corrompido ou usa um formato que o leitor não consegue abrir.";
    case "BINARY_CONTENT":
      return "O ficheiro parece binário e não contém texto legível.";
    case "READ_FAILED":
      return "O navegador não conseguiu ler o ficheiro.";
    default:
      return "Não foi possível ler o documento.";
  }
}

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

/** Minimal structural types so PDF extraction can be tested without pdf.js. */
export type PdfTextItemLike = { str?: string; hasEOL?: boolean };
export type PdfPageLike = { getTextContent: () => Promise<{ items: PdfTextItemLike[] }> };
export type PdfDocumentLike = {
  numPages: number;
  getPage: (page: number) => Promise<PdfPageLike>;
  getMetadata?: () => Promise<{ info?: Record<string, unknown> }>;
};

function joinPageItems(items: PdfTextItemLike[]): string {
  const parts: string[] = [];
  for (const item of items) {
    const text = typeof item.str === "string" ? item.str : "";
    if (!text) continue;
    parts.push(text);
    if (item.hasEOL) parts.push("\n");
  }
  return parts
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Reads **every** page of an already-opened pdf.js document. Pages that fail are
 * reported in `metadata.failedPages`; the rest of the text is still returned.
 */
export async function extractPdfDocument(
  doc: PdfDocumentLike,
  meta: { fileName: string; fileSize: number; fileType?: string },
): Promise<ExtractionResult> {
  const totalPages = doc.numPages;
  let text = "";
  const pages: DocumentPage[] = [];
  const emptyPages: number[] = [];
  const failedPages: number[] = [];
  const warnings: string[] = [];

  let pdfTitle: string | undefined;
  let pdfProducer: string | undefined;
  if (doc.getMetadata) {
    try {
      const info = (await doc.getMetadata()).info ?? {};
      if (typeof info["Title"] === "string" && info["Title"].trim())
        pdfTitle = info["Title"].trim();
      if (typeof info["Producer"] === "string" && info["Producer"].trim()) {
        pdfProducer = info["Producer"].trim();
      }
    } catch {
      // Metadata is optional; never fail the extraction because of it.
    }
  }

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    let pageText = "";
    try {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pageText = joinPageItems(content.items);
    } catch {
      failedPages.push(pageNumber);
      pageText = "";
    }
    if (!pageText) emptyPages.push(pageNumber);
    const charStart = text.length;
    text += pageText;
    pages.push({ page: pageNumber, text: pageText, charStart, charEnd: text.length });
    // Separator kept outside the page range so offsets stay exact.
    text += "\n\n";
  }

  if (failedPages.length > 0) {
    warnings.push(
      `${failedPages.length} página(s) não puderam ser lidas: ${failedPages.slice(0, 20).join(", ")}${failedPages.length > 20 ? "…" : ""}.`,
    );
  }
  if (emptyPages.length === totalPages) {
    throw new DocumentExtractionError("NO_TEXT_LAYER", "O PDF não contém texto extraível.", {
      text: "",
      pages,
      readPages: 0,
      totalPages,
      unreadRange: { from: 1, to: totalPages },
      charsRead: 0,
      charsExpected: null,
    });
  }
  if (emptyPages.length > 0) {
    warnings.push(
      `${emptyPages.length} página(s) sem texto (possivelmente digitalizadas): ${emptyPages.slice(0, 20).join(", ")}${emptyPages.length > 20 ? "…" : ""}.`,
    );
  }

  return {
    text,
    pages,
    totalPages,
    truncated: false,
    complete: failedPages.length === 0,
    metadata: {
      fileName: meta.fileName,
      fileType: meta.fileType ?? "application/pdf",
      fileSize: meta.fileSize,
      extraction: "pdf",
      totalPages,
      totalChars: text.length,
      emptyPages,
      failedPages,
      ...(pdfTitle ? { pdfTitle } : {}),
      ...(pdfProducer ? { pdfProducer } : {}),
      warnings,
    },
  };
}

/** Extracts every page of a PDF using pdf.js, loaded on demand (no SSR cost). */
export async function readPdfDocument(file: File): Promise<ExtractionResult> {
  let doc: PdfDocumentLike & { destroy?: () => Promise<void> };
  try {
    const pdfjs = await import("pdfjs-dist");
    const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
    const buffer = await file.arrayBuffer();
    doc = (await pdfjs.getDocument({ data: new Uint8Array(buffer) })
      .promise) as unknown as PdfDocumentLike & { destroy?: () => Promise<void> };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/password/i.test(message)) {
      throw new DocumentExtractionError(
        "PASSWORD_PROTECTED",
        "O PDF está protegido por palavra-passe.",
      );
    }
    throw new DocumentExtractionError(
      "PDF_LOAD_FAILED",
      message || "Não foi possível abrir o PDF.",
    );
  }
  try {
    return await extractPdfDocument(doc, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || "application/pdf",
    });
  } finally {
    await doc.destroy?.().catch(() => undefined);
  }
}

/** Reads any supported text-like file (TXT, MD, CSV, JSON, source code). */
export async function readTextDocument(file: File): Promise<ExtractionResult> {
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    throw new DocumentExtractionError(
      "READ_FAILED",
      error instanceof Error ? error.message : "Falha ao ler o ficheiro.",
    );
  }
  // A text decode of binary data usually keeps NUL bytes around.
  if (text.includes("\u0000")) {
    throw new DocumentExtractionError("BINARY_CONTENT", "O ficheiro contém dados binários.");
  }
  if (!text.trim()) {
    throw new DocumentExtractionError("EMPTY_DOCUMENT", "O ficheiro está vazio.");
  }
  const page: DocumentPage = { page: 1, text, charStart: 0, charEnd: text.length };
  return {
    text,
    pages: [page],
    totalPages: 1,
    truncated: false,
    complete: true,
    metadata: {
      fileName: file.name,
      fileType: file.type || "text/plain",
      fileSize: file.size,
      extraction: "text",
      totalPages: 1,
      totalChars: text.length,
      emptyPages: [],
      failedPages: [],
      warnings: [],
    },
  };
}

/** Extracts a supported document completely (PDF or text-like file). */
export async function extractDocument(file: File): Promise<ExtractionResult> {
  if (file.type === "application/pdf" || PDF_EXTENSIONS.test(file.name)) {
    return readPdfDocument(file);
  }
  if (!isAllowedFile(file)) {
    throw new DocumentExtractionError(
      "UNSUPPORTED_TYPE",
      `Tipo de ficheiro não suportado (${file.type || file.name}).`,
    );
  }
  return readTextDocument(file);
}

/** Backwards-compatible helper: returns the full extracted text. */
export async function readAttachmentText(file: File): Promise<string> {
  const result = await extractDocument(file);
  return result.text;
}

/** Kept for backwards compatibility: now reads every page, without truncation. */
export async function readPdfText(file: File): Promise<string> {
  return (await readPdfDocument(file)).text;
}

export function isAllowedFile(file: File): boolean {
  if (file.type === "application/pdf" || PDF_EXTENSIONS.test(file.name)) return true;
  if (TEXT_FILE_EXTENSIONS.test(file.name)) return true;
  if (file.type.startsWith("text/")) return true;
  return ALLOWED_MIME.has(file.type);
}

/** Images are intentionally not supported yet: no multimodal payload is sent. */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Explicit, honest message for attachments the product cannot process. */
export function unsupportedAttachmentMessage(file: File): string {
  if (isImageFile(file)) {
    return "As imagens ainda não são enviadas para o modelo (o tutor não tem visão configurada). Usa um PDF com texto ou descreve a imagem por palavras.";
  }
  return "Escolhe um ficheiro PDF, TXT, Markdown, CSV, JSON ou código-fonte.";
}

/**
 * Wraps context in explicit markers. Exported for compatibility and reused by
 * the document pipeline so the model always sees untrusted-data boundaries.
 */
export function contextBlock(label: string, text: string): string {
  return `\n\n${DOCUMENT_CONTEXT_START}\n${UNTRUSTED_DOCUMENT_INSTRUCTION}\n[Contexto de ${label}]\n${text}\n${DOCUMENT_CONTEXT_END}`;
}

export function lastMessagesWithAttachment(msgs: ChatMsg[], aiMessage: ChatMsg): ChatMsg[] {
  return [...msgs, aiMessage].slice(-12);
}
