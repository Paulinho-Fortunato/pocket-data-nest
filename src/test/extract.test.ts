import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  parseYouTubeUrl,
  youtubeThumb,
  isAllowedFile,
  contextBlock,
  TEXT_FILE_EXTENSIONS,
} = await import("../lib/extract");

describe("parseYouTubeUrl", () => {
  it("extracts the ID from watch URLs", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
  });

  it("extracts the ID from short youtu.be links", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
  });

  it("extracts the ID from shorts", ()   => {
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
  const mk = (name: string, type: string) =>
    new File(["x"], name, { type }) as unknown as File;

  it("allows PDF by type", () => {
    expect(isAllowedFile(mk("doc.pdf", "application/pdf"))).toBe(true);
  });

  it("allows PDF by extension even without type", () => {
    expect(isAllowedFile(mk("doc.pdf", ""))).toBe(true);
  });

  it("allows text-like types and extensions", () => {
    expect(isAllowedFile(mk("notas.txt", "text/plain"))).toBe(true);
    expect(isAllowedFile(mk("script.py", ""))).toBe(true);
    expect(isAllowedFile(mk("dados.csv", "text/csv"))).toBe(true);
  });

  it("rejects unsupported binaries", () => {
    expect(isAllowedFile(mk("foto.png", "image/png"))).toBe(false);
    expect(isAllowedFile(mk("app.exe", "application/octet-stream"))).toBe(false);
  });
});

describe("contextBlock", () => {
  it("wraps content in the expected context markers", () => {
    const block = contextBlock("ficheiro apontamentos.pdf", "conteúdo do PDF");
    expect(block).toContain("[Contexto de ficheiro apontamentos.pdf]");
    expect(block).toContain("conteúdo do PDF");
    expect(block.endsWith("[/Contexto]")).toBe(true);
  });
});

describe("TEXT_FILE_EXTENSIONS", () => {
  it("matches the supported extensions", () => {
    expect(TEXT_FILE_EXTENSIONS.test("a.md")).toBe(true);
    expect(TEXT_FILE_EXTENSIONS.test("a.TSX")).toBe(true);
    expect(TEXT_FILE_EXTENSIONS.test("a.docx")).toBe(false);
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});
