import { describe, expect, it, vi, beforeEach } from "vitest";

const { askAIStream } = await import("../lib/ai");

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("askAIStream", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("angostudy:openrouter_key", '"test-key"');
    localStorage.setItem("angostudy:openrouter_model", '"test-model"');
  });

  it("accumulates streamed deltas and calls onDelta per chunk", async () => {
    const payloads = [
      "data: {\"choices\":[{\"delta\":{\"content\":\"Olá\"}}]}\n\n",
      ": OPENROUTER PROCESSING\n\n",
      "data: {\"choices\":[{\"delta\":{\"content\":\", tudo bem?\"}}]}\n\n",
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(payloads)),
    );
    const deltas: string[] = [];
    const full = await askAIStream([], (d) => deltas.push(d));
    expect(full).toBe("Olá, tudo bem?");
    expect(deltas).toEqual(["Olá", ", tudo bem?"]);
    vi.unstubAllGlobals();
  });

  it("throws NO_KEY when the key is missing", async () => {
    localStorage.clear();
    await expect(askAIStream([], () => {})).rejects.toThrow("NO_KEY");
  });

  it("throws when the stream contains no content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(["data: [DONE]\n\n"])),
    );
    await expect(askAIStream([], () => {})).rejects.toThrow("Sem resposta");
    vi.unstubAllGlobals();
  });
});
