import { Ban, FileText, FileWarning, RefreshCw, Trash2, X } from "lucide-react";

import type { IngestProgress, IngestStage } from "@/lib/document-pipeline";
import { formatBytes, formatChars } from "./types";

const STEPS = ["Ficheiro", "Validação", "Leitura", "Páginas", "Índice"] as const;

const STAGE_STEP: Record<IngestStage, number> = {
  selected: 0,
  validating: 1,
  hashing: 2,
  cache: 2,
  reading: 2,
  opening: 2,
  pages: 3,
  indexing: 4,
  ready: 5,
  partial: 4,
  cancelled: 3,
  error: 3,
};

export type AttachmentPreviewProps = {
  file: { name: string; size: number; type: string } | null;
  progress: IngestProgress | null;
  record: {
    status: string;
    totalPages: number;
    processedPages: number;
    totalChars: number;
    warnings: string[];
  } | null;
  error: string | null;
  cancelled: boolean;
  scanned: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onOpenDocument: () => void;
  onManualPaste?: () => void;
};

/**
 * Immediate, honest feedback for an upload: the file appears before any I/O,
 * every step reflects real work and partial/scanned results are never shown as
 * "ready".
 */
export function AttachmentPreview({
  file,
  progress,
  record,
  error,
  cancelled,
  scanned,
  onCancel,
  onRetry,
  onRemove,
  onOpenDocument,
  onManualPaste,
}: AttachmentPreviewProps) {
  if (!file) return null;

  const stage: IngestStage = error
    ? "error"
    : cancelled
      ? "cancelled"
      : record?.status === "partial"
        ? "partial"
        : record?.status === "ready"
          ? "ready"
          : (progress?.stage ?? "selected");

  const busy = !error && !cancelled && !record;
  const percent = Math.max(0, Math.min(100, progress?.percent ?? (record ? 100 : 0)));
  const doneStep = STAGE_STEP[stage] ?? 0;
  const state = error
    ? "error"
    : record?.status === "partial" || cancelled
      ? "partial"
      : record
        ? "ready"
        : "processing";
  const extension = file.name.split(".").pop()?.toUpperCase().slice(0, 6) ?? "DOC";

  return (
    <section
      className="attachment-card"
      data-state={error ? "error" : undefined}
      aria-label="Documento anexado"
    >
      <div className="attachment-card-head">
        <span className="attachment-icon" aria-hidden="true">
          {error ? <FileWarning className="size-4" /> : <FileText className="size-4" />}
        </span>
        <div className="attachment-info">
          <span className="attachment-name" title={file.name}>
            {file.name}
          </span>
          <span className="attachment-meta">
            <span>{extension}</span>
            <span aria-hidden="true">·</span>
            <span>{formatBytes(file.size)}</span>
            {progress?.cached ? (
              <>
                <span aria-hidden="true">·</span>
                <span>já lido antes</span>
              </>
            ) : null}
            {record ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {record.status === "partial"
                    ? `${record.processedPages}/${record.totalPages} pág.`
                    : `${record.totalPages} pág.`}{" "}
                  · {formatChars(record.totalChars)}
                </span>
              </>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          className="tutor-icon-button"
          onClick={busy ? onCancel : onRemove}
          aria-label={busy ? "Cancelar leitura do documento" : "Remover documento"}
        >
          {busy ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <div
        className="attachment-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Progresso da leitura"
      >
        <span style={{ width: `${percent}%` }} />
      </div>

      <p className="attachment-meta" role="status" aria-live="polite">
        {error
          ? error
          : cancelled
            ? "Leitura cancelada."
            : (progress?.label ?? "Ficheiro selecionado")}
        {!error && progress && progress.totalPages > 0 && busy
          ? ` · ${progress.pagesDone}/${progress.totalPages} páginas`
          : ""}
      </p>

      <ol className="ingest-steps" aria-label="Etapas da leitura">
        {STEPS.map((label, index) => {
          const stepState = error
            ? index < doneStep
              ? "done"
              : index === doneStep
                ? "error"
                : "pending"
            : index < doneStep
              ? "done"
              : index === doneStep
                ? "active"
                : "pending";
          return (
            <li key={label} className="ingest-step" data-state={stepState}>
              {label}
            </li>
          );
        })}
      </ol>

      {record && record.warnings.length > 0 ? (
        <p className="document-warning">
          <FileWarning className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {record.status === "partial" ? "Leitura parcial: " : ""}
            {record.warnings[0]}
          </span>
        </p>
      ) : null}

      {scanned ? (
        <p className="document-warning">
          <FileWarning className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Este PDF parece uma digitalização (imagens sem texto). Não foi lido como texto e não vou
            fingir que foi. Podes colar o texto manualmente.
          </span>
        </p>
      ) : null}

      <div className="attachment-actions">
        {busy ? (
          <button type="button" className="tutor-msg-action" onClick={onCancel}>
            <Ban className="size-3.5" aria-hidden="true" />
            Cancelar
          </button>
        ) : null}

        {error || cancelled ? (
          <button type="button" className="tutor-msg-action" onClick={onRetry}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Tentar de novo
          </button>
        ) : null}

        {record ? (
          <button type="button" className="tutor-msg-action" onClick={onOpenDocument}>
            <FileText className="size-3.5" aria-hidden="true" />
            Ver documento
          </button>
        ) : null}

        {scanned && onManualPaste ? (
          <button type="button" className="tutor-msg-action" onClick={onManualPaste}>
            Colar texto manualmente
          </button>
        ) : null}
      </div>
    </section>
  );
}
