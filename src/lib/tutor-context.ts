import { askAI } from "./ai";
import {
  buildDocumentContextBlock,
  describeContextUsage,
  planDocumentContext,
  summarizeHierarchically,
  type DocumentRecord,
} from "./documents";

/**
 * Builds the untrusted context for one tutor turn.
 *
 * - small document → whole text;
 * - large document + specific question → best matching chunks (with pages);
 * - large document + global question → hierarchical summary;
 * - never enough evidence → the model is told explicitly to say so.
 */

export const SUMMARY_SYSTEM_PROMPT =
  "És um assistente de estudo. Resume o texto em português europeu, mantendo factos, números, definições e fórmulas. Devolve apenas o resumo, sem comentários nem markdown decorativo.";

export const NO_EVIDENCE_INSTRUCTION =
  'Se os trechos fornecidos não contiverem informação suficiente para responder, diz explicitamente "Não encontrei evidência suficiente no documento para responder a isso" e indica o que falta. Nunca inventes conteúdo que não esteja nos trechos.';

export type TutorContextInfo = {
  documentName: string;
  documentId: string;
  mode: "full" | "retrieval" | "hierarchical";
  usedChunks: number;
  totalChunks: number;
  totalChars: number;
  usedChars: number;
  partial: boolean;
  batches: number;
  pages: number;
  pageRanges: { from: number; to: number }[];
  summary: string;
};

export type ContextBuildResult = {
  block: string;
  info: TutorContextInfo;
  description: string;
};

function pageRangesOf(record: DocumentRecord, chunks: { pageStart: number; pageEnd: number }[]) {
  if (chunks.length === 0) return [{ from: 1, to: record.totalPages }];
  const ranges: { from: number; to: number }[] = [];
  for (const chunk of [...chunks].sort((a, b) => a.pageStart - b.pageStart)) {
    const last = ranges[ranges.length - 1];
    if (last && chunk.pageStart <= last.to + 2) {
      last.to = Math.max(last.to, chunk.pageEnd);
    } else {
      ranges.push({ from: chunk.pageStart, to: chunk.pageEnd });
    }
  }
  return ranges;
}

export async function buildTutorDocumentContext(
  record: DocumentRecord,
  query: string,
  signal: AbortSignal,
  onProgress?: (message: string | null) => void,
): Promise<ContextBuildResult> {
  const plan = planDocumentContext(record, query);
  const baseInfo: TutorContextInfo = {
    documentName: record.name,
    documentId: record.id,
    mode: plan.mode,
    usedChunks: plan.chunks.length,
    totalChunks: plan.totalChunks,
    totalChars: record.totalChars,
    usedChars: plan.usedChars,
    partial: plan.partial,
    batches: plan.summaryBatches.length,
    pages: record.totalPages,
    pageRanges: pageRangesOf(record, plan.chunks),
    summary: "",
  };

  if (plan.mode === "hierarchical") {
    onProgress?.(`A resumir o documento em ${plan.summaryBatches.length} lote(s)…`);
    const summary = await summarizeHierarchically(
      record.chunks,
      async (batch) => {
        if (signal.aborted) throw new DOMException("Geração cancelada.", "AbortError");
        return askAI(
          [
            {
              role: "user",
              content: `Documento: ${record.name}\n\nTrecho a resumir:\n${batch}`,
            },
          ],
          SUMMARY_SYSTEM_PROMPT,
        );
      },
      {
        onRound: (round, batches) =>
          onProgress?.(`A resumir o documento: ronda ${round}, ${batches} lote(s)…`),
      },
    );
    onProgress?.(null);
    const info: TutorContextInfo = {
      ...baseInfo,
      usedChunks: summary.usedChunks,
      batches: summary.batches,
      usedChars: summary.summary.length,
      pageRanges: [{ from: 1, to: record.totalPages }],
      summary: summary.summary,
      partial: true,
    };
    return {
      block: buildDocumentContextBlock({
        documentName: record.name,
        mode: "hierarchical",
        chunks: [],
        totalChunks: plan.totalChunks,
        totalChars: record.totalChars,
        usedChars: summary.summary.length,
        partial: true,
        summary: `${summary.summary}${summary.partial ? "\n[Resumo truncado: o documento excede o orçamento de contexto.]" : ""}`,
      }),
      info,
      description: describeContextUsage({
        mode: "hierarchical",
        usedChunks: summary.usedChunks,
        totalChunks: plan.totalChunks,
        partial: true,
        batches: summary.batches,
      }),
    };
  }

  return {
    block: buildDocumentContextBlock({
      documentName: record.name,
      mode: plan.mode,
      chunks: plan.chunks,
      totalChunks: plan.totalChunks,
      totalChars: record.totalChars,
      usedChars: plan.usedChars,
      partial: plan.partial,
    }),
    info: baseInfo,
    description: describeContextUsage({
      mode: plan.mode,
      usedChunks: plan.chunks.length,
      totalChunks: plan.totalChunks,
      partial: plan.partial,
    }),
  };
}

/** Language directive for the answer (preference `aiLanguage`). */
export function answerLanguageInstruction(language: "pt-PT" | "en" | "auto"): string {
  if (language === "en") return "Responde sempre em inglês.";
  if (language === "auto")
    return "Responde no mesmo idioma em que o utilizador escreveu, a não ser que peça outro.";
  return "Responde em português europeu (pt-PT), com linguagem clara e rigorosa.";
}
