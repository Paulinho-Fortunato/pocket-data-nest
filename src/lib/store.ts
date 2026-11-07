import { useCallback, useEffect, useMemo, useState } from "react";
import type { z } from "zod";

import {
  CardSchema,
  ChatMsgSchema,
  NoteSchema,
  StatsSchema,
  type ParsedCard,
  type ParsedChatMsg,
  type ParsedNote,
  type ParsedStats,
} from "./schemas";

/**
 * Small preferences live in localStorage under this prefix. Large documents are
 * stored in IndexedDB (`lib/idb.ts`) — never here.
 */
export const STORAGE_PREFIX = "angostudy:";
const EVENT = "angostudy-store";

export function readStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStore<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  } catch {
    // Private browsing and storage quotas can reject writes. The in-memory
    // state still updates, so the current session remains usable.
  }
}

export function removeStore(key: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  } catch {
    // ignore
  }
}

/**
 * Reads a value and validates it with a Zod schema. Corrupted or outdated data
 * degrades to the fallback instead of crashing the route.
 */
export type Validator<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

export function readValidated<T>(
  key: string,
  schema: Validator<T>,
  fallback: T,
): { value: T; valid: boolean } {
  const raw = readStore<unknown>(key, undefined as unknown);
  if (raw === undefined) return { value: fallback, valid: true };
  const parsed = schema.safeParse(raw);
  return parsed.success ? { value: parsed.data, valid: true } : { value: fallback, valid: false };
}

export function writeValidated<T>(key: string, schema: Validator<T>, value: T): boolean {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return false;
  writeStore(key, parsed.data);
  return true;
}

/** useState that persists to localStorage, validates and syncs across tabs. */
export function usePersistent<T>(key: string, fallback: T, schema?: Validator<T>) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  const read = useCallback(() => {
    if (!schema) return readStore(key, fallback);
    return readValidated(key, schema, fallback).value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, schema]);

  useEffect(() => {
    setValue(read());
    setReady(true);
    const sync = (e: Event) => {
      const k =
        e instanceof CustomEvent ? e.detail : (e as StorageEvent).key?.replace(STORAGE_PREFIX, "");
      if (k === key) setValue(read());
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key, read]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(read()) : next;
      if (!schema) {
        writeStore(key, resolved);
      } else {
        const parsed = schema.safeParse(resolved);
        if (!parsed.success) return;
        writeStore(key, parsed.data);
      }
      setValue(resolved);
    },
    [key, read, schema],
  );

  return [value, update, ready] as const;
}

/** Alias kept for compatibility with code that refers to the store as a local "DB". */
export const usePersistentDB = usePersistent;

export type Card = ParsedCard;
export type Note = ParsedNote;
export type ChatMsg = ParsedChatMsg;
export type Stats = ParsedStats;

export const defaultStats: Stats = {
  name: "Estudante",
  xp: 0,
  quizzes: 0,
  correct: 0,
  answered: 0,
  reviewed: 0,
  focusMinutes: 0,
  sessions: 0,
  weeklyGoal: 6,
  days: [],
};

export const defaultCards: Card[] = [
  {
    id: "c1",
    deck: "Matemática",
    q: "Qual é a derivada de f(x) = x²?",
    a: "f'(x) = 2x",
    known: false,
  },
  {
    id: "c2",
    deck: "História",
    q: "Principal causa da Revolução Francesa?",
    a: "Crise financeira, desigualdade social e insatisfação do Terceiro Estado.",
    known: false,
  },
  {
    id: "c3",
    deck: "Física",
    q: "O que diz a 1.ª Lei de Newton?",
    a: "Um corpo mantém repouso ou movimento uniforme se nenhuma força resultante atuar sobre ele.",
    known: false,
  },
  { id: "c4", deck: "Matemática", q: "Qual é o valor de ∫ 2x dx?", a: "x² + C", known: false },
];

/** Deterministic-enough id that never collides with the static demo cards. */
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const XP_PER_LEVEL = 300;
export const levelOf = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1;

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function today() {
  return dateKey();
}

/** Consecutive days with activity ending today (or yesterday). */
export function streak(days: string[]) {
  const set = new Set(days);
  let n = 0;
  const d = new Date();
  if (!set.has(today())) d.setDate(d.getDate() - 1);
  while (set.has(dateKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Hook helper to award XP and register activity. */
export function useStats() {
  const [stats, setStats, ready] = usePersistent<Stats>("stats", defaultStats, StatsSchema);
  const award = useCallback(
    (xp: number, patch: (s: Stats) => Partial<Stats> = () => ({})) =>
      setStats((s) => {
        const s2 = { ...defaultStats, ...s };
        return {
          ...s2,
          ...patch(s2),
          xp: s2.xp + xp,
          days: s2.days.includes(today()) ? s2.days : [...s2.days, today()],
        };
      }),
    [setStats],
  );
  return useMemo(
    () => ({ stats: { ...defaultStats, ...stats }, setStats, award, ready }),
    [stats, setStats, award, ready],
  );
}

/** Validated hooks for the other persisted collections. */
export function useCards() {
  return usePersistent<Card[]>("cards", defaultCards, CardSchema.array());
}

export function useNotes() {
  return usePersistent<Note[]>("notes", [], NoteSchema.array());
}

export function useChatMessages(fallback: ChatMsg[]) {
  return usePersistent<ChatMsg[]>("chat", fallback, ChatMsgSchema.array());
}
