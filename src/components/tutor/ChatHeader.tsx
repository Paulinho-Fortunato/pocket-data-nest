import { Link } from "@tanstack/react-router";

import { AiLogo } from "@/components/AiLogo";
import {
  ChevronLeft,
  Copy,
  Download,
  FileJson,
  FileText,
  MoreVertical,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  WifiOff,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ChatHeaderProps = {
  subtitle: string;
  documentName?: string | null;
  documentMeta?: string | null;
  onOpenDocument: () => void;
  onNewChat: () => void;
  onClear: () => void;
  onExport: (format: "md" | "json") => void;
  onCopyConversation: () => void;
  onCreateCards: () => void;
  clearingDisabled: boolean;
  online: boolean;
};

/**
 * Compact chat header. On mobile it replaces the global top bar (the chat route
 * is immersive), so the back link and the document button must always fit at
 * 320 px — labels collapse to icons with `aria-label`s.
 */
export function ChatHeader({
  subtitle,
  documentName,
  documentMeta,
  onOpenDocument,
  onNewChat,
  onClear,
  onExport,
  onCopyConversation,
  onCreateCards,
  clearingDisabled,
  online,
}: ChatHeaderProps) {
  return (
    <header className="tutor-app-header">
      <Link to="/" className="tutor-icon-button tutor-back-button" aria-label="Voltar ao início">
        <ChevronLeft className="size-5" aria-hidden="true" />
      </Link>

      <AiLogo className="tutor-app-logo" size="1.9rem" animated interactive />

      <div className="tutor-app-heading">
        <h1 className="tutor-app-title">Tutor IA</h1>
        <p className="tutor-app-subtitle">
          {documentName ? `📄 ${documentName} · ${documentMeta ?? ""}` : subtitle}
        </p>
      </div>

      <div className="tutor-app-actions">
        {!online ? (
          <span className="online-dot" data-online="false" title="Sem ligação à internet">
            <WifiOff className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Sem ligação à internet</span>
          </span>
        ) : null}

        <button
          type="button"
          className="tutor-icon-button"
          data-active={documentName ? "true" : undefined}
          onClick={onOpenDocument}
          aria-label={documentName ? "Gerir documento em uso" : "Abrir documentos guardados"}
          title="Documento usado"
        >
          <FileText className="size-4" aria-hidden="true" />
          <span className="tutor-icon-label">Documento</span>
        </button>

        <button
          type="button"
          className="tutor-icon-button"
          onClick={onNewChat}
          aria-label="Nova conversa"
          title="Nova conversa"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span className="tutor-icon-label">Nova</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="tutor-icon-button"
              aria-label="Mais opções da conversa"
              title="Mais opções"
            >
              <MoreVertical className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={onCreateCards}>
              <Sparkles className="size-4" aria-hidden="true" />
              Criar cartões com IA
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCopyConversation}>
              <Copy className="size-4" aria-hidden="true" />
              Copiar conversa
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("md")}>
              <Download className="size-4" aria-hidden="true" />
              Exportar Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport("json")}>
              <FileJson className="size-4" aria-hidden="true" />
              Exportar JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onClear}
              disabled={clearingDisabled}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Limpar conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Link
          to="/definicoes"
          className="tutor-icon-button"
          aria-label="Abrir definições e personalização"
          title="Definições"
        >
          <Settings className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
