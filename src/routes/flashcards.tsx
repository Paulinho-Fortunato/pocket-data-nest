import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  GraduationCap,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { pageHead } from "@/lib/page-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_DECK, demoCards, isDemoCard, uid, useCards, useStats } from "@/lib/store";

export const Route = createFileRoute("/flashcards")({
  head: () => pageHead("Flashcards", "Prática de recuperação para fixar o que realmente importa."),
  component: Flashcards,
});

function Flashcards() {
  const [cards, setCards] = useCards();
  const [deck, setDeck] = useState("Todos");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [form, setForm] = useState({ q: "", a: "", deck: "" });
  const [showForm, setShowForm] = useState(false);
  const { award } = useStats();

  const decks = useMemo(() => ["Todos", ...new Set(cards.map((c) => c.deck))], [cards]);
  const demo = useMemo(() => cards.filter(isDemoCard), [cards]);
  const realCards = useMemo(() => cards.filter((card) => !isDemoCard(card)), [cards]);
  /* Example cards never mix with the user's own cards in "Todos". */
  const list =
    deck === "Todos" ? realCards : deck === DEMO_DECK ? demo : cards.filter((c) => c.deck === deck);
  const card = list[Math.min(idx, list.length - 1)];

  const go = (d: number) => {
    if (!list.length) return;
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
    if (!form.q.trim() || !form.a.trim()) {
      toast.error("Preenche pergunta e resposta.");
      return;
    }
    setCards((cs) => [
      ...cs,
      {
        id: uid(),
        q: form.q.trim(),
        a: form.a.trim(),
        deck: form.deck.trim() || "Geral",
        known: false,
      },
    ]);
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
        <Button variant="outline" size="sm" asChild>
          <Link to="/criar-cartoes">
            <Sparkles aria-hidden="true" />
            Criar com IA
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={exportDecks} disabled={cards.length === 0}>
          <Download aria-hidden="true" /> Exportar
        </Button>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus aria-hidden="true" /> Novo cartão
        </Button>
      </PageHeader>

      {showForm && (
        <div className="panel mb-5 grid gap-2 p-4 md:grid-cols-[1fr_1fr_160px_auto]">
          <Input
            aria-label="Pergunta do cartão"
            placeholder="Pergunta"
            value={form.q}
            onChange={(e) => setForm({ ...form, q: e.target.value })}
          />
          <Input
            aria-label="Resposta do cartão"
            placeholder="Resposta"
            value={form.a}
            onChange={(e) => setForm({ ...form, a: e.target.value })}
          />
          <Input
            aria-label="Disciplina"
            placeholder="Disciplina"
            value={form.deck}
            onChange={(e) => setForm({ ...form, deck: e.target.value })}
          />
          <Button onClick={add}>Guardar</Button>
        </div>
      )}

      {realCards.length === 0 && demo.length === 0 ? (
        <section
          className="panel mb-5 flex flex-col items-start gap-3 p-5"
          aria-label="Sem cartões"
        >
          <div className="flex items-center gap-2">
            <GraduationCap className="size-5 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Ainda não tens cartões</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Cria cartões a partir de um PDF, de texto colado ou de um tema. Vês a pré-visualização
            antes de guardar. Também podes escrever os teus cartões à mão.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/criar-cartoes">
                <Sparkles aria-hidden="true" />
                Criar cartões com IA
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setShowForm(true)}>
              <Plus aria-hidden="true" />
              Adicionar manualmente
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCards((current) => [...current, ...demoCards]);
                setDeck(DEMO_DECK);
                setIdx(0);
                toast.info("Deck de exemplo carregado. Podes removê-lo quando quiseres.");
              }}
            >
              Carregar exemplo
            </Button>
          </div>
        </section>
      ) : null}

      {demo.length > 0 ? (
        <section className="install-banner mb-4" aria-label="Deck de exemplo">
          <GraduationCap className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <p>
            <strong>{demo.length} cartões de exemplo</strong> do deck “{DEMO_DECK}”. Ficam separados
            dos teus cartões e nunca entram no quiz.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCards((current) => current.filter((item) => !isDemoCard(item)));
              setDeck("Todos");
              setIdx(0);
              toast.success("Cartões de exemplo removidos.");
            }}
          >
            Remover exemplo
          </Button>
        </section>
      ) : realCards.length > 0 ? (
        <p className="preview-source mb-4">
          Queres ver como funciona?{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setCards((current) => [...current, ...demoCards]);
              setDeck(DEMO_DECK);
              setIdx(0);
            }}
          >
            Carregar deck de exemplo
          </button>{" "}
          (fica separado dos teus cartões).
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {decks.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === deck}
            onClick={() => {
              setDeck(d);
              setIdx(0);
              setFlipped(false);
            }}
            className={`min-h-11 rounded-full border px-4 py-2 text-xs font-semibold ${d === deck ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}
          >
            {d}
          </button>
        ))}
      </div>

      {card ? (
        <>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="block w-full [perspective:1200px]"
            aria-pressed={flipped}
          >
            <div className={`flip-3d flip-card ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
              <div className="panel flip-face backface-hidden" aria-hidden={flipped || undefined}>
                <div className="min-w-0">
                  <span className="text-xs text-muted-foreground">
                    {card.deck} · {Math.min(idx, list.length - 1) + 1} / {list.length}{" "}
                    {card.known && "· ✓ dominado"}
                  </span>
                  <p className="flip-question mt-4 font-display font-semibold">{card.q}</p>
                  <p className="mt-5 text-xs text-muted-foreground">
                    {flipped ? "Clica para ver a pergunta" : "Clica para ver a resposta"}
                  </p>
                </div>
              </div>
              <div
                className="panel flip-face backface-hidden border-primary/40 [transform:rotateY(180deg)]"
                aria-hidden={!flipped || undefined}
              >
                <p className="text-lg text-primary sm:text-xl">{card.a}</p>
              </div>
            </div>
          </button>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => go(-1)}>
              <ChevronLeft /> Anterior
            </Button>
            <Button variant="outline" onClick={() => mark(false)}>
              <RotateCcw /> Rever outra vez
            </Button>
            <Button onClick={() => mark(true)}>
              <Check /> Dominei · +20 XP
            </Button>
            <Button variant="outline" onClick={() => go(1)}>
              Seguinte <ChevronRight />
            </Button>
          </div>
        </>
      ) : (
        <div className="panel p-10 text-center text-muted-foreground">
          {deck === "Todos" ? "Ainda não tens cartões neste deck." : `O deck “${deck}” está vazio.`}
        </div>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold">
        {deck === "Todos" ? "Os teus cartões" : `Cartões · ${deck}`} ({list.length})
      </h2>
      <div className="grid gap-2">
        {list.map((c) => (
          <div key={c.id} className="panel flex items-start gap-3 p-3 text-sm">
            <span
              className={`mt-0.5 shrink-0 ${c.known ? "text-success" : "text-warning"}`}
              aria-hidden="true"
            >
              {c.known ? <Check className="size-4" /> : <RotateCcw className="size-4" />}
            </span>
            <span className="sr-only">{c.known ? "Dominado" : "Por rever"}</span>
            <span className="min-w-0 flex-1 break-words">{c.q}</span>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{c.deck}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Apagar cartão: ${c.q}`}
              onClick={() => setCards((cs) => cs.filter((x) => x.id !== c.id))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
