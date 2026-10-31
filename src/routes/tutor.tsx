import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MessageContent } from "@/components/MessageContent";
import { PageHeader, pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askAI } from "@/lib/ai";
import { usePersistent, useStats, type ChatMsg } from "@/lib/store";

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
const MAX_FILE_CHARS = 18_000;

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

function Tutor() {
  const [storedMsgs, setMsgs] = usePersistent<ChatMsg[]>("chat", [welcome]);
  const msgs = validMessages(storedMsgs);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const { award } = useStats();
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, loading]);
  useEffect(
    () => () => {
      recognitionRef.current?.stop();
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
    const allowed =
      file.type.startsWith("text/") ||
      /\.(txt|md|markdown|csv|json|js|ts|tsx|jsx|py|html|css)$/i.test(file.name);
    if (!allowed) {
      toast.error("Escolhe um ficheiro de texto, Markdown, código, CSV ou JSON.");
      return;
    }
    try {
      const text = await file.text();
      setAttachment({ name: file.name, text: text.slice(0, MAX_FILE_CHARS) });
      toast.success(
        text.length > MAX_FILE_CHARS
          ? "Ficheiro anexado (texto limitado a 18 000 caracteres)."
          : "Ficheiro anexado ao próximo pedido.",
      );
    } catch {
      toast.error("Não foi possível ler esse ficheiro.");
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && !attachment) || loading) return;
    const fileContext = attachment
      ? `\n\n[Contexto do ficheiro ${attachment.name}]\n${attachment.text}\n[/Contexto do ficheiro]`
      : "";
    const displayMessage: ChatMsg = {
      role: "user",
      content: `${text || "Analisa o ficheiro anexado."}${attachment ? `\n\n📎 ${attachment.name}` : ""}`,
    };
    const aiMessage: ChatMsg = {
      role: "user",
      content: `${text || "Analisa o ficheiro anexado."}${fileContext}`,
    };
    const next = [...msgs, displayMessage];
    setMsgs(next);
    setInput("");
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = "";
    setLoading(true);
    setNoKey(false);
    try {
      const reply = await askAI([...msgs, aiMessage].slice(-12));
      setMsgs([...next, { role: "assistant", content: reply }]);
      award(5);
      speak(reply);
    } catch (e) {
      const isKey = e instanceof Error && e.message === "NO_KEY";
      setNoKey(isKey);
      setMsgs([
        ...next,
        {
          role: "assistant",
          content: isKey
            ? "Para eu responder, adiciona a tua chave OpenRouter nas Definições."
            : "Não consegui ligar ao tutor agora. Verifica a ligação e a chave.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Tutor IA" subtitle="Explicações com texto, fórmulas, ficheiros e voz.">
        <Button variant="outline" size="sm" onClick={() => setMsgs([welcome])}>
          <Trash2 /> Limpar
        </Button>
      </PageHeader>
      <div className="panel flex h-[calc(100dvh-13rem)] min-h-[520px] max-h-[780px] min-w-0 flex-col overflow-hidden sm:h-[65vh]">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-5">
          {msgs.map((m, i) => (
            <div
              key={`${i}-${m.role}`}
              className={`flex items-end gap-2 sm:gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold sm:size-9 sm:text-[11px] ${m.role === "user" ? "bg-accent text-accent-foreground" : "bg-brand text-primary-foreground"}`}
              >
                {m.role === "user" ? "EU" : "IA"}
              </span>
              <div
                className={`min-w-0 max-w-[calc(100%-2.75rem)] rounded-2xl px-3 py-2.5 text-sm leading-relaxed sm:max-w-[82%] sm:px-4 sm:py-3 ${m.role === "user" ? "bg-accent/20" : "bg-secondary"}`}
              >
                {m.role === "assistant" ? (
                  <MessageContent content={m.content} />
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <p className="flex items-center gap-2 pl-10 text-sm text-muted-foreground animate-pulse">
              <Loader2 className="size-4 animate-spin" /> A organizar uma explicação clara...
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
        <div className="shrink-0 border-t border-border bg-background/50 p-2.5 sm:p-3">
          {attachment && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs">
              <FileText className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Remover ficheiro"
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
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
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
              placeholder="Escreve a tua dúvida..."
              rows={2}
              className="min-h-12 flex-1 resize-none text-sm sm:min-h-14"
            />
            <div className="flex shrink-0 flex-col gap-1.5">
              <div className="flex gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json,.js,.ts,.tsx,.jsx,.py,.html,.css,text/*"
                  hidden
                  onChange={(e) => readFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Anexar ficheiro"
                >
                  <Paperclip />
                </Button>
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
            </div>
          </div>
          <p className="mt-1.5 hidden text-[11px] text-muted-foreground sm:block">
            Enter envia · Shift + Enter cria uma nova linha · ficheiros até 18 000 caracteres
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="size-3.5 text-primary" />A IA entende Markdown, fórmulas matemáticas e
        tabelas nas respostas.
      </div>
    </div>
  );
}
