import { describe, expect, it } from "vitest";

import {
  buildFlashcardPrompt,
  extractJsonObject,
  parseFlashcardResponse,
  toCards,
} from "../lib/flashcards";
import { MAX_CARD_QUESTION } from "../lib/schemas";

const valid = (count: number) => ({
  flashcards: Array.from({ length: count }, (_, index) => ({
    q: `Pergunta ${index + 1}?`,
    a: `Resposta ${index + 1}`,
  })),
});

describe("extractJsonObject", () => {
  it("pulls JSON out of a fenced block or surrounding prose", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObject('Claro! {"a":{"b":"c}"}} espero que ajude')).toBe('{"a":{"b":"c}"}}');
    expect(extractJsonObject("sem json")).toBeNull();
  });
});

describe("parseFlashcardResponse", () => {
  it("accepts exactly the requested number of cards", () => {
    const result = parseFlashcardResponse(JSON.stringify(valid(5)), 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(5);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a custom requested count", () => {
    const result = parseFlashcardResponse(JSON.stringify(valid(3)), 3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cards).toHaveLength(3);
  });

  it("removes empty entries and duplicates", () => {
    const result = parseFlashcardResponse(
      JSON.stringify({
        flashcards: [
          { q: "Igual?", a: "1" },
          { q: "Igual?", a: "1" },
          { q: "   ", a: "vazia" },
          { q: "Outra?", a: "" },
          { q: "Única?", a: "2" },
        ],
      }),
      5,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/2 de 5/);
  });

  it("clamps oversized questions and answers", () => {
    const result = parseFlashcardResponse(
      JSON.stringify({ flashcards: [{ q: "p".repeat(700), a: "r".repeat(5_000) }] }),
      1,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards[0]!.q.length).toBeLessThanOrEqual(MAX_CARD_QUESTION);
    expect(result.cards[0]!.a.length).toBeLessThanOrEqual(4_000);
  });

  it("limits the result to the requested count", () => {
    const result = parseFlashcardResponse(JSON.stringify(valid(9)), 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(5);
    expect(result.warnings.join(" ")).toMatch(/primeiros 5/);
  });

  it("returns a recoverable error for unusable answers", () => {
    for (const raw of ["", "desculpa, não consigo", '{"flashcards":[]}', '{"flashcards":5}']) {
      const result = parseFlashcardResponse(raw, 5);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.recoverable).toBe(true);
    }
  });

  it("converts valid pairs into store cards", () => {
    const cards = toCards([{ q: "p", a: "r" }], "Deck X");
    expect(cards[0]).toMatchObject({ q: "p", a: "r", deck: "Deck X", known: false });
    expect(cards[0]!.id.length).toBeGreaterThan(3);
  });
});

describe("buildFlashcardPrompt", () => {
  it("asks for the requested number and caps the source", () => {
    const prompt = buildFlashcardPrompt("texto ".repeat(5_000), 5);
    expect(prompt).toContain("exatamente 5 pares");
    expect(prompt).toContain("texto reduzido para geração de flashcards");
    expect(prompt.length).toBeLessThan(10_000);
  });
});
