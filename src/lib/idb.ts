import { DocumentRecordSchema } from "./schemas";
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

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
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
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no IndexedDB."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transação IndexedDB falhou."));
    tx.onabort = () => reject(tx.error ?? new Error("Transação IndexedDB abortada."));
  });
}

/** Persists a document and its chunks. Throws only on invalid records. */
export async function saveDocument(record: DocumentRecord): Promise<void> {
  const parsed = DocumentRecordSchema.parse(migrateDocumentRecord(record));
  const { chunks, ...stored } = parsed;
  const db = await openDatabase();
  if (!db) {
    memory.documents.set(stored.id, stored);
    memory.chunks.set(stored.id, chunks);
    return;
  }
  // IndexedDB transactions auto-commit as soon as they are idle, so each step
  // uses its own transaction instead of awaiting between requests.
  await deleteChunksOfDocument(db, stored.id);
  const tx = db.transaction([DOCUMENTS, CHUNKS], "readwrite");
  tx.objectStore(DOCUMENTS).put(stored);
  const chunkStore = tx.objectStore(CHUNKS);
  for (const chunk of chunks) chunkStore.put(chunk);
  await transactionDone(tx);
}

/** Deletes every chunk of a document using a cursor (stays inside one transaction). */
function deleteChunksOfDocument(db: IDBDatabase, documentId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS, "readwrite");
    const request = tx
      .objectStore(CHUNKS)
      .index("documentId")
      .openCursor(IDBKeyRange.only(documentId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("Falha ao substituir os trechos do documento."));
    tx.onabort = () => reject(tx.error ?? new Error("Transação IndexedDB abortada."));
  });
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

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDatabase();
  if (!db) {
    memory.documents.delete(id);
    memory.chunks.delete(id);
    return;
  }
  const tx = db.transaction(DOCUMENTS, "readwrite");
  tx.objectStore(DOCUMENTS).delete(id);
  await transactionDone(tx);
  await deleteChunksOfDocument(db, id);
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
