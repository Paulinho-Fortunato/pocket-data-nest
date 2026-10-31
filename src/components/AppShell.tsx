import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Bot,
  Flame,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Settings,
  Timer,
  Zap,
} from "lucide-react";
import { levelOf, streak, useStats } from "@/lib/store";

const nav = [
  { to: "/", label: "Início", icon: LayoutDashboard },
  { to: "/tutor", label: "Tutor IA", icon: Bot },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/quiz", label: "Quiz", icon: ListChecks },
  { to: "/foco", label: "Modo foco", icon: Timer },
  { to: "/notas", label: "Notas", icon: NotebookPen },
  { to: "/progresso", label: "Progresso", icon: BarChart3 },
  { to: "/metodos", label: "Métodos", icon: BookOpen },
  { to: "/definicoes", label: "Definições", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { stats } = useStats();
  const initials = stats.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 md:px-6 md:pb-10">
      <header className="sticky top-0 z-20 -mx-4 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl md:-mx-6 md:px-6">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-primary-foreground shadow-glow">
            <GraduationCap className="size-5" />
          </span>
          <span>
            <span className="block font-display text-lg font-bold leading-none">AngoStudy</span>
            <span className="text-[11px] text-muted-foreground">Aprende com intenção</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-muted-foreground sm:flex">
            <Flame className="size-3.5 text-warning" />
            <strong className="text-foreground">{streak(stats.days)}</strong> dias
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-muted-foreground">
            <Zap className="size-3.5 text-warning" />
            <strong className="text-foreground">{stats.xp}</strong> XP · Nv {levelOf(stats.xp)}
          </span>
          <Link
            to="/definicoes"
            className="grid size-8 place-items-center rounded-full bg-brand text-[11px] font-bold text-primary-foreground"
            aria-label="Perfil"
          >
            {initials || "AS"}
          </Link>
        </div>
      </header>

      <div className="grid gap-7 pt-7 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden md:block">
          <nav className="sticky top-24 grid gap-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex items-center gap-3 rounded-xl border border-transparent px-3.5 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground data-[status=active]:border-primary/25 data-[status=active]:bg-primary/10 data-[status=active]:text-foreground"
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-background/95 py-2 backdrop-blur md:hidden">
        {nav.slice(0, 6).map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex flex-col items-center gap-0.5 px-2 text-[10px] text-muted-foreground data-[status=active]:text-primary"
          >
            <Icon className="size-5" />
            {label.split(" ")[0]}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}

export function pageHead(title: string, description: string) {
  const t = `${title} — AngoStudy`;
  return {
    meta: [
      { title: t },
      { name: "description", content: description },
      { property: "og:title", content: t },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
