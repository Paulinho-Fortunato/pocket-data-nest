import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Download,
  ArrowDown,
  FileJson,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  X,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { AIInput } from "@/components/AIInput";
import { MessageContent } from "@/components/MessageContent";
import { PageHeader, pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { askAIStream, friendlyAIError } from "@/lib/ai";
import {
  contextBlock,
  isAllowedFile,
  MAX_FILE_CHARS,
  readAttachmentText,
  parseYouTubeUrl,
  youtubeThumb,
} from "@/lib/extract";
import {
  usePersistentDB,
  readStore,
  writeStore,
  useStats,
  type ChatMsg,
  type Card,
  uid,
} from "@/lib/store";
import { getYouTubeTranscript } from "@/lib/transcript";

export const Route = createFileRoute("/tutor")({
  head: () =>
    pageHead(
      "Agente IA",
      "Um agente que compreende contexto e transforma pedidos em respostas úteis.",
    ),
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
  "Dá-me um exemplo prático de ",
  "Compara estes dois conceitos: ",
  "Testa-me com perguntas sobre ",
  "Resume este conteúdo: ",
  "Cria um plano de estudo para ",
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
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [showScrollLatest, setShowScrollLatest] = useState(false);
  const { award, setStats, stats } = useStats();
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 180) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);
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
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachment({
          name: file.name,
          text: `[Imagem anexada: ${file.name}] (descreve ao tutor o que queres saber sobre esta imagem.)`,
          kind: "file",
        });
        toast.success("Imagem anexada ao próximo pedido.");
      };
      reader.onerror = () => toast.error("Não foi possível ler essa imagem.");
      reader.readAsDataURL(file);
      return;
    }
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

  function conversationMarkdown() {
    return msgs
      .map((m) => `**${m.role === "user" ? "Tu" : "Agente"}:**\n\n${m.content}\n\n---\n\n`)
      .join("");
  }

  function downloadConversation(format: "md" | "json") {
    const stamp = new Date().toISOString().slice(0, 10);
    const isJson = format === "json";
    const payload = isJson
      ? JSON.stringify(
          {
            app: "AngoStudy",
            type: "agent-conversation",
            exportedAt: new Date().toISOString(),
            messages: msgs,
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
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `angostudy-conversa-${stamp}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`Histórico exportado como ${isJson ? "JSON" : "Markdown"}.`);
  }

  async function copyConversation() {
    try {
      await navigator.clipboard.writeText(conversationMarkdown());
      toast.success("Histórico copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar o histórico neste navegador.");
    }
  }

  async function createFlashcardsFromLast() {
    const lastMsg = msgs.filter((m) => m.role === "assistant").pop();
    if (!lastMsg) {
      toast.error("Não há uma explicação recente para criar flashcards.");
      return;
    }

    setLoading(true);
    try {
      const key = readStore<string>("openrouter_key", "").trim();
      const model = readStore<string>("openrouter_model", "openrouter/auto");
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

      const allCards = readStore<Card[]>("cards", []);
      writeStore("cards", [...allCards, ...cards]);

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
      const rawMessage = e instanceof Error ? e.message : "";
      const isKey = rawMessage === "NO_KEY";
      setNoKey(isKey);
      if (isKey) {
        appendAssistantDelta(
          "\n\nPara eu responder, adiciona a tua chave OpenRouter nas Definições.",
        );
      } else {
        const reason = friendlyAIError(rawMessage || "Erro desconhecido");
        appendAssistantDelta(`\n\n⚠️ ${reason}`);
        toast.error(reason);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Agente IA"
        subtitle="Pensa contigo, organiza contexto e transforma pedidos em respostas úteis."
      >
        <Button variant="outline" size="sm" onClick={() => setMsgs([welcome])}>
          <Trash2 /> Limpar
        </Button>
      </PageHeader>
      <div className="panel tutor-panel flex h-[calc(100dvh-13rem)] min-h-[520px] max-h-[780px] min-w-0 flex-col overflow-hidden sm:h-[65vh]">
        <div
          ref={messagesRef}
          onScroll={() => {
            const container = messagesRef.current;
            if (!container) return;
            setShowScrollLatest(
              container.scrollHeight - container.scrollTop - container.clientHeight > 180,
            );
          }}
          className="tutor-messages min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-5"
        >
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
                className={`tutor-message-bubble min-w-0 max-w-[calc(100%-2.75rem)] rounded-2xl px-3 py-2.5 text-sm leading-relaxed sm:max-w-[82%] sm:px-4 sm:py-3 ${
                  m.role === "user" ? "tutor-message-user" : "tutor-message-assistant"
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
        <button
          type="button"
          className={`scroll-latest ${showScrollLatest ? "is-visible" : ""}`}
          aria-label="Descer para a mensagem mais recente"
          onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth" })}
        >
          <ArrowDown className="size-4" />
          <span>Ir para o fim</span>
        </button>
        <div className="tutor-composer shrink-0 border-t border-border/60 p-2.5 sm:p-3">
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
          <AIInput
            value={input}
            onChange={setInput}
            onSubmit={send}
            onAbort={stopStreaming}
            placeholder="Escreve a tua dúvida ou cola um link do YouTube..."
            suggestions={presets}
            listening={listening}
            onToggleMic={toggleListening}
            voiceEnabled={voiceEnabled}
            onToggleVoice={() => setVoiceEnabled((value) => !value)}
            searchEnabled={searchEnabled}
            onToggleSearch={() => setSearchEnabled((value) => !value)}
            onFile={(file) => readFile(file ?? undefined)}
            loading={loading}
            disabled={(!input.trim() && !attachment) || loading}
            hint="Enter envia · Shift + Enter nova linha · PDF, textos e vídeos do YouTube (colar link) até 18 000 caracteres"
          />
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
            <Button variant="outline" size="sm" onClick={copyConversation} className="text-xs">
              <Copy className="mr-1 size-3.5" /> Copiar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadConversation("md")}
              className="text-xs"
            >
              <Download className="mr-1 size-3.5" /> Markdown
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadConversation("json")}
              className="text-xs"
            >
              <FileJson className="mr-1 size-3.5" /> JSON
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
