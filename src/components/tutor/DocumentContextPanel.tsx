import { useEffect, useState } from "react";
import { FileText, FolderOpen, Trash2, XCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DocumentRecord, DocumentSummary } from "@/lib/documents";
import { listDocuments, loadDocument } from "@/lib/idb";
import { describeDocumentStatus } from "@/lib/document-pipeline";
import { formatChars, formatBytes } from "./types";

const TEXT_PREVIEW_LIMIT = 200_000;

export type DocumentContextPanelProps = {
  open: boolean;
  onClose: () => void;
  document: DocumentRecord | null;
  onDetach: () => void;
  onDelete: (id: string) => Promise<void> | void;
  onReuse: (record: DocumentRecord) => void;
  usage?: {
    mode: string;
    usedChunks: number;
    totalChunks: number;
    pageRanges: { from: number; to: number }[];
  } | null;
};

/**
 * "Documento usado": what the model can see, how much of it, and the actions
 * that matter (view text, reuse another extraction, remove from context or
 * delete permanently). Never opens a nested viewer/iframe.
 */
export function DocumentContextPanel({
  open,
  onClose,
  document,
  onDetach,
  onDelete,
  onReuse,
  usage,
}: DocumentContextPanelProps) {
  const [library, setLibrary] = useState<DocumentSummary[]>([]);
  const [showText, setShowText] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setShowText(false);
      setConfirmDelete(false);
      return;
    }
    let cancelled = false;
    void listDocuments()
      .then((documents) => {
        if (!cancelled) setLibrary(documents.filter((item) => item.totalChars > 0));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, document?.id]);

  async function reuse(id: string) {
    setLoadingId(id);
    try {
      const record = await loadDocument(id);
      if (record) {
        onReuse(record);
        onClose();
      }
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="document-panel" aria-describedby="doc-panel-desc">
        <DialogHeader>
          <DialogTitle>Documento usado</DialogTitle>
          <DialogDescription id="doc-panel-desc">
            O tutor só vê o que está aqui. O texto completo fica neste dispositivo.
          </DialogDescription>
        </DialogHeader>

        {document ? (
          <div className="document-panel">
            <div>
              <p className="document-panel-title">{document.name}</p>
              <p className="document-panel-subtitle">
                {document.mime || "documento"} · {formatBytes(document.size)} ·{" "}
                {describeDocumentStatus(document)}
              </p>
            </div>

            <div className="document-panel-grid">
              <div className="document-stat">
                <span>Páginas</span>
                <strong>
                  {document.processedPages}/{document.totalPages}
                </strong>
              </div>
              <div className="document-stat">
                <span>Caracteres</span>
                <strong>{formatChars(document.totalChars)}</strong>
              </div>
              <div className="document-stat">
                <span>Trechos</span>
                <strong>{document.chunkCount || document.chunks.length}</strong>
              </div>
              <div className="document-stat">
                <span>Estado</span>
                <strong>{document.status}</strong>
              </div>
              {usage ? (
                <>
                  <div className="document-stat">
                    <span>Páginas usadas</span>
                    <strong>
                      {usage.pageRanges.length > 0
                        ? usage.pageRanges
                            .map((range) =>
                              range.from === range.to
                                ? `${range.from}`
                                : `${range.from}–${range.to}`,
                            )
                            .join(", ")
                        : "—"}
                    </strong>
                  </div>
                  <div className="document-stat">
                    <span>Trechos usados</span>
                    <strong>
                      {usage.usedChunks}/{usage.totalChunks}
                    </strong>
                  </div>
                </>
              ) : null}
            </div>

            {usage ? (
              <p className="preview-source">
                Modo de contexto: {usage.mode}
                {usage.usedChunks < usage.totalChunks
                  ? " — só os trechos relevantes para a pergunta foram enviados ao modelo."
                  : " — o documento inteiro cabe no contexto."}
              </p>
            ) : null}

            {document.warnings.length > 0 ? (
              <div className="document-warning" role="status">
                <XCircle className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{document.warnings.slice(0, 3).join(" ")}</span>
              </div>
            ) : null}

            <div className="attachment-actions">
              <Button variant="outline" size="sm" onClick={() => setShowText((value) => !value)}>
                <FileText aria-hidden="true" />
                {showText ? "Ocultar texto" : "Ver texto extraído"}
              </Button>
              <Button variant="outline" size="sm" onClick={onDetach}>
                <XCircle aria-hidden="true" />
                Remover do contexto
              </Button>
              {confirmDelete ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      await onDelete(document.id);
                      setConfirmDelete(false);
                      onClose();
                    }}
                  >
                    Confirmar apagar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden="true" />
                  Apagar definitivamente
                </Button>
              )}
            </div>

            {showText ? (
              <>
                <pre className="document-text-preview" aria-label="Texto extraído do documento">
                  {document.text.slice(0, TEXT_PREVIEW_LIMIT)}
                </pre>
                {document.text.length > TEXT_PREVIEW_LIMIT ? (
                  <p className="preview-source">
                    A mostrar os primeiros {formatChars(TEXT_PREVIEW_LIMIT)} de{" "}
                    {formatChars(document.text.length)}. O texto completo continua guardado e é
                    usado pelo tutor; esta pré-visualização é limitada para o navegador não
                    bloquear.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <p className="preview-source">
            Nenhum documento em uso. Escolhe um documento já lido para reutilizar sem voltar a
            processar o ficheiro.
          </p>
        )}

        <section aria-label="Documentos guardados" className="document-panel">
          <h3 className="document-panel-section-title">
            <FolderOpen className="size-4" aria-hidden="true" />
            Documentos guardados ({library.length})
          </h3>
          {library.length === 0 ? (
            <p className="preview-source">
              Ainda não há documentos guardados. Anexa um PDF ou um ficheiro de texto no compositor.
            </p>
          ) : (
            <div className="document-list">
              {library.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="document-list-item"
                  data-selected={item.id === document?.id ? "true" : undefined}
                  onClick={() => void reuse(item.id)}
                  disabled={loadingId === item.id}
                >
                  <strong>{item.name}</strong>
                  <span>
                    {describeDocumentStatus(item)} · {formatChars(item.totalChars)} ·{" "}
                    {loadingId === item.id ? "a abrir…" : "reutilizar"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
