import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: mocks.getDocument,
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/assets/pdf.worker.js" }));

import * as pdfjs from "pdfjs-dist";
import { DocumentExtractionError, readPdfDocument } from "../lib/extract";

function pdfFile(): File {
  return new File([new Uint8Array([37, 80, 68, 70])], "estudo.pdf", { type: "application/pdf" });
}

function page(text: string) {
  return { getTextContent: async () => ({ items: [{ str: text, hasEOL: false }] }) };
}

describe("pdf.js integration", () => {
  beforeEach(() => {
    mocks.getDocument.mockReset();
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  });

  it("loads the worker on demand, reads every page and destroys the document", async () => {
    const destroy = vi.fn(async () => undefined);
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async (number: number) =>
          page(`Página ${number} com texto suficiente para ser extraído corretamente.`),
        getMetadata: async () => ({ info: { Title: "Biologia", Producer: "Teste" } }),
        destroy,
      }),
    });

    const progress: number[] = [];
    const result = await readPdfDocument(pdfFile(), {
      onProgress: (event) => progress.push(event.pagesDone),
    });

    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe("/assets/pdf.worker.js");
    expect(mocks.getDocument).toHaveBeenCalledTimes(1);
    expect(result.totalPages).toBe(3);
    expect(result.pages).toHaveLength(3);
    expect(result.text).toContain("Página 3");
    expect(result.complete).toBe(true);
    expect(progress.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(progress.at(-1)).toBe(3);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("reports a corrupt PDF without leaving a worker open", async () => {
    const destroy = vi.fn(async () => undefined);
    mocks.getDocument.mockImplementation(() => {
      const promise = Promise.reject(
        Object.assign(new Error("Invalid PDF structure"), { name: "InvalidPDFException" }),
      );
      promise.catch(() => undefined);
      return { promise, destroy };
    });

    await expect(readPdfDocument(pdfFile())).rejects.toMatchObject({
      code: "PDF_LOAD_FAILED",
    });
    await expect(readPdfDocument(pdfFile())).rejects.toBeInstanceOf(DocumentExtractionError);
  });

  it("explains a password-protected PDF", async () => {
    mocks.getDocument.mockImplementation(() => {
      const promise = Promise.reject(new Error("No password given"));
      promise.catch(() => undefined);
      return { promise };
    });
    await expect(readPdfDocument(pdfFile())).rejects.toMatchObject({
      code: "PASSWORD_PROTECTED",
    });
  });

  it("rejects a scanned PDF with no text layer instead of silently truncating", async () => {
    const destroy = vi.fn(async () => undefined);
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async () => page(""),
        destroy,
      }),
    });
    await expect(readPdfDocument(pdfFile())).rejects.toMatchObject({
      code: "NO_TEXT_LAYER",
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
