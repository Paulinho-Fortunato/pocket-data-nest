import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, FileText, X } from "lucide-react";

/* Composer estilo ChatGPT (adaptado de Uiverse.io by AshtonLiou),
   com as cores/interacções do tema AngoStudy. */

const icons = {
  micOn: (
    <svg viewBox="0 0 16 16" fill="currentColor" height="20" width="20" aria-hidden="true">
      <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5" />
      <path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3" />
    </svg>
  ),
  micOff: (
    <svg viewBox="0 0 16 16" fill="currentColor" height="20" width="20" aria-hidden="true">
      <path d="M13 8c0 .564-.094 1.107-.266 1.613l-.814-.814A4 4 0 0 0 12 8V7a.5.5 0 0 1 1 0zm-5 4c.818 0 1.578-.245 2.212-.667l.718.719a5 5 0 0 1-2.43.923V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 1 0v1a4 4 0 0 0 4 4m3-9v4.879l-1-1V3a2 2 0 0 0-3.997-.118l-.845-.845A3.001 3.001 0 0 1 11 3" />
      <path d="m9.486 10.607-.748-.748A2 2 0 0 1 6 8v-.878l-1-1V8a3 3 0 0 0 4.486 2.607m-7.84-9.253 12 12 .708-.708-12-12z" />
    </svg>
  ),
  volumeOn: (
    <svg viewBox="0 0 16 16" fill="currentColor" height="20" width="20" aria-hidden="true">
      <path d="M8.5 1.262a.5.5 0 0 1 .737-.441 7 7 0 0 1 0 12.358.5.5 0 0 1-.737-.44zM12 4a.5.5 0 0 1 .703.718L11.352 8l1.351 3.282A.5.5 0 0 1 12 12l-.156-.005a4.5 4.5 0 0 1-.311-.078l-.872-2.72a.5.5 0 0 1 0-.066l.872-2.72q.158-.047.311-.078zm1.879-2.879a.5.5 0 0 1 .708 0A6.97 6.97 0 0 1 16 8a6.97 6.97 0 0 1-1.713 4.879.5.5 0 1 1-.708-.708A5.97 5.97 0 0 0 15 8a5.97 5.97 0 0 0-1.421-4.171.5.5 0 0 1 0-.708M6 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5" />
      <path
        d="M4.879 5.121 1.5 2V14l3.379-3.121L9 14V2z"
        fillRule="evenodd"
        clipRule="evenodd"
        transform="scale(-1,1) translate(-11,0)"
      />
    </svg>
  ),
  volumeOff: (
    <svg viewBox="0 0 16 16" fill="currentColor" height="20" width="20" aria-hidden="true">
      <path d="M8.5 1.262a.5.5 0 0 1 .737-.441 7 7 0 0 1 0 12.358.5.5 0 0 1-.737-.44zM6 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5" />
      <path d="m1.5 2 12 12 .708-.708-12-12z" />
      <path
        d="M4.879 5.121 1.5 2V14l3.379-3.121L9 14v-3.354"
        fillRule="evenodd"
        clipRule="evenodd"
        transform="scale(-1,1) translate(-11,0)"
      />
    </svg>
  ),
  files: (
    <svg viewBox="0 0 16 16" fill="currentColor" height="22" width="22" aria-hidden="true">
      <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a2 2 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4zm4.69-1.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139q.323-.119.684-.12h5.396z" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 16 16" fill="currentColor" height="22" width="22" aria-hidden="true">
      <path d="M16 8A8 8 0 1 0 0 8a8 8 0 0 0 16 0m-7.5 3.5a.5.5 0 0 1-1 0V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707z" />
    </svg>
  ),
  stop: (
    <svg viewBox="0 0 16 16" fill="currentColor" height="18" width="18" aria-hidden="true">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.8" />
    </svg>
  ),
};

export type AIInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAbort?: () => void;
  placeholder?: string;
  suggestions?: string[];
  onPickSuggestion?: (suggestion: string) => void;
  listening?: boolean;
  onToggleMic?: () => void;
  voiceEnabled?: boolean;
  onToggleVoice?: () => void;
  onFile?: (file: File | undefined) => void;
  loading?: boolean;
  disabled?: boolean;
  hint?: string;
  /** What the attach picker accepts. Documents only — images are rejected. */
  fileAccept?: string;
};

/** Mirrors the extensions supported by `lib/extract.ts`. */
export const DEFAULT_FILE_ACCEPT =
  ".pdf,.txt,.md,.markdown,.mdx,.csv,.tsv,.json,.jsonl,.js,.mjs,.cjs,.ts,.tsx,.jsx,.py,.rb,.go,.rs,.java,.kt,.c,.h,.cpp,.cs,.php,.sh,.bash,.sql,.html,.htm,.css,.scss,.xml,.yml,.yaml,.toml,.ini,.cfg,.tex,.log";

export function AIInput({
  value,
  onChange,
  onSubmit,
  onAbort,
  placeholder = "Pergunta qualquer coisa...",
  suggestions = [],
  onPickSuggestion,
  listening = false,
  onToggleMic,
  voiceEnabled = false,
  onToggleVoice,
  onFile,
  loading = false,
  disabled = false,
  hint,
  fileAccept = DEFAULT_FILE_ACCEPT,
}: AIInputProps) {
  const [appendixOpen, setAppendixOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLButtonElement>(null);
  const appendixRef = useRef<HTMLDivElement>(null);

  /* ao abrir anexos o foco entra na barra; Escape devolve-o ao botão */
  useEffect(() => {
    if (!appendixOpen) return;
    appendixRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }, [appendixOpen]);

  function closeAppendix() {
    setAppendixOpen(false);
    attachRef.current?.focus();
  }

  /* auto-grow do textarea (substitui a animação de typing do original) */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  function pick(file?: File) {
    setAppendixOpen(false);
    onFile?.(file);
    if (filesRef.current) filesRef.current.value = "";
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      onChange(value ? `${value}\n${text}` : text);
      taRef.current?.focus();
    } catch {
      // Browsers can deny clipboard access without a user-visible error.
    }
  }

  return (
    <div className="ai-input">
      <input
        ref={filesRef}
        type="file"
        accept={fileAccept}
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {suggestions.length > 0 && (
        <div className="chat-suggestions">
          <ul aria-label="Sugestões rápidas">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => {
                    const prompt = s.endsWith(" ") || s.endsWith(":") ? s : `${s} `;
                    onPickSuggestion?.(prompt);
                    onChange(prompt);
                    taRef.current?.focus();
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="chat-container">
        {appendixOpen && (
          <div
            ref={appendixRef}
            id="anexos"
            className="appendix-bar"
            data-open="true"
            role="group"
            aria-label="Anexar conteúdo"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                closeAppendix();
              }
            }}
          >
            <button
              type="button"
              data-label="Fechar"
              aria-label="Fechar anexos"
              onClick={() => closeAppendix()}
            >
              <X height={22} width={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              data-label="Documento"
              aria-label="Anexar documento (PDF, texto ou código)"
              onClick={() => filesRef.current?.click()}
            >
              {icons.files}
            </button>
          </div>
        )}

        {/* inert: a barra de anexos cobre o campo; nada atrás dela recebe foco */}
        <div className="chat-wrapper" inert={appendixOpen || undefined}>
          <textarea
            ref={taRef}
            id="chat-input"
            className="chat-field"
            aria-label="Mensagem para o tutor"
            aria-describedby={hint ? "chat-input-hint" : undefined}
            enterKeyHint="send"
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            rows={2}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <div className="button-bar">
            <div className="left-buttons">
              <button
                type="button"
                className="icon-drop"
                aria-label="Colar texto da área de transferência"
                onClick={pasteFromClipboard}
              >
                <ClipboardPaste className="size-[18px]" />
              </button>
              <button
                ref={attachRef}
                type="button"
                className="icon-drop"
                data-on={appendixOpen || undefined}
                aria-label="Anexar documento (PDF, texto ou código)"
                aria-expanded={appendixOpen}
                aria-controls={appendixOpen ? "anexos" : undefined}
                onClick={() => setAppendixOpen((open) => !open)}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  height="20"
                  width="20"
                  aria-hidden="true"
                >
                  <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 1 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 1 1-7 0z" />
                </svg>
              </button>
              {onToggleMic && (
                <button
                  type="button"
                  className="icon-drop"
                  data-on={listening || undefined}
                  aria-label={listening ? "Parar ditado" : "Ditar pergunta"}
                  aria-pressed={listening}
                  onClick={onToggleMic}
                >
                  {listening ? icons.micOff : icons.micOn}
                </button>
              )}
              {onToggleVoice && (
                <button
                  type="button"
                  className="icon-drop"
                  data-on={voiceEnabled || undefined}
                  aria-label={
                    voiceEnabled ? "Desligar leitura por voz" : "Ler respostas em voz alta"
                  }
                  aria-pressed={voiceEnabled}
                  onClick={onToggleVoice}
                >
                  {voiceEnabled ? icons.volumeOn : icons.volumeOff}
                </button>
              )}
            </div>
            <div className="right-buttons">
              {/* um único botão: o foco não se perde ao alternar enviar/parar */}
              <button
                type="button"
                className={loading ? "send-orb stop" : "send-orb"}
                aria-label={loading ? "Parar resposta" : "Enviar"}
                disabled={loading ? false : disabled}
                onClick={loading ? onAbort : onSubmit}
              >
                {loading ? icons.stop : icons.send}
              </button>
            </div>
          </div>
        </div>
      </div>

      {hint && (
        <p id="chat-input-hint" className="ai-input-hint">
          <FileText className="size-3 shrink-0" aria-hidden="true" />
          <span>{hint}</span>
        </p>
      )}
    </div>
  );
}
