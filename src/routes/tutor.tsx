import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Youtube,
  Download,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { MessageContent } from "@/components/MessageContent";
import { PageHeader, pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askAIStream } from "@/lib/ai";
import {
  contextBlock,
  isAllowedFile,
  MAX_FILE_CHARS,
  readAttachmentText,
  parseYouTubeUrl,
  youtubeThumb,
} from "@/lib/extract";
import { usePersistentDB, useStats, type ChatMsg, type Card, uid } from "@/lib/store";
import { getYouTubeTranscript } from "@/lib/transcript";

export const Route = createFileRoute("/tutor")({
  head: () => pageHead("Tutor IA", "Um tutor que explica, questiona e ajuda-te a pensar."),
  component: Tutor,
});

const welcome: ChatMsg = {
  role: "assistant",
  content: "Olá! Sou o teu tutor AngoStudy. Que disciplina ou conceito queres dominar hoje?",
};
const presets = [
  "Explica-me de forma simples: ",
  "Cria 5 perguntas de revisão sobre ",
  "Usa o método Feynman para explicar ",
];

type Attachment = {
  name: string;
  text: string;
  kind: "file" | "youtube";
  thumb?: string;
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

function validMessages(value: ChatMsg[]): ChatMsg[] {
  if (!Array.isArray(value)) return [welcome];
  const messages = value.filter(
    (message): message is ChatMsg =>
      Boolean(message) &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string",
  );
  return messages.length ? messages : [welcome];
}

function speechText(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, " bloco de código omitido ")
    .replace(/https?:\/\/\S+/g, " ligação ")
    .replace(/[*_#`>$|~]/g, "")
    .replace(/\$[^$]+\$/g, " fórmula ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownEscape(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, "\\$&");
}

function Tutor() {
  const [storedMsgs, setMsgs, readyMsgs] = usePersistentDB<ChatMsg[]>("chat", [welcome]);
  const msgs = validMessages(storedMsgs);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const { award, setStats, stats } = useStats();
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, loading]);
  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      abortRef.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  function speak(content: string) {
    if (!voiceEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText(content));
    utterance.lang = "pt-PT";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function toggleListening() {
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
    recognition.lang = "pt-PT";
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
  }

  async function readFile(file?: File) {
    if (!file) return;
    if (!isAllowedFile(file)) {
      toast.error("Escolhe um ficheiro de texto, Markdown, código, CSV, JSON ou PDF.");
      return;
    }
    try {
      const text = await readAttachmentText(file);
      setAttachment({ name: file.name, text, kind: "file" });
      toast.success(
        text.length >= MAX_FILE_CHARS
          ? "Ficheiro anexado (texto limitado a 18 000 caracteres)."
          : "Ficheiro anexado ao próximo pedido.",
      );
    } catch {
      toast.error("Não foi possível ler esse ficheiro.");
    }
  }

  async function loadYouTube(url: string) {
    const video = parseYouTubeUrl(url);
    if (!video) {
      toast.error("Cola uma ligação válida do YouTube.");
      return;
    }
    try {
      const data = await getYouTubeTranscript({ data: video.id });
      if (!data.text) {
        toast.error("O vídeo não tem legendas em português ou inglês.");
        return;
      }
      setAttachment({
        name: "Vídeo do YouTube",
        text: data.text.slice(0, MAX_FILE_CHARS),
        kind: "youtube",
        thumb: youtubeThumb(video.id),
      });
      toast.success("Transcrição do vídeo anexada ao próximo pedido.");
    } catch {
      toast.error("Não foi possível obter a transcrição deste vídeo.");
    }
  }

  function appendAssistantDelta(delta: string) {
    setMsgs((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = { role: "assistant", content: last.content + delta };
      } else {
        next.push({ role: "assistant", content: delta });
      }
      return next;
    });
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function exportConversa() {
    const content = msgs
      .map(
        (m) =>
          `**${m.role === "user" ? "Tu" : "Tutor"}:**\n\n${m.content}\n\n---\n\n`,
      )
      .join("");

    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([content], { type: "text/markdown; charset=utf-8" }),
    );
    a.download = `conversa-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    toast.success("Conversa exportada como Markdown.");
  }

  async function createFlashcardsFromLast() {
    const lastMsg = msgs.filter((m) => m.role === "assistant").pop();
    if (!lastMsg) {
      toast.error("Não há uma explicação recente para criar flashcards.");
      return;
    }

    setLoading(true);
    try {
      const key = localStorage.getItem("angostudy:openrouter_key");
      const model = localStorage.getItem("angostudy:openrouter_model") || "openrouter/free";
      if (!key) {
        setNoKey(true);
        toast.error("Falta a chave OpenRouter.");
        return;
      }

      const prompt = `Com base na explicação abaixo, cria 5 pares pergunta-resposta para um flashcard de estudo.
Retorna APENAS um JSON válido neste formato (sem markdown backticks):
{"flashcards":[{"q":"pergunta?","a":"resposta curta"}]}

Explicação:\n${lastMsg.content}`;

      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": location.origin,
          "X-Title": "AngoStudy",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
        }),
      });

      const data = (await r.json().catch(() => null)) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      } | null;

      if (!r.ok || !data?.choices?.[0]?.message?.content) {
        toast.error("Não consegui gerar os flashcards.");
        return;
      }

      const jsonText = data.choices[0].message.content.replace(/```json\n?|\n?```/g, "");
      const parsed = JSON.parse(jsonText) as { flashcards: { q: string; a: string }[] };

      const cards = parsed.flashcards.map((f) => ({
        id: uid(),
        q: f.q,
        a: f.a,
        deck: "Gerado do Tutor",
        known: false,
      })) as Card[];

      const existingCards = localStorage.getItem("angostudy:cards");
      const allCards = existingCards ? JSON.parse(existingCards) : [];
      localStorage.setItem("angostudy:cards", JSON.stringify([...allCards, ...cards]));

      toast.success(`${cards.length} flashcards criados e adicionados ao teu deck!`);
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : "Desconhecido"}`);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const text = input.trim();
    const youtubeUrl = parseYouTubeUrl(text);
    if ((!text && !attachment) || loading) return;
    if (youtubeUrl && !attachment) {
      await loadYouTube(text);
      return;
    }
    const label =
      attachment?.kind === "youtube" ? "vídeo do YouTube" : `ficheiro ${attachment?.name ?? ""}`;
    const fileContext = attachment ? contextBlock(label, attachment.text) : "";
    const displayMessage: ChatMsg = {
      role: "user",
      content: `${text || "Analisa o conteúdo anexado."}${
        attachment ? ` 📎 ${attachment.name}${attachment.kind === "youtube" ? " (vídeo)" : ""}` : ""
      }`,
    };
    const aiMessage: ChatMsg = {
      role: "user",
      content: `${text || "Analisa o conteúdo anexado."}${fileContext}`,
    };
    const next = [...msgs, displayMessage];
    setMsgs(next);
    setInput("");
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = "";
    setLoading(true);
    setNoKey(false);
    setStreaming(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reply = await askAIStream(
        [...msgs, aiMessage].slice(-12),
        (delta) => {
          setStreaming(true);
          appendAssistantDelta(delta);
        },
        { signal: controller.signal },
      );
      setStreaming(false);
      if (reply) {
        award(5);
        toast.success("+5 XP ganhos! 🚀", { duration: 2000 });
      }
      speak(reply);
    } catch (e) {
      setStreaming(false);
      if (controller.signal.aborted) {
        appendAssistantDelta("\n\n*(resposta interrompida)*");
        return;
      }
      const isKey = e instanceof Error && e.message === "NO_KEY";
      setNoKey(isKey);
      appendAssistantDelta(
        isKey
          ? "\n\nPara eu responder, adiciona a tua chave OpenRouter nas Definições."
          : "\n\nNão consegui ligar ao tutor agora. Verifica a ligação e a chave.",
      );
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Tutor IA" subtitle="Explicações com texto, fórmulas, ficheiros, PDF, vídeos e voz.">
        <Button variant="outline" size="sm" onClick={() => setMsgs([welcome])}>
          <Trash2 /> Limpar
        </Button>
      </PageHeader>
      <div className="panel flex h-[calc(100dvh-13rem)] min-h-[520px] max-h-[780px] min-w-0 flex-col overflow-hidden sm:h-[65vh]">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-5">
          {msgs.map((m, i) => (
            <div
              key={`${i}-${m.role}`}
              className={`animate-in fade-in slide-in-from-bottom-2 duration-300 flex items-end gap-2 sm:gap-3 ${
                m.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold sm:size-9 sm:text-[11px] ${
                  m.role === "user"
                    ? "bg-accent text-accent-foreground"
                    : "bg-brand text-primary-foreground"
                }`}
              >
                {m.role === "user" ? "EU" : "IA"}
              </span>
              <div
                className={`min-w-0 max-w-[calc(100%-2.75rem)] rounded-2xl px-3 py-2.5 text-sm leading-relaxed sm:max-w-[82%] sm:px-4 sm:py-3 ${
                  m.role === "user" ? "bg-accent/20" : "bg-secondary/60"
                }`}
              >
                {m.role === "assistant" ? (
                  <MessageContent content={m.content} />
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                )}
                {streaming && i === msgs.length - 1 && m.role === "assistant" && (
                  <span className="typing-cursor" aria-hidden="true" />
                )}
              </div>
            </div>
          ))}
          {loading && !streaming && (
            <p className="flex items-center gap-2 pl-10 text-sm text-muted-foreground">
              <span className="flex gap-1">
                <span className="typing-dot" style={{ animationDelay: "0ms" }} />
                <span className="typing-dot" style={{ animationDelay: "150ms" }} />
                <span className="typing-dot" style={{ animationDelay: "300ms" }} />
              </span>
              A organizar uma explicação clara...
            </p>
          )}
          {noKey && (
            <div className="pl-10">
              <Button asChild size="sm">
                <Link to="/definicoes">Abrir definições</Link>
              </Button>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="shrink-0 border-t border-border/60 p-2.5 sm:p-3">
          {attachment && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs">
              {attachment.kind === "youtube" && attachment.thumb ? (
                <img
                  src={attachment.thumb}
                  alt=""
                  className="h-8 w-14 shrink-0 rounded object-cover"
                />
              ) : (
                <FileText className="size-4 shrink-0 text-primary" />
              )}
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Remover anexo"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setInput(p)}
                className="shrink-0 rounded-full border border-border bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
              >
                {p.replace(/[: ]+$/, "").replace(/ sobre$| para explicar$/, "")}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-1.5 sm:gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Escreve a tua dúvida ou cola um link do YouTube..."
              rows={2}
              className="min-h-12 flex-1 resize-none text-sm sm:min-h-14"
            />
            <div className="flex shrink-0 flex-col gap-1.5">
              <div className="flex gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json,.js,.ts,.tsx,.jsx,.py,.html,.css,.pdf,text/*,application/pdf"
                  hidden
                  onChange={(e) => readFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  className="file-upload-button"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Anexar ficheiro ou PDF"
                >
                  <svg
                    aria-hidden="true"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeWidth="2"
                      stroke="#ffffff"
                      d="M13.5 3H12H8C6.34315 3 5 4.34315 5 6V18C5 19.6569 6.34315 21 8 21H11M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V11.8125"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <path
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeWidth="2"
                      stroke="#ffffff"
                      d="M17 15V18M17 21V18M17 18H14M17 18H20"
                    />
                  </svg>
                  <span>ADD FILE</span>
                </button>
                <Button
                  type="button"
                  variant={listening ? "default" : "outline"}
                  size="icon"
                  onClick={toggleListening}
                  aria-label={listening ? "Parar ditado" : "Ditar pergunta"}
                >
                  {listening ? <MicOff /> : <Mic />}
                </Button>
                <Button
                  type="button"
                  variant={voiceEnabled ? "default" : "outline"}
                  size="icon"
                  onClick={() => setVoiceEnabled((value) => !value)}
                  aria-label={voiceEnabled ? "Desligar voz" : "Ler respostas em voz alta"}
                >
                  {voiceEnabled ? <Volume2 /> : <VolumeX />}
                </Button>
              </div>
              {loading ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={stopStreaming}
                  size="icon"
                  className="h-11 w-full sm:h-12"
                  aria-label="Parar resposta"
                >
                  <Square />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={send}
                  disabled={loading || (!input.trim() && !attachment)}
                  size="icon"
                  className="h-11 w-full sm:h-12"
                  aria-label="Enviar"
                >
                  <Send />
                </Button>
              )}
            </div>
          </div>
          <p className="mt-1.5 hidden text-[11px] text-muted-foreground sm:block">
            Enter envia · Shift + Enter nova linha · PDF, textos e vídeos do YouTube (colar link) até 18 000 caracteres
          </p>
        </div>
      </div>

      {readyMsgs && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            A IA digita em tempo real e entende Markdown, fórmulas matemáticas e tabelas.
            <Youtube className="size-3.5 text-primary" />
          </div>
          <div className="ml-auto flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={exportConversa}
              className="text-xs"
            >
              <Download className="size-3.5 mr-1" />
              Exportar conversa
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={createFlashcardsFromLast}
              disabled={loading || msgs.filter((m) => m.role === "assistant").length === 0}
              className="text-xs"
            >
              <Plus className="size-3.5 mr-1" />
              Flashcards
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Tutor;
