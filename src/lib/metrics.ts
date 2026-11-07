/**
 * Lightweight performance marks.
 *
 * Only the last value of each metric is kept (no unbounded arrays) and nothing
 * is persisted: these numbers exist to verify the promises made in the UI
 * ("feedback imediato", "primeira página", "primeiro token") instead of
 * guessing. They are shown in Definições → Desempenho.
 */

export type MetricKey =
  | "upload:file-shown"
  | "upload:extraction-start"
  | "upload:first-page"
  | "upload:document-ready"
  | "upload:total"
  | "ai:request-start"
  | "ai:first-token"
  | "ai:generation-end"
  | "ai:cards-ready"
  | "ai:quiz-ready";

const LABELS: Record<MetricKey, string> = {
  "upload:file-shown": "Ficheiro mostrado",
  "upload:extraction-start": "Início da extração",
  "upload:first-page": "Primeira página lida",
  "upload:document-ready": "Documento pronto",
  "upload:total": "Tempo total de leitura",
  "ai:request-start": "Pedido enviado",
  "ai:first-token": "Primeiro token",
  "ai:generation-end": "Geração completa",
  "ai:cards-ready": "Cartões prontos",
  "ai:quiz-ready": "Quiz pronto",
};

const durations = new Map<MetricKey, number>();

function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/** Starts a timer; calling the returned function records the elapsed ms. */
export function startTimer(key: MetricKey): () => number {
  const started = now();
  return () => {
    const elapsed = Math.round(now() - started);
    durations.set(key, elapsed);
    return elapsed;
  };
}

/** Records an explicit duration (e.g. measured elsewhere). */
export function recordDuration(key: MetricKey, ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return;
  durations.set(key, Math.round(ms));
}

export function getDuration(key: MetricKey): number | null {
  return durations.get(key) ?? null;
}

export type MetricRow = { key: MetricKey; label: string; ms: number };

/** Snapshot for the settings screen, ordered as a timeline. */
export function getMetricsSnapshot(): MetricRow[] {
  return (Object.keys(LABELS) as MetricKey[])
    .filter((key) => durations.has(key))
    .map((key) => ({ key, label: LABELS[key], ms: durations.get(key) ?? 0 }));
}

export function resetMetrics() {
  durations.clear();
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}
