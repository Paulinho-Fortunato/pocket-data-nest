import { Loader2, RefreshCw, Square } from "lucide-react";

export type GenerationState = "idle" | "preparing" | "streaming" | "stopped" | "error";

export type GenerationStatusProps = {
  state: GenerationState;
  label: string;
  detail?: string;
  elapsedMs?: number | null;
  onStop?: () => void;
  onRetry?: () => void;
};

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Live status for the current generation: honest state, elapsed time and a
 * prominent stop button. Screen readers get one short announcement per change,
 * not one per token.
 */
export function GenerationStatus({
  state,
  label,
  detail,
  elapsedMs,
  onStop,
  onRetry,
}: GenerationStatusProps) {
  if (state === "idle" && !label) return null;
  const tone = state === "error" ? "error" : "info";

  return (
    <div className="generation-status" data-tone={tone} role="status" aria-live="polite">
      {state === "streaming" || state === "preparing" ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
      ) : null}
      <span>{label}</span>
      {detail ? <span className="sr-only">{detail}</span> : null}
      {elapsedMs != null ? (
        <span aria-hidden="true" className="tutor-tabular">
          {formatElapsed(elapsedMs)}
        </span>
      ) : null}
      {(state === "streaming" || state === "preparing") && onStop ? (
        <button
          type="button"
          className="tutor-msg-action"
          onClick={onStop}
          aria-label="Parar resposta"
        >
          <Square className="size-3" aria-hidden="true" />
          Parar
        </button>
      ) : null}
      {state === "error" && onRetry ? (
        <button type="button" className="tutor-msg-action" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}
