import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultCards, uid, usePersistent, useStats, type Card } from "@/lib/store";

export const Route = createFileRoute("/flashcards")({
  head: () => pageHead("Flashcards", "Prática de recuperação para fixar o que realmente importa."),
  component: Flashcards,
});

function Flashcards() {
  const [cards, setCards] = usePersistent<Card[]>("cards", defaultCards);
  const [deck, setDeck] = useState("Todos");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [form, setForm] = useState({ q: "", a: "", deck: "" });
  const [showForm, setShowForm] = useState(false);
  const { award } = useStats();

  const decks = useMemo(() => ["Todos", ...new Set(cards.map((c) => c.deck))], [cards]);
  const list = deck === "Todos" ? cards : cards.filter((c) => c.deck === deck);
  const card = list[Math.min(idx, list.length - 1)];

  const go = (d: number) => {
    setFlipped(false);
    setIdx((i) => (i + d + list.length) % list.length);
  };

  function mark(known: boolean) {
    if (!card) return;
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, known } : c)));
    if (known) {
      award(20, (s) => ({ reviewed: s.reviewed + 1 }));
      toast.success("Dominado · +20 XP");
    } else award(0, (s) => ({ reviewed: s.reviewed + 1 }));
    go(1);
  }

  function add() {
    if (!form.q.trim() || !form.a.trim()) { toast.error("Preenche pergunta e resposta."); return; }
    setCards((cs) => [...cs, { id: uid(), q: form.q.trim(), a: form.a.trim(), deck: form.deck.trim() || "Geral", known: false }]);
    setForm({ q: "", a: "", deck: form.deck });
    toast.success("Cartão adicionado.");
  }

  function exportDecks() {
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "angostudy-flashcards.json";
    a.click();
  }

  return (
    <div>
      <PageHeader title="Flashcards" subtitle="Clica no cartão para ver a resposta.">
        <Button variant="outline" size="sm" onClick={exportDecks}><Download /> Exportar</Button>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}><Plus /> Novo cartão</Button>
      </PageHeader>

      {showForm && (
        <div className="panel mb-5 grid gap-2 p-4 md:grid-cols-[1fr_1fr_160px_auto]">
          <Input placeholder="Pergunta" value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} />
          <Input placeholder="Resposta" value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} />
          <Input placeholder="Disciplina" value={form.deck} onChange={(e) => setForm({ ...form, deck: e.target.value })} />
          <Button onClick={add}>Guardar</Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {decks.map((d) => (
          <button
            key={d}
            onClick={() => { setDeck(d); setIdx(0); setFlipped(false); }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${d === deck ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}
          >
            {d}
          </button>
        ))}
      </div>

      {card ? (
        <>
          <button onClick={() => setFlipped((f) => !f)} className="block w-full [perspective:1200px]" aria-label="Virar cartão">
            <div className={`flip-3d relative h-72 ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
              <div className="panel backface-hidden absolute inset-0 grid place-items-center p-8 text-center">
                <div>
                  <span className="text-xs text-muted-foreground">{card.deck} · {Math.min(idx, list.length - 1) + 1} / {list.length} {card.known && "· ✓ dominado"}</span>
                  <p className="mt-4 font-display text-2xl font-semibold">{card.q}</p>
                  <p className="mt-6 text-xs text-muted-foreground">Clica para virar</p>
                </div>
              </div>
              <div className="panel backface-hidden absolute inset-0 grid place-items-center border-primary/40 p-8 text-center [transform:rotateY(180deg)]">
                <p className="text-xl text-primary">{card.a}</p>
              </div>
            </div>
          </button>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => go(-1)}><ChevronLeft /> Anterior</Button>
            <Button variant="outline" onClick={() => mark(false)}><RotateCcw /> Rever outra vez</Button>
            <Button onClick={() => mark(true)}><Check /> Dominei · +20 XP</Button>
            <Button variant="outline" onClick={() => go(1)}>Seguinte <ChevronRight /></Button>
          </div>
        </>
      ) : (
        <div className="panel p-10 text-center text-muted-foreground">Ainda não tens cartões. Cria o primeiro!</div>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold">Todos os cartões ({list.length})</h2>
      <div className="grid gap-2">
        {list.map((c) => (
          <div key={c.id} className="panel flex items-center gap-3 p-3 text-sm">
            <span className={`size-2 rounded-full ${c.known ? "bg-success" : "bg-warning"}`} />
            <span className="flex-1 truncate">{c.q}</span>
            <span className="hidden text-xs text-muted-foreground sm:block">{c.deck}</span>
            <Button variant="ghost" size="icon" aria-label="Apagar" onClick={() => setCards((cs) => cs.filter((x) => x.id !== c.id))}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
