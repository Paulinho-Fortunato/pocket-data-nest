/** Shared helpers for AI card/quiz generation (pure, testable). */

const STOPWORDS = new Set([
  "a",
  "à",
  "às",
  "ao",
  "aos",
  "as",
  "o",
  "os",
  "um",
  "uma",
  "uns",
  "umas",
  "de",
  "da",
  "das",
  "do",
  "dos",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "por",
  "para",
  "com",
  "sem",
  "que",
  "qual",
  "quais",
  "quando",
  "onde",
  "como",
  "porque",
  "se",
  "e",
  "ou",
  "mas",
  "é",
  "são",
  "foi",
  "ser",
  "estar",
  "está",
  "the",
  "an",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "with",
  "without",
  "that",
  "this",
  "these",
  "those",
  "from",
  "by",
  "as",
  "at",
  "it",
  "its",
  "which",
  "who",
  "what",
  "when",
  "where",
  "how",
  "why",
]);

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeForCompare(value: string): string {
  return stripAccents(value.toLowerCase()).replace(/\s+/g, " ").trim();
}

/** Meaningful tokens (length > 3, accents folded, stopwords removed). */
export function meaningfulTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of normalizeForCompare(value).split(/[^a-z0-9]+/)) {
    if (raw.length > 3 && !STOPWORDS.has(raw)) tokens.add(raw);
  }
  return tokens;
}

/** True when the text shares at least one meaningful token with the source. */
export function overlapsSource(candidate: string, source: string): boolean {
  const sourceTokens = meaningfulTokens(source);
  if (sourceTokens.size === 0) return true;
  for (const token of meaningfulTokens(candidate)) {
    if (sourceTokens.has(token)) return true;
  }
  return false;
}

export function cleanText(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function dedupeKey(value: string): string {
  return normalizeForCompare(value).slice(0, 240);
}

/** Explicit (never silent) source truncation for prompts with a hard budget. */
export function clampSourceForPrompt(
  source: string,
  maxChars: number,
): { text: string; truncated: boolean; originalChars: number } {
  if (source.length <= maxChars) {
    return { text: source, truncated: false, originalChars: source.length };
  }
  return {
    text: `${source.slice(0, maxChars)}\n[… fonte reduzida: mostrados ${maxChars} de ${source.length} caracteres]`,
    truncated: true,
    originalChars: source.length,
  };
}

/** Pulls the first JSON object out of a model answer (fenced or not). */
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
