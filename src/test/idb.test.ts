import { beforeEach, describe, expect, it } from "vitest";

import { createDocumentRecord } from "../lib/documents";
import {
  __resetMemoryDocuments,
  clearDocuments,
  deleteDocument,
  isIndexedDbAvailable,
  listDocuments,
  loadDocument,
  saveDocument,
} from "../lib/idb";

function record(id = "doc-1", name = "notas.md") {
  return createDocumentRecord({
    id,
    name,
    mime: "text/markdown",
    size: 120,
    text: `${"Parágrafo de estudo com conteúdo. ".repeat(80)}`,
    pages: [
      {
        page: 1,
        text: `${"Parágrafo de estudo com conteúdo. ".repeat(80)}`,
        charStart: 0,
        charEnd: `${"Parágrafo de estudo com conteúdo. ".repeat(80)}`.length,
      },
    ],
  });
}

describe("document storage", () => {
  beforeEach(() => {
    __resetMemoryDocuments();
  });

  it("round-trips a document without using localStorage", async () => {
    localStorage.clear();
    const doc = record();
    await saveDocument(doc);

    const loaded = await loadDocument(doc.id);
    expect(loaded?.text).toBe(doc.text);
    expect(loaded?.chunks).toHaveLength(doc.chunks.length);
    expect(loaded?.chunks[0]?.hash).toBe(doc.chunks[0]?.hash);
    expect(loaded?.totalPages).toBe(1);
    // Nothing large leaked into localStorage.
    expect(Object.keys(localStorage)).toHaveLength(0);
  });

  it("lists, deletes and clears documents", async () => {
    await saveDocument(record("a", "a.md"));
    await saveDocument(record("b", "b.md"));
    const listed = await listDocuments();
    expect(listed.map((doc) => doc.id).sort()).toEqual(["a", "b"]);
    expect(listed[0]).toHaveProperty("totalChars");
    expect(listed[0]).toHaveProperty("chunkCount");

    await deleteDocument("a");
    expect(await loadDocument("a")).toBeNull();
    expect((await listDocuments()).map((doc) => doc.id)).toEqual(["b"]);

    await clearDocuments();
    expect(await listDocuments()).toEqual([]);
  });

  it("replaces the chunk set of an existing document", async () => {
    const doc = record("replace-me");
    await saveDocument(doc);
    expect((await loadDocument(doc.id))?.chunks.length).toBeGreaterThan(0);

    await saveDocument({ ...doc, chunks: [] });
    const loaded = await loadDocument(doc.id);
    expect(loaded?.chunks).toEqual([]);
    expect(loaded?.totalChars).toBe(doc.totalChars);
  });

  it("rejects an invalid record instead of persisting it", async () => {
    await expect(saveDocument({ ...record(), totalChars: -1 } as never)).rejects.toThrow();
  });

  it("reports whether the browser has IndexedDB", () => {
    expect(typeof isIndexedDbAvailable()).toBe("boolean");
  });
});
