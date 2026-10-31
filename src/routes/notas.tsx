import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { askAI } from "@/lib/ai";
import { uid, usePersistent, type Note } from "@/lib/store";

export const Route = createFileRoute("/notas")({
  head: () => pageHead("Notas", "Escreve livremente e transforma notas em clareza."),
  component: Notas,
});

function Notas() {
  const [notes, setNotes] = usePersistent<Note[]>("notes", []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = notes.find((n) => n.id === activeId) ?? notes[0];

  const create = () => {
    const n = { id: uid(), title: "Nova nota", body: "", updated: Date.now() };
    setNotes((ns) => [n, ...ns]);
    setActiveId(n.id);
  };
  const patch = (p: Partial<Note>) =>
    active && setNotes((ns) => ns.map((n) => (n.id === active.id ? { ...n, ...p, updated: Date.now() } : n)));

  async function summarize() {
    if (!active?.body.trim()) { toast.error("Escreve algo primeiro."); return; }
    setBusy(true);
    try {
      const s = await askAI([{ role: "user", content: `Resume estas notas em tópicos claros e curtos:\n\n${active.body}` }]);
      patch({ body: `${active.body}\n\n— Resumo IA —\n${s}` });
    } catch (e) {
      toast.error(e instanceof Error && e.message === "NO_KEY" ? "Adiciona a chave OpenRouter nas Definições." : "Não foi possível resumir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Notas inteligentes" subtitle="Guardadas automaticamente neste dispositivo.">
        <Button size="sm" onClick={create}><Plus /> Nova nota</Button>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="grid content-start gap-2">
          {notes.length === 0 && <p className="text-sm text-muted-foreground">Sem notas ainda.</p>}
          {notes.map((n) => (
            <button key={n.id} onClick={() => setActiveId(n.id)} className={`panel p-3 text-left ${n.id === active?.id ? "border-primary/50" : ""}`}>
              <div className="truncate text-sm font-semibold">{n.title || "Sem título"}</div>
              <div className="text-xs text-muted-foreground">{new Date(n.updated).toLocaleDateString("pt-PT")}</div>
            </button>
          ))}
        </div>
        {active ? (
          <div className="panel space-y-3 p-4">
            <div className="flex gap-2">
              <Input value={active.title} onChange={(e) => patch({ title: e.target.value })} className="font-semibold" />
              <Button variant="outline" onClick={summarize} disabled={busy}><Sparkles /> {busy ? "A resumir..." : "Resumir com IA"}</Button>
              <Button variant="ghost" size="icon" aria-label="Apagar nota" onClick={() => setNotes((ns) => ns.filter((n) => n.id !== active.id))}><Trash2 /></Button>
            </div>
            <Textarea value={active.body} onChange={(e) => patch({ body: e.target.value })} placeholder="Começa a escrever..." className="min-h-[50vh]" />
          </div>
        ) : (
          <div className="panel grid place-items-center p-10 text-muted-foreground">
            <Button onClick={create}><Plus /> Criar a primeira nota</Button>
          </div>
        )}
      </div>
    </div>
  );
}
