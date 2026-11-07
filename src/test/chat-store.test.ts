import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useChatSession, validated } from "../lib/chat-store";
import { MAX_CHAT_CONTENT, MAX_MESSAGES, type ParsedChatMsg } from "../lib/schemas";
import { STORAGE_PREFIX } from "../lib/store";

const LEGACY_KEY = `${STORAGE_PREFIX}chat`;

function msg(id: string, content: string): ParsedChatMsg {
  return { id, role: "assistant", content } as ParsedChatMsg;
}

describe("conversation persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("restores a saved conversation after a reload", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([msg("m1", "Olá de novo")]));

    const first = renderHook(() => useChatSession());
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(first.result.current.messages).toHaveLength(1);

    await act(async () => {
      first.result.current.setMessages([msg("m1", "Olá de novo"), msg("m2", "Resposta nova")]);
      await first.result.current.flush();
    });
    first.unmount();

    const second = renderHook(() => useChatSession());
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.messages.map((item) => item.id)).toEqual(["m1", "m2"]);
  });

  it("throttles writes instead of persisting every streaming update", async () => {
    const { result } = renderHook(() => useChatSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      result.current.setMessages([msg("a", "primeiro token")]);
    });
    // Not written synchronously: streaming one delta per token must not touch storage.
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();

    await act(async () => {
      result.current.setMessages([msg("a", "primeiro token e mais texto")]);
    });

    await waitFor(
      () => {
        const stored = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]") as ParsedChatMsg[];
        expect(stored.at(-1)?.content).toBe("primeiro token e mais texto");
      },
      { timeout: 3_000 },
    );
  });

  it("drops invalid stored history instead of crashing", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ nope: true }]));
    const { result } = renderHook(() => useChatSession());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.messages).toEqual([]);
  });
});

describe("chat history validation", () => {
  it("keeps the newest window instead of discarding the whole conversation", () => {
    const messages = Array.from({ length: MAX_MESSAGES + 1 }, (_, index) => ({
      id: `m${index}`,
      role: "user" as const,
      content: `mensagem ${index}`,
    }));

    const restored = validated(messages);

    expect(restored).toHaveLength(MAX_MESSAGES);
    expect(restored[0]?.content).toBe("mensagem 1");
    expect(restored.at(-1)?.content).toBe(`mensagem ${MAX_MESSAGES}`);
  });

  it("drops only the invalid item and truncates an oversized answer", () => {
    const restored = validated([
      { id: "ok", role: "user", content: "válida" },
      { id: "bad", role: "system", content: "não permitido" },
      { id: "long", role: "assistant", content: "x".repeat(MAX_CHAT_CONTENT + 50) },
    ]);

    expect(restored).toHaveLength(2);
    expect(restored[0]?.content).toBe("válida");
    expect(restored[1]?.content).toHaveLength(MAX_CHAT_CONTENT);
  });

  it("returns an empty history for a non-array payload", () => {
    expect(validated(null)).toEqual([]);
    expect(validated({ messages: [] })).toEqual([]);
  });
});
