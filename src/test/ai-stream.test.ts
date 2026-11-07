import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  askAIStream,
  consumeSseStream,
  friendlyAIError,
  normalizeNewlines,
  parseSseBlock,
} from "../lib/ai";

const encoder = new TextEncoder();

function sseResponse(chunks: (string | Uint8Array)[]) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function dataLine(content: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

async function collect(chunks: (string | Uint8Array)[]) {
  const deltas: string[] = [];
  const full = await consumeSseStream(sseResponse(chunks).body!, (delta) => deltas.push(delta));
  return { full, deltas };
}

describe("normalizeNewlines", () => {
  it("normalises CRLF and lone CR, but keeps a split CRLF intact", () => {
    expect(normalizeNewlines("a\r\nb")).toBe("a\nb");
    expect(normalizeNewlines("a\rb")).toBe("a\nb");
    expect(normalizeNewlines("a\r")).toBe("a\r");
  });
});

describe("parseSseBlock", () => {
  it("ignores comments and empty blocks", () => {
    expect(parseSseBlock(": OPENROUTER PROCESSING")).toEqual({ kind: "ignored" });
    expect(parseSseBlock("")).toEqual({ kind: "ignored" });
    expect(parseSseBlock("event: message")).toEqual({ kind: "ignored" });
  });

  it("detects [DONE] and JSON payloads", () => {
    expect(parseSseBlock("data: [DONE]")).toEqual({ kind: "done" });
    expect(parseSseBlock('data: {"a":1}')).toEqual({ kind: "data", data: '{"a":1}' });
  });
});

describe("consumeSseStream", () => {
  it("keeps a JSON payload split across two chunks", async () => {
    const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: "Olá mundo" } }] })}\n\n`;
    const cut = 20;
    const { full, deltas } = await collect([payload.slice(0, cut), payload.slice(cut)]);
    expect(full).toBe("Olá mundo");
    expect(deltas).toEqual(["Olá mundo"]);
  });

  it("preserves UTF-8 characters split between chunks", async () => {
    const payload = dataLine("Olá, coração! 🌍");
    const bytes = encoder.encode(payload);
    // Split in the middle of a multi-byte sequence.
    const emojiIndex = payload.indexOf("🌍");
    const emojiBytes = encoder.encode(payload.slice(0, emojiIndex)).length;
    const parts = [bytes.slice(0, emojiBytes + 1), bytes.slice(emojiBytes + 1)];
    const { full } = await collect(parts);
    expect(full).toBe("Olá, coração! 🌍");
  });

  it("processes the last event even without a trailing newline", async () => {
    const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: "fim" } }] })}`;
    const { full, deltas } = await collect([dataLine("início"), payload]);
    expect(full).toBe("iníciofim");
    expect(deltas).toEqual(["início", "fim"]);
  });

  it("accepts CRLF separated events and ignores SSE comments", async () => {
    const crlf = `data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\r\n\r\n: keep-alive\r\n\r\ndata: ${JSON.stringify(
      { choices: [{ delta: { content: "b" } }] },
    )}\r\n\r\n`;
    const { full } = await collect([crlf]);
    expect(full).toBe("ab");
  });

  it("stops at [DONE] and ignores empty chunks", async () => {
    const { full } = await collect([
      new Uint8Array(),
      dataLine("um"),
      "data: [DONE]\n\n",
      dataLine("depois do done"),
    ]);
    expect(full).toBe("um");
  });

  it("skips malformed JSON payloads instead of failing the stream", async () => {
    const { full } = await collect(["data: {not json}\n\n", dataLine("ok")]);
    expect(full).toBe("ok");
  });

  it("throws a friendly message for an SSE error payload", async () => {
    const error = 'data: {"error":{"message":"429 rate limit exceeded"}}\n\n';
    await expect(collect([error])).rejects.toThrow(/Demasiados pedidos/i);
  });

  it("propagates abort as an AbortError rather than a generic error", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(encoder.encode(dataLine("a")));
        controller.abort();
        streamController.error(new DOMException("Aborted", "AbortError"));
      },
    });
    const error = await consumeSseStream(stream, () => {}, controller.signal).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  it("releases the reader after a failure so the stream is not locked", async () => {
    const response = sseResponse(['data: {"error":{"message":"boom"}}\n\n']);
    await expect(consumeSseStream(response.body!, () => {})).rejects.toThrow();
    expect(response.body!.locked).toBe(false);
  });

  it("returns text equal to the concatenation of every delta", async () => {
    const chunks = [dataLine("A"), dataLine("B"), dataLine("ç"), dataLine(" "), dataLine("D")];
    const { full, deltas } = await collect(chunks);
    expect(full).toBe(deltas.join(""));
    expect(full).toBe("ABç D");
  });
});

describe("askAIStream", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("angostudy:openrouter_key", JSON.stringify("test-key"));
    localStorage.setItem("angostudy:openrouter_model", JSON.stringify("test-model"));
    vi.unstubAllGlobals();
  });

  it("accumulates streamed deltas and calls onDelta per chunk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          dataLine("Olá"),
          ": OPENROUTER PROCESSING\n\n",
          dataLine(", tudo bem?"),
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const deltas: string[] = [];
    const full = await askAIStream([], (delta) => deltas.push(delta));
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

  it("maps HTTP failures to a friendly error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "401 Unauthorized" } }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    await expect(askAIStream([], () => {})).rejects.toThrow(/chave OpenRouter/i);
    vi.unstubAllGlobals();
  });

  it("does not turn an abort into a generic error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Aborted", "AbortError");
      }),
    );
    const error = await askAIStream([], () => {}).catch((e: unknown) => e);
    expect((error as DOMException).name).toBe("AbortError");
    vi.unstubAllGlobals();
  });
});

describe("centralised OpenRouter errors", () => {
  it("explains limits and capabilities in Portuguese", () => {
    expect(friendlyAIError("429 rate limit exceeded: free-models-per-day")).toMatch(
      /limite diário/i,
    );
    expect(friendlyAIError("429 rate limit")).toMatch(/Demasiados pedidos/i);
    expect(friendlyAIError("This model's maximum context length is 8192 tokens")).toMatch(
      /limite de contexto/i,
    );
    expect(friendlyAIError("tool_choice is not supported for this model")).toMatch(
      /não suporta ferramentas/i,
    );
    expect(friendlyAIError("401 Unauthorized")).toMatch(/chave/i);
    expect(friendlyAIError("408 request timeout")).toMatch(/demorou demasiado/i);
  });
});
