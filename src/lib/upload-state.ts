import type { IngestProgress, IngestStage } from "./document-pipeline";
import type { DocumentRecord } from "./documents";

/**
 * Explicit upload state machine.
 *
 * Every upload ends in `ready`, `partial`, `error` or `cancelled`. Intermediate
 * states carry the operation id, so a late result from an old upload can never
 * overwrite the state of a newer one.
 */

/** Stable stage names used in developer logs and by the upload UI. */
export type UploadStage =
  | "selected"
  | "reading"
  | "loading-pdf"
  | "extracting"
  | "chunking"
  | "persisting"
  | "ready"
  | "partial"
  | "error"
  | "cancelled";

export type UploadProgress = {
  operationId: string;
  stage: UploadStage;
  progress: number;
  processedPages?: number;
  totalPages?: number;
  processedCharacters?: number;
  totalBytes?: number;
  message: string;
};

export function toUploadStage(stage: IngestStage): UploadStage {
  switch (stage) {
    case "selected":
    case "validating":
    case "hashing":
    case "cache":
      return "selected";
    case "reading":
      return "reading";
    case "opening":
    case "pages":
      return "loading-pdf";
    case "indexing":
      return "extracting";
    case "persisting":
      return "persisting";
    case "ready":
    case "partial":
    case "cancelled":
      return stage;
    default:
      return "error";
  }
}

export function toUploadProgress(
  operationId: string,
  file: File,
  progress: IngestProgress,
): UploadProgress {
  return {
    operationId,
    stage: toUploadStage(progress.stage),
    progress: progress.percent,
    processedPages: progress.pagesDone,
    totalPages: progress.totalPages,
    processedCharacters: progress.chars,
    totalBytes: file.size,
    message: progress.message?.trim() || progress.label,
  };
}

export type UploadStatus =
  "idle" | "reading" | "extracting" | "indexing" | "ready" | "partial" | "error" | "cancelled";

export type UploadState =
  | { status: "idle" }
  | {
      status: "reading" | "extracting" | "indexing";
      operationId: string;
      file: File;
      progress: IngestProgress;
    }
  | { status: "ready"; operationId: string; document: DocumentRecord; cached: boolean }
  | { status: "partial"; operationId: string; document: DocumentRecord; reason: string }
  | {
      status: "error";
      operationId: string;
      file: File | null;
      fileName: string;
      error: string;
      code: string;
      canRetry: boolean;
      partial: DocumentRecord | null;
    }
  | {
      status: "cancelled";
      operationId: string;
      fileName: string;
      document: DocumentRecord | null;
    };

export type BusyUploadState = Extract<
  UploadState,
  { status: "reading" | "extracting" | "indexing" }
>;

export function isUploadBusy(state: UploadState): state is BusyUploadState {
  return state.status === "reading" || state.status === "extracting" || state.status === "indexing";
}

/** Status derived from the pipeline stage (never a fake timer). */
export function uploadStatusForStage(stage: IngestStage): UploadStatus {
  switch (stage) {
    case "selected":
    case "validating":
    case "hashing":
    case "cache":
    case "reading":
      return "reading";
    case "opening":
    case "pages":
      return "extracting";
    case "indexing":
    case "persisting":
      return "indexing";
    case "ready":
      return "ready";
    case "partial":
      return "partial";
    case "cancelled":
      return "cancelled";
    default:
      return "error";
  }
}

/** Builds the intermediate state for a progress event of the active operation. */
/** True only for stages that the UI should show as "in progress". */
export function isProgressStage(stage: IngestStage): boolean {
  return stage !== "ready" && stage !== "partial" && stage !== "error" && stage !== "cancelled";
}

export function progressToUploadState(
  operationId: string,
  file: File,
  progress: IngestProgress,
): UploadState {
  const mapped = uploadStatusForStage(progress.stage);
  // Only intermediate statuses are valid here; terminal ones are set by the caller.
  const status: "reading" | "extracting" | "indexing" =
    mapped === "extracting" ? "extracting" : mapped === "indexing" ? "indexing" : "reading";
  return { status, operationId, file, progress };
}

export type AttachmentView = {
  file: { name: string; size: number; type: string } | null;
  progress: IngestProgress | null;
  record: {
    status: string;
    totalPages: number;
    processedPages: number;
    totalChars: number;
    warnings: string[];
  } | null;
  error: string | null;
  cancelled: boolean;
  scanned: boolean;
};

/** Adapts the state machine to the props of `AttachmentPreview`. */
export function attachmentView(state: UploadState): AttachmentView {
  const empty: AttachmentView = {
    file: null,
    progress: null,
    record: null,
    error: null,
    cancelled: false,
    scanned: false,
  };
  switch (state.status) {
    case "idle":
      return empty;
    case "reading":
    case "extracting":
    case "indexing":
      return {
        ...empty,
        file: state.file,
        progress: state.progress,
      };
    case "ready":
      return {
        ...empty,
        file: { name: state.document.name, size: state.document.size, type: state.document.mime },
        progress: {
          stage: "ready",
          label: state.cached ? "Já lido antes · reutilizado" : "Pronto a usar",
          pagesDone: state.document.totalPages,
          totalPages: state.document.totalPages,
          chars: state.document.totalChars,
          percent: 100,
          cached: state.cached,
        },
        record: state.document,
      };
    case "partial":
      return {
        ...empty,
        file: { name: state.document.name, size: state.document.size, type: state.document.mime },
        progress: {
          stage: "partial",
          label: "Leitura parcial",
          pagesDone: state.document.processedPages,
          totalPages: state.document.totalPages,
          chars: state.document.totalChars,
          percent: Math.round(
            (state.document.processedPages / Math.max(1, state.document.totalPages)) * 100,
          ),
        },
        record: state.document,
        error: null,
      };
    case "error":
      return {
        ...empty,
        file:
          state.file || state.partial
            ? {
                name: state.fileName,
                size: state.file?.size ?? state.partial?.size ?? 0,
                type: state.file?.type ?? state.partial?.mime ?? "",
              }
            : { name: state.fileName, size: 0, type: "" },
        record: state.partial,
        error: state.error,
        scanned: state.code === "NO_TEXT_LAYER",
      };
    case "cancelled":
      return {
        ...empty,
        file: { name: state.fileName, size: 0, type: "" },
        cancelled: true,
        record: state.document,
        error: state.document ? null : null,
      };
  }
}

/** True when the operation must be ignored because a newer one is active. */
export function isStale(activeId: string | null, operationId: string): boolean {
  return activeId !== null && activeId !== operationId;
}
