import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw, Square, Volume2 } from "lucide-react";

import { markdownToSpeechText } from "@/lib/markdown";

export type MessageActionsProps = {
  content: string;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
  disabled?: boolean;
  /** Personalization: TTS rate and language. */
  speechRate?: number;
  speechLang?: string;
  /** Hide the spoken-text action when the answer is still streaming. */
  hideSpeak?: boolean;
};

/**
 * Per-message actions. They live outside the markdown tree so the model's
 * content is never modified and buttons are never injected into it.
 */
export function MessageActions({
  content,
  onRegenerate,
  canRegenerate = false,
  disabled = false,
  speechRate = 1,
  speechLang = "pt-PT",
  hideSpeak = false,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speechAvailable = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [content]);

  const speak = useCallback(() => {
    if (!speechAvailable) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    // Cancel first so a previous answer is never read on top of this one.
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(markdownToSpeechText(content));
    utterance.lang = speechLang;
    utterance.rate = Math.min(2, Math.max(0.5, speechRate));
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  }, [content, speaking, speechAvailable, speechLang, speechRate]);

  return (
    <div className="message-actions">
      <button
        type="button"
        className="message-action"
        onClick={copy}
        disabled={disabled}
        aria-label={copied ? "Resposta copiada" : "Copiar resposta"}
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
        <span>{copied ? "Copiado" : "Copiar"}</span>
      </button>
      {onRegenerate ? (
        <button
          type="button"
          className="message-action"
          onClick={onRegenerate}
          disabled={disabled || !canRegenerate}
          aria-label="Regenerar resposta"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          <span>Regenerar</span>
        </button>
      ) : null}
      {speechAvailable && !hideSpeak ? (
        <button
          type="button"
          className="message-action"
          onClick={speak}
          aria-pressed={speaking}
          disabled={disabled}
          aria-label={speaking ? "Parar leitura em voz alta" : "Ler resposta em voz alta"}
        >
          {speaking ? (
            <Square className="size-3.5" aria-hidden="true" />
          ) : (
            <Volume2 className="size-3.5" aria-hidden="true" />
          )}
          <span>{speaking ? "Parar" : "Ouvir"}</span>
        </button>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Resposta copiada para a área de transferência." : ""}
      </span>
    </div>
  );
}
