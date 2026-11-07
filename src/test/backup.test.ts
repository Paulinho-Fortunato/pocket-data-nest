import { beforeEach, describe, expect, it } from "vitest";

import {
  applyBackup,
  buildBackup,
  deleteAllAppData,
  mergeBackupValues,
  parseBackup,
  serializeBackup,
} from "../lib/backup";
import {
  BACKUP_KEY_SCHEMAS,
  CardSchema,
  ChatMsgSchema,
  DATA_SCHEMA_VERSION,
  NoteSchema,
  StatsSchema,
} from "../lib/schemas";
import { readValidated, writeValidated } from "../lib/store";
import {
  __resetMemoryDocuments,
  clearChatHistory,
  loadChatHistory,
  loadDocument,
  saveChatHistory,
  saveDocument,
} from "../lib/idb";
import { createDocumentRecord } from "../lib/documents";

const stats = {
  name: "Ana",
  xp: 120,
  quizzes: 3,
  correct: 8,
  answered: 10,
  reviewed: 4,
  focusMinutes: 50,
  sessions: 5,
  weeklyGoal: 6,
  days: ["2026-01-01", "2026-01-02"],
};

const cards = [
  { id: "a1", q: "Pergunta?", a: "Resposta", deck: "Biologia", known: false },
  { id: "a2", q: "Outra?", a: "Outra resposta", deck: "Biologia", known: true },
];

function envelope(data: Record<string, unknown>, schemaVersion = DATA_SCHEMA_VERSION) {
  return JSON.stringify({
    app: "AngoStudy",
    type: "backup",
    schemaVersion,
    exportedAt: "2026-01-01T00:00:00.000Z",
    data,
  });
}

beforeEach(() => {
  localStorage.clear();
  __resetMemoryDocuments();
});

function chatMessage(id: string, content: string) {
  return { id, role: "user" as const, content, createdAt: 1 };
}

function documentRecord(id = "doc-1") {
  const text = "Conteúdo de estudo suficiente para um chunk. ".repeat(20);
  return createDocumentRecord({
    id,
    name: `${id}.md`,
    mime: "text/markdown",
    size: text.length,
    text,
    pages: [{ page: 1, text, charStart: 0, charEnd: text.length }],
  });
}

describe("Zod schemas", () => {
  it("accepts valid data and rejects broken shapes", () => {
    expect(StatsSchema.safeParse(stats).success).toBe(true);
    expect(StatsSchema.safeParse({ ...stats, xp: -5 }).success).toBe(false);
    expect(StatsSchema.safeParse({ ...stats, weeklyGoal: 0 }).success).toBe(false);
    expect(StatsSchema.safeParse({ ...stats, days: ["01/01/2026"] }).success).toBe(false);
    expect(CardSchema.safeParse({ id: "1", q: "", a: "x" }).success).toBe(false);
    expect(CardSchema.safeParse({ id: "1", q: "q", a: "a", deck: "x".repeat(200) }).success).toBe(
      false,
    );
    expect(NoteSchema.safeParse({ id: "n", title: "t", body: "b", updated: 1 }).success).toBe(true);
    expect(ChatMsgSchema.safeParse({ role: "system", content: "x" }).success).toBe(false);
  });

  it("validates before persisting", () => {
    expect(writeValidated("stats", StatsSchema, stats)).toBe(true);
    expect(writeValidated("stats", StatsSchema, { ...stats, xp: -1 })).toBe(false);
    const read = readValidated("stats", StatsSchema, stats);
    expect(read.value.xp).toBe(120);
  });

  it("falls back when stored data is corrupted", () => {
    localStorage.setItem("angostudy:cards", "{not json");
    const read = readValidated("cards", BACKUP_KEY_SCHEMAS["angostudy:cards"], []);
    expect(read.value).toEqual([]);
    expect(read.valid).toBe(true);

    localStorage.setItem("angostudy:cards", JSON.stringify([{ id: "x" }]));
    const invalid = readValidated("cards", BACKUP_KEY_SCHEMAS["angostudy:cards"], []);
    expect(invalid.value).toEqual([]);
    expect(invalid.valid).toBe(false);
  });
});

describe("buildBackup", () => {
  it("never exports the OpenRouter key", async () => {
    localStorage.setItem("angostudy:openrouter_key", JSON.stringify("sk-or-secret"));
    localStorage.setItem("angostudy:stats", JSON.stringify(stats));
    localStorage.setItem("angostudy:cards", JSON.stringify(cards));

    const { envelope: built } = await buildBackup();
    const serialized = serializeBackup({ envelope: built, skipped: [] });

    expect(serialized).not.toContain("sk-or-secret");
    expect(serialized).not.toContain("openrouter_key");
    expect(Object.keys(built.data)).toEqual(
      expect.arrayContaining(["angostudy:stats", "angostudy:cards"]),
    );
    expect(built.schemaVersion).toBe(DATA_SCHEMA_VERSION);
  });
});

describe("parseBackup", () => {
  it("rejects invalid JSON", () => {
    const result = parseBackup("não é json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JSON válido/);
  });

  it("rejects an unknown envelope", () => {
    const result = parseBackup(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
  });

  it("rejects non-allow-listed keys", () => {
    const result = parseBackup(
      envelope({ "angostudy:stats": stats, "angostudy:evil": { hacked: true } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/não permitidas/);
  });

  it("rejects invalid values without writing anything", () => {
    const result = parseBackup(envelope({ "angostudy:stats": { xp: "muitos" } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/inválidos/);
    expect(localStorage.getItem("angostudy:stats")).toBeNull();
  });

  it("accepts a valid backup and ignores the secret", () => {
    const result = parseBackup(
      envelope({
        "angostudy:stats": stats,
        "angostudy:cards": cards,
        "angostudy:openrouter_key": "sk-or-secret",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.join(" ")).toMatch(/chave OpenRouter/i);
    expect((result.values as Record<string, unknown>)["angostudy:openrouter_key"]).toBeUndefined();
    expect(localStorage.getItem("angostudy:openrouter_key")).toBeNull();
  });

  it("rejects backups from a newer schema", () => {
    const result = parseBackup(envelope({ "angostudy:stats": stats }, 99));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/versão mais recente/);
  });

  it("migrates legacy flat backups (v0)", () => {
    const legacy = JSON.stringify({
      "angostudy:stats": JSON.stringify(stats),
      "angostudy:cards": JSON.stringify(cards),
    });
    const result = parseBackup(legacy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(0);
    expect(result.values["angostudy:stats"]).toMatchObject({ xp: 120 });
    expect(result.values["angostudy:cards"]).toHaveLength(2);
  });
});

describe("applyBackup", () => {
  it("replaces data when asked to", async () => {
    localStorage.setItem("angostudy:cards", JSON.stringify([cards[0]]));
    const parsed = parseBackup(envelope({ "angostudy:cards": cards }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await applyBackup(parsed.values, "replace");
    expect(JSON.parse(localStorage.getItem("angostudy:cards") ?? "[]")).toHaveLength(2);
  });

  it("merges cards by id and keeps the highest progress", async () => {
    localStorage.setItem("angostudy:cards", JSON.stringify([cards[0]]));
    localStorage.setItem(
      "angostudy:stats",
      JSON.stringify({ ...stats, xp: 500, days: ["2026-01-03"] }),
    );
    localStorage.setItem("angostudy:openrouter_model", JSON.stringify("modelo-atual"));

    const parsed = parseBackup(
      envelope({
        "angostudy:cards": cards,
        "angostudy:stats": stats,
        "angostudy:openrouter_model": "modelo-do-backup",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await applyBackup(parsed.values, "merge");

    const storedCards = JSON.parse(localStorage.getItem("angostudy:cards") ?? "[]");
    expect(storedCards.map((card: { id: string }) => card.id).sort()).toEqual(["a1", "a2"]);

    const storedStats = JSON.parse(localStorage.getItem("angostudy:stats") ?? "{}");
    expect(storedStats.xp).toBe(500);
    expect(storedStats.days).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(storedStats.name).toBe("Ana");

    // A merge never silently changes the selected model.
    expect(JSON.parse(localStorage.getItem("angostudy:openrouter_model") ?? '"?"')).toBe(
      "modelo-atual",
    );
  });

  it("restores chat and documents from IndexedDB and replaces the target", async () => {
    await saveChatHistory([chatMessage("old", "antiga")]);
    await saveDocument(documentRecord("old-doc"));

    await saveChatHistory([chatMessage("new", "nova")]);
    await saveDocument(documentRecord("new-doc"));
    const built = await buildBackup();

    await clearChatHistory();
    await saveChatHistory([chatMessage("target", "a substituir")]);
    await saveDocument(documentRecord("target-doc"));

    const result = await applyBackup(built.envelope.data, "replace", {
      chat: built.envelope.chat,
      documents: built.envelope.documents,
    });

    expect(result.chatRestored).toBe(1);
    expect(result.documentsRestored).toBe(2);
    expect((await loadChatHistory())?.messages).toEqual([chatMessage("new", "nova")]);
    expect(await loadDocument("target-doc")).toBeNull();
    expect(await loadDocument("new-doc")).not.toBeNull();
  });

  it("clears chat and documents when a replace backup has no data", async () => {
    const built = await buildBackup();
    expect(built.envelope.chat).toEqual([]);
    expect(built.envelope.documents).toEqual([]);

    await saveChatHistory([chatMessage("old", "antiga")]);
    await saveDocument(documentRecord("old-doc"));
    localStorage.setItem("angostudy:chat", JSON.stringify([chatMessage("legacy", "antiga")]));

    const result = await applyBackup(built.envelope.data, "replace", {
      chat: built.envelope.chat,
      documents: built.envelope.documents,
    });
    expect(result.chatRestored).toBe(0);
    expect(result.documentsRestored).toBe(0);
    expect(await loadChatHistory()).toBeNull();
    expect(localStorage.getItem("angostudy:chat")).toBeNull();
    expect(await loadDocument("old-doc")).toBeNull();
  });

  it("never writes the API key, even if it slipped into the values", async () => {
    const result = await applyBackup(
      {
        "angostudy:stats": stats,
        "angostudy:openrouter_key": "sk-or-secret",
      } as never,
      "replace",
    );
    expect(result.secretKeysPreserved).toBe(true);
    expect(localStorage.getItem("angostudy:openrouter_key")).toBeNull();
  });

  it("mergeBackupValues does not duplicate chat messages", () => {
    const message = { id: "m1", role: "user" as const, content: "olá" };
    localStorage.setItem("angostudy:chat", JSON.stringify([message]));
    const merged = mergeBackupValues({ "angostudy:chat": [message] }, "merge");
    expect(merged["angostudy:chat"]).toHaveLength(1);
  });
});

describe("deleteAllAppData", () => {
  it("removes only angostudy keys", () => {
    localStorage.setItem("angostudy:stats", JSON.stringify(stats));
    localStorage.setItem("outra-app", "manter");
    deleteAllAppData();
    expect(localStorage.getItem("angostudy:stats")).toBeNull();
    expect(localStorage.getItem("outra-app")).toBe("manter");
  });
});
