import type { ReactNode } from "react";
import { FolderOpen, FileText, WifiOff } from "lucide-react";

import { AIInput } from "@/components/AIInput";

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onFile: (file: File | undefined) => void;
  loading: boolean;
  disabled: boolean;
  offline: boolean;
  suggestionList: string[];
  onPickSuggestion: (suggestion: string) => void;
  listening: boolean;
  onToggleMic: () => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  documentName: string | null;
  documentMeta: string | null;
  onOpenDocument: () => void;
  onOpenLibrary: () => void;
  attachment?: ReactNode;
  generation?: ReactNode;
};

/**
 * Sticky bottom composer. It is a flex child of the full-height chat (never an
 * absolute overlay), so it can't be covered by the bottom navigation and it
 * stays above the virtual keyboard.
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  onFile,
  loading,
  disabled,
  offline,
  suggestionList,
  onPickSuggestion,
  listening,
  onToggleMic,
  voiceEnabled,
  onToggleVoice,
  documentName,
  documentMeta,
  onOpenDocument,
  onOpenLibrary,
  attachment,
  generation,
}: ChatComposerProps) {
  return (
    <div className="tutor-composer-area">
      <div className="tutor-composer-inner">
        <div className="tutor-composer-tools">
          <button type="button" className="tutor-tool" onClick={onOpenLibrary}>
            <FolderOpen className="size-3.5" aria-hidden="true" />
            Documentos
          </button>
          {documentName ? (
            <button type="button" className="tutor-doc-badge" onClick={onOpenDocument}>
              <FileText className="size-3.5" aria-hidden="true" />
              <span>{documentName}</span>
              {documentMeta ? <span aria-hidden="true">· {documentMeta}</span> : null}
            </button>
          ) : null}
        </div>

        {attachment}
        {generation}

        {offline ? (
          <p className="offline-note" role="status">
            <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              O tutor precisa de internet. Podes continuar a ler documentos já guardados, estudar
              flashcards e usar o modo foco offline.
            </span>
          </p>
        ) : null}

        <AIInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          onAbort={onStop}
          placeholder={
            offline
              ? "Sem ligação — o tutor não pode responder agora"
              : "Pergunta ou pede um resumo…"
          }
          suggestions={suggestionList}
          onPickSuggestion={onPickSuggestion}
          listening={listening}
          onToggleMic={onToggleMic}
          voiceEnabled={voiceEnabled}
          onToggleVoice={onToggleVoice}
          onFile={onFile}
          loading={loading}
          disabled={disabled || offline}
          hint="Enter envia · Shift+Enter faz uma nova linha. O tutor pode errar: verifica fontes importantes."
        />
      </div>
    </div>
  );
}
