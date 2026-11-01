import { useCallback, useEffect, useState } from "react";

/** All app data is stored in the browser (localStorage) under this prefix. */
const PREFIX = "angostudy:";
const EVENT = "angostudy-store";

export function readStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStore<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  } catch {
    // Private browsing and storage quotas can reject writes. The in-memory
    // state still updates, so the current session remains usable.
  }
}

/** useState that persists to localStorage and syncs between components/tabs. */
export function usePersistent<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(readStore(key, fallback));
    setReady(true);
    const sync = (e: Event) => {
      const k = e instanceof CustomEvent ? e.detail : (e as StorageEvent).key?.replace(PREFIX, "");
      if (k === key) setValue(readStore(key, fallback));
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (p: T) => T)(readStore(key, fallback)) : next;
      writeStore(key, resolved);
      setValue(resolved);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, update, ready] as const;
}

/** Alias kept for compatibility with code that refers to the store as a local "DB". */
export const usePersistentDB = usePersistent;

export type Card = { id: string; q: string; a: string; deck: string; known: boolean };
export type Note = { id: string; title: string; body: string; updated: number };
export type ChatMsg = { role: "user" | "assistant"; content: string };
export type Stats = {
  name: string;
  xp: number;
  quizzes: number;
  correct: number;
  answered: number;
  reviewed: number;
  focusMinutes: number;
  sessions: number;
  weeklyGoal: number;
  days: string[]; // ISO dates with activity
};

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

export const uid = () => Math.random().toString(36).slice(2, 10);

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
  const [stats, setStats, ready] = usePersistent<Stats>("stats", defaultStats);
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
  return { stats: { ...defaultStats, ...stats }, setStats, award, ready };
}
