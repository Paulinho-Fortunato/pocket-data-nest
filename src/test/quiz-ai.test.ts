import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUIZ_OPTIONS,
  buildQuizPrompt,
  isAnswerCorrect,
  parseGeneratedQuiz,
  type QuestionDraft,
  type QuizOptions,
} from "../lib/quiz-ai";

const OPTIONS: QuizOptions = {
  ...DEFAULT_QUIZ_OPTIONS,
  count: 2,
  type: "multiple-choice",
  optionCount: 3,
  explanations: true,
};

const SOURCE = [
  "A mitose é a divisão celular que produz duas células geneticamente idênticas.",
  "Ocorre em quatro fases: prófase, metáfase, anáfase e telófase. A metáfase alinha os cromossomas",
  "no plano equatorial da célula. A anáfase separa as cromátides-irmãs para polos opostos.",
].join(" ");

function question(overrides: Record<string, unknown> = {}) {
  return {
    question: "Em que fase os cromossomas se alinham no equador da célula?",
    type: "multiple-choice",
    options: ["Prófase", "Metáfase", "Anáfase"],
    correctAnswer: "Metáfase",
    explanation: "Na metáfase os cromossomas alinham-se no plano equatorial.",
    difficulty: "medium",
    ...overrides,
  };
}

function payload(questions: unknown[]): string {
  return JSON.stringify({ questions });
}

describe("quiz generation prompts", () => {
  it("documents type, option count, time and JSON contract", () => {
    const prompt = buildQuizPrompt(SOURCE, { ...OPTIONS, count: 7, timePerQuestion: 30 });
    expect(prompt).toContain("7");
    expect(prompt).toContain("3 opções");
    expect(prompt).toContain("opções");
    expect(prompt).toContain('"questions"');
    expect(prompt).toContain('"correctAnswer"');
  });
});

describe("quiz response validation", () => {
  it("accepts a valid multiple-choice quiz with explanations", () => {
    const raw = payload([question()]);
    const result = parseGeneratedQuiz(raw, { ...OPTIONS, count: 1 }, SOURCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      type: "multiple-choice",
      correctAnswer: "Metáfase",
    });
    expect(result.questions[0]?.explanation).toContain("plano equatorial");
    expect(result.exact).toBe(true);
  });

  it("drops a question whose correct answer is not among the options", () => {
    const result = parseGeneratedQuiz(payload([question({ correctAnswer: "Telófase" })]), {
      ...OPTIONS,
      count: 1,
    });
    expect(result).toMatchObject({ ok: false, recoverable: true });
    expect(result.ok ? "" : result.error).toContain("nenhuma pergunta");
  });

  it("drops duplicated options and refuses fewer than two answers", () => {
    const result = parseGeneratedQuiz(
      payload([question({ options: ["Metáfase", "metafase", "Metáfase"] })]),
      { ...OPTIONS, count: 1 },
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("normalises true/false answers to Verdadeiro/Falso", () => {
    const result = parseGeneratedQuiz(
      payload([
        question({
          question: "A mitose produz duas células geneticamente idênticas.",
          type: "true-false",
          options: undefined,
          correctAnswer: "true",
        }),
      ]),
      { ...OPTIONS, count: 1, type: "true-false" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions[0]?.options).toEqual(["Verdadeiro", "Falso"]);
    expect(result.questions[0]?.correctAnswer).toBe("Verdadeiro");
  });

  it("keeps short answers without options", () => {
    const result = parseGeneratedQuiz(
      payload([
        question({
          question: "Como se chama a fase que separa as cromátides-irmãs?",
          type: "short-answer",
          options: undefined,
          correctAnswer: "Anáfase",
        }),
      ]),
      { ...OPTIONS, count: 1, type: "short-answer" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions[0]?.options).toBeUndefined();
    expect(result.questions[0]?.type).toBe("short-answer");
  });

  it("drops off-topic questions when the source is available", () => {
    const result = parseGeneratedQuiz(
      payload([
        question({
          question: "Quem escreveu Os Lusíadas?",
          options: ["Camões", "Pessoa", "Eça"],
          correctAnswer: "Camões",
        }),
        question(),
      ]),
      { ...OPTIONS, count: 2 },
      SOURCE,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("sem relação");
    expect(result.exact).toBe(false);
  });

  it("reports an honest mismatch when fewer questions validate", () => {
    const result = parseGeneratedQuiz(payload([question()]), { ...OPTIONS, count: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions).toHaveLength(1);
    expect(result.exact).toBe(false);
    expect(result.warnings.join(" ")).toContain("1 de 5");
  });

  it("rejects empty or malformed JSON", () => {
    expect(parseGeneratedQuiz(null, OPTIONS)).toMatchObject({ ok: false, recoverable: true });
    expect(parseGeneratedQuiz("sem json", OPTIONS)).toMatchObject({ ok: false });
    expect(parseGeneratedQuiz('{"questions":[{"question":"x"}]}', OPTIONS)).toMatchObject({
      ok: false,
    });
  });
});

describe("answer checking", () => {
  const mcq = {
    id: "q1",
    type: "multiple-choice",
    question: "Fase?",
    options: ["Prófase", "Metáfase"],
    correctAnswer: "Metáfase",
    difficulty: "medium",
  } as QuestionDraft;

  it("compares option answers ignoring case and accents", () => {
    expect(isAnswerCorrect(mcq, "metafase")).toBe(true);
    expect(isAnswerCorrect(mcq, "Prófase")).toBe(false);
  });

  it("accepts short answers with small typos", () => {
    const short = { ...mcq, type: "short-answer", options: undefined, correctAnswer: "Anáfase" };
    expect(isAnswerCorrect(short as unknown as QuestionDraft, "anafase")).toBe(true);
    expect(isAnswerCorrect(short as unknown as QuestionDraft, "metafase")).toBe(false);
  });
});
