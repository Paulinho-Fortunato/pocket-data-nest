import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

type CodeBlockProps = {
  code: string;
  language: string | null;
};

/**
 * Fenced code block with a visible language label and a copy button. The button
 * lives in a toolbar above the code, never inside the model's markdown.
 */
export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        // Older browsers (and jsdom) have no async clipboard API.
        const area = document.createElement("textarea");
        area.value = code;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [code]);

  const label = language ?? "texto";

  return (
    <div className="message-code">
      <div className="message-code-toolbar">
        <span className="message-code-language">{label}</span>
        <button
          type="button"
          className="message-code-copy"
          onClick={copy}
          aria-label={copied ? "Código copiado" : `Copiar bloco de código ${label}`}
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
          <span aria-hidden="true">{copied ? "Copiado" : "Copiar"}</span>
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? "Código copiado para a área de transferência." : ""}
        </span>
      </div>
      <pre className="message-code-block" tabIndex={0}>
        <code data-language={label}>{code}</code>
      </pre>
    </div>
  );
}
