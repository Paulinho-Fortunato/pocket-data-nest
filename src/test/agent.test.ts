import { describe, expect, it, vi } from "vitest";

import { runAgent } from "../lib/agent/agent";
import { buildAgentContext } from "../lib/agent/context";
import {
  DOCUMENT_CONTEXT_END,
  UNTRUSTED_DOCUMENT_INSTRUCTION,
  createDocumentRecord,
} from "../lib/documents";
import type { AgentRunOptions } from "../lib/agent/types";

const text =
  "A fotossíntese é o processo em que as plantas convertem luz solar em energia química. " +
  "Ocorre nos cloroplastos. A clorofila absorve a luz. O ciclo de Calvin fixa o carbono.";

function document() {
  return createDocumentRecord({
    id: "doc-bio",
    name: "biologia.md",
    mime: "text/markdown",
    size: text.length,
    text,
    pages: [{ page: 1, text, charStart: 0, charEnd: text.length }],
  });
}

function baseOptions(overrides: Partial<AgentRunOptions> = {}): AgentRunOptions {
  return {
    query: "O que é a fotossíntese?",
    history: [],
    documents: [document()],
    documentId: "doc-bio",
    model: "google/gemma-2-9b-it:free",
    system: "És um tutor.",
    signal: new AbortController().signal,
    callPlanner: vi.fn(async () => '{"type":"answer"}'),
    callFinal: vi.fn(async (_messages, _system, onDelta) => {
      onDelta("Resposta final.");
      return "Resposta final.";
    }),
    ...overrides,
  };
}

describe("agent loop", () => {
  it("answers without tools when no tool is needed", async () => {
    const callPlanner = vi.fn(async () => '{"type":"answer"}');
    const callFinal = vi.fn(async (_m, _s, onDelta) => {
      onDelta("Olá! Como posso ajudar?");
      return "Olá! Como posso ajudar?";
    });
    const result = await runAgent(
      baseOptions({
        query: "Olá",
        documents: [],
        documentId: null,
        callPlanner,
        callFinal,
      }),
    );
    expect(result.status).toBe("completed");
    expect(callPlanner).not.toHaveBeenCalled();
    expect(callFinal).toHaveBeenCalledTimes(1);
    expect(result.text).toContain("Olá");
  });

  it("searches the selected document and cites it", async () => {
    const callPlanner = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          type: "tool_call",
          tool: "search_document",
          arguments: { documentId: "doc-bio", query: "clorofila" },
        }),
      )
      .mockResolvedValueOnce('{"type":"answer"}');
    let finalMessages: unknown[] = [];
    const callFinal = vi.fn(async (messages, _system, onDelta) => {
      finalMessages = messages;
      onDelta("A clorofila absorve a luz (página 1).");
      return "A clorofila absorve a luz (página 1).";
    });

    const result = await runAgent(baseOptions({ callPlanner, callFinal }));
    expect(result.status).toBe("completed");
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({ tool: "search_document", ok: true });
    expect(result.sources[0]).toMatchObject({ documentId: "doc-bio", name: "biologia.md" });
    expect(JSON.stringify(finalMessages)).toContain("Resultado da ferramenta search_document");
  });

  it("falls back to a normal answer when the planner returns invalid JSON", async () => {
    const callPlanner = vi.fn(async () => "Vou procurar no documento.");
    const callFinal = vi.fn(async (_m, _s, onDelta) => {
      onDelta("Resposta sem ferramentas.");
      return "Resposta sem ferramentas.";
    });
    const result = await runAgent(baseOptions({ callPlanner, callFinal }));
    expect(result.status).toBe("completed");
    expect(result.fallbackUsed).toBe(true);
    expect(result.tools).toHaveLength(0);
    expect(callFinal).toHaveBeenCalledTimes(1);
  });

  it("stops at the configured maximum number of steps", async () => {
    const callPlanner = vi.fn(async () =>
      JSON.stringify({
        type: "tool_call",
        tool: "calculate",
        arguments: { expression: "1 + 1" },
      }),
    );
    const result = await runAgent(baseOptions({ callPlanner, maxSteps: 3 }));
    expect(result.status).toBe("completed");
    expect(callPlanner).toHaveBeenCalledTimes(3);
    expect(result.steps).toBe(3);
    expect(result.tools).toHaveLength(3);
  });

  it("returns cancelled with the partial text when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runAgent(baseOptions({ signal: controller.signal, callFinal: vi.fn() }));
    expect(result.status).toBe("cancelled");
  });

  it("prepares cards or a quiz without saving them", async () => {
    const callPlanner = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          type: "tool_call",
          tool: "create_flashcards",
          arguments: { documentId: "doc-bio", count: 5 },
        }),
      )
      .mockResolvedValueOnce('{"type":"answer"}');
    const result = await runAgent(baseOptions({ callPlanner }));
    expect(result.tools[0]?.ok).toBe(true);
    expect(result.tools[0]?.summary).toContain("Proposta");
  });

  it("does not execute unknown tools or missing evidence", async () => {
    const callPlanner = vi
      .fn()
      .mockResolvedValueOnce(
        '{"type":"tool_call","tool":"delete_everything","arguments":{"id":"x"}}',
      )
      .mockResolvedValueOnce('{"type":"answer"}');
    const result = await runAgent(baseOptions({ callPlanner }));
    expect(result.tools).toHaveLength(0);
    expect(result.fallbackUsed).toBe(true);
  });
});

describe("agent context", () => {
  it("marks document content as untrusted and keeps the budget", () => {
    const long = createDocumentRecord({
      id: "doc-long",
      name: "grande.md",
      mime: "text/markdown",
      size: text.length,
      text: `${text} `.repeat(400),
      pages: [
        {
          page: 1,
          text: `${text} `.repeat(400),
          charStart: 0,
          charEnd: `${text} `.repeat(400).length,
        },
      ],
    });
    const history = Array.from({ length: 40 }, (_, index) => ({
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Mensagem ${index} com algum texto de contexto para ocupar espaço.`,
    }));

    const built = buildAgentContext({
      system: "Sistema.",
      history,
      documents: [long],
      documentId: "doc-long",
      query: "Resume o documento",
      maxChars: 4_000,
    });

    expect(built.system).toContain(UNTRUSTED_DOCUMENT_INSTRUCTION);
    expect(built.usedChars).toBeLessThanOrEqual(4_100);
    expect(built.messages.length).toBeLessThan(history.length + 2);
    expect(built.messages.at(-1)?.content).toContain("Resume o documento");
    expect(built.messages.at(-1)?.content).toContain(DOCUMENT_CONTEXT_END);
    expect(built.truncated).toBe(true);
  });
});
