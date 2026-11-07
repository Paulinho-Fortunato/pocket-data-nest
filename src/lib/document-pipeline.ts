import { createDocumentRecord, type DocumentRecord } from "./documents";
import {
  DocumentExtractionError,
  explainExtractionError,
  extractDocument,
  isAllowedFile,
  isCancelled,
  PDF_EXTENSIONS,
  type ExtractionProgress,
  type ExtractionResult,
} from "./extract";
import { findDocumentByHash, saveDocument } from "./idb";
import { recordDuration, startTimer } from "./metrics";
import { uid } from "./store";

/**
 * The upload pipeline.
 *
 * Order of events (each one is reported to the UI immediately):
 *   selected → validating → hashing → cache → reading/opening → pages → indexing → ready
 *
 * Guarantees:
 *  - the file card appears before any I/O starts;
 *  - every page read is reported, so progress is real (pages, not a fake bar);
 *  - an identical file (same hash) reuses the stored extraction instantly;
 *  - cancelling keeps the pages already read as a `partial` document;
 *  - nothing is truncated; the full text lives in IndexedDB.
 */

export const DEFAULT_MAX_FILE_BYTES = 60 * 1024 * 1024;
export const DEFAULT_MAX_NAME_LENGTH = 180;

export type IngestLimits = {
  maxBytes: number;
  maxNameLength: number;
};

export const DEFAULT_INGEST_LIMITS: IngestLimits = {
  maxBytes: DEFAULT_MAX_FILE_BYTES,
  maxNameLength: DEFAULT_MAX_NAME_LENGTH,
};

export const INGEST_STAGES = [
  "selected",
  "validating",
  "hashing",
  "cache",
  "reading",
  "opening",
  "pages",
  "indexing",
  "ready",
  "partial",
  "cancelled",
  "error",
] as const;

export type IngestStage = (typeof INGEST_STAGES)[number];

export const INGEST_LABELS: Record<IngestStage, string> = {
  selected: "Ficheiro selecionado",
  validating: "A validar tipo e tamanho",
  hashing: "A calcular a impressão digital",
  cache: "A procurar uma extração anterior",
  reading: "A ler o ficheiro",
  opening: "A abrir o PDF",
  pages: "A processar páginas",
  indexing: "A indexar o texto",
  ready: "Pronto a usar",
  partial: "Leitura parcial",
  cancelled: "Leitura cancelada",
  error: "Não foi possível ler",
};

export type IngestProgress = {
  stage: IngestStage;
  label: string;
  message?: string;
  pagesDone: number;
  totalPages: number;
  chars: number;
  /** 0–100 based on pages actually read (never a simulated animation). */
  percent: number;
  cached?: boolean;
};

export type IngestOutcome = {
  record: DocumentRecord | null;
  cached: boolean;
  cancelled: boolean;
  warnings: string[];
};

export type FileValidationCode = "EMPTY_FILE" | "TOO_LARGE" | "UNSUPPORTED_TYPE" | "NAME_TOO_LONG";

export type FileValidation =
  { ok: true } | { ok: false; code: FileValidationCode; message: string };

/** Validates type, size, emptiness and name length *before* reading anything. */
export function validateDocumentFile(
  file: Pick<File, "name" | "size" | "type">,
  limits: IngestLimits = DEFAULT_INGEST_LIMITS,
): FileValidation {
  if (!file.name || !file.name.trim()) {
    return { ok: false, code: "UNSUPPORTED_TYPE", message: "O ficheiro não tem nome." };
  }
  if (file.name.length > limits.maxNameLength) {
    return {
      ok: false,
      code: "NAME_TOO_LONG",
      message: `O nome do ficheiro é demasiado longo (${file.name.length} caracteres). Encurta para menos de ${limits.maxNameLength}.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, code: "EMPTY_FILE", message: "O ficheiro está vazio (0 bytes)." };
  }
  if (file.size > limits.maxBytes) {
    const mb = (limits.maxBytes / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      code: "TOO_LARGE",
      message: `O ficheiro tem ${(file.size / (1024 * 1024)).toFixed(1)} MB. O limite é ${mb} MB.`,
    };
  }
  if (!isAllowedFile(file as File)) {
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: "Tipo não suportado. Usa PDF, TXT, Markdown, CSV, JSON ou código-fonte.",
    };
  }
  return { ok: true };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** FNV-1a over the bytes, used only when Web Crypto is unavailable. */
function fnvBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index++) {
    hash ^= bytes[index]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Content hash of the file. SHA-256 through Web Crypto (native, off the JS main
 * loop where the platform provides it) with a deterministic fallback.
 */
export async function hashFileBytes(bytes: Uint8Array): Promise<string> {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (subtle && typeof subtle.digest === "function") {
    try {
      const digest = await subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
      return `sha256:${toHex(digest)}`;
    } catch {
      // Older/secure-context-less browsers: fall through to FNV.
    }
  }
  return `fnv1a:${fnvBytes(bytes)}:${bytes.length}`;
}

export class DocumentIngestError extends Error {
  readonly code: string;
  readonly friendly: string;
  readonly partial: DocumentRecord | null;

  constructor(code: string, friendly: string, partial: DocumentRecord | null = null) {
    super(friendly);
    this.name = "DocumentIngestError";
    this.code = code;
    this.friendly = friendly;
    this.partial = partial;
  }
}

function trimName(name: string): string {
  // Strip control characters without a control-character regex literal.
  return (
    Array.from(name)
      .filter((char) => {
        const code = char.codePointAt(0) ?? 32;
        return code >= 32 && code !== 127;
      })
      .join("")
      .trim() || "documento"
  );
}

function partialRecordFrom(
  error: DocumentExtractionError,
  file: File,
  hash: string,
  base: { id: string; createdAt?: number | undefined },
  status: "partial" | "error",
): DocumentRecord | null {
  const partial = error.partial;
  if (!partial || !partial.text.trim() || partial.pages.length === 0) return null;
  const warnings = [
    `Leitura interrompida: ${partial.readPages} de ${partial.totalPages} página(s) lidas. O texto disponível corresponde apenas a essas páginas.`,
  ];
  return createDocumentRecord({
    id: base.id,
    name: trimName(file.name),
    mime: file.type || (PDF_EXTENSIONS.test(file.name) ? "application/pdf" : "text/plain"),
    size: file.size,
    hash,
    status,
    processedPages: partial.readPages,
    createdAt: base.createdAt,
    text: partial.text,
    pages: partial.pages,
    warnings: status === "error" ? [...warnings, explainExtractionError(error)] : warnings,
    ...(status === "error" ? { error: explainExtractionError(error) } : {}),
  });
}

export type IngestOptions = {
  signal?: AbortSignal;
  limits?: IngestLimits;
  onProgress?: (progress: IngestProgress) => void;
  /** Set to false to force a fresh extraction (e.g. "repetir leitura"). */
  reuseCache?: boolean;
};

/**
 * Reads a file into a complete `DocumentRecord`.
 *
 * Resolves with `cancelled: true` when the caller aborts **and** some pages were
 * already read (the partial record is saved so the user can keep working).
 */
export async function ingestDocumentFile(
  file: File,
  options: IngestOptions = {},
): Promise<IngestOutcome> {
  const limits = options.limits ?? DEFAULT_INGEST_LIMITS;
  const emit = (progress: IngestProgress) => options.onProgress?.(progress);
  const base = {
    pagesDone: 0,
    totalPages: 0,
    chars: 0,
    percent: 0,
  };

  emit({ ...base, stage: "selected", label: INGEST_LABELS.selected });

  const validation = validateDocumentFile(file, limits);
  if (!validation.ok) {
    emit({
      ...base,
      stage: "error",
      label: INGEST_LABELS.error,
      message: validation.message,
    });
    throw new DocumentIngestError(validation.code, validation.message);
  }

  emit({ ...base, stage: "validating", label: INGEST_LABELS.validating, percent: 3 });

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    const message = `O navegador não conseguiu ler o ficheiro (${error instanceof Error ? error.message : "erro"}).`;
    throw new DocumentIngestError("READ_FAILED", message);
  }

  emit({ ...base, stage: "hashing", label: INGEST_LABELS.hashing, percent: 6 });
  const hash = await hashFileBytes(bytes);

  let previous: DocumentRecord | null = null;
  if (options.reuseCache !== false) {
    emit({ ...base, stage: "cache", label: INGEST_LABELS.cache, percent: 9 });
    previous = await findDocumentByHash(hash).catch(() => null);
    if (previous && previous.status === "ready" && previous.text.trim()) {
      const progress: IngestProgress = {
        stage: "ready",
        label: "Já lido antes · reutilizado",
        pagesDone: previous.totalPages,
        totalPages: previous.totalPages,
        chars: previous.totalChars,
        percent: 100,
        cached: true,
      };
      emit(progress);
      recordDuration("upload:document-ready", 0);
      return { record: previous, cached: true, cancelled: false, warnings: previous.warnings };
    }
  }

  // A partial extraction is re-read, but reusing its id avoids duplicates.
  const recordId = previous?.id ?? uid();
  const createdAt = previous?.createdAt;
  // Re-wrap the bytes so the extractor never re-reads the file from disk.
  const source =
    typeof File === "function"
      ? new File([bytes as unknown as BlobPart], file.name, {
          type: file.type,
          lastModified: file.lastModified ?? Date.now(),
        })
      : file;

  const stopExtraction = startTimer("upload:extraction-start");
  let firstPageReported = false;
  const onExtractionProgress = (progress: ExtractionProgress) => {
    if (progress.stage === "opened") {
      emit({
        stage: "opening",
        label: `PDF aberto · ${progress.totalPages} página(s)`,
        pagesDone: 0,
        totalPages: progress.totalPages,
        chars: 0,
        percent: 10,
      });
      return;
    }
    if (progress.stage === "reading" || progress.stage === "text") {
      emit({
        stage: "reading",
        label: "A ler texto",
        pagesDone: progress.pagesDone,
        totalPages: progress.totalPages || 1,
        chars: progress.chars,
        percent: progress.percent,
      });
      return;
    }
    if (progress.stage === "page" || progress.stage === "done") {
      if (!firstPageReported) {
        firstPageReported = true;
        recordDuration("upload:first-page", stopExtraction());
      }
      emit({
        stage: progress.stage === "done" ? "indexing" : "pages",
        label:
          progress.stage === "done"
            ? INGEST_LABELS.indexing
            : `Página ${progress.pagesDone} de ${progress.totalPages}`,
        pagesDone: progress.pagesDone,
        totalPages: progress.totalPages,
        chars: progress.chars,
        percent: progress.percent,
      });
    }
  };

  let result: ExtractionResult;
  try {
    result = await extractDocument(source, {
      signal: options.signal,
      onProgress: onExtractionProgress,
    });
  } catch (error) {
    if (isCancelled(error) && error instanceof DocumentExtractionError) {
      const record = partialRecordFrom(error, file, hash, { id: recordId, createdAt }, "partial");
      if (record) {
        await saveDocument(record).catch(() => undefined);
        emit({
          stage: "cancelled",
          label: "Leitura cancelada · texto parcial guardado",
          pagesDone: record.processedPages,
          totalPages: record.totalPages,
          chars: record.totalChars,
          percent: Math.round((record.processedPages / record.totalPages) * 100),
        });
        return {
          record,
          cached: false,
          cancelled: true,
          warnings: ["Leitura cancelada. Só as páginas indicadas foram lidas."],
        };
      }
      emit({ ...base, stage: "cancelled", label: INGEST_LABELS.cancelled, percent: 0 });
      return { record: null, cached: false, cancelled: true, warnings: [] };
    }
    if (error instanceof DocumentExtractionError) {
      const record = partialRecordFrom(error, file, hash, { id: recordId, createdAt }, "error");
      if (record) await saveDocument(record).catch(() => undefined);
      const friendly =
        error.code === "NO_TEXT_LAYER"
          ? "Este PDF não tem camada de texto — é provavelmente uma digitalização (imagens). Não leio o conteúdo como texto. Podes colar o texto manualmente ou usar um PDF com texto selecionável."
          : explainExtractionError(error);
      emit({
        ...base,
        stage: "error",
        label: INGEST_LABELS.error,
        message: friendly,
        ...(record
          ? {
              pagesDone: record.processedPages,
              totalPages: record.totalPages,
              chars: record.totalChars,
            }
          : {}),
      });
      throw new DocumentIngestError(error.code, friendly, record);
    }
    const friendly = explainExtractionError(error);
    emit({ ...base, stage: "error", label: INGEST_LABELS.error, message: friendly });
    throw new DocumentIngestError("READ_FAILED", friendly);
  }

  emit({
    stage: "indexing",
    label: INGEST_LABELS.indexing,
    pagesDone: result.totalPages,
    totalPages: result.totalPages,
    chars: result.text.length,
    percent: 99,
  });

  const warnings = [...result.metadata.warnings];
  if (
    result.metadata.emptyPages.length > 0 &&
    result.metadata.emptyPages.length < result.totalPages
  ) {
    // Already described in metadata.warnings; keep the list explicit for the UI.
    warnings.push(
      `${result.metadata.emptyPages.length} página(s) não tinham texto (imagens). O restante foi lido.`,
    );
  }

  const record = createDocumentRecord({
    id: recordId,
    name: trimName(file.name),
    mime: result.metadata.fileType,
    size: file.size,
    hash,
    status: "ready",
    processedPages: result.totalPages,
    createdAt,
    text: result.text,
    pages: result.pages,
    warnings: Array.from(new Set(warnings)),
  });

  await saveDocument(record);
  recordDuration("upload:document-ready", stopExtraction());

  emit({
    stage: "ready",
    label: INGEST_LABELS.ready,
    pagesDone: result.totalPages,
    totalPages: result.totalPages,
    chars: result.text.length,
    percent: 100,
  });

  return {
    record,
    cached: false,
    cancelled: false,
    warnings: Array.from(new Set(warnings)),
  };
}

/** Human summary of a document status, reused by every panel. */
export function describeDocumentStatus(record: {
  status: string;
  processedPages: number;
  totalPages: number;
}): string {
  switch (record.status) {
    case "ready":
      return `${record.totalPages} página(s) lidas`;
    case "partial":
      return `${record.processedPages} de ${record.totalPages} página(s) — leitura parcial`;
    case "error":
      return `Erro de leitura · ${record.processedPages} de ${record.totalPages} página(s)`;
    case "processing":
      return `A processar · ${record.processedPages} de ${record.totalPages}`;
    case "queued":
      return "Em fila";
    default:
      return record.status;
  }
}
