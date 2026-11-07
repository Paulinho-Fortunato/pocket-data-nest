import {
  FlashcardResponseSchema,
  MAX_CARD_ANSWER,
  MAX_CARD_QUESTION,
  type ParsedCard,
} from "./schemas";
import { uid, type Card } from "./store";

/** Number of cards requested by the tutor button. */
export const DEFAULT_FLASHCARD_COUNT = 5;
export const MAX_FLASHCARD_SOURCE_CHARS = 6_000;

export const FLASHCARD_SYSTEM_PROMPT =
  'És um gerador de flashcards do AngoStudy. Responde sempre com JSON válido, sem markdown, no formato {"flashcards":[{"q":"...","a":"..."}]}. Segue exatamente o número de cartões pedido.';

export function buildFlashcardPrompt(source: string, count = DEFAULT_FLASHCARD_COUNT): string {
  const trimmed = source.trim();
  const clipped =
    trimmed.length > MAX_FLASHCARD_SOURCE_CHARS
      ? `${trimmed.slice(0, MAX_FLASHCARD_SOURCE_CHARS)}\n[… texto reduzido para geração de flashcards]`
      : trimmed;
  return `Com base na explicação abaixo, cria exatamente ${count} pares pergunta-resposta para um flashcard de estudo.
Perguntas: máximo ${MAX_CARD_QUESTION} caracteres. Respostas: máximo ${MAX_CARD_ANSWER} caracteres.
Retorna APENAS JSON válido neste formato (sem markdown, sem backticks):
{"flashcards":[{"q":"pergunta?","a":"resposta curta"}]}

Explicação:
${clipped}`;
}

/**
 * Pulls the first JSON object out of a model answer. Models often wrap the JSON
 * in a fenced block or add a sentence before it.
 */
export function extractJsonObject(raw: string): string | null {
  const withoutFences = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();
  const start = withoutFences.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < withoutFences.length; index++) {
    const char = withoutFences[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return withoutFences.slice(start, index + 1);
    }
  }
  return null;
}

export type FlashcardParseResult =
  | {
      ok: true;
      cards: GeneratedFlashcard[];
      warnings: string[];
      requested: number;
    }
  | { ok: false; error: string; recoverable: true };

export type GeneratedFlashcard = { q: string; a: string };

function clampText(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Validates the model's JSON: shape, size limits, empty entries and count.
 * Never throws — the caller shows a recoverable error instead of crashing.
 */
export function parseFlashcardResponse(
  raw: string | null | undefined,
  requested: number = DEFAULT_FLASHCARD_COUNT,
): FlashcardParseResult {
  if (!raw || !raw.trim()) {
    return {
      ok: false,
      recoverable: true,
      error: "O modelo respondeu vazio. Tenta gerar outra vez.",
    };
  }
  const json = extractJsonObject(raw);
  if (!json) {
    return {
      ok: false,
      recoverable: true,
      error: "A resposta não continha JSON válido. Tenta gerar outra vez.",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      ok: false,
      recoverable: true,
      error: "O JSON devolvido pelo modelo estava incompleto. Tenta gerar outra vez.",
    };
  }
  const validated = FlashcardResponseSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      recoverable: true,
      error: "A resposta do modelo não tem o formato de flashcards esperado.",
    };
  }

  const warnings: string[] = [];
  const seen = new Set<string>();
  const cards: GeneratedFlashcard[] = [];
  for (const item of validated.data.flashcards) {
    const q = clampText(item.q, MAX_CARD_QUESTION);
    const a = clampText(item.a, MAX_CARD_ANSWER);
    if (!q || !a) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ q, a });
  }

  const limited = cards.slice(0, Math.max(1, requested));
  if (limited.length === 0) {
    return {
      ok: false,
      recoverable: true,
      error: "O modelo devolveu flashcards vazios. Tenta gerar outra vez.",
    };
  }
  if (limited.length < requested) {
    warnings.push(
      `Foram gerados ${limited.length} de ${requested} flashcards. Podes gerar novamente para completar.`,
    );
  }
  if (cards.length > requested) {
    warnings.push(
      `O modelo devolveu ${cards.length} flashcards; foram usados os primeiros ${requested}.`,
    );
  }
  return { ok: true, cards: limited, warnings, requested };
}

/** Converts validated pairs into store cards. */
export function toCards(flashcards: GeneratedFlashcard[], deck = "Gerado do Tutor"): Card[] {
  return flashcards.map<ParsedCard>((card) => ({
    id: uid(),
    q: card.q,
    a: card.a,
    deck,
    known: false,
  }));
}
