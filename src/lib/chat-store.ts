import { useCallback, useEffect, useRef, useState } from "react";

import { ChatSchema, MAX_MESSAGES, type ParsedChatMsg } from "./schemas";
import { clearChatHistory, isIndexedDbAvailable, loadChatHistory, saveChatHistory } from "./idb";
import { readValidated, removeStore, writeValidated } from "./store";

/**
 * Conversation history with throttled persistence.
 *
 * Streaming produces one update per token; writing to storage on every token
 * froze the UI on long answers. Here only the newest state is persisted, at
 * most once every ~1.2 s (and immediately when the answer ends), and the full
 * history goes to IndexedDB instead of the 5 MB localStorage quota.
 */

const LEGACY_KEY = "chat";
const SAVE_DELAY = 1_200;
/** localStorage fallback keeps the last turns only (quota-safe). */
const FALLBACK_MESSAGES = 40;

export type ChatSession = {
  messages: ParsedChatMsg[];
  setMessages: (updater: ParsedChatMsg[] | ((prev: ParsedChatMsg[]) => ParsedChatMsg[])) => void;
  clear: () => Promise<void>;
  flush: () => Promise<void>;
  ready: boolean;
};

function validated(messages: unknown): ParsedChatMsg[] {
  const parsed = ChatSchema.safeParse(messages);
  return parsed.success ? parsed.data.slice(-MAX_MESSAGES) : [];
}

export function useChatSession(initial: ParsedChatMsg[] = []): ChatSession {
  const [messages, setState] = useState<ParsedChatMsg[]>(initial);
  const [ready, setReady] = useState(false);
  const pending = useRef<ParsedChatMsg[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const persist = useCallback(async (next: ParsedChatMsg[]) => {
    const safe = next.slice(-MAX_MESSAGES);
    if (!isIndexedDbAvailable()) {
      // No IndexedDB (private mode / old browser): small, bounded mirror.
      writeValidated(LEGACY_KEY, ChatSchema, safe.slice(-FALLBACK_MESSAGES));
      return;
    }
    try {
      await saveChatHistory(safe);
      // Remove the legacy mirror once the IndexedDB copy succeeds.
      removeStore(LEGACY_KEY);
    } catch {
      writeValidated(LEGACY_KEY, ChatSchema, safe.slice(-FALLBACK_MESSAGES));
    }
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    pending.current = null;
    if (next) await persist(next);
  }, [persist]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void (async () => {
      let restored: ParsedChatMsg[] = [];
      try {
        const stored = await loadChatHistory();
        if (stored) restored = validated(stored.messages);
      } catch {
        restored = [];
      }
      if (restored.length === 0) {
        // Migrate the previous localStorage history the first time.
        const legacy = readValidated(LEGACY_KEY, ChatSchema, []).value;
        if (legacy.length > 0) restored = legacy;
      }
      if (cancelled) return;
      setState(restored.length > 0 ? restored : initial);
      setReady(true);
      if (restored.length > 0) void persist(restored);
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      // Best-effort flush on unmount (e.g. navigating to another route).
      const next = pending.current;
      if (next) void persist(next);
    },
    [persist],
  );

  const setMessages = useCallback(
    (updater: ParsedChatMsg[] | ((prev: ParsedChatMsg[]) => ParsedChatMsg[])) => {
      setState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        pending.current = next;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          const snapshot = pending.current;
          pending.current = null;
          if (snapshot) void persist(snapshot);
        }, SAVE_DELAY);
        return next;
      });
    },
    [persist],
  );

  const clear = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    setState([]);
    removeStore(LEGACY_KEY);
    await clearChatHistory().catch(() => undefined);
  }, []);

  return { messages, setMessages, clear, flush, ready };
}
