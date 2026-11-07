import { memo } from "react";
import { AlertTriangle, CornerDownLeft, RefreshCw, Sparkles, User } from "lucide-react";

import { MessageActions } from "@/components/MessageActions";
import { MessageContent } from "@/components/MessageContent";
import { formatMessageTime, type TutorMessage } from "./types";

export type MessageItemProps = {
  message: TutorMessage;
  isStreaming: boolean;
  isLastAssistant: boolean;
  busy: boolean;
  speechRate: number;
  speechLang: string;
  onRegenerate: (messageId: string) => void;
  onRetry: (messageId: string) => void;
};

function MessageItemImpl({
  message,
  isStreaming,
  isLastAssistant,
  busy,
  speechRate,
  speechLang,
  onRegenerate,
  onRetry,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const time = formatMessageTime(message.createdAt);

  return (
    <article
      className="tutor-msg"
      data-role={message.role}
      data-streaming={isStreaming ? "true" : undefined}
      aria-busy={isStreaming || undefined}
      aria-label={isUser ? "A tua mensagem" : "Resposta do tutor"}
    >
      <span className="tutor-msg-avatar" aria-hidden="true">
        {isUser ? <User className="size-4" /> : <Sparkles className="size-4" />}
      </span>

      <div className="tutor-msg-content">
        <div className="tutor-bubble">
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <>
              <MessageContent content={message.content} isStreaming={isStreaming} />
              {isStreaming ? <span className="typing-cursor" aria-hidden="true" /> : null}
              {isStreaming ? <span className="sr-only">A resposta está a ser escrita.</span> : null}
            </>
          )}
        </div>

        {message.sources && message.sources.length > 0 ? (
          <div className="tutor-sources" aria-label="Documento usado nesta resposta">
            <span>Documento usado:</span>
            {message.sources.slice(0, 4).map((source, index) => (
              <span className="tutor-source-chip" key={`${source.name}-${index}`}>
                {source.name}
                {source.pageStart
                  ? ` · p. ${source.pageStart}${
                      source.pageEnd && source.pageEnd !== source.pageStart
                        ? `–${source.pageEnd}`
                        : ""
                    }`
                  : ""}
              </span>
            ))}
          </div>
        ) : null}

        {message.stopped ? (
          <p className="tutor-sources" role="status">
            <CornerDownLeft className="size-3.5" aria-hidden="true" />
            Resposta interrompida. O texto já recebido foi mantido.
          </p>
        ) : null}

        {message.error ? (
          <div className="tutor-error" role="alert">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span className="tutor-error-text">{message.error.message}</span>
            {message.error.retryable ? (
              <button
                type="button"
                className="tutor-msg-action"
                onClick={() => onRetry(message.id ?? "")}
                disabled={busy}
                aria-label="Tentar novamente a resposta"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                <span className="tutor-action-label">Tentar novamente</span>
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="tutor-msg-meta">
          {time ? (
            <time dateTime={new Date(message.createdAt ?? 0).toISOString()}>{time}</time>
          ) : null}

          {!isUser ? (
            <div className="tutor-msg-actions">
              <MessageActions
                content={message.content}
                onRegenerate={() => onRegenerate(message.id ?? "")}
                canRegenerate={isLastAssistant}
                disabled={busy || isStreaming}
                speechRate={speechRate}
                speechLang={speechLang}
                hideSpeak={isStreaming}
              />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Memoised: during streaming only the active message changes identity, so the
 * rest of the conversation is never re-rendered (and never re-parses markdown).
 */
export const MessageItem = memo(MessageItemImpl);
MessageItem.displayName = "MessageItem";
