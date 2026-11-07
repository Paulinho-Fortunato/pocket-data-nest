import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, History, Sparkles } from "lucide-react";

import { MessageItem } from "./MessageItem";
import type { TutorMessage } from "./types";

export type MessageListProps = {
  messages: TutorMessage[];
  streamingId: string | null;
  busy: boolean;
  speechRate: number;
  speechLang: string;
  showSuggestions: boolean;
  onRegenerate: (messageId: string) => void;
  onRetry: (messageId: string) => void;
  onSuggestion: (text: string) => void;
};

/** Window of rendered messages; older turns load on demand (bounded DOM). */
const PAGE = 60;
/** How close to the bottom counts as "following the answer". */
const PIN_THRESHOLD = 120;

export function MessageList({
  messages,
  streamingId,
  busy,
  speechRate,
  speechLang,
  showSuggestions,
  onRegenerate,
  onRetry,
  onSuggestion,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastLength = useRef(messages.length);
  const [showJump, setShowJump] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE);

  const start = Math.max(0, messages.length - visibleCount);
  const visible = messages.slice(start);
  const hidden = start;

  const distanceFromBottom = useCallback(() => {
    const element = containerRef.current;
    if (!element) return 0;
    return element.scrollHeight - element.scrollTop - element.clientHeight;
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = containerRef.current;
    if (!element) return;
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ top: element.scrollHeight, behavior: reduce ? "auto" : behavior });
    pinned.current = true;
    setShowJump(false);
  }, []);

  /* First paint (including a restored conversation): jump to the end once. */
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, []);

  /* New content: follow only if the user is pinned to the bottom. */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const grew = messages.length > lastLength.current;
    const last = messages[messages.length - 1];
    if (grew && last?.role === "user") {
      // The user just sent something: always bring the answer into view.
      pinned.current = true;
      setShowJump(false);
    }
    lastLength.current = messages.length;

    if (!pinned.current) {
      if (messages.length > 0) setShowJump(true);
      return;
    }

    const frame = requestAnimationFrame(() => {
      const node = containerRef.current;
      if (!node) return;
      // Instant while tokens arrive (smooth cancels itself every frame); smooth
      // once the answer is complete.
      node.scrollTop = node.scrollHeight;
      if (!streamingId) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, streamingId]);

  const onScroll = useCallback(() => {
    const distance = distanceFromBottom();
    pinned.current = distance <= PIN_THRESHOLD;
    if (pinned.current) setShowJump(false);
  }, [distanceFromBottom]);

  const loadOlder = useCallback(() => {
    const element = containerRef.current;
    const before = element?.scrollHeight ?? 0;
    const previousTop = element?.scrollTop ?? 0;
    setVisibleCount((count) => count + PAGE);
    // Preserve the reading position after prepending older messages.
    requestAnimationFrame(() => {
      const node = containerRef.current;
      if (!node) return;
      node.scrollTop = previousTop + (node.scrollHeight - before);
    });
  }, []);

  return (
    <div
      className="tutor-app-main"
      ref={containerRef}
      onScroll={onScroll}
      tabIndex={0}
      role="region"
      aria-label="Conversa"
    >
      <div className="tutor-stream">
        {messages.length === 0 ? (
          <div className="tutor-welcome">
            <span className="tutor-welcome-mark" aria-hidden="true">
              <Sparkles className="size-6" />
            </span>
            <h1>Em que posso ajudar a estudar?</h1>
            <p>
              Pergunta, cola texto ou anexa um PDF. A conversa fica guardada neste dispositivo e o
              tutor só usa os documentos que tu escolheres.
            </p>
            {showSuggestions ? (
              <div className="tutor-suggestions" aria-label="Sugestões para começar">
                <button
                  type="button"
                  className="tutor-suggestion"
                  onClick={() => onSuggestion("Explica este conceito como se eu tivesse 12 anos: ")}
                >
                  <strong>Explica de forma simples</strong>
                  <span>Um conceito difícil, passo a passo</span>
                </button>
                <button
                  type="button"
                  className="tutor-suggestion"
                  onClick={() => onSuggestion("Cria um plano de estudo de 5 dias para o exame de ")}
                >
                  <strong>Plano de estudo</strong>
                  <span>Divide a matéria por dias</span>
                </button>
                <button
                  type="button"
                  className="tutor-suggestion"
                  onClick={() => onSuggestion("Faz-me 5 perguntas de escolha múltipla sobre ")}
                >
                  <strong>Testa-me</strong>
                  <span>Perguntas com correção</span>
                </button>
                <button
                  type="button"
                  className="tutor-suggestion"
                  onClick={() => onSuggestion("Resume os pontos essenciais do documento anexado.")}
                >
                  <strong>Resumir documento</strong>
                  <span>Pontos essenciais com páginas</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {hidden > 0 ? (
          <button type="button" className="tutor-load-older" onClick={loadOlder}>
            <History className="size-3.5" aria-hidden="true" />
            Mostrar {Math.min(PAGE, hidden)} mensagens anteriores
          </button>
        ) : null}

        {visible.map((message, index) => (
          <MessageItem
            key={message.id ?? `msg-${start + index}`}
            message={message}
            isStreaming={Boolean(streamingId && message.id === streamingId)}
            isLastAssistant={
              message.role === "assistant" &&
              message.id === [...messages].reverse().find((m) => m.role === "assistant")?.id
            }
            busy={busy}
            speechRate={speechRate}
            speechLang={speechLang}
            onRegenerate={onRegenerate}
            onRetry={onRetry}
          />
        ))}
      </div>

      {showJump ? (
        <button type="button" className="tutor-jump" onClick={() => scrollToLatest("smooth")}>
          <ArrowDown className="size-3.5" aria-hidden="true" />
          Ir para o mais recente
        </button>
      ) : null}
    </div>
  );
}
