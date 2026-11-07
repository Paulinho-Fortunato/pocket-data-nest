import { describe, expect, it } from "vitest";

import { createDocumentRecord } from "../lib/documents";
import type { IngestProgress } from "../lib/document-pipeline";
import {
  attachmentView,
  isStale,
  isUploadBusy,
  progressToUploadState,
  uploadStatusForStage,
} from "../lib/upload-state";

const file = new File(["conteúdo de estudo"], "notas.txt", { type: "text/plain" });

function record() {
  return createDocumentRecord({
    id: "doc-1",
    name: "notas.txt",
    mime: "text/plain",
    size: file.size,
    text: "conteúdo de estudo",
    pages: [{ page: 1, text: "conteúdo de estudo", charStart: 0, charEnd: 18 }],
  });
}

function progress(stage: IngestProgress["stage"], percent = 20): IngestProgress {
  return {
    stage,
    label: stage,
    pagesDone: 1,
    totalPages: 4,
    chars: 120,
    percent,
  };
}

describe("upload state machine", () => {
  it("maps every pipeline stage to a real UI state", () => {
    expect(uploadStatusForStage("selected")).toBe("reading");
    expect(uploadStatusForStage("pages")).toBe("extracting");
    expect(uploadStatusForStage("persisting")).toBe("indexing");
    expect(uploadStatusForStage("ready")).toBe("ready");
    expect(uploadStatusForStage("error")).toBe("error");
  });

  it("never stays busy once a terminal state is reached", () => {
    const busy = progressToUploadState("op-1", file, progress("pages", 40));
    expect(busy.status).toBe("extracting");
    expect(isUploadBusy(busy)).toBe(true);

    const ready = {
      status: "ready",
      operationId: "op-1",
      document: record(),
      cached: false,
    } as const;
    expect(isUploadBusy(ready)).toBe(false);
    expect(attachmentView(ready).progress?.percent).toBe(100);

    const partial = {
      status: "partial",
      operationId: "op-1",
      document: { ...record(), status: "partial" as const, processedPages: 1 },
      reason: "2 páginas não foram lidas.",
    } as const;
    expect(isUploadBusy(partial)).toBe(false);
    expect(attachmentView(partial).record?.status).toBe("partial");
  });

  it("ignores results from an older operation", () => {
    expect(isStale("op-new", "op-old")).toBe(true);
    expect(isStale("op-new", "op-new")).toBe(false);
    expect(isStale(null, "op-any")).toBe(false);
  });

  it("renders cancelled and error states with an honest message", () => {
    const cancelled = {
      status: "cancelled",
      operationId: "op-1",
      fileName: "notas.txt",
      document: null,
    } as const;
    expect(attachmentView(cancelled).cancelled).toBe(true);
    expect(isUploadBusy(cancelled)).toBe(false);

    const error = {
      status: "error",
      operationId: "op-1",
      file,
      fileName: "notas.txt",
      error: "O dispositivo não confirmou a gravação.",
      code: "DB_ERROR",
      canRetry: true,
      partial: null,
    } as const;
    const view = attachmentView(error);
    expect(view.error).toContain("gravação");
    expect(isUploadBusy(error)).toBe(false);
  });

  it("labels a scanned PDF instead of showing it as ready", () => {
    const error = {
      status: "error",
      operationId: "op-1",
      file: new File(["%PDF"], "scan.pdf", { type: "application/pdf" }),
      fileName: "scan.pdf",
      error: "Sem camada de texto.",
      code: "NO_TEXT_LAYER",
      canRetry: true,
      partial: null,
    } as const;
    expect(attachmentView(error).scanned).toBe(true);
  });
});
