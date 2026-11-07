import { beforeEach, describe, expect, it } from "vitest";

import {
  DocumentIngestError,
  ingestDocumentFile,
  hashFileBytes,
  validateDocumentFile,
  DEFAULT_INGEST_LIMITS,
  type IngestProgress,
} from "../lib/document-pipeline";
import {
  DocumentExtractionError,
  explainExtractionError,
  extractPdfDocument,
  type ExtractionProgress,
  type PdfTextItemLike,
} from "../lib/extract";
import {
  __resetMemoryDocuments,
  findDocumentByHash,
  listDocuments,
  loadDocument,
} from "../lib/idb";

function textFile(text: string, name = "apontamentos.txt", type = "text/plain"): File {
  return new File([text], name, { type });
}

/** Fake pdf.js document: every page returns a controlled string. */
function fakePdf(pageTexts: string[]) {
  return {
    numPages: pageTexts.length,
    async getPage(pageNumber: number) {
      const text = pageTexts[pageNumber - 1] ?? "";
      return {
        async getTextContent() {
          return { items: text ? [{ str: text } as PdfTextItemLike] : [] };
        },
      };
    },
  };
}

describe("upload validation", () => {
  it("rejects empty, oversized, unsupported and over-long names", () => {
    const empty = validateDocumentFile(new File([], "vazio.txt", { type: "text/plain" }));
    expect(empty).toMatchObject({ ok: false, code: "EMPTY_FILE" });

    const big = validateDocumentFile(
      { name: "grande.pdf", size: DEFAULT_INGEST_LIMITS.maxBytes + 1, type: "application/pdf" },
      DEFAULT_INGEST_LIMITS,
    );
    expect(big).toMatchObject({ ok: false, code: "TOO_LARGE" });

    const binary = validateDocumentFile({
      name: "virus.exe",
      size: 10,
      type: "application/octet-stream",
    });
    expect(binary).toMatchObject({ ok: false, code: "UNSUPPORTED_TYPE" });

    const longName = validateDocumentFile({
      name: `${"a".repeat(200)}.pdf`,
      size: 10,
      type: "application/pdf",
    });
    expect(longName).toMatchObject({ ok: false, code: "NAME_TOO_LONG" });
  });

  it("accepts the documented formats", () => {
    for (const [name, type] of [
      ["a.pdf", "application/pdf"],
      ["a.md", "text/markdown"],
      ["a.csv", "text/csv"],
      ["a.json", "application/json"],
      ["a.py", "text/x-python"],
      ["a.tsx", "text/plain"],
    ] as const) {
      expect(validateDocumentFile({ name, size: 100, type })).toEqual({ ok: true });
    }
  });
});

describe("file hashing and cache", () => {
  beforeEach(() => __resetMemoryDocuments());

  it("hashes the bytes deterministically", async () => {
    const bytes = new TextEncoder().encode("conteúdo de estudo");
    const first = await hashFileBytes(bytes);
    const second = await hashFileBytes(bytes);
    expect(first).toBe(second);
    expect(first).toMatch(/^(sha256|fnv1a):/);
    expect(await hashFileBytes(new TextEncoder().encode("outro"))).not.toBe(first);
  });

  it("reuses an identical file instead of reading it twice", async () => {
    // 25 000 characters: well past the old 18 000 truncation limit.
    const text = "Linha de estudo com detalhe suficiente. ".repeat(650);
    const first = await ingestDocumentFile(textFile(text));
    expect(first.cached).toBe(false);
    expect(first.record?.totalChars).toBeGreaterThan(18_000);
    expect(first.record?.text.length).toBeGreaterThan(18_000);
    expect(first.record?.status).toBe("ready");
    expect(first.record?.chunkCount ?? 0).toBeGreaterThan(1);

    const second = await ingestDocumentFile(textFile(text));
    expect(second.cached).toBe(true);
    expect(second.record?.id).toBe(first.record?.id);

    const stored = await findDocumentByHash(first.record?.hash ?? "");
    expect(stored?.id).toBe(first.record?.id);
    const summaries = await listDocuments();
    expect(summaries).toHaveLength(1);
    const loaded = await loadDocument(first.record!.id);
    expect(loaded?.text.length).toBe(text.length);
  });

  it("reports every stage with real progress and never truncates", async () => {
    const stages: IngestProgress["stage"][] = [];
    const text = "Estudo aprofundado. ".repeat(1_500);
    const outcome = await ingestDocumentFile(textFile(text), {
      onProgress: (progress) => stages.push(progress.stage),
    });
    expect(stages[0]).toBe("selected");
    expect(stages).toContain("hashing");
    expect(stages).toContain("indexing");
    expect(stages.at(-1)).toBe("ready");
    expect(outcome.record?.text.length).toBe(text.length);
  });

  it("cancels before reading without creating an empty document", async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await ingestDocumentFile(textFile("texto suficiente"), {
      signal: controller.signal,
    });
    expect(outcome.cancelled).toBe(true);
    expect(outcome.record).toBeNull();
  });

  it("surfaces validation failures as friendly ingest errors", async () => {
    await expect(
      ingestDocumentFile(new File([], "vazio.txt", { type: "text/plain" })),
    ).rejects.toBeInstanceOf(DocumentIngestError);
  });
});

describe("incremental PDF extraction", () => {
  it("reports progress page by page and keeps all pages", async () => {
    const pageTexts = Array.from(
      { length: 40 },
      (_, index) => `Página ${index + 1}. ${"Conteúdo denso de estudo. ".repeat(120)}`,
    );
    const progress: ExtractionProgress["stage"][] = [];
    const result = await extractPdfDocument(
      fakePdf(pageTexts),
      { fileName: "grande.pdf", fileSize: 1_000_000 },
      {
        onProgress: (event) => progress.push(event.stage),
        yieldEvery: 4,
      },
    );
    expect(result.pages).toHaveLength(40);
    expect(result.text.length).toBeGreaterThan(18_000);
    expect(result.truncated).toBe(false);
    expect(progress.filter((stage) => stage === "page")).toHaveLength(40);
    expect(progress[0]).toBe("opened");
    expect(progress.at(-1)).toBe("done");
  });

  it("keeps the pages already read when cancelled mid-way", async () => {
    const controller = new AbortController();
    const pageTexts = Array.from({ length: 30 }, (_, index) => `Página ${index + 1} com texto.`);
    const promise = extractPdfDocument(
      fakePdf(pageTexts),
      { fileName: "cancelar.pdf", fileSize: 1000 },
      {
        signal: controller.signal,
        yieldEvery: 1,
        onProgress: (event) => {
          if (event.stage === "page" && event.pagesDone >= 5) controller.abort();
        },
      },
    );
    await expect(promise).rejects.toMatchObject({ code: "CANCELLED" });
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentExtractionError);
      const partial = (error as DocumentExtractionError).partial;
      expect(partial?.readPages).toBeGreaterThanOrEqual(5);
      expect(partial?.readPages).toBeLessThan(30);
      expect(partial?.text.length).toBeGreaterThan(0);
      expect(partial?.unreadRange?.from).toBe((partial?.readPages ?? 0) + 1);
    }
  });

  it("detects scanned PDFs with no text layer instead of claiming success", async () => {
    await expect(
      extractPdfDocument(fakePdf(["", "", ""]), { fileName: "scan.pdf", fileSize: 100 }),
    ).rejects.toMatchObject({ code: "NO_TEXT_LAYER" });
    expect(explainExtractionError(new DocumentExtractionError("NO_TEXT_LAYER", "scan"))).toContain(
      "digitalização",
    );
  });

  it("explains corrupted and protected PDFs", () => {
    expect(explainExtractionError(new DocumentExtractionError("PDF_LOAD_FAILED", "x"))).toContain(
      "corrompido",
    );
    expect(
      explainExtractionError(new DocumentExtractionError("PASSWORD_PROTECTED", "x")),
    ).toContain("palavra-passe");
  });
});
