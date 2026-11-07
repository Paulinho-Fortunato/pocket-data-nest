import { useCallback, useEffect, useRef, useState } from "react";

import { DocumentIngestError, ingestDocumentFile, type IngestProgress } from "./document-pipeline";
import { createDocumentRecord, type DocumentRecord, type DocumentSummary } from "./documents";
import { listDocuments, loadDocument } from "./idb";
import { buildTutorDocumentContext } from "./tutor-context";
import { uid } from "./store";
import { isImageFile, unsupportedAttachmentMessage } from "./extract";

export type SourceTab = "file" | "paste" | "document" | "topic";

export type GenerationIngest = {
  file: File;
  progress: IngestProgress | null;
  error: string | null;
  errorCode: string | null;
  cancelled: boolean;
};

export type ResolvedSource = {
  record: DocumentRecord | null;
  sourceBlock: string;
  label: string;
  topic: string;
  truncated: boolean;
};

const PENDING_KEY = "angostudy:pending-cards-source";

/** Reads a conversation handoff from the tutor (sessionStorage). */
export function readPendingSource(): { name: string; text: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: unknown; text?: unknown };
    if (typeof parsed.text !== "string" || !parsed.text.trim()) return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "Resposta do tutor",
      text: parsed.text,
    };
  } catch {
    return null;
  }
}

export function clearPendingSource() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

/**
 * Shared source selection for "Criar cartões/Quiz com IA": upload, pasted text,
 * a saved document or just a theme. Files go through the same progressive
 * pipeline as the tutor (hash cache included).
 */
export function useGenerationSource() {
  const [tab, setTab] = useState<SourceTab>("paste");
  const [ingest, setIngest] = useState<GenerationIngest | null>(null);
  const [fileRecord, setFileRecord] = useState<DocumentRecord | null>(null);
  const [record, setRecord] = useState<DocumentRecord | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [topic, setTopic] = useState("");
  const [library, setLibrary] = useState<DocumentSummary[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Identity of the upload that currently owns the state. */
  const operationRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const pending = readPendingSource();
    if (pending) {
      setTab("paste");
      setPasteText(pending.text);
      clearPendingSource();
    }
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      setLibrary((await listDocuments()).filter((item) => item.totalChars > 0));
    } catch {
      setLibrary([]);
    }
  }, []);

  useEffect(() => {
    if (libraryOpen) void refreshLibrary();
  }, [libraryOpen, refreshLibrary]);

  const handleFile = useCallback(async (file?: File) => {
    if (!file) return;
    if (isImageFile(file)) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    operationRef.current = controller;
    const isCurrent = () => operationRef.current === controller;
    setFileRecord(null);
    setIngest({
      file,
      progress: {
        stage: "selected",
        label: "Ficheiro selecionado",
        pagesDone: 0,
        totalPages: 0,
        chars: 0,
        percent: 0,
      },
      error: null,
      errorCode: null,
      cancelled: false,
    });
    try {
      const outcome = await ingestDocumentFile(file, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!isCurrent()) return;
          setIngest((current) => (current ? { ...current, progress } : current));
        },
      });
      if (!isCurrent()) return;
      if (outcome.cancelled) {
        setIngest((current) => (current ? { ...current, cancelled: true } : current));
        if (outcome.record) setFileRecord(outcome.record);
        return;
      }
      if (outcome.record) setFileRecord(outcome.record);
    } catch (error) {
      if (!isCurrent()) return;
      const ingestError = error instanceof DocumentIngestError ? error : null;
      setIngest((current) =>
        current
          ? {
              ...current,
              error: ingestError?.friendly ?? "Não foi possível ler o ficheiro.",
              errorCode: ingestError?.code ?? "READ_FAILED",
            }
          : current,
      );
      if (ingestError?.partial) setFileRecord(ingestError.partial);
    } finally {
      if (isCurrent()) operationRef.current = null;
    }
  }, []);

  const cancelIngest = useCallback(() => abortRef.current?.abort(), []);

  const retryIngest = useCallback(() => {
    if (ingest?.file) void handleFile(ingest.file);
  }, [handleFile, ingest]);

  const removeIngest = useCallback(() => {
    abortRef.current?.abort();
    operationRef.current = null;
    setIngest(null);
    setFileRecord(null);
  }, []);

  const pickDocument = useCallback(async (id: string) => {
    const loaded = await loadDocument(id);
    if (loaded) {
      setRecord(loaded);
      setLibraryOpen(false);
    }
  }, []);

  const activeRecord = tab === "file" ? fileRecord : tab === "document" ? record : null;

  const canGenerate =
    tab === "file"
      ? Boolean(fileRecord && fileRecord.totalChars > 0)
      : tab === "document"
        ? Boolean(record && record.totalChars > 0)
        : tab === "paste"
          ? pasteText.trim().length >= 40
          : topic.trim().length >= 3;

  const sourceLabel =
    tab === "file"
      ? (fileRecord?.name ?? "Ficheiro")
      : tab === "document"
        ? (record?.name ?? "Documento guardado")
        : tab === "paste"
          ? "Texto colado"
          : `Tema: ${topic.trim() || "—"}`;

  const resolveSource = useCallback(
    async (signal: AbortSignal, query: string): Promise<ResolvedSource> => {
      if (tab === "topic") {
        if (topic.trim().length < 3)
          throw new Error("Escreve um tema com pelo menos 3 caracteres.");
        return {
          record: null,
          sourceBlock: `Tema indicado pelo utilizador: ${topic.trim()}`,
          label: `Tema: ${topic.trim()}`,
          topic: topic.trim(),
          truncated: false,
        };
      }

      if (tab === "paste") {
        const text = pasteText.trim();
        if (text.length < 40) {
          throw new Error("Cola pelo menos 40 caracteres de conteúdo.");
        }
        const pastedRecord = createDocumentRecord({
          id: uid(),
          name: "Texto colado",
          mime: "text/plain",
          size: text.length,
          text,
          pages: [{ page: 1, text, charStart: 0, charEnd: text.length }],
        });
        const built = await buildTutorDocumentContext(pastedRecord, query, signal);
        return {
          record: pastedRecord,
          sourceBlock: built.block,
          label: "Texto colado",
          topic: "",
          truncated: false,
        };
      }

      if (!activeRecord) {
        throw new Error(
          tab === "file"
            ? "Anexa um ficheiro e espera que a leitura termine."
            : "Escolhe um documento guardado.",
        );
      }
      const built = await buildTutorDocumentContext(activeRecord, query, signal);
      return {
        record: activeRecord,
        sourceBlock: built.block,
        label: activeRecord.name,
        topic: "",
        truncated: built.info.partial,
      };
    },
    [activeRecord, pasteText, tab, topic],
  );

  return {
    tab,
    setTab,
    ingest,
    fileRecord,
    record,
    pasteText,
    setPasteText,
    topic,
    setTopic,
    library,
    libraryOpen,
    setLibraryOpen,
    handleFile,
    cancelIngest,
    retryIngest,
    removeIngest,
    pickDocument,
    canGenerate,
    sourceLabel,
    resolveSource,
  };
}

export type GenerationSourceApi = ReturnType<typeof useGenerationSource>;

export function imageErrorFor(file: File): string | null {
  return isImageFile(file) ? unsupportedAttachmentMessage(file) : null;
}
