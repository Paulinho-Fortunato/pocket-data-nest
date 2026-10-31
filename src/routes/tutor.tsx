import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { PageHeader, pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askAI } from "@/lib/ai";
import { usePersistent, useStats, type ChatMsg } from "@/lib/store";

export const Route = createFileRoute("/tutor")({
  head: () => pageHead("Tutor IA", "Um tutor que explica, questiona e ajuda-te a pensar."),
  component: Tutor,
});

const welcome: ChatMsg = { role: "assistant", content: "Olá! Sou o teu tutor AngoStudy. Que disciplina ou conceito queres dominar hoje?" };
const presets = [
  "Explica-me de forma simples: ",
  "Cria 5 perguntas de revisão sobre ",
  "Usa o método Feynman para explicar ",
];

function Tutor() {
  const [msgs, setMsgs] = usePersistent<ChatMsg[]>("chat", [welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const { award } = useStats();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs(next);
    setInput("");
    setLoading(true);
    setNoKey(false);
    try {
      const reply = await askAI(next.slice(-12));
      setMsgs([...next, { role: "assistant", content: reply }]);
      award(5);
    } catch (e) {
      const isKey = e instanceof Error && e.message === "NO_KEY";
      setNoKey(isKey);
      setMsgs([...next, { role: "assistant", content: isKey ? "Para eu responder, adiciona a tua chave OpenRouter nas Definições." : "Não consegui ligar ao tutor agora. Verifica a ligação e a chave." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Tutor IA" subtitle="A conversa fica guardada neste dispositivo.">
        <Button variant="outline" size="sm" onClick={() => setMsgs([welcome])}>
          <Trash2 /> Limpar
        </Button>
      </PageHeader>
      <div className="panel flex h-[65vh] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {msgs.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${m.role === "user" ? "bg-accent text-accent-foreground" : "bg-brand text-primary-foreground"}`}>
                {m.role === "user" ? "EU" : "IA"}
              </span>
              <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-accent/20" : "bg-secondary"}`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && <p className="pl-11 text-sm text-muted-foreground animate-pulse">A organizar uma explicação clara...</p>}
          {noKey && (
            <div className="pl-11">
              <Button asChild size="sm"><Link to="/definicoes">Abrir definições</Link></Button>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="border-t border-border p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p} onClick={() => setInput(p)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
                {p.replace(/[: ]+$/, "").replace(/ sobre$| para explicar$/, "")}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
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
              className="resize-none"
            />
            <Button onClick={send} disabled={loading} size="icon" className="h-auto w-12" aria-label="Enviar">
              <Send />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
