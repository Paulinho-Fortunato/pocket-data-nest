import { afterEach, describe, expect, it, vi } from "vitest";

import { ingestDocumentFile } from "../lib/document-pipeline";
import { createDocumentRecord } from "../lib/documents";
import {
  IdbError,
  __resetMemoryDocuments,
  __setIdbTimeoutsForTests,
  saveDocument,
} from "../lib/idb";

function hangingFile(name = "lento.pdf"): File {
  const file = new File(["%PDF-1.4"], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: () => new Promise<ArrayBuffer>(() => {}),
  });
  return file;
}

describe("upload timeouts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __setIdbTimeoutsForTests({ open: 8_000, tx: 15_000 });
    __resetMemoryDocuments();
  });

  it("ends with a TIMEOUT error instead of spinning forever", async () => {
    const started = Date.now();
    await expect(
      ingestDocumentFile(hangingFile(), { timeouts: { readMs: 30 } }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("can retry after a timeout without reloading the page", async () => {
    await expect(
      ingestDocumentFile(hangingFile(), { timeouts: { readMs: 20 } }),
    ).rejects.toBeInstanceOf(Error);

    const retry = await ingestDocumentFile(
      new File(["texto de estudo com detalhe suficiente para indexar."], "ok.txt", {
        type: "text/plain",
      }),
    );
    expect(retry.record?.status).toBe("ready");
    expect(retry.cancelled).toBe(false);
  });

  it("rejects with an explicit database error when IndexedDB never opens", async () => {
    const request = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
      result: undefined,
      error: null,
    };
    vi.stubGlobal("indexedDB", { open: () => request });
    __setIdbTimeoutsForTests({ open: 25 });

    const record = createDocumentRecord({
      id: "doc-db",
      name: "notas.txt",
      mime: "text/plain",
      size: 10,
      text: "texto suficiente para o teste",
      pages: [{ page: 1, text: "texto suficiente para o teste", charStart: 0, charEnd: 28 }],
    });
    await expect(saveDocument(record)).rejects.toBeInstanceOf(IdbError);
  });
});

describe("agent tool timeout", () => {
  it("returns a failure instead of hanging when the signal is aborted", async () => {
    const { executeAgentTool } = await import("../lib/agent/tools");
    const controller = new AbortController();
    controller.abort();
    const result = await executeAgentTool(
      "list_user_documents",
      {},
      { documents: [], signal: controller.signal },
      50,
    );
    expect(result.ok).toBe(false);
  });
});
