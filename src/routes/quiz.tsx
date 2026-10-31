import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askAI } from "@/lib/ai";
import { defaultCards, usePersistent, useStats, type Card } from "@/lib/store";

export const Route = createFileRoute("/quiz")({
  head: () => pageHead("Quiz", "Testa o teu conhecimento sem medo de errar."),
  component: Quiz,
});

type Q = { q: string; answer: string; options: string[] };
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

function buildQuiz(cards: Card[]): Q[] {
  const pool = [
    ...shuffle(cards.filter((c) => !c.known)),
    ...shuffle(cards.filter((c) => c.known)),
  ].slice(0, 5);
  return pool.map((c) => ({
    q: c.q,
    answer: c.a,
    options: shuffle([
      c.a,
      ...Array.from(new Set(shuffle(cards.filter((o) => o.id !== c.id)).map((o) => o.a)))
        .filter((answer) => answer !== c.a)
        .slice(0, 3),
    ]),
  }));
}

function parseAIQuiz(raw: string): Q[] {
  const json = raw.match(/\[[\s\S]*\]/)?.[0];
  if (!json) throw new Error("FORMATO_INVALIDO");
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) throw new Error("FORMATO_INVALIDO");
  const questions = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const question = item as {
        question?: unknown;
        q?: unknown;
        answer?: unknown;
        options?: unknown;
      };
      const q = typeof question.question === "string" ? question.question : question.q;
      const answer = typeof question.answer === "string" ? question.answer : "";
      const options = Array.isArray(question.options)
        ? question.options.filter((option): option is string => typeof option === "string")
        : [];
      if (typeof q !== "string" || !q.trim() || !answer.trim() || options.length < 2) return null;
      return {
        q: q.trim(),
        answer: answer.trim(),
        options: shuffle(Array.from(new Set([answer.trim(), ...options]))),
      };
    })
    .filter((question): question is Q => question !== null)
    .slice(0, 10);
  if (questions.length < 2) throw new Error("FORMATO_INVALIDO");
  return questions;
}

function Quiz() {
  const [cards] = usePersistent<Card[]>("cards", defaultCards);
  const { award } = useStats();
  const [qs, setQs] = useState<Q[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [topic, setTopic] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const start = () => {
    const localQuiz = buildQuiz(cards);
    if (localQuiz.length < 1) return;
    setQs(localQuiz);
    setI(0);
    setPicked(null);
    setScore(0);
  };

  async function createWithAI() {
    if (!topic.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const raw = await askAI([
        {
          role: "user",
          content: `Cria um quiz de 5 perguntas de escolha múltipla sobre: ${topic.trim()}. Responde APENAS com JSON válido, sem Markdown, no formato [{"question":"...","options":["...","...","...","..."],"answer":"..."}]. A resposta correta deve existir em options. Usa português europeu e mistura dificuldade.`,
        },
      ]);
      setQs(parseAIQuiz(raw));
      setI(0);
      setPicked(null);
      setScore(0);
      toast.success("Quiz criado com IA.");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "NO_KEY"
          ? "Adiciona a chave OpenRouter nas Definições."
          : "Não foi possível criar o quiz. Tenta reformular o tema.",
      );
    } finally {
      setAiBusy(false);
    }
  }

  function pick(option: string) {
    if (picked || !qs) return;
    setPicked(option);
    const ok = option === qs[i]?.answer;
    if (ok) setScore((value) => value + 1);
    award(ok ? 10 : 0, (s) => ({ answered: s.answered + 1, correct: s.correct + (ok ? 1 : 0) }));
  }

  function next() {
    if (!qs) return;
    if (i + 1 >= qs.length) {
      award(15, (s) => ({ quizzes: s.quizzes + 1 }));
      setI(qs.length);
    } else {
      setI(i + 1);
      setPicked(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Quiz adaptativo"
        subtitle="Pratica com os teus cartões ou deixa a IA criar um quiz sobre qualquer tema."
      />
      {!qs ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel p-6">
            <div className="mb-4 flex items-center gap-2 text-primary">
              <Sparkles className="size-5" />
              <h2 className="font-semibold text-foreground">Quiz com IA</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Escreve um tema, disciplina ou capítulo. A IA cria perguntas e respostas múltiplas.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Ex.: fotossíntese, funções quadráticas..."
                onKeyDown={(event) => {
                  if (event.key === "Enter") createWithAI();
                }}
              />
              <Button
                onClick={createWithAI}
                disabled={aiBusy || !topic.trim()}
                className="shrink-0"
              >
                {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}{" "}
                {aiBusy ? "A criar..." : "Criar quiz"}
              </Button>
            </div>
          </div>
          <div className="panel p-6">
            <h2 className="mb-2 font-semibold">Quiz dos teus cartões</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              5 perguntas · +10 XP por acerto · +15 XP ao terminar
            </p>
            <Button size="lg" onClick={start} disabled={cards.length < 2}>
              Começar quiz local
            </Button>
            {cards.length < 2 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Precisas de pelo menos 2 flashcards.{" "}
                <Link to="/flashcards" className="text-primary underline">
                  Criar cartões
                </Link>
              </p>
            )}
          </div>
        </div>
      ) : i >= qs.length ? (
        <div className="panel p-10 text-center">
          <Trophy className="mx-auto size-12 text-warning" />
          <h2 className="mt-4 text-2xl font-bold">
            {score} / {qs.length} certas
          </h2>
          <p className="mt-1 text-muted-foreground">
            {score === qs.length ? "Perfeito!" : "Revê os cartões em que falhaste."}
          </p>
          <Button
            className="mt-6"
            onClick={() => {
              setQs(null);
              setTopic("");
            }}
          >
            Novo quiz
          </Button>
        </div>
      ) : (
        (() => {
          const cur = qs[i]!;
          return (
            <div className="panel p-4 sm:p-6">
              <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${((i + 1) / qs.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Pergunta {i + 1} de {qs.length}
              </p>
              <h2 className="mt-2 text-xl font-semibold">{cur.q}</h2>
              <div className="mt-5 grid gap-2">
                {cur.options.map((option, index) => {
                  const state = !picked
                    ? ""
                    : option === cur.answer
                      ? "border-success bg-success/15"
                      : option === picked
                        ? "border-destructive bg-destructive/15"
                        : "opacity-60";
                  return (
                    <button
                      key={`${option}-${index}`}
                      type="button"
                      onClick={() => pick(option)}
                      className={`rounded-xl border border-border p-3 text-left text-sm transition hover:border-primary/50 ${state}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {picked && (
                <Button className="mt-5" onClick={next}>
                  {i + 1 >= qs.length ? "Ver resultado" : "Seguinte"}
                </Button>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
}
