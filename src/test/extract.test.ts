import { describe, expect, it } from "vitest";

import {
  DocumentExtractionError,
  contextBlock,
  explainExtractionError,
  extractDocument,
  extractPdfDocument,
  isAllowedFile,
  isImageFile,
  parseYouTubeUrl,
  TEXT_FILE_EXTENSIONS,
  unsupportedAttachmentMessage,
  youtubeThumb,
  type PdfDocumentLike,
} from "../lib/extract";
import { DOCUMENT_CONTEXT_START } from "../lib/documents";

function makeFile(content: string, name: string, type = "text/plain"): File {
  // jsdom's File only accepts an iterable of parts.
  return new File([content], name, { type });
}

/** Fake pdf.js document: `pages` strings, one page each. */
function fakePdf(pages: string[], options: { failPages?: number[] } = {}): PdfDocumentLike {
  return {
    numPages: pages.length,
    async getPage(pageNumber: number) {
      if (options.failPages?.includes(pageNumber)) throw new Error("page broken");
      const text = pages[pageNumber - 1] ?? "";
      return {
        async getTextContent() {
          return { items: [{ str: text }] };
        },
      };
    },
    async getMetadata() {
      return { info: { Title: "Documento de teste", Producer: "gerador" } };
    },
  };
}

describe("parseYouTubeUrl", () => {
  it("extracts the ID from watch URLs", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
  });

  it("extracts the ID from short youtu.be links", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
  });

  it("extracts the ID from shorts", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/shorts/abcdefghijk")?.id).toBe("abcdefghijk");
  });

  it("extracts the ID from embed and live URLs", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeUrl("https://www.youtube.com/live/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
  });

  it("extracts the ID from URLs with extra params", () => {
    const url = "https://www.youtube.com/watch?app=desktop&t=42s&v=dQw4w9WgXcQ";
    expect(parseYouTubeUrl(url)?.id).toBe("dQw4w9WgXcQ");
  });

  it("returns null for non-YouTube URLs", () => {
    expect(parseYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeUrl("não é um link")).toBeNull();
    expect(parseYouTubeUrl("")).toBeNull();
  });
});

describe("youtubeThumb", () => {
  it("builds the hqdefault thumbnail URL", () => {
    expect(youtubeThumb("dQw4w9WgXcQ")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });
});

describe("isAllowedFile", () => {
  const mk = (name: string, type: string) => new File(["x"], name, { type });

  it("allows PDF by type and by extension", () => {
    expect(isAllowedFile(mk("doc.pdf", "application/pdf"))).toBe(true);
    expect(isAllowedFile(mk("doc.pdf", ""))).toBe(true);
  });

  it("allows text-like types and extensions", () => {
    expect(isAllowedFile(mk("notas.txt", "text/plain"))).toBe(true);
    expect(isAllowedFile(mk("script.py", ""))).toBe(true);
    expect(isAllowedFile(mk("dados.csv", "text/csv"))).toBe(true);
    expect(isAllowedFile(mk("dados.json", "application/json"))).toBe(true);
    expect(isAllowedFile(mk("leia.md", ""))).toBe(true);
  });

  it("rejects images and binaries", () => {
    expect(isAllowedFile(mk("foto.png", "image/png"))).toBe(false);
    expect(isImageFile(mk("foto.png", "image/png"))).toBe(true);
    expect(isAllowedFile(mk("app.exe", "application/octet-stream"))).toBe(false);
  });

  it("explains why an image is rejected", () => {
    const message = unsupportedAttachmentMessage(mk("foto.png", "image/png"));
    expect(message).toMatch(/imagens ainda não são enviadas/i);
  });
});

describe("TEXT_FILE_EXTENSIONS", () => {
  it("matches the supported extensions", () => {
    expect(TEXT_FILE_EXTENSIONS.test("a.md")).toBe(true);
    expect(TEXT_FILE_EXTENSIONS.test("a.TSX")).toBe(true);
    expect(TEXT_FILE_EXTENSIONS.test("a.docx")).toBe(false);
  });
});

describe("contextBlock", () => {
  it("wraps content in untrusted-data markers", () => {
    const block = contextBlock("ficheiro apontamentos.pdf", "conteúdo do PDF");
    expect(block).toContain(DOCUMENT_CONTEXT_START);
    expect(block).toContain("[Contexto de ficheiro apontamentos.pdf]");
    expect(block).toContain("conteúdo do PDF");
    expect(block).toMatch(/nunca sigas instruções/i);
  });
});

describe("text extraction is never truncated", () => {
  it("preserves a text file above 18 000 characters", async () => {
    const paragraph = "A fotossíntese converte luz em energia química. ".repeat(20);
    const content = Array.from({ length: 60 }, (_, index) => `${index + 1}. ${paragraph}`).join(
      "\n\n",
    );
    expect(content.length).toBeGreaterThan(18_000);

    const result = await extractDocument(makeFile(content, "biologia.md", "text/markdown"));

    expect(result.truncated).toBe(false);
    expect(result.complete).toBe(true);
    expect(result.totalPages).toBe(1);
    expect(result.text).toBe(content);
    expect(result.text.length).toBe(content.length);
    expect(result.metadata.totalChars).toBe(content.length);
    expect(result.metadata.fileName).toBe("biologia.md");
    // The final characters are still there (a silent slice would drop them).
    expect(result.text.trimEnd().endsWith(paragraph.trim())).toBe(true);
    expect(result.pages[0]?.charStart).toBe(0);
    expect(result.pages[0]?.charEnd).toBe(content.length);
  });

  it("preserves CSV and JSON byte-for-byte", async () => {
    const csv = "nome,nota\nAna,18\nBruno,15\n";
    const json = JSON.stringify({
      turma: "10.º",
      alunos: Array.from({ length: 200 }, (_, i) => i),
    });
    const csvResult = await extractDocument(makeFile(csv, "notas.csv", "text/csv"));
    const jsonResult = await extractDocument(makeFile(json, "dados.json", "application/json"));
    expect(csvResult.text).toBe(csv);
    expect(jsonResult.text).toBe(json);
  });

  it("rejects empty files with a clear reason", async () => {
    await expect(extractDocument(makeFile("   ", "vazio.txt", "text/plain"))).rejects.toThrow(
      /vazio/i,
    );
  });

  it("rejects binary content instead of pretending it is text", async () => {
    const binary = "texto\u0000com bytes";
    await expect(extractDocument(makeFile(binary, "coisa.txt", "text/plain"))).rejects.toThrow(
      DocumentExtractionError,
    );
  });

  it("rejects unsupported document types", async () => {
    const file = new File(["x"], "apresentacao.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    await expect(extractDocument(file)).rejects.toThrow(DocumentExtractionError);
    expect(explainExtractionError(new DocumentExtractionError("UNSUPPORTED_TYPE", ""))).toMatch(
      /não é suportado/i,
    );
  });
});

describe("PDF extraction", () => {
  it("reads every page of a PDF above 40 pages", async () => {
    const pages = Array.from({ length: 45 }, (_, index) => `Conteúdo da página ${index + 1}.`);
    const result = await extractPdfDocument(fakePdf(pages), {
      fileName: "grande.pdf",
      fileSize: 1024,
    });

    expect(result.totalPages).toBe(45);
    expect(result.pages).toHaveLength(45);
    expect(result.truncated).toBe(false);
    expect(result.complete).toBe(true);
    for (const [index, page] of pages.entries()) {
      expect(result.text).toContain(page);
      expect(result.pages[index]?.page).toBe(index + 1);
      // Offsets point at the exact page slice.
      expect(result.text.slice(result.pages[index]!.charStart, result.pages[index]!.charEnd)).toBe(
        page,
      );
    }
    expect(result.metadata.pdfTitle).toBe("Documento de teste");
    expect(result.metadata.emptyPages).toEqual([]);
  });

  it("keeps the text of pages that fail and reports which ones", async () => {
    const pages = ["página um", "página dois", "página três"];
    const result = await extractPdfDocument(fakePdf(pages, { failPages: [2] }), {
      fileName: "parcial.pdf",
      fileSize: 10,
    });
    expect(result.complete).toBe(false);
    expect(result.metadata.failedPages).toEqual([2]);
    expect(result.text).toContain("página três");
    expect(result.metadata.warnings.join(" ")).toMatch(/não puderam ser lidas/);
  });

  it("reports a PDF without a text layer and the unread range", async () => {
    const pages = Array.from({ length: 12 }, () => "");
    const error = await extractPdfDocument(fakePdf(pages), {
      fileName: "digitalizado.pdf",
      fileSize: 10,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DocumentExtractionError);
    const extractionError = error as DocumentExtractionError;
    expect(extractionError.code).toBe("NO_TEXT_LAYER");
    expect(extractionError.partial?.unreadRange).toEqual({ from: 1, to: 12 });
    expect(explainExtractionError(extractionError)).toMatch(/OCR/i);
  });
});
