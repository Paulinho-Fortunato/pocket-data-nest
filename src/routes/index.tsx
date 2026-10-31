import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Layers, ListChecks, Timer, ArrowRight } from "lucide-react";
import { pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  defaultCards,
  levelOf,
  usePersistent,
  useStats,
  XP_PER_LEVEL,
  type Card,
} from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => pageHead("Início", "O teu painel de estudo: progresso, metas e ferramentas."),
  component: Dashboard,
});

const tools = [
  { to: "/tutor", icon: Bot, title: "Tutor IA", text: "Explica qualquer conceito ao teu ritmo." },
  {
    to: "/flashcards",
    icon: Layers,
    title: "Flashcards",
    text: "Revê com prática de recuperação.",
  },
  { to: "/quiz", icon: ListChecks, title: "Quiz", text: "Descobre onde podes melhorar." },
  { to: "/foco", icon: Timer, title: "Modo foco", text: "Protege o teu tempo de estudo." },
] as const;

function Dashboard() {
  const { stats } = useStats();
  const [cards] = usePersistent<Card[]>("cards", defaultCards);
  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const pending = cards.filter((c) => !c.known).length;
  const lvlXp = stats.xp % XP_PER_LEVEL;
  const goalPct = Math.min(100, (stats.sessions / stats.weeklyGoal) * 100);
  const date = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const statCards = [
    { label: "Taxa de acerto", value: `${accuracy}%`, hint: `${stats.answered} respostas` },
    {
      label: "Tempo focado",
      value: `${Math.floor(stats.focusMinutes / 60)}h ${stats.focusMinutes % 60}m`,
      hint: `${stats.sessions} sessões`,
    },
    { label: "Cartões por rever", value: pending, hint: `${cards.length} no total` },
    { label: `Nível ${levelOf(stats.xp)}`, value: `${lvlXp}`, hint: `/ ${XP_PER_LEVEL} XP` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs capitalize text-muted-foreground">{date}</p>
        <h1 className="mt-1 text-3xl font-bold md:text-4xl">
          Olá, {stats.name.split(" ")[0]}. <span className="text-brand">Vamos avançar?</span>
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="panel relative overflow-hidden p-6">
          <div className="absolute -right-20 -top-28 size-64 rounded-full bg-primary/20 blur-3xl" />
          <span className="relative rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            Plano inteligente
          </span>
          <h2 className="relative mt-4 max-w-md text-2xl font-semibold">
            Transforma dúvidas em domínio.
          </h2>
          <p className="relative mt-2 max-w-md text-sm text-muted-foreground">
            Esclarece um conceito com o tutor, pratica com flashcards e consolida com um quiz.
          </p>
          <div className="relative mt-5 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/tutor">
                Começar sessão <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/progresso">Ver progresso</Link>
            </Button>
          </div>
          <div className="relative mt-6">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Meta semanal</span>
              <span>
                {stats.sessions} de {stats.weeklyGoal} sessões de foco
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </div>
        </section>
        <div className="grid grid-cols-2 gap-3">
          {statCards.map((s) => (
            <div key={s.label} className="panel p-4">
              <small className="text-xs text-muted-foreground">{s.label}</small>
              <div className="mt-3 font-display text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-success">{s.hint}</div>
            </div>
          ))}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Escolhe uma ferramenta</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tools.map(({ to, icon: Icon, title, text }) => (
            <Link
              key={to}
              to={to}
              className="panel group p-5 transition hover:-translate-y-0.5 hover:border-primary/40"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
