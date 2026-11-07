import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatComposer } from "@/components/tutor/ChatComposer";
import { ChatHeader } from "@/components/tutor/ChatHeader";
import { DocumentContextPanel } from "@/components/tutor/DocumentContextPanel";
import { AttachmentPreview } from "@/components/tutor/AttachmentPreview";
import { GenerationStatus, type GenerationState } from "@/components/tutor/GenerationStatus";
import { MessageList } from "@/components/tutor/MessageList";
import { TutorShell } from "@/components/tutor/TutorShell";
import { documentSubtitle, type TutorError, type TutorMessage } from "@/components/tutor/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { pageHead } from "@/lib/page-head";
import { askAIStream, friendlyAIError, SYSTEM_PROMPT } from "@/lib/ai";
import { useChatSession } from "@/lib/chat-store";
import {
  DocumentIngestError,
  ingestDocumentFile,
  type IngestProgress,
} from "@/lib/document-pipeline";
import {
  createDocumentRecord,
  UNTRUSTED_DOCUMENT_INSTRUCTION,
  type DocumentRecord,
} from "@/lib/documents";
import { deleteDocument, loadDocument, saveDocument } from "@/lib/idb";
import { isImageFile, parseYouTubeUrl, unsupportedAttachmentMessage } from "@/lib/extract";
import { usePreferences } from "@/lib/preferences";
import { useOnlineStatus } from "@/lib/pwa";
import { getApiKey } from "@/lib/credentials";
import { markdownToSpeechText } from "@/lib/markdown";
import { recordDuration, startTimer } from "@/lib/metrics";
import { getYouTubeTranscript } from "@/lib/transcript";
import { readStore, removeStore, useStats, writeStore, uid } from "@/lib/store";
import {
  answerLanguageInstruction,
  buildTutorDocumentContext,
  NO_EVIDENCE_INSTRUCTION,
  type TutorContextInfo,
} from "@/lib/tutor-context";

export const Route = createFileRoute("/tutor")({
  head: () =>
    pageHead("Tutor IA", "Conversa em ecrã inteiro com documentos, fontes e respostas honestas."),
  component: Tutor,
});

const ACTIVE_DOCUMENT_KEY = "active_document_id";
const PENDING_CARDS_KEY = "angostudy:pending-cards-source";

type IngestState = {
  file: File;
  progress: IngestProgress | null;
  record: DocumentRecord | null;
  error: string | null;
  errorCode: string | null;
  cancelled: boolean;
};

type SpeechResult = Event & {
  results: { length: number; [index: number]: { [index: number]: { transcript: string } } };
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResult) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function Tutor() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { preferences, update } = usePreferences();
  const { messages, setMessages, clear, flush } = useChatSession();
  const { award } = useStats();
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [generation, setGeneration] = useState<{ state: GenerationState; label: string }>({
    state: "idle",
    label: "",
  });
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, TutorError>>({});
  const [stopped, setStopped] = useState<Record<string, true>>({});
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [contextInfo, setContextInfo] = useState<TutorContextInfo | null>(null);
  const [docPanelOpen, setDocPanelOpen] = useState(false);
  const [ingest, setIngest] = useState<IngestState | null>(null);
  const [listening, setListening] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const ingestAbortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lastRequestRef = useRef<{ text: string; documentId: string | null } | null>(null);
  const requestTimer = useRef<(() => number) | null>(null);
  const generationTimer = useRef<(() => number) | null>(null);

  const busy = streamingId !== null || generation.state === "preparing";
  const noKey = Object.values(errors).some((error) => error.code === "no-key");

  /* Restore the last document (IndexedDB; localStorage only stores its id). */
  useEffect(() => {
    const id = readStore<string>(ACTIVE_DOCUMENT_KEY, "");
    if (!id) return;
    let cancelled = false;
    void loadDocument(id)
      .then((record) => {
        if (!cancelled && record) setDocument(record);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /* Elapsed time for the current answer (updated twice a second). */
  useEffect(() => {
    if (generation.state !== "streaming" && generation.state !== "preparing") return;
    const started = performance.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.round(performance.now() - started)), 500);
    return () => clearInterval(id);
  }, [generation.state]);

  /* Keep the composer above the virtual keyboard: the reading area shrinks,
     the tab bar steps aside and the composer never hides behind the keyboard. */
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = window.document.documentElement;
    if (!viewport) return;
    let base = Math.max(viewport.height, window.innerHeight);
    const isEditing = () => {
      const active = window.document.activeElement;
      return active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement;
    };
    const apply = () => {
      const shrink = Math.max(0, base - viewport.height);
      const open = isEditing() && shrink > 120;
      root.style.setProperty("--tutor-viewport-height", `${Math.round(viewport.height)}px`);
      window.document
        .querySelector<HTMLElement>(".app-frame")
        ?.setAttribute("data-keyboard", open ? "open" : "closed");
      if (!open) base = Math.max(base, viewport.height);
    };
    const onFocusOut = () => window.setTimeout(apply, 60);
    const onOrientation = () => {
      base = viewport.height;
      apply();
    };
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    window.addEventListener("focusin", apply);
    window.addEventListener("focusout", onFocusOut);
    window.addEventListener("orientationchange", onOrientation);
    apply();
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      window.removeEventListener("focusin", apply);
      window.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("orientationchange", onOrientation);
      root.style.removeProperty("--tutor-viewport-height");
      window.document.querySelector<HTMLElement>(".app-frame")?.removeAttribute("data-keyboard");
    };
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      ingestAbortRef.current?.abort();
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  const speak = useCallback(
    (content: string) => {
      if (!preferences.voiceEnabled || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(markdownToSpeechText(content));
      utterance.lang = preferences.uiLanguage === "en" ? "en-GB" : "pt-PT";
      utterance.rate = Math.min(2, Math.max(0.5, preferences.speechRate));
      window.speechSynthesis.speak(utterance);
    },
    [preferences.speechRate, preferences.uiLanguage, preferences.voiceEnabled],
  );

  const adoptDocument = useCallback((record: DocumentRecord) => {
    setDocument(record);
    writeStore(ACTIVE_DOCUMENT_KEY, record.id);
  }, []);

  const handleFile = useCallback(
    async (file?: File) => {
      if (!file) return;
      if (isImageFile(file)) {
        toast.error(unsupportedAttachmentMessage(file), { duration: 8000 });
        return;
      }
      ingestAbortRef.current?.abort();
      const controller = new AbortController();
      ingestAbortRef.current = controller;
      // The card appears before any I/O starts.
      setIngest({
        file,
        progress: {
          stage: "selected",
          label: "Ficheiro selecionado",
          pagesDone: 0,
          totalPages: 0,
          chars: 0,
          percent: 0,
        },
        record: null,
        error: null,
        errorCode: null,
        cancelled: false,
      });
      const stopShown = startTimer("upload:file-shown");
      stopShown();

      try {
        const outcome = await ingestDocumentFile(file, {
          signal: controller.signal,
          onProgress: (progress) =>
            setIngest((current) => (current ? { ...current, progress } : current)),
        });

        if (outcome.cancelled) {
          setIngest((current) =>
            current
              ? {
                  ...current,
                  record: outcome.record,
                  cancelled: true,
                  progress: {
                    ...(current.progress ?? {
                      stage: "cancelled",
                      label: "Leitura cancelada",
                      pagesDone: 0,
                      totalPages: 0,
                      chars: 0,
                      percent: 0,
                    }),
                    stage: "cancelled",
                    label: "Leitura cancelada",
                  },
                }
              : current,
          );
          if (outcome.record) {
            adoptDocument(outcome.record);
            toast.warning(
              `Leitura cancelada. Ficaram disponíveis ${outcome.record.processedPages} de ${outcome.record.totalPages} páginas — o resto não foi lido.`,
              { duration: 8000 },
            );
          } else {
            toast.info("Leitura cancelada. Nada foi guardado.");
          }
          return;
        }

        if (!outcome.record) return;
        setIngest((current) =>
          current
            ? {
                ...current,
                record: outcome.record,
                progress: {
                  ...(current.progress ?? {
                    stage: "ready",
                    label: "Pronto",
                    pagesDone: 0,
                    totalPages: 0,
                    chars: 0,
                    percent: 100,
                  }),
                  stage: "ready",
                  label: outcome.cached ? "Já lido antes · reutilizado" : "Pronto a usar",
                  percent: 100,
                  pagesDone: outcome.record!.totalPages,
                  totalPages: outcome.record!.totalPages,
                  chars: outcome.record!.totalChars,
                  cached: outcome.cached,
                },
              }
            : current,
        );
        adoptDocument(outcome.record);
        toast.success(
          outcome.cached
            ? `Documento reutilizado (já tinha sido lido): ${outcome.record.processedPages} páginas, ${outcome.record.totalChars.toLocaleString("pt-PT")} caracteres.`
            : `Documento pronto: ${outcome.record.processedPages} páginas, ${outcome.record.totalChars.toLocaleString("pt-PT")} caracteres, ${outcome.record.chunkCount} trechos indexados.`,
          { duration: 6000 },
        );
        for (const warning of outcome.warnings.slice(0, 2)) {
          toast.warning(warning, { duration: 7000 });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const ingestError = error instanceof DocumentIngestError ? error : null;
        setIngest((current) =>
          current
            ? {
                ...current,
                error: ingestError?.friendly ?? "Não foi possível ler este ficheiro.",
                errorCode: ingestError?.code ?? "READ_FAILED",
                record: ingestError?.partial ?? null,
              }
            : current,
        );
        if (ingestError?.partial) {
          adoptDocument(ingestError.partial);
          toast.warning(
            `${ingestError.friendly} Foi guardado apenas o texto parcial (${ingestError.partial.processedPages}/${ingestError.partial.totalPages} páginas).`,
            { duration: 9000 },
          );
        } else {
          toast.error(ingestError?.friendly ?? "Não foi possível ler este ficheiro.", {
            duration: 8000,
          });
        }
      }
    },
    [adoptDocument],
  );

  const cancelIngest = useCallback(() => {
    ingestAbortRef.current?.abort();
  }, []);

  const retryIngest = useCallback(() => {
    if (ingest?.file) void handleFile(ingest.file);
  }, [handleFile, ingest]);

  const removeIngest = useCallback(() => {
    ingestAbortRef.current?.abort();
    setIngest(null);
    setDocument(null);
    setContextInfo(null);
    removeStore(ACTIVE_DOCUMENT_KEY);
  }, []);

  const loadYouTube = useCallback(
    async (url: string) => {
      const video = parseYouTubeUrl(url);
      if (!video) {
        toast.error("Cola uma ligação válida do YouTube.");
        return;
      }
      const toastId = toast.loading("A obter a transcrição do vídeo…");
      try {
        const data = await getYouTubeTranscript({ data: video.id });
        if (!data.text) {
          toast.error("O vídeo não tem legendas disponíveis.", { id: toastId });
          return;
        }
        const record = createDocumentRecord({
          id: uid(),
          name: `Transcrição do YouTube (${video.id})`,
          mime: "text/plain",
          size: data.text.length,
          text: data.text,
          pages: [{ page: 1, text: data.text, charStart: 0, charEnd: data.text.length }],
        });
        await saveDocument(record);
        adoptDocument(record);
        setIngest(null);
        toast.success(
          `Transcrição pronta: ${record.totalChars.toLocaleString("pt-PT")} caracteres.`,
          {
            id: toastId,
          },
        );
      } catch {
        toast.error("Não foi possível obter a transcrição deste vídeo.", { id: toastId });
      }
    },
    [adoptDocument],
  );

  const requestClear = useCallback(() => {
    if (messages.length === 0) return;
    if (preferences.confirmDelete) {
      setConfirmClear(true);
      return;
    }
    void (async () => {
      abortRef.current?.abort();
      await flush();
      await clear();
    })();
  }, [clear, flush, messages.length, preferences.confirmDelete]);

  const runAssistant = useCallback(
    async (request: { text: string; documentId: string | null }, base: TutorMessage[]) => {
      if (!online) {
        toast.error("Sem ligação à internet. O tutor precisa de rede para responder.");
        return;
      }
      if (!getApiKey()) {
        toast.error("Falta a tua chave OpenRouter. Abre Definições para a adicionar.", {
          action: { label: "Definições", onClick: () => void navigate({ to: "/definicoes" }) },
        });
      }

      const assistantId = uid();
      const assistantMessage: TutorMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };
      setMessages([...base, assistantMessage]);
      setStreamingId(assistantId);
      setGeneration({ state: "preparing", label: "A preparar o contexto…" });
      setErrors((current) => {
        const next = { ...current };
        delete next[assistantId];
        return next;
      });
      setStopped((current) => {
        if (!(assistantId in current)) return current;
        const next = { ...current };
        delete next[assistantId];
        return next;
      });

      const controller = new AbortController();
      abortRef.current = controller;
      let answer = "";
      let firstToken = true;
      requestTimer.current = startTimer("ai:request-start");
      generationTimer.current = startTimer("ai:generation-end");

      try {
        let context = "";
        let info: TutorContextInfo | null = null;
        if (request.documentId && document?.id === request.documentId) {
          const built = await buildTutorDocumentContext(
            document,
            request.text,
            controller.signal,
            (message) =>
              setGeneration({ state: "preparing", label: message ?? "A preparar a resposta…" }),
          );
          context = built.block;
          info = built.info;
          setContextInfo(info);
        }

        const system = [
          SYSTEM_PROMPT,
          answerLanguageInstruction(preferences.aiLanguage),
          UNTRUSTED_DOCUMENT_INSTRUCTION,
          context ? NO_EVIDENCE_INSTRUCTION : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const history = base
          .filter((message) => (message.content ?? "").trim().length > 0)
          .slice(-10)
          .map(({ role, content }) => ({ role, content }));

        setGeneration({ state: "streaming", label: "A responder…" });

        const reply = await askAIStream(
          [...history, { role: "user", content: `${request.text}${context}` }],
          (delta) => {
            if (firstToken) {
              firstToken = false;
              if (requestTimer.current) recordDuration("ai:first-token", requestTimer.current());
              setGeneration({ state: "streaming", label: "A responder…" });
            }
            answer += delta;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
          },
          { signal: controller.signal, system },
        );

        if (generationTimer.current) recordDuration("ai:generation-end", generationTimer.current());
        generationTimer.current = null;

        const sources =
          info && context
            ? [
                {
                  name: info.documentName,
                  documentId: info.documentId,
                  pageStart: info.pageRanges[0]?.from,
                  pageEnd: info.pageRanges[info.pageRanges.length - 1]?.to,
                },
              ]
            : undefined;

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: message.content || reply,
                  ...(sources ? { sources } : {}),
                }
              : message,
          ),
        );
        setGeneration({ state: "idle", label: "" });
        setStreamingId(null);
        void flush();

        if (reply.trim()) {
          award(5);
          toast.success("+5 XP ganhos! 🚀", { duration: 2000 });
          speak(reply);
        }
      } catch (error) {
        const aborted = controller.signal.aborted;
        if (aborted) {
          setStopped((current) => ({ ...current, [assistantId]: true }));
          setGeneration({
            state: "stopped",
            label: answer.trim()
              ? "Resposta interrompida — o texto parcial foi mantido."
              : "Resposta interrompida antes de receber texto.",
          });
          setStreamingId(null);
          void flush();
          return;
        }

        const raw = error instanceof Error ? error.message : "";
        const isKey = raw === "NO_KEY";
        const reason = isKey
          ? "Falta a tua chave OpenRouter. Abre Definições e adiciona-a."
          : friendlyAIError(raw || "Erro desconhecido");
        const tutorError: TutorError = {
          message: reason,
          retryable: true,
          code: isKey ? "no-key" : "unknown",
        };
        setErrors((current) => ({ ...current, [assistantId]: tutorError }));
        setGeneration({ state: "error", label: reason });
        setStreamingId(null);
        void flush();
        toast.error(reason, {
          description: answer.trim()
            ? "O texto parcial foi mantido; podes tentar novamente sem perder a conversa."
            : undefined,
        });
      } finally {
        requestTimer.current = null;
        generationTimer.current = null;
        abortRef.current = null;
      }
    },
    [award, document, flush, navigate, online, preferences.aiLanguage, setMessages, speak],
  );

  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim();
      if (busy) return;
      if (!text && !document) return;
      if (!online) {
        toast.error("Sem internet não consigo falar com o tutor. O resto da app continua offline.");
        return;
      }
      const youtube = parseYouTubeUrl(text);
      if (youtube && /^https?:\/\/\S+$/.test(text.trim())) {
        await loadYouTube(text);
        return;
      }
      const userMessage: TutorMessage = {
        id: uid(),
        role: "user",
        content: text || "Analisa o documento em uso.",
        createdAt: Date.now(),
      };
      const base = [...messages, userMessage] as TutorMessage[];
      setMessages(base);
      setInput("");
      lastRequestRef.current = { text, documentId: document?.id ?? null };
      await runAssistant(lastRequestRef.current, base);
    },
    [busy, document, input, loadYouTube, messages, online, runAssistant, setMessages],
  );

  const regenerate = useCallback(
    async (messageId: string) => {
      if (busy) return;
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      let userIndex = index - 1;
      while (userIndex >= 0 && messages[userIndex]?.role !== "user") userIndex--;
      const userMessage = messages[userIndex];
      if (!userMessage) return;
      const base = messages.slice(0, userIndex + 1) as TutorMessage[];
      setErrors((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
      setStopped((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
      lastRequestRef.current = {
        text: userMessage.content,
        documentId: document?.id ?? null,
      };
      await runAssistant(lastRequestRef.current, base);
    },
    [busy, document, messages, runAssistant],
  );

  const conversationMarkdown = useCallback(() => {
    return messages
      .map(
        (message) =>
          `**${message.role === "user" ? "Tu" : "Tutor"}:**\n\n${message.content}\n\n---\n\n`,
      )
      .join("");
  }, [messages]);

  const exportConversation = useCallback(
    (format: "md" | "json") => {
      if (messages.length === 0) {
        toast.error("Ainda não há conversa para exportar.");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const isJson = format === "json";
      const payload = isJson
        ? JSON.stringify(
            {
              app: "AngoStudy",
              type: "tutor-conversation",
              exportedAt: new Date().toISOString(),
              document: document ? { id: document.id, name: document.name } : null,
              messages,
            },
            null,
            2,
          )
        : conversationMarkdown();
      const url = URL.createObjectURL(
        new Blob([payload], {
          type: isJson ? "application/json" : "text/markdown; charset=utf-8",
        }),
      );
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `angostudy-conversa-${stamp}.${format}`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Conversa exportada como ${isJson ? "JSON" : "Markdown"}.`);
    },
    [conversationMarkdown, document, messages],
  );

  const copyConversation = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(conversationMarkdown());
      toast.success("Conversa copiada.");
    } catch {
      toast.error("Não foi possível copiar a conversa neste navegador.");
    }
  }, [conversationMarkdown]);

  const createCards = useCallback(() => {
    const lastAnswer = [...messages].reverse().find((message) => message.role === "assistant");
    if (!lastAnswer || !lastAnswer.content.trim()) {
      toast.error("Ainda não há uma resposta para transformar em cartões.");
      return;
    }
    try {
      sessionStorage.setItem(
        PENDING_CARDS_KEY,
        JSON.stringify({
          name: document?.name ?? "Resposta do tutor",
          text: lastAnswer.content,
        }),
      );
    } catch {
      // Session storage may be unavailable; the route still opens.
    }
    void navigate({ to: "/criar-cartoes" });
  }, [document?.name, messages, navigate]);

  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      toast.error("O reconhecimento de voz não está disponível neste navegador.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = preferences.uiLanguage === "en" ? "en-US" : "pt-PT";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, index) => event.results[index]?.[0]?.transcript ?? "",
      ).join("");
      setInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      toast.error("Não foi possível captar a voz. Tenta novamente.");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, preferences.uiLanguage]);

  const tutorMessages = useMemo<TutorMessage[]>(
    () =>
      messages.map<TutorMessage>((message) => ({
        ...message,
        ...(message.id && errors[message.id] ? { error: errors[message.id] } : {}),
        ...(message.id && stopped[message.id] ? { stopped: true } : {}),
      })),
    [errors, messages, stopped],
  );

  const documentMeta = document ? documentSubtitle(document) : null;

  return (
    <>
      <TutorShell
        header={
          <ChatHeader
            subtitle="Conversa guardada neste dispositivo"
            documentName={document?.name ?? null}
            documentMeta={documentMeta}
            onOpenDocument={() => setDocPanelOpen(true)}
            onNewChat={requestClear}
            onClear={requestClear}
            onExport={exportConversation}
            onCopyConversation={() => void copyConversation()}
            onCreateCards={createCards}
            clearingDisabled={messages.length === 0}
            online={online}
          />
        }
        list={
          <MessageList
            messages={tutorMessages}
            streamingId={streamingId}
            busy={busy}
            speechRate={preferences.speechRate}
            speechLang={preferences.uiLanguage === "en" ? "en-GB" : "pt-PT"}
            showSuggestions={preferences.showSuggestions}
            onRegenerate={(id) => void regenerate(id)}
            onRetry={(id) => void regenerate(id)}
            onSuggestion={(text) => {
              setInput(text);
              window.document.getElementById("chat-input")?.focus();
            }}
          />
        }
        composer={
          <ChatComposer
            value={input}
            onChange={setInput}
            onSubmit={() => void send()}
            onStop={() => abortRef.current?.abort()}
            onFile={(file) => void handleFile(file)}
            loading={busy}
            disabled={busy}
            offline={!online}
            suggestionList={[]}
            onPickSuggestion={setInput}
            listening={listening}
            onToggleMic={toggleListening}
            voiceEnabled={preferences.voiceEnabled}
            onToggleVoice={() => update({ voiceEnabled: !preferences.voiceEnabled })}
            documentName={document?.name ?? null}
            documentMeta={documentMeta}
            onOpenDocument={() => setDocPanelOpen(true)}
            onOpenLibrary={() => setDocPanelOpen(true)}
            attachment={
              ingest ? (
                <AttachmentPreview
                  file={ingest.file}
                  progress={ingest.progress}
                  record={ingest.record}
                  error={ingest.error}
                  cancelled={ingest.cancelled}
                  scanned={ingest.errorCode === "NO_TEXT_LAYER"}
                  onCancel={cancelIngest}
                  onRetry={retryIngest}
                  onRemove={removeIngest}
                  onOpenDocument={() => setDocPanelOpen(true)}
                  onManualPaste={() => {
                    const field = window.document.getElementById("chat-input");
                    field?.focus();
                    toast.info(
                      "Cola aqui o texto do documento. Sem OCR não consigo ler as imagens do PDF.",
                      { duration: 8000 },
                    );
                  }}
                />
              ) : null
            }
            generation={
              generation.state !== "idle" ? (
                <GenerationStatus
                  state={generation.state}
                  label={generation.label}
                  elapsedMs={generation.state === "streaming" ? elapsed : null}
                  onStop={() => abortRef.current?.abort()}
                  onRetry={() => {
                    const last = lastRequestRef.current;
                    if (last) void runAssistant(last, messages as TutorMessage[]);
                  }}
                />
              ) : null
            }
          />
        }
        overlays={
          <>
            <DocumentContextPanel
              open={docPanelOpen}
              onClose={() => setDocPanelOpen(false)}
              document={document}
              onDetach={() => {
                setDocument(null);
                setContextInfo(null);
                removeStore(ACTIVE_DOCUMENT_KEY);
                toast.info(
                  "Documento removido do contexto. Continua guardado nos teus documentos.",
                );
              }}
              onDelete={async (id) => {
                await deleteDocument(id);
                if (document?.id === id) {
                  setDocument(null);
                  removeStore(ACTIVE_DOCUMENT_KEY);
                }
                setIngest((current) => (current?.record?.id === id ? null : current));
                toast.success("Documento apagado do dispositivo.");
              }}
              onReuse={(record) => {
                adoptDocument(record);
                setContextInfo(null);
                toast.success(`Documento reutilizado: ${record.name}.`);
              }}
              usage={
                contextInfo && document && contextInfo.documentId === document.id
                  ? {
                      mode: contextInfo.mode,
                      usedChunks: contextInfo.usedChunks,
                      totalChunks: contextInfo.totalChunks,
                      pageRanges: contextInfo.pageRanges,
                    }
                  : null
              }
            />
            <ConfirmDialog
              open={confirmClear}
              title="Limpar esta conversa?"
              description="As mensagens são apagadas deste dispositivo. Os documentos guardados não são afetados."
              confirmLabel="Limpar conversa"
              destructive
              onCancel={() => setConfirmClear(false)}
              onConfirm={() => {
                setConfirmClear(false);
                void (async () => {
                  abortRef.current?.abort();
                  await flush();
                  await clear();
                  toast.success("Conversa limpa.");
                })();
              }}
            />
          </>
        }
      />

      {noKey ? (
        <span className="sr-only" role="status">
          Falta a chave OpenRouter nas definições.
        </span>
      ) : null}
    </>
  );
}
