import { DocumentRecordSchema } from "./schemas";
import { withTimeout } from "./async-control";
import { diag } from "./diagnostics";
import {
  migrateDocumentRecord,
  type DocumentChunk,
  type DocumentRecord,
  type DocumentSummary,
  summarizeDocument,
} from "./documents";

/**
 * IndexedDB storage for extracted documents.
 *
 * Documents are far too large for localStorage (which is limited to ~5 MB and
 * synchronous). We keep only small preferences there; the full text, the page
 * map and every chunk live in IndexedDB.
 *
 * When IndexedDB is unavailable (private mode, very old browser, unit tests) we
 * fall back to an in-memory map so the current session still works. Nothing is
 * silently written to localStorage.
 */

const DB_NAME = "angostudy-documents";
const DB_VERSION = 3;
const DOCUMENTS = "documents";
const CHUNKS = "chunks";
const CHATS = "chats";
const CHAT_KEY = "current";

type StoredDocument = Omit<DocumentRecord, "chunks">;

type MemoryTable = {
  documents: Map<string, StoredDocument>;
  chunks: Map<string, DocumentChunk[]>;
  chat: StoredChat | null;
};

const memory: MemoryTable = { documents: new Map(), chunks: new Map(), chat: null };

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Tests can shorten these; production values are deliberately generous. */
let openTimeoutMs = 8_000;
let txTimeoutMs = 15_000;

export function __setIdbTimeoutsForTests(options: { open?: number; tx?: number }) {
  if (options.open !== undefined) openTimeoutMs = options.open;
  if (options.tx !== undefined) txTimeoutMs = options.tx;
}

/** IndexedDB reported a real failure (not "unavailable"). Data was not saved. */
export class IdbError extends Error {
  readonly code = "DB_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "IdbError";
  }
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

/**
 * Opens the database with a hard timeout. The cached promise is cleared after a
 * failure so a later attempt can retry instead of reusing a dead promise.
 */
function openDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  const attempt = new Promise<IDBDatabase | null>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new IdbError(
          "O armazenamento do dispositivo não respondeu (IndexedDB). Fecha outras abas da app e tenta novamente.",
        ),
      );
    }, openTimeoutMs);
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      finish(() =>
        reject(
          new IdbError(
            `Não foi possível abrir o armazenamento do dispositivo: ${
              error instanceof Error ? error.message : "erro desconhecido"
            }`,
          ),
        ),
      );
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      let documents: IDBObjectStore;
      if (!db.objectStoreNames.contains(DOCUMENTS)) {
        documents = db.createObjectStore(DOCUMENTS, { keyPath: "id" });
      } else {
        documents = request.transaction!.objectStore(DOCUMENTS);
      }
      // v2: file-content hash index so an identical upload can reuse an
      // extraction instead of reading the PDF again.
      if (!documents.indexNames.contains("hash")) {
        documents.createIndex("hash", "hash", { unique: false });
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        const store = db.createObjectStore(CHUNKS, { keyPath: "chunkId" });
        store.createIndex("documentId", "documentId", { unique: false });
      }
      // v3: conversation history lives here (it can grow past localStorage).
      if (!db.objectStoreNames.contains(CHATS)) {
        db.createObjectStore(CHATS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => finish(() => resolve(request.result));
    request.onerror = () =>
      finish(() => reject(new IdbError("O IndexedDB recusou a abertura (modo privado ou quota).")));
    request.onblocked = () =>
      finish(() =>
        reject(
          new IdbError(
            "O IndexedDB está bloqueado por outra aba com uma versão antiga. Fecha as outras abas e tenta novamente.",
          ),
        ),
      );
  });
  dbPromise = attempt.catch((error) => {
    dbPromise = null;
    diag("idb:open-failed", { message: error instanceof Error ? error.message : "unknown" });
    throw error;
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>, label = "pedido ao IndexedDB"): Promise<T> {
  const response = new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new IdbError(`Falhou ${label}.`));
  });
  return withTimeout(response, txTimeoutMs, "O armazenamento do dispositivo", {
    message: "O armazenamento do dispositivo demorou demasiado a responder.",
  });
}

function transactionDone(tx: IDBTransaction, label = "transação"): Promise<void> {
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new IdbError(`A ${label} no dispositivo falhou.`));
    tx.onabort = () => reject(new IdbError(`A ${label} no dispositivo foi abortada.`));
  });
  return withTimeout(done, txTimeoutMs, "O armazenamento do dispositivo", {
    message: `A ${label} no dispositivo demorou demasiado tempo.`,
  });
}

/** Persists a document and its chunks in one transaction. Throws only on invalid records. */
export async function saveDocument(record: DocumentRecord): Promise<void> {
  const parsed = DocumentRecordSchema.parse(migrateDocumentRecord(record));
  const { chunks, ...stored } = parsed;
  const db = await openDatabase();
  if (!db) {
    memory.documents.set(stored.id, stored);
    memory.chunks.set(stored.id, chunks);
    return;
  }
  // Deleting the old chunks and writing the new record/chunks must be atomic.
  // Otherwise a timeout after the delete leaves a `ready` document with zero
  // chunks, and the tutor silently loses its context.
  const tx = db.transaction([DOCUMENTS, CHUNKS], "readwrite");
  const done = transactionDone(tx, "gravação do documento");
  const chunkStore = tx.objectStore(CHUNKS);
  const abort = () => {
    try {
      tx.abort();
    } catch {
      // Ignore: the transaction may already have finished.
    }
  };
  const cursorRequest = chunkStore.index("documentId").openCursor(IDBKeyRange.only(stored.id));
  cursorRequest.onerror = abort;
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
      return;
    }
    try {
      tx.objectStore(DOCUMENTS).put(stored);
      for (const chunk of chunks) chunkStore.put(chunk);
    } catch {
      abort();
    }
  };
  try {
    await done;
  } catch (error) {
    throw new IdbError(
      `Não foi possível gravar o documento no dispositivo: ${
        error instanceof Error ? error.message : "erro desconhecido"
      }`,
    );
  }
  diag("idb:document-saved", { id: stored.id, chunks: chunks.length, chars: stored.totalChars });
}

/** Deletes a document and its chunks in one transaction (no orphan metadata). */
export async function deleteDocument(id: string): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    memory.documents.delete(id);
    memory.chunks.delete(id);
    return;
  }
  const tx = db.transaction([DOCUMENTS, CHUNKS], "readwrite");
  const done = transactionDone(tx);
  const abort = () => {
    try {
      tx.abort();
    } catch {
      // Ignore.
    }
  };
  const chunkStore = tx.objectStore(CHUNKS);
  tx.objectStore(DOCUMENTS).delete(id);
  const cursorRequest = chunkStore.index("documentId").openCursor(IDBKeyRange.only(id));
  cursorRequest.onerror = abort;
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
  await done;
}

export async function loadDocument(id: string): Promise<DocumentRecord | null> {
  const db = await openDatabase();
  if (!db) {
    const stored = memory.documents.get(id);
    if (!stored) return null;
    return DocumentRecordSchema.parse(
      migrateDocumentRecord({ ...stored, chunks: memory.chunks.get(id) ?? [] }),
    );
  }
  const tx = db.transaction([DOCUMENTS, CHUNKS], "readonly");
  const stored = (await requestToPromise(tx.objectStore(DOCUMENTS).get(id))) as
    StoredDocument | undefined;
  if (!stored) return null;
  const chunks = (await requestToPromise(
    tx.objectStore(CHUNKS).index("documentId").getAll(id),
  )) as DocumentChunk[];
  chunks.sort((a, b) => a.index - b.index);
  return DocumentRecordSchema.parse(migrateDocumentRecord({ ...stored, chunks }));
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const db = await openDatabase();
  if (!db) {
    return Array.from(memory.documents.values())
      .map((stored) => summarizeDocument({ ...stored, chunks: memory.chunks.get(stored.id) ?? [] }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  const tx = db.transaction(DOCUMENTS, "readonly");
  const stored = (await requestToPromise(tx.objectStore(DOCUMENTS).getAll())) as StoredDocument[];
  return stored
    .map((document) => summarizeDocument({ ...document, chunks: [] }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Finds a previously stored document with the same file-content hash.
 * This is what turns a repeated upload into an instant "reused" result.
 */
export async function findDocumentByHash(hash: string): Promise<DocumentRecord | null> {
  if (!hash) return null;
  const db = await openDatabase();
  if (!db) {
    for (const stored of memory.documents.values()) {
      if (stored.hash === hash) {
        return DocumentRecordSchema.parse(
          migrateDocumentRecord({ ...stored, chunks: memory.chunks.get(stored.id) ?? [] }),
        );
      }
    }
    return null;
  }
  const tx = db.transaction(DOCUMENTS, "readonly");
  const store = tx.objectStore(DOCUMENTS);
  let stored: StoredDocument | undefined;
  try {
    stored = (await requestToPromise(store.index("hash").get(hash))) as StoredDocument | undefined;
  } catch {
    // Index missing (older database): fall back to a full scan of the metadata.
    const all = (await requestToPromise(store.getAll())) as StoredDocument[];
    stored = all.find((document) => document.hash === hash);
  }
  if (!stored) return null;
  return loadDocument(stored.id);
}

export async function clearDocuments(): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    memory.documents.clear();
    memory.chunks.clear();
    return;
  }
  const tx = db.transaction([DOCUMENTS, CHUNKS], "readwrite");
  tx.objectStore(DOCUMENTS).clear();
  tx.objectStore(CHUNKS).clear();
  await transactionDone(tx);
}

type StoredChat = {
  id: string;
  messages: unknown[];
  updatedAt: number;
};

/**
 * Saves the conversation history. Only plain data is stored (no API keys, no
 * model responses from other users) and it never leaves the device.
 */
export async function saveChatHistory(messages: unknown[]): Promise<void> {
  const record: StoredChat = { id: CHAT_KEY, messages, updatedAt: Date.now() };
  const db = await openDatabase();
  if (!db) {
    memory.chat = record;
    return;
  }
  const tx = db.transaction(CHATS, "readwrite");
  tx.objectStore(CHATS).put(record);
  await transactionDone(tx);
}

export async function loadChatHistory(): Promise<{
  messages: unknown[];
  updatedAt: number;
} | null> {
  const db = await openDatabase();
  if (!db) return memory.chat;
  const tx = db.transaction(CHATS, "readonly");
  const stored = (await requestToPromise(tx.objectStore(CHATS).get(CHAT_KEY))) as
    StoredChat | undefined;
  return stored ? { messages: stored.messages, updatedAt: stored.updatedAt } : null;
}

export async function clearChatHistory(): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    memory.chat = null;
    return;
  }
  const tx = db.transaction(CHATS, "readwrite");
  tx.objectStore(CHATS).delete(CHAT_KEY);
  await transactionDone(tx);
}

/** Test helper: drops the in-memory fallback between test cases. */
export function __resetMemoryDocuments() {
  memory.documents.clear();
  memory.chunks.clear();
  memory.chat = null;
  dbPromise = null;
}
