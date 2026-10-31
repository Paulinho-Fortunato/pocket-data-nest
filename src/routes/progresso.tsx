import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, pageHead } from "@/components/AppShell";
import { defaultCards, levelOf, streak, usePersistent, useStats, XP_PER_LEVEL, type Card } from "@/lib/store";

export const Route = createFileRoute("/progresso")({
  head: () => pageHead("Progresso", "Percebe o que já conquistaste e onde focar a seguir."),
  component: Progresso,
});

function Progresso() {
  const { stats } = useStats();
  const [cards] = usePersistent<Card[]>("cards", defaultCards);
  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const weak = cards.filter((c) => !c.known).slice(0, 5);

  const last14 = Array.from({ length: 14 }, (_, k) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - k));
    const iso = d.toISOString().slice(0, 10);
    return { iso, active: stats.days.includes(iso), label: d.toLocaleDateString("pt-PT", { weekday: "narrow" }) };
  });

  const items = [
    ["Quizzes realizados", stats.quizzes],
    ["Taxa de acerto", `${accuracy}%`],
    ["Flashcards revistos", stats.reviewed],
    ["Sessões de foco", stats.sessions],
    ["Sequência", `${streak(stats.days)} dias`],
    ["Nível", `${levelOf(stats.xp)} · ${stats.xp % XP_PER_LEVEL}/${XP_PER_LEVEL}`],
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="O teu progresso" subtitle="Tudo calculado a partir das tuas sessões reais." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {items.map(([l, v]) => (
          <div key={l} className="panel p-5">
            <small className="text-xs text-muted-foreground">{l}</small>
            <div className="mt-2 font-display text-3xl font-bold">{v}</div>
          </div>
        ))}
      </div>
      <div className="panel p-5">
        <h2 className="font-semibold">Últimos 14 dias</h2>
        <div className="mt-4 grid grid-cols-14 gap-1.5" style={{ gridTemplateColumns: "repeat(14, minmax(0,1fr))" }}>
          {last14.map((d) => (
            <div key={d.iso} className="text-center">
              <div className={`aspect-square rounded-md ${d.active ? "bg-brand" : "bg-muted"}`} title={d.iso} />
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel p-5">
        <h2 className="font-semibold">Próximos pontos de foco</h2>
        <p className="text-sm text-muted-foreground">Cartões que ainda não marcaste como dominados.</p>
        <ul className="mt-3 grid gap-2">
          {weak.length === 0 && <li className="text-sm text-success">Dominas todos os teus cartões!</li>}
          {weak.map((c) => (
            <li key={c.id} className="flex justify-between rounded-lg bg-secondary px-3 py-2 text-sm">
              <span className="truncate">{c.q}</span>
              <span className="ml-2 text-xs text-muted-foreground">{c.deck}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
