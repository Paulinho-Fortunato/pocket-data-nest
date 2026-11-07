import { useRef } from "react";
import { FileText, FolderOpen, Keyboard, Lightbulb, Upload, WifiOff } from "lucide-react";

import { DEFAULT_FILE_ACCEPT } from "@/components/AIInput";
import { AttachmentPreview } from "@/components/tutor/AttachmentPreview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GenerationSourceApi, SourceTab } from "@/lib/use-generation-source";
import { describeDocumentStatus } from "@/lib/document-pipeline";
import { formatChars } from "@/components/tutor/types";

const TABS: { id: SourceTab; label: string; icon: typeof FileText }[] = [
  { id: "file", label: "Ficheiro", icon: Upload },
  { id: "paste", label: "Colar texto", icon: Keyboard },
  { id: "document", label: "Documento guardado", icon: FolderOpen },
  { id: "topic", label: "Tema", icon: Lightbulb },
];

export type SourcePickerProps = {
  api: GenerationSourceApi;
  offline: boolean;
  onError: (message: string) => void;
};

/**
 * Source selector shared by card and quiz creation. Every option is explicit:
 * the user always knows whether the AI reads a PDF, pasted text, a saved
 * document or just a theme.
 */
export function SourcePicker({ api, offline, onError }: SourcePickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section className="create-card" aria-label="Fonte do conteúdo">
      <header>
        <h2>De onde vêm os conteúdos?</h2>
        <p>PDF, texto ou um documento que já leste antes. Nada é enviado sem escolheres.</p>
      </header>

      <div className="source-tabs" role="group" aria-label="Tipo de fonte">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="source-tab"
            aria-pressed={api.tab === id}
            onClick={() => api.setTab(id)}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {api.tab === "file" ? (
        <div className="create-card create-subcard">
          <input
            ref={fileRef}
            type="file"
            accept={DEFAULT_FILE_ACCEPT}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.type.startsWith("image/")) {
                onError(
                  "As imagens não são lidas como texto (sem OCR). Usa um PDF com texto ou cola o conteúdo.",
                );
                return;
              }
              void api.handleFile(file);
            }}
          />
          <div className="attachment-actions">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden="true" />
              Escolher ficheiro
            </Button>
            <span className="preview-source">
              A leitura é progressiva e podes cancelar. O texto completo fica no dispositivo.
            </span>
          </div>
          {api.ingest ? (
            <AttachmentPreview
              file={api.ingest.file}
              progress={api.ingest.progress}
              record={
                api.fileRecord
                  ? {
                      status: api.fileRecord.status,
                      totalPages: api.fileRecord.totalPages,
                      processedPages: api.fileRecord.processedPages,
                      totalChars: api.fileRecord.totalChars,
                      warnings: api.fileRecord.warnings,
                    }
                  : null
              }
              error={api.ingest.error}
              cancelled={api.ingest.cancelled}
              scanned={api.ingest.errorCode === "NO_TEXT_LAYER"}
              onCancel={api.cancelIngest}
              onRetry={api.retryIngest}
              onRemove={api.removeIngest}
              onOpenDocument={() => api.setLibraryOpen(true)}
            />
          ) : null}
        </div>
      ) : null}

      {api.tab === "paste" ? (
        <label className="option-field">
          <span>Cola os apontamentos, um resumo ou o texto do documento</span>
          <textarea
            className="source-textarea"
            value={api.pasteText}
            onChange={(event) => api.setPasteText(event.target.value)}
            placeholder="Cola aqui pelo menos algumas frases sobre o tema…"
            aria-describedby="paste-counter"
          />
          <span id="paste-counter" className="preview-source" role="status">
            {api.pasteText.trim().length} caracteres
            {api.pasteText.trim().length < 40 ? " · mínimo 40" : ""}
            {api.pasteText.length > 60_000
              ? " · o texto é grande: só os trechos relevantes para o tema são enviados ao modelo."
              : ""}
          </span>
        </label>
      ) : null}

      {api.tab === "document" ? (
        <div className="create-card create-subcard">
          <div className="attachment-actions">
            <Button variant="outline" size="sm" onClick={() => api.setLibraryOpen(true)}>
              <FolderOpen aria-hidden="true" />
              Escolher documento guardado
            </Button>
          </div>
          {api.record ? (
            <p className="preview-source">
              <strong>{api.record.name}</strong> · {describeDocumentStatus(api.record)} ·{" "}
              {formatChars(api.record.totalChars)}
            </p>
          ) : (
            <p className="preview-source">
              Documentos já lidos são reutilizados sem voltar a processar o ficheiro.
            </p>
          )}
        </div>
      ) : null}

      {api.tab === "topic" ? (
        <label className="option-field">
          <span>Indica o tema (sem documento)</span>
          <input
            className="source-textarea topic-input"
            value={api.topic}
            onChange={(event) => api.setTopic(event.target.value)}
            placeholder="Ex.: fotossíntese, equações do 2.º grau, Revolução Francesa…"
          />
          <span className="preview-source">
            Sem documento não há citações nem páginas: as fontes ficam indicadas como “tema”.
          </span>
        </label>
      ) : null}

      {offline ? (
        <p className="offline-note">
          <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Sem internet podes escolher e ler documentos, mas a geração com IA só funciona online.
          </span>
        </p>
      ) : null}

      <Dialog open={api.libraryOpen} onOpenChange={api.setLibraryOpen}>
        <DialogContent aria-describedby="source-library-desc">
          <DialogHeader>
            <DialogTitle>Documentos guardados</DialogTitle>
            <DialogDescription id="source-library-desc">
              Extrações completas ou parciais guardadas neste dispositivo.
            </DialogDescription>
          </DialogHeader>
          {api.library.length === 0 ? (
            <p className="preview-source">Ainda não há documentos. Anexa um PDF ou cola texto.</p>
          ) : (
            <div className="document-list">
              {api.library.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="document-list-item"
                  onClick={() => {
                    void api.pickDocument(item.id).then(() => api.setTab("document"));
                  }}
                >
                  <strong>{item.name}</strong>
                  <span>
                    {describeDocumentStatus(item)} · {formatChars(item.totalChars)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <p className="preview-source">
        Fonte atual: <strong>{api.sourceLabel}</strong>
        {api.canGenerate ? "" : " · escolhe ou cola conteúdo para continuar"}
      </p>
    </section>
  );
}
