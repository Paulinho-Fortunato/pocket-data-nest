/**
 * Development-only diagnostics. Never logs API keys, document text or message
 * content: only identifiers, stages, sizes and timings.
 */

const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
export const isDev = Boolean(env?.DEV ?? false);

type Detail = Record<string, unknown>;

export function diag(event: string, detail: Detail = {}): void {
  if (!isDev) return;
  const safe: Detail = {};
  for (const [key, value] of Object.entries(detail)) {
    if (/key|token|secret|authorization/i.test(key)) continue;
    if (typeof value === "string" && value.length > 120) safe[key] = `${value.slice(0, 117)}…`;
    else safe[key] = value;
  }
  console.debug(`[angostudy:${event}]`, { ...safe, at: Math.round(performance.now()) });
}
