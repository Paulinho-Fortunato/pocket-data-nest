import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trophy } from "lucide-react";
import { PageHeader, pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { defaultCards, usePersistent, useStats, type Card } from "@/lib/store";

export const Route = createFileRoute("/quiz")({
  head: () => pageHead("Quiz", "Testa o teu conhecimento sem medo de errar."),
  component: Quiz,
});

type Q = { q: string; answer: string; options: string[] };
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

/** Builds multiple-choice questions from the user's flashcards, prioritising unknown cards. */
function buildQuiz(cards: Card[]): Q[] {
  const pool = [...shuffle(cards.filter((c) => !c.known)), ...shuffle(cards.filter((c) => c.known))].slice(0, 5);
  return pool.map((c) => ({
    q: c.q,
    answer: c.a,
    options: shuffle([c.a, ...shuffle(cards.filter((o) => o.id !== c.id)).slice(0, 3).map((o) => o.a)]),
  }));
}

function Quiz() {
  const [cards] = usePersistent<Card[]>("cards", defaultCards);
  const { award } = useStats();
  const [qs, setQs] = useState<Q[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const start = () => { setQs(buildQuiz(cards)); setI(0); setPicked(null); setScore(0); };

  function pick(o: string) {
    if (picked || !qs) return;
    setPicked(o);
    const ok = o === qs[i].answer;
    if (ok) setScore((s) => s + 1);
    award(ok ? 10 : 0, (s) => ({ answered: s.answered + 1, correct: s.correct + (ok ? 1 : 0) }));
  }

  function next() {
    if (!qs) return;
    if (i + 1 >= qs.length) {
      award(15, (s) => ({ quizzes: s.quizzes + 1 }));
      setI(qs.length);
    } else { setI(i + 1); setPicked(null); }
  }

  return (
    <div>
      <PageHeader title="Quiz adaptativo" subtitle="Perguntas criadas a partir dos teus flashcards, com foco no que ainda não dominas." />
      {cards.length < 2 ? (
        <div className="panel p-10 text-center text-muted-foreground">
          Precisas de pelo menos 2 flashcards. <Link to="/flashcards" className="text-primary underline">Criar cartões</Link>
        </div>
      ) : !qs ? (
        <div className="panel p-10 text-center">
          <p className="mb-5 text-muted-foreground">5 perguntas · +10 XP por acerto · +15 XP ao terminar</p>
          <Button size="lg" onClick={start}>Começar</Button>
        </div>
      ) : i >= qs.length ? (
        <div className="panel p-10 text-center">
          <Trophy className="mx-auto size-12 text-warning" />
          <h2 className="mt-4 text-2xl font-bold">{score} / {qs.length} certas</h2>
          <p className="mt-1 text-muted-foreground">{score === qs.length ? "Perfeito!" : "Revê os cartões em que falhaste."}</p>
          <Button className="mt-6" onClick={start}>Novo quiz</Button>
        </div>
      ) : (
        <div className="panel p-6">
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-brand transition-all" style={{ width: `${(i / qs.length) * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Pergunta {i + 1} de {qs.length}</p>
          <h2 className="mt-2 text-xl font-semibold">{qs[i].q}</h2>
          <div className="mt-5 grid gap-2">
            {qs[i].options.map((o, k) => {
              const state = !picked ? "" : o === qs[i].answer ? "border-success bg-success/15" : o === picked ? "border-destructive bg-destructive/15" : "opacity-60";
              return (
                <button key={k} onClick={() => pick(o)} className={`rounded-xl border border-border p-3 text-left text-sm transition hover:border-primary/50 ${state}`}>
                  {o}
                </button>
              );
            })}
          </div>
          {picked && <Button className="mt-5" onClick={next}>{i + 1 >= qs.length ? "Ver resultado" : "Seguinte"}</Button>}
        </div>
      )}
    </div>
  );
}
