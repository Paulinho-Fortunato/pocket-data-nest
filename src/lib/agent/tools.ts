import { z } from "zod";

import { withTimeout } from "@/lib/async-control";
import { selectRelevantChunks } from "@/lib/documents";
import { diag } from "@/lib/diagnostics";
import type { AgentDocument, AgentToolName } from "./types";

/** Argument/result schemas: nothing reaches a tool without passing Zod. */
export const SearchDocumentArgs = z.object({
  documentId: z.string().trim().min(1).max(120).optional(),
  query: z.string().trim().min(2).max(300),
  limit: z.number().int().min(1).max(10).optional(),
});

export const GetChunkArgs = z.object({
  documentId: z.string().trim().min(1).max(120),
  chunkId: z.string().trim().min(1).max(160),
});

export const SummarizeArgs = z.object({
  documentId: z.string().trim().min(1).max(120).optional(),
  focus: z.string().trim().max(300).optional(),
});

export const ListDocumentsArgs = z.object({}).strict();

export const CalculateArgs = z.object({
  expression: z.string().trim().min(1).max(200),
});

export const CreateStudyArgs = z.object({
  documentId: z.string().trim().min(1).max(120).optional(),
  topic: z.string().trim().max(300).optional(),
  count: z.number().int().min(1).max(60).default(10),
  difficulty: z.enum(["facil", "media", "dificil", "mista"]).default("mista"),
});

export type ToolContext = {
  documents: AgentDocument[];
  signal: AbortSignal;
  /** When set, tools may only read the document the user selected. */
  selectedDocumentId?: string;
};

export type ToolResult = {
  ok: boolean;
  /** Short, user-safe description of what happened. */
  summary: string;
  data: unknown;
};

const MAX_OBSERVATION_CHARS = 8_000;

function clip(text: string, max = 1_200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function docOrDocs(ctx: ToolContext, documentId?: string): AgentDocument[] {
  const allowed = ctx.selectedDocumentId
    ? ctx.documents.filter((doc) => doc.id === ctx.selectedDocumentId)
    : ctx.documents;
  if (documentId) {
    const match = allowed.find((doc) => doc.id === documentId);
    return match ? [match] : [];
  }
  return allowed.slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* Safe arithmetic (no eval, no Function, no access to globals)        */
/* ------------------------------------------------------------------ */

class Calculator {
  private index = 0;
  constructor(private readonly tokens: (number | string)[]) {}

  parse(): number {
    const value = this.expression();
    if (this.index !== this.tokens.length) throw new Error("Expressão inválida.");
    if (!Number.isFinite(value)) throw new Error("O resultado não é um número finito.");
    return value;
  }

  private peek() {
    return this.tokens[this.index];
  }

  private expression(): number {
    let value = this.term();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.tokens[this.index++];
      const right = this.term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  private term(): number {
    let value = this.unary();
    while (this.peek() === "*" || this.peek() === "/" || this.peek() === "%") {
      const op = this.tokens[this.index++];
      const right = this.unary();
      if (op === "*") value *= right;
      else if (op === "/") {
        if (right === 0) throw new Error("Divisão por zero.");
        value /= right;
      } else {
        if (right === 0) throw new Error("Módulo por zero.");
        value %= right;
      }
    }
    return value;
  }

  private power(): number {
    const base = this.primary();
    if (this.peek() === "^") {
      this.index++;
      return Math.pow(base, this.unary());
    }
    return base;
  }

  private unary(): number {
    if (this.peek() === "-") {
      this.index++;
      return -this.unary();
    }
    if (this.peek() === "+") {
      this.index++;
      return this.unary();
    }
    return this.power();
  }

  private primary(): number {
    const token = this.tokens[this.index++];
    if (typeof token === "number") return token;
    if (token === "(") {
      const value = this.expression();
      if (this.tokens[this.index++] !== ")") throw new Error("Parênteses não fechados.");
      return value;
    }
    throw new Error("Expressão inválida.");
  }
}

export function calculateExpression(input: string): number {
  const compact = input.replace(/\s+/g, "");
  if (!compact) throw new Error("Expressão vazia.");
  const tokens: (number | string)[] = [];
  let i = 0;
  while (i < compact.length) {
    const char = compact[i]!;
    if (/[0-9.]/.test(char)) {
      let raw = "";
      while (i < compact.length && /[0-9.]/.test(compact[i]!)) raw += compact[i++];
      if ((raw.match(/\./g) ?? []).length > 1) throw new Error("Número inválido.");
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error("Número inválido.");
      tokens.push(value);
      continue;
    }
    if ("+-*/%^()".includes(char)) {
      tokens.push(char);
      i++;
      continue;
    }
    throw new Error(`Caractere não permitido: ${char}`);
  }
  return new Calculator(tokens).parse();
}

/* ------------------------------------------------------------------ */
/* Tool implementations                                                */
/* ------------------------------------------------------------------ */

function searchDocument(args: z.infer<typeof SearchDocumentArgs>, ctx: ToolContext): ToolResult {
  const docs = docOrDocs(ctx, args.documentId);
  if (docs.length === 0) {
    return { ok: false, summary: "Não há documento selecionado para pesquisar.", data: [] };
  }
  const limit = args.limit ?? 6;
  const matches = docs.flatMap((doc) =>
    selectRelevantChunks(args.query, doc.chunks, { maxChars: 6_000, maxChunks: limit }).map(
      (chunk) => ({
        documentId: doc.id,
        documentName: doc.name,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        quote: clip(chunk.text, 900),
      }),
    ),
  );
  if (matches.length === 0) {
    return {
      ok: false,
      summary: `Não encontrei trechos relevantes para “${clip(args.query, 80)}”.`,
      data: [],
    };
  }
  return {
    ok: true,
    summary: `${matches.length} trecho(s) encontrados em ${docs.map((doc) => doc.name).join(", ")}.`,
    data: matches,
  };
}

function getChunk(args: z.infer<typeof GetChunkArgs>, ctx: ToolContext): ToolResult {
  const doc = docOrDocs(ctx, args.documentId)[0];
  if (!doc)
    return { ok: false, summary: "Documento não encontrado ou não autorizado.", data: null };
  const chunk = doc.chunks.find((item) => item.chunkId === args.chunkId);
  if (!chunk) return { ok: false, summary: "Trecho não encontrado.", data: null };
  return {
    ok: true,
    summary: `Trecho das páginas ${chunk.pageStart}–${chunk.pageEnd}.`,
    data: {
      documentId: doc.id,
      documentName: doc.name,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      text: clip(chunk.text, 3_000),
    },
  };
}

function summarizeDocument(args: z.infer<typeof SummarizeArgs>, ctx: ToolContext): ToolResult {
  const docs = docOrDocs(ctx, args.documentId);
  if (docs.length === 0) return { ok: false, summary: "Não há documento para resumir.", data: [] };
  const summaries = docs.map((doc) => {
    const chunks = doc.chunks;
    if (chunks.length === 0) {
      return { documentId: doc.id, name: doc.name, summary: "", pages: [] as number[] };
    }
    const wanted = Math.min(6, chunks.length);
    const step = Math.max(1, Math.floor(chunks.length / wanted));
    const picked = Array.from({ length: wanted }, (_, index) => chunks[index * step]).filter(
      (chunk): chunk is (typeof chunks)[number] => Boolean(chunk),
    );
    return {
      documentId: doc.id,
      name: doc.name,
      pages: picked.map((chunk) => chunk.pageStart),
      summary: clip(picked.map((chunk) => clip(chunk.text, 700)).join("\n\n"), 4_000),
    };
  });
  return {
    ok: true,
    summary: `Resumo extrativo local de ${summaries.length} documento(s) (não é uma síntese por IA).`,
    data: summaries,
  };
}

function listDocuments(_args: unknown, ctx: ToolContext): ToolResult {
  return {
    ok: true,
    summary: `${ctx.documents.length} documento(s) disponíveis.`,
    data: ctx.documents.map((doc) => ({
      documentId: doc.id,
      name: doc.name,
      status: doc.status,
      pages: doc.totalPages,
      characters: doc.totalChars,
    })),
  };
}

function createStudy(
  kind: "cards" | "quiz",
  args: z.infer<typeof CreateStudyArgs>,
  ctx: ToolContext,
): ToolResult {
  const doc = args.documentId ? (docOrDocs(ctx, args.documentId)[0] ?? null) : null;
  const hasTopic = Boolean(args.topic && args.topic.trim().length >= 3);
  if (!doc && !hasTopic) {
    return {
      ok: false,
      summary: "Indica um documento ou um tema para preparar o estudo.",
      data: null,
    };
  }
  return {
    ok: true,
    summary: `Proposta de ${args.count} ${kind === "cards" ? "cartões" : "perguntas"} preparada para revisão.`,
    data: {
      kind,
      count: args.count,
      difficulty: args.difficulty,
      source: doc
        ? { documentId: doc.id, name: doc.name, pages: doc.totalPages }
        : { topic: args.topic },
      requiresConfirmation: true,
      deepLink: kind === "cards" ? "/criar-cartoes" : "/criar-quiz",
      note: "Nada foi guardado. Confirma e revê a pré-visualização na página de criação.",
    },
  };
}

function calculate(args: z.infer<typeof CalculateArgs>, _ctx: ToolContext): ToolResult {
  try {
    const value = calculateExpression(args.expression);
    return {
      ok: true,
      summary: `${args.expression} = ${value}`,
      data: { expression: args.expression, value },
    };
  } catch (error) {
    return {
      ok: false,
      summary: error instanceof Error ? error.message : "Não foi possível calcular.",
      data: null,
    };
  }
}

const SCHEMAS: Record<AgentToolName, z.ZodTypeAny> = {
  search_document: SearchDocumentArgs,
  get_document_chunk: GetChunkArgs,
  summarize_document: SummarizeArgs,
  list_user_documents: ListDocumentsArgs,
  calculate: CalculateArgs,
  create_flashcards: CreateStudyArgs,
  create_quiz: CreateStudyArgs,
};

/** Validates and runs one tool with a hard timeout. Never throws for bad input. */
export async function executeAgentTool(
  tool: AgentToolName,
  rawArgs: unknown,
  ctx: ToolContext,
  timeoutMs = 8_000,
): Promise<ToolResult> {
  const parsed = SCHEMAS[tool].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      summary: `Argumentos inválidos para ${tool}: ${parsed.error.issues[0]?.message ?? "formato"}`,
      data: null,
    };
  }
  const started = performance.now();
  try {
    const run = (async (): Promise<ToolResult> => {
      switch (tool) {
        case "search_document":
          return searchDocument(parsed.data as z.infer<typeof SearchDocumentArgs>, ctx);
        case "get_document_chunk":
          return getChunk(parsed.data as z.infer<typeof GetChunkArgs>, ctx);
        case "summarize_document":
          return summarizeDocument(parsed.data as z.infer<typeof SummarizeArgs>, ctx);
        case "list_user_documents":
          return listDocuments(parsed.data, ctx);
        case "calculate":
          return calculate(parsed.data as z.infer<typeof CalculateArgs>, ctx);
        case "create_flashcards":
          return createStudy("cards", parsed.data as z.infer<typeof CreateStudyArgs>, ctx);
        case "create_quiz":
          return createStudy("quiz", parsed.data as z.infer<typeof CreateStudyArgs>, ctx);
      }
    })();
    const result = await withTimeout(run, timeoutMs, `A ferramenta ${tool}`, {
      signal: ctx.signal,
      message: `A ferramenta ${tool} demorou demasiado tempo.`,
    });
    diag("agent:tool", {
      tool,
      ok: result.ok,
      ms: Math.round(performance.now() - started),
    });
    return limitResult(result);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? `A ferramenta ${tool} excedeu o tempo limite.`
        : error instanceof Error
          ? error.message
          : "Falha na ferramenta.";
    diag("agent:tool-error", { tool, message });
    return { ok: false, summary: message, data: null };
  }
}

function limitResult(result: ToolResult): ToolResult {
  const encoded = JSON.stringify(result.data ?? null);
  if (encoded.length <= MAX_OBSERVATION_CHARS) return result;
  return {
    ...result,
    data: { truncated: true, preview: `${encoded.slice(0, MAX_OBSERVATION_CHARS)}…` },
  };
}

export const TOOL_DESCRIPTIONS: Record<AgentToolName, string> = {
  search_document: "Pesquisa trechos relevantes nos documentos autorizados.",
  get_document_chunk: "Lê um trecho específico de um documento, com páginas.",
  summarize_document: "Resume localmente um documento (extrativo, com páginas).",
  list_user_documents: "Lista os documentos disponíveis nesta sessão.",
  calculate: "Calcula uma expressão aritmética com segurança.",
  create_flashcards: "Prepara uma proposta de cartões para confirmação do utilizador.",
  create_quiz: "Prepara uma proposta de quiz para confirmação do utilizador.",
};
