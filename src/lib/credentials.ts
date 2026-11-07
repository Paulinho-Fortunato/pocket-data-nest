import { readStore, writeStore } from "./store";

/**
 * The OpenRouter key lives in localStorage, which is readable by any script
 * running on this origin (and by browser extensions). That is acceptable for a
 * personal local-first app, but it is a real risk and the UI says so.
 *
 * A server-side proxy (see `createProxyTransport` in `lib/ai.ts`) removes the
 * need for a browser key entirely.
 */
export const API_KEY_STORE_KEY = "openrouter_key";

export const API_KEY_RISK_NOTICE =
  "A chave fica guardada neste navegador (localStorage). Qualquer script ou extensão com acesso a esta origem pode lê-la. Usa uma chave com limite de gastos e remove-a quando não precisares.";

export function getApiKey(): string {
  return readStore<string>(API_KEY_STORE_KEY, "").trim();
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function setApiKey(key: string) {
  writeStore(API_KEY_STORE_KEY, key.trim());
}

export function clearApiKey() {
  writeStore(API_KEY_STORE_KEY, "");
}

/** Never log or export the real key; this is only for UI confirmation. */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
