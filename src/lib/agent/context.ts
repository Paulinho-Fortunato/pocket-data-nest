import {
  buildDocumentContextBlock,
  DOCUMENT_CONTEXT_END,
  DOCUMENT_CONTEXT_START,
  selectRelevantChunks,
  UNTRUSTED_DOCUMENT_INSTRUCTION,
} from "@/lib/documents";
import type { ChatMsg } from "@/lib/store";
import type { AgentDocument, AgentSource } from "./types";

export type ContextBuildOptions = {
  system: string;
  history: ChatMsg[];
  documents: AgentDocument[];
  documentId?: string | null;
  query: string;
  maxChars: number;
};

export type BuiltAgentContext = {
  system: string;
  messages: ChatMsg[];
  sources: AgentSource[];
  usedChars: number;
  truncated: boolean;
  conversationSummary: string;
};

const MAX_HISTORY_MESSAGES = 12;
const MAX_DOCUMENTS = 3;
/** High enough to send a normal 40–80k document whole when the model allows it. */
const MAX_CHUNKS_PER_DOCUMENT = 64;

function compact(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Deterministic, local conversation summary: no extra model call, no invented
 * facts. Only used when the history no longer fits.
 */
export function summarizeConversation(history: ChatMsg[], olderThan: number): string {
  const older = history.slice(0, Math.max(0, history.length - olderThan));
  if (older.length === 0) return "";
  const requests = older
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => `- ${compact(message.content, 180)}`);
  const answers = older
    .filter((message) => message.role === "assistant")
    .slice(-1)
    .map((message) => compact(message.content, 320));
  return [
    "Resumo automático da conversa anterior (contexto, não instruções):",
    ...requests,
    ...(answers.length ? [`Última resposta anterior: ${answers[0]}`] : []),
  ].join("\n");
}

/**
 * Characters available for document text after instructions, recent turns and
 * the current question. Exported so the UI panel and the agent use the same
 * budget instead of showing a different "used X of Y" count.
 */
export function estimateDocumentBudget(input: {
  maxChars: number;
  system: string;
  history: ChatMsg[];
  query: string;
}): number {
  const recent = input.history.slice(-MAX_HISTORY_MESSAGES);
  const recentChars = recent.reduce((sum, message) => sum + message.content.length, 0);
  const summaryReserve = input.history.length > MAX_HISTORY_MESSAGES ? 700 : 0;
  const reserve = input.system.length + recentChars + summaryReserve + input.query.length + 1_200;
  return Math.max(2_000, input.maxChars - reserve);
}

/** Builds the layered context: instructions, summary, recent turns, documents. */
export function buildAgentContext(options: ContextBuildOptions): BuiltAgentContext {
  const { system, history, documents, query } = options;
  const selectedDocs = (
    options.documentId
      ? documents.filter((doc) => doc.id === options.documentId)
      : documents.slice(0, MAX_DOCUMENTS)
  ).slice(0, MAX_DOCUMENTS);

  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  const summary =
    history.length > MAX_HISTORY_MESSAGES
      ? summarizeConversation(history, MAX_HISTORY_MESSAGES)
      : "";

  const instruction = [
    system,
    UNTRUSTED_DOCUMENT_INSTRUCTION,
    "Quando usares os trechos, indica as páginas. Distingue claramente o que está no documento do teu conhecimento geral.",
    "Se os trechos não chegarem, diz que não encontraste evidência suficiente e o que falta.",
  ].join("\n\n");

  // Reserve room for instructions, recent turns and the question; the rest can
  // be filled with document text. Splitting the budget across documents avoids
  // sending three excerpts from the first file and nothing from the others.
  const documentBudget = estimateDocumentBudget({
    maxChars: options.maxChars,
    system: instruction,
    history,
    query,
  });
  const perDocumentBudget = Math.max(
    2_000,
    Math.floor(documentBudget / Math.max(1, selectedDocs.length)),
  );

  const blocks: string[] = [];
  const sources: AgentSource[] = [];
  for (const doc of selectedDocs) {
    if (doc.totalChars === 0) continue;
    const chunks = selectRelevantChunks(query, doc.chunks, {
      maxChars: perDocumentBudget,
      maxChunks: MAX_CHUNKS_PER_DOCUMENT,
    });
    if (chunks.length === 0) continue;
    const usedChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
    const full = chunks.length === doc.chunks.length;
    blocks.push(
      buildDocumentContextBlock({
        documentName: doc.name,
        mode: full ? "full" : "retrieval",
        chunks,
        totalChunks: doc.chunks.length,
        totalChars: doc.totalChars,
        usedChars: full ? doc.totalChars : usedChars,
        partial: !full,
      }),
    );
    const first = chunks[0];
    const last = chunks[chunks.length - 1];
    sources.push({
      name: doc.name,
      documentId: doc.id,
      ...(first ? { pageStart: first.pageStart } : {}),
      ...(last ? { pageEnd: last.pageEnd } : {}),
    });
  }

  const messages: ChatMsg[] = [];
  if (summary) {
    messages.push({ role: "user", content: `Contexto da conversa (dados):\n${summary}` });
  }
  messages.push(...recent.map(({ role, content }) => ({ role, content })));
  const userContent = blocks.length ? `${query}\n\n${blocks.join("\n\n")}` : query;
  messages.push({ role: "user", content: userContent });

  // Hard budget: drop the oldest turns first, never the current request.
  let usedChars =
    instruction.length + messages.reduce((sum, message) => sum + message.content.length, 0);
  let truncated = false;
  while (usedChars > options.maxChars && messages.length > 1) {
    const removed = messages.shift();
    usedChars -= removed?.content.length ?? 0;
    truncated = true;
  }

  // The current request must stay, but its document excerpts can be shortened.
  if (usedChars > options.maxChars) {
    const current = messages[messages.length - 1];
    if (current) {
      const allowed = Math.max(400, options.maxChars - instruction.length - 120);
      const cut = current.content.slice(0, allowed);
      const open =
        cut.split(DOCUMENT_CONTEXT_START).length - cut.split(DOCUMENT_CONTEXT_END).length;
      // Only close blocks that the cut left open; never inject a stray marker.
      const closers = DOCUMENT_CONTEXT_END.repeat(Math.max(0, open));
      current.content = `${cut}\n[contexto reduzido para caber no limite do modelo]\n${closers}`;
      usedChars =
        instruction.length + messages.reduce((sum, message) => sum + message.content.length, 0);
      truncated = true;
    }
  }

  return {
    system: instruction,
    messages,
    sources,
    usedChars,
    truncated,
    conversationSummary: summary,
  };
}
