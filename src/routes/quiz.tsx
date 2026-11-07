import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Timer, Trophy } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/page-head";
import { isDemoCard, uid, useCards, useStats, type Card } from "@/lib/store";
import {
  GENERATED_QUIZ_KEY,
  isAnswerCorrect,
  type QuestionDraft,
  type QuizOptions,
} from "@/lib/quiz-ai";

export const Route = createFileRoute("/quiz")({
  head: () => pageHead("Quiz", "Pratica com perguntas validadas e explicações."),
  component: Quiz,
});

type QuizSession = {
  questions: QuestionDraft[];
  options: Pick<QuizOptions, "timePerQuestion" | "explanations">;
  sourceLabel: string;
};

function shuffle<T>(values: T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

/** Builds a local quiz from saved cards (only when the user has enough cards). */
function quizFromCards(cards: Card[]): QuestionDraft[] {
  const pool = [
    ...shuffle(cards.filter((card) => !card.known)),
    ...shuffle(cards.filter((card) => card.known)),
  ].slice(0, 10);
  return pool
    .map<QuestionDraft | null>((card) => {
      const distractors = shuffle(
        Array.from(new Set(cards.filter((other) => other.id !== card.id).map((other) => other.a))),
      )
        .filter((answer) => answer !== card.a)
        .slice(0, 3);
      if (distractors.length < 1) return null;
      return {
        id: uid(),
        type: "multiple-choice" as const,
        question: card.q,
        options: shuffle([card.a, ...distractors]),
        correctAnswer: card.a,
        difficulty: card.difficulty ?? "medium",
        ...(card.source ? { source: { quote: card.source } } : {}),
      };
    })
    .filter((question): question is QuestionDraft => question !== null);
}

/** Reads the confirmed quiz handed over by /criar-quiz (sessionStorage). */
function readGeneratedQuiz(): QuizSession | null {
  try {
    const raw = sessionStorage.getItem(GENERATED_QUIZ_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      questions?: unknown;
      options?: { timePerQuestion?: unknown; explanations?: unknown };
      source?: unknown;
    };
    if (!Array.isArray(parsed.questions)) return null;
    const rawQuestions = parsed.questions as unknown[];
    const questions = rawQuestions.filter((item): item is QuestionDraft => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate["question"] === "string" &&
        (candidate["question"] as string).trim().length > 0 &&
        typeof candidate["correctAnswer"] === "string" &&
        (candidate["correctAnswer"] as string).trim().length > 0
      );
    });
    if (questions.length === 0) return null;
    return {
      questions,
      options: {
        timePerQuestion:
          typeof parsed.options?.timePerQuestion === "number" ? parsed.options.timePerQuestion : 0,
        explanations: parsed.options?.explanations !== false,
      },
      sourceLabel: typeof parsed.source === "string" ? parsed.source : "Quiz gerado com IA",
    };
  } catch {
    return null;
  }
}

function Quiz() {
  const [cards] = useCards();
  const ownCards = useMemo(() => cards.filter((card) => !isDemoCard(card)), [cards]);
  const { award } = useStats();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    setSession(readGeneratedQuiz());
  }, []);

  const current = session?.questions[index];
  const timePerQuestion = session?.options.timePerQuestion ?? 0;

  const check = useCallback(
    (answer: string) => {
      if (!current || checked) return;
      setChecked(true);
      setPicked(answer);
      const correct = isAnswerCorrect(current, answer);
      if (correct) {
        setScore((value) => value + 1);
        award(10, (stats) => ({ answered: stats.answered + 1, correct: stats.correct + 1 }));
      } else {
        award(0, (stats) => ({ answered: stats.answered + 1 }));
      }
    },
    [award, checked, current],
  );

  /* Per-question timer (optional). Expiring reveals the answer, never blocks. */
  useEffect(() => {
    if (!current || checked || finished || timePerQuestion <= 0) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(timePerQuestion);
    const id = setInterval(() => {
      setTimeLeft((value) => {
        if (value === null) return null;
        if (value <= 1) {
          clearInterval(id);
          // Time is up: count as unanswered and reveal the correct answer.
          setChecked(true);
          award(0, (stats) => ({ answered: stats.answered + 1 }));
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [award, checked, current, finished, timePerQuestion]);

  const next = useCallback(() => {
    if (!session) return;
    if (index + 1 >= session.questions.length) {
      setFinished(true);
      award(15, (stats) => ({ quizzes: stats.quizzes + 1 }));
    } else {
      setIndex((value) => value + 1);
      setPicked(null);
      setAnswerText("");
      setChecked(false);
    }
  }, [award, index, session]);

  const restart = useCallback(() => {
    setIndex(0);
    setPicked(null);
    setAnswerText("");
    setChecked(false);
    setScore(0);
    setFinished(false);
  }, []);

  const startFromCards = useCallback(() => {
    const questions = quizFromCards(ownCards);
    if (questions.length === 0) return;
    setSession({
      questions,
      options: { timePerQuestion: 0, explanations: true },
      sourceLabel: "Quiz dos teus cartões",
    });
    restart();
    toast.success(`${questions.length} perguntas a partir dos teus cartões.`);
  }, [ownCards, restart]);

  const hasEnoughCards = useMemo(
    () => ownCards.length >= 2 && ownCards.filter((card) => card.a.trim()).length >= 2,
    [ownCards],
  );

  if (!session) {
    return (
      <div className="min-w-0">
        <PageHeader
          title="Quiz"
          subtitle="Cria um quiz a partir de um documento ou pratica com os teus cartões."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="size-5" aria-hidden="true" />
              <h2 className="font-semibold text-foreground">Criar quiz com IA</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Escolhe um PDF, texto colado, documento guardado ou um tema. Defines a quantidade, o
              tipo de pergunta, o tempo e as explicações — e confirmas antes de começar.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/criar-quiz">
                  <Sparkles aria-hidden="true" />
                  Criar quiz com IA
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/criar-cartoes">Criar cartões</Link>
              </Button>
            </div>
          </section>

          <section className="panel flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <Timer className="size-5 text-primary" aria-hidden="true" />
              <h2 className="font-semibold">Quiz dos teus cartões</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Usa os cartões que já criaste. +10 XP por acerto, +15 XP ao terminar.
            </p>
            <Button onClick={startFromCards} disabled={!hasEnoughCards}>
              Começar quiz dos cartões
            </Button>
            {!hasEnoughCards ? (
              <p className="text-xs text-muted-foreground">
                Precisas de pelo menos 2 cartões.{" "}
                <Link to="/criar-cartoes" className="text-primary underline">
                  Criar cartões com IA
                </Link>{" "}
                ou{" "}
                <Link to="/flashcards" className="text-primary underline">
                  adicionar manualmente
                </Link>
                .
              </p>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  if (finished || !current) {
    const total = session.questions.length;
    return (
      <div className="min-w-0">
        <PageHeader title="Resultado do quiz" subtitle={session.sourceLabel} />
        <div className="panel p-8 text-center">
          <Trophy className="mx-auto size-12 text-warning" aria-hidden="true" />
          <h2 className="mt-4 text-2xl font-bold">
            {score} / {total} certas
          </h2>
          <p className="mt-1 text-muted-foreground">
            {score === total ? "Perfeito!" : "Revê as perguntas falhadas e tenta outra vez."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={restart}>Repetir este quiz</Button>
            <Button variant="outline" asChild>
              <Link to="/criar-quiz">
                <Sparkles aria-hidden="true" />
                Criar outro quiz
              </Link>
            </Button>
            <Button variant="ghost" onClick={() => setSession(null)}>
              Voltar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const total = session.questions.length;
  const correct = isAnswerCorrect(current, picked ?? answerText);
  const isShort = current.type === "short-answer";

  return (
    <div className="min-w-0">
      <PageHeader title="Quiz" subtitle={session.sourceLabel}>
        <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {index + 1} de {total}
          {timeLeft !== null ? ` · ${timeLeft}s` : ""}
        </span>
      </PageHeader>

      <div className="panel p-4 sm:p-6">
        <div
          className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Progresso do quiz"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
        >
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Pergunta {index + 1} de {total}
          {current.source?.pageStart ? ` · p. ${current.source.pageStart}` : ""}
        </p>
        <h2 className="mt-2 text-xl font-semibold">{current.question}</h2>

        {isShort ? (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              className="settings-select quiz-answer-input"
              value={answerText}
              onChange={(event) => setAnswerText(event.target.value)}
              disabled={checked}
              aria-label="A tua resposta"
              onKeyDown={(event) => {
                if (event.key === "Enter") check(answerText);
              }}
            />
            <Button onClick={() => check(answerText)} disabled={checked || !answerText.trim()}>
              Verificar resposta
            </Button>
          </div>
        ) : (
          <div className="mt-5 grid gap-2">
            {(current.options ?? []).map((option, optionIndex) => {
              const isCorrectOption = option.toLowerCase() === current.correctAnswer.toLowerCase();
              const isPicked = picked === option;
              const state = !checked
                ? ""
                : isCorrectOption
                  ? "border-success bg-success/15"
                  : isPicked
                    ? "border-destructive bg-destructive/15"
                    : "opacity-60";
              return (
                <button
                  key={`${option}-${optionIndex}`}
                  type="button"
                  onClick={() => check(option)}
                  disabled={checked}
                  aria-pressed={isPicked}
                  className={`min-h-11 rounded-xl border border-border p-3 text-left text-sm transition hover:border-primary/50 ${state}`}
                >
                  {option}
                  {checked && isCorrectOption ? (
                    <span className="ml-2 font-bold text-success">✓ correta</span>
                  ) : null}
                  {checked && isPicked && !isCorrectOption ? (
                    <span className="ml-2 font-bold text-destructive">✗ a tua resposta</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {checked ? (
          <div className="mt-4 flex flex-col gap-2" role="status">
            <p className="text-sm">
              {picked === null ? (
                <span className="text-warning">Tempo esgotado.</span>
              ) : correct ? (
                <span className="text-success">✓ Resposta correta.</span>
              ) : (
                <span className="text-destructive">
                  ✗ Ainda não. Resposta correta: <strong>{current.correctAnswer}</strong>
                </span>
              )}
            </p>
            {session.options.explanations && current.explanation ? (
              <p className="text-sm text-muted-foreground">{current.explanation}</p>
            ) : null}
            {current.source?.quote ? (
              <p className="preview-source">“{current.source.quote}”</p>
            ) : null}
            <div>
              <Button onClick={next}>
                {index + 1 >= total ? "Terminar quiz" : "Próxima pergunta"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
