import { describe, expect, it } from "vitest";

import { createDocumentRecord } from "../lib/documents";
import { contextCharBudget, getModelCapabilities } from "../lib/agent/model-capabilities";
import { calculateExpression, executeAgentTool } from "../lib/agent/tools";
import { parseDecision, shouldPlanTools } from "../lib/agent/agent";

const text =
  "A fotossíntese ocorre nos cloroplastos e converte luz solar em energia química. " +
  "A clorofila absorve a luz. O ciclo de Calvin fixa o dióxido de carbono e produz glucose. " +
  "A fase dependente da luz produz ATP e NADPH nas membranas dos tilacoides.";

function document() {
  return createDocumentRecord({
    id: "doc-bio",
    name: "biologia.md",
    mime: "text/markdown",
    size: text.length,
    text,
    pages: [{ page: 2, text, charStart: 0, charEnd: text.length }],
  });
}

describe("model capabilities", () => {
  it("is conservative for unknown and free models", () => {
    const unknown = getModelCapabilities("acme/modelo-desconhecido");
    expect(unknown.nativeTools).toBe(false);
    expect(unknown.streaming).toBe(true);
    expect(unknown.free).toBe(false);

    const gemma = getModelCapabilities("google/gemma-2-9b-it:free");
    expect(gemma.free).toBe(true);
    expect(gemma.nativeTools).toBe(false);
    expect(gemma.contextTokens).toBe(8_192);

    const freeLlama = getModelCapabilities("meta-llama/llama-3.3-70b-instruct:free");
    expect(freeLlama.free).toBe(true);
    expect(freeLlama.nativeTools).toBe(false);
  });

  it("knows which paid models support native tools and vision", () => {
    const gpt = getModelCapabilities("openai/gpt-4o-mini");
    expect(gpt.nativeTools).toBe(true);
    expect(gpt.vision).toBe(true);
    expect(gpt.contextTokens).toBeGreaterThan(100_000);
    expect(contextCharBudget(gpt)).toBeGreaterThan(
      contextCharBudget(getModelCapabilities("google/gemma-2-9b-it:free")),
    );
  });
});

describe("safe calculator", () => {
  it("evaluates arithmetic with precedence and parentheses", () => {
    expect(calculateExpression("2 + 3 * 4")).toBe(14);
    expect(calculateExpression("(2 + 3) * 4")).toBe(20);
    expect(calculateExpression("-2 ^ 2")).toBe(-4);
    expect(calculateExpression("10 % 4")).toBe(2);
  });

  it("rejects code, letters and division by zero", () => {
    expect(() => calculateExpression("alert(1)")).toThrow();
    expect(() => calculateExpression("1 / 0")).toThrow(/zero/i);
    expect(() => calculateExpression("()")).toThrow();
  });
});

describe("agent tools", () => {
  const ctx = () => ({ documents: [document()], signal: new AbortController().signal });

  it("searches only the authorized document and returns pages", async () => {
    const result = await executeAgentTool(
      "search_document",
      { documentId: "doc-bio", query: "clorofila luz" },
      ctx(),
    );
    expect(result.ok).toBe(true);
    const data = result.data as { documentId: string; pageStart: number }[];
    expect(data[0]?.documentId).toBe("doc-bio");
    expect(data[0]?.pageStart).toBe(2);
    expect(result.summary).toContain("trecho");
  });

  it("does not read a document that was not selected", async () => {
    const result = await executeAgentTool(
      "get_document_chunk",
      { documentId: "outro", chunkId: "x" },
      ctx(),
    );
    expect(result).toMatchObject({ ok: false });

    const restricted = { ...ctx(), selectedDocumentId: "outro" };
    const search = await executeAgentTool(
      "search_document",
      { documentId: "doc-bio", query: "clorofila" },
      restricted,
    );
    expect(search.ok).toBe(false);
  });

  it("produces a local extractive summary with a clear disclaimer", async () => {
    const result = await executeAgentTool("summarize_document", { documentId: "doc-bio" }, ctx());
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("não é uma síntese por IA");
  });

  it("lists documents and prepares study proposals without saving", async () => {
    const list = await executeAgentTool("list_user_documents", {}, ctx());
    expect((list.data as unknown[]).length).toBe(1);

    const cards = await executeAgentTool(
      "create_flashcards",
      { documentId: "doc-bio", count: 5 },
      ctx(),
    );
    expect(cards.ok).toBe(true);
    expect(cards.data).toMatchObject({ requiresConfirmation: true, deepLink: "/criar-cartoes" });
    const quiz = await executeAgentTool("create_quiz", { topic: "fotossíntese", count: 3 }, ctx());
    expect(quiz.data).toMatchObject({ deepLink: "/criar-quiz", requiresConfirmation: true });
  });

  it("rejects invalid arguments instead of executing them", async () => {
    const result = await executeAgentTool("search_document", { query: "" }, ctx());
    expect(result.ok).toBe(false);
  });
});

describe("agent decisions", () => {
  it("accepts only known tools", () => {
    expect(parseDecision('{"type":"tool_call","tool":"calculate","arguments":{}}')).toMatchObject({
      type: "tool_call",
    });
    expect(
      parseDecision('{"type":"tool_call","tool":"delete_everything","arguments":{}}'),
    ).toBeNull();
    expect(parseDecision('```json\n{"type":"answer"}\n```')).toMatchObject({ type: "answer" });
    expect(parseDecision("texto livre")).toBeNull();
  });

  it("plans tools only when the request can need them", () => {
    expect(shouldPlanTools("Olá!", false)).toBe(false);
    expect(shouldPlanTools("Resume o documento", false)).toBe(true);
    expect(shouldPlanTools("O que é isto?", true)).toBe(true);
  });
});
