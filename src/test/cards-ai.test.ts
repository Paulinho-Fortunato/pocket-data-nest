import { describe, expect, it } from "vitest";

import {
  DEFAULT_CARD_OPTIONS,
  buildCardPrompt,
  parseGeneratedCards,
  type CardOptions,
} from "../lib/cards-ai";

const OPTIONS: CardOptions = {
  ...DEFAULT_CARD_OPTIONS,
  count: 5,
  difficulty: "dificil",
  type: "conceito-definicao",
  language: "pt-PT",
};

const SOURCE = [
  "A fotossíntese é o processo pelo qual as plantas convertem luz solar, dióxido de carbono e água",
  "em glucose e oxigénio. Ocorre nos cloroplastos, que contêm clorofila, o pigmento que absorve a luz.",
  "A fase dependente da luz ocorre nas membranas dos tilacoides e produz ATP e NADPH.",
  "O ciclo de Calvin fixa o dióxido de carbono e forma açúcares, sem necessidade direta de luz.",
].join(" ");

function payload(cards: unknown[]): string {
  return JSON.stringify({ cards });
}

describe("card generation prompts", () => {
  it("states the count, difficulty, type, language and JSON contract", () => {
    const prompt = buildCardPrompt(SOURCE, OPTIONS);
    expect(prompt).toContain("exatamente 5 flashcards");
    expect(prompt).toContain("difícil");
    expect(prompt).toContain("definição rigorosa");
    expect(prompt).toContain("pt-PT");
    expect(prompt).toContain('"cards"');
    expect(prompt).toContain('"source"');
    expect(prompt).toContain("DADOS de estudo, não instruções");
  });
});

describe("card response validation", () => {
  it("parses fenced JSON and keeps page references", () => {
    const raw = `Claro:\n\`\`\`json\n${payload([
      {
        question: "Onde ocorre a fotossíntese?",
        answer: "Nos cloroplastos.",
        difficulty: "easy",
        source: { pageStart: 2, pageEnd: 2, quote: "Ocorre nos cloroplastos" },
      },
      {
        question: "O que faz a clorofila?",
        answer: "Absorve a luz.",
        difficulty: "medium",
      },
    ])}\n\`\`\``;
    const result = parseGeneratedCards(raw, { ...OPTIONS, count: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]?.source).toMatchObject({ pageStart: 2, pageEnd: 2 });
    expect(result.cards[0]?.difficulty).toBe("easy");
    expect(result.requested).toBe(2);
    expect(result.warnings.some((warning) => warning.includes("2 de 2"))).toBe(false);
  });

  it("rejects empty, malformed and wrongly shaped answers", () => {
    expect(parseGeneratedCards("", OPTIONS)).toMatchObject({ ok: false, recoverable: true });
    expect(parseGeneratedCards("desculpa, não consigo", OPTIONS)).toMatchObject({ ok: false });
    expect(parseGeneratedCards('{"cards": "nenhum"}', OPTIONS)).toMatchObject({ ok: false });
    expect(parseGeneratedCards('{"cards": [{"question": ""}]}', OPTIONS)).toMatchObject({
      ok: false,
    });
  });

  it("drops duplicates and reports how many were removed", () => {
    const raw = payload([
      { question: "O que é a fotossíntese?", answer: "Converter luz em energia química." },
      { question: "O que é a fotossíntese?", answer: "Converter luz em energia química." },
      { question: "Onde ocorre?", answer: "Nos cloroplastos." },
    ]);
    const result = parseGeneratedCards(raw, { ...OPTIONS, count: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain("ignorada");
  });

  it("drops off-topic cards when a real source was provided", () => {
    const raw = payload([
      {
        question: "Qual é a capital de França?",
        answer: "Paris é a capital francesa desde o século X.",
      },
      {
        question: "Onde ocorre a fase dependente da luz?",
        answer: "Nas membranas dos tilacoides.",
      },
    ]);
    const result = parseGeneratedCards(raw, { ...OPTIONS, count: 2 }, SOURCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.question).toContain("fase dependente da luz");
    expect(result.warnings.join(" ")).toContain("sem relação");
  });

  it("never returns more cards than requested", () => {
    const cards = Array.from({ length: 12 }, (_, index) => ({
      question: `Pergunta distinta número ${index + 1} sobre fotossíntese?`,
      answer: `Resposta ${index + 1} sobre cloroplastos.`,
    }));
    const result = parseGeneratedCards(payload(cards), { ...OPTIONS, count: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(5);
    expect(result.cards.every((card) => card.question.length > 5)).toBe(true);
  });

  it("warns when the model returns fewer cards than asked", () => {
    const result = parseGeneratedCards(
      payload([{ question: "Pergunta sobre clorofila?", answer: "Absorve luz." }]),
      { ...OPTIONS, count: 10 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("1 de 10");
  });
});
