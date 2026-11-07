import { useCallback, useEffect, useRef, useState } from "react";

import {
  ChatMsgSchema,
  ChatSchema,
  MAX_CHAT_CONTENT,
  MAX_MESSAGES,
  type ParsedChatMsg,
} from "./schemas";
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

/**
 * Validates messages one by one and keeps the newest window.
 *
 * The previous implementation validated the whole array first: one oversized
 * answer (or a 501st message) made `safeParse` fail and returned `[]`, wiping
 * the entire restored conversation. Invalid items are dropped individually and
 * long content is truncated, never used as a reason to discard the history.
 */
export function validated(messages: unknown): ParsedChatMsg[] {
  if (!Array.isArray(messages)) return [];
  const window = messages.slice(-MAX_MESSAGES);
  const valid: ParsedChatMsg[] = [];
  for (const item of window) {
    const parsed = ChatMsgSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
  }
  return valid;
}

function normaliseForPersist(messages: ParsedChatMsg[]): ParsedChatMsg[] {
  return messages.slice(-MAX_MESSAGES).map((message) => ({
    ...message,
    content: message.content.slice(0, MAX_CHAT_CONTENT),
  }));
}

export function useChatSession(initial: ParsedChatMsg[] = []): ChatSession {
  const [messages, setState] = useState<ParsedChatMsg[]>(initial);
  const [ready, setReady] = useState(false);
  const pending = useRef<ParsedChatMsg[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  /** True once the user has changed the session (or cleared it) before load. */
  const dirty = useRef(false);
  const cleared = useRef(false);

  const persist = useCallback(async (next: ParsedChatMsg[]) => {
    const safe = normaliseForPersist(next);
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
      if (cleared.current) {
        // A clear happened while IndexedDB was loading: never bring the old
        // conversation back over the empty state.
        setState([]);
      } else if (dirty.current) {
        // The user already sent something before the async restore completed.
        // Keep those messages and merge the older restored ones behind them.
        setState((current) => {
          const currentIds = new Set(current.map((message) => message.id).filter(Boolean));
          const older = restored.filter((message) => !message.id || !currentIds.has(message.id));
          return [...older, ...current].slice(-MAX_MESSAGES);
        });
      } else {
        setState(restored.length > 0 ? restored : initial);
        if (restored.length > 0) void persist(restored);
      }
      setReady(true);
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
      dirty.current = true;
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
    cleared.current = true;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    setState([]);
    removeStore(LEGACY_KEY);
    await clearChatHistory().catch(() => undefined);
  }, []);

  return { messages, setMessages, clear, flush, ready };
}
