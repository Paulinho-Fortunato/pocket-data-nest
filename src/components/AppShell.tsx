import { useCallback, useEffect, useState, type PointerEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Bot,
  Flame,
  Home,
  Layers,
  ListChecks,
  MoreHorizontal,
  NotebookPen,
  Settings,
  Timer,
  Zap,
} from "lucide-react";
import { levelOf, streak, useStats } from "@/lib/store";

const nav = [
  { to: "/", label: "Início", short: "Início", icon: Home },
  { to: "/tutor", label: "Agente IA", short: "Agente", icon: Bot },
  { to: "/flashcards", label: "Flashcards", short: "Cartões", icon: Layers },
  { to: "/quiz", label: "Quiz", short: "Quiz", icon: ListChecks },
  { to: "/foco", label: "Modo foco", short: "Foco", icon: Timer },
  { to: "/notas", label: "Notas", short: "Notas", icon: NotebookPen },
  { to: "/progresso", label: "Progresso", short: "Níveis", icon: BarChart3 },
  { to: "/metodos", label: "Métodos", short: "Métodos", icon: BookOpen },
  { to: "/definicoes", label: "Definições", short: "Ajustes", icon: Settings },
] as const;

/* 4 destinos principais na barra de baixo + "Mais" (estilo app Android) */
const tabPrimary = [nav[0], nav[1], nav[2], nav[3]];
const tabOverflow = nav.slice(4);

export function AppShell({ children }: { children: ReactNode }) {
  const { stats } = useStats();
  const [moreOpen, setMoreOpen] = useState(false);
  const initials = stats.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  /* fecha o sheet "Mais" com Escape */
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  /* ondinha (ripple) ao tocar num separador — feedback tátil visual */
  const spawnRipple = useCallback((e: PointerEvent<HTMLElement>) => {
    const host = e.currentTarget;
    if (host.querySelector(".tab-ripple")) return;
    const span = document.createElement("span");
    span.className = "tab-ripple";
    span.addEventListener("animationend", () => span.remove());
    host.appendChild(span);
  }, []);

  return (
    <div className="app-frame mx-auto min-h-dvh max-w-7xl px-4 pb-28 md:px-6">
      {/* ── Top bar compacta estilo app ─────────────────────────────── */}
      <header className="topbar">
        <Link to="/" className="topbar-brand">
          <span className="topbar-logo" aria-hidden="true">
            AS
          </span>
          <span className="topbar-wordmark">AngoStudy</span>
        </Link>

        <div className="topbar-stats">
          <span className="stat-chip hidden sm:inline-flex">
            <Flame className="size-3.5 text-warning" />
            <strong>{streak(stats.days)}</strong> dias
          </span>
          <span className="stat-chip">
            <Zap className="size-3.5 text-warning" />
            <strong>{stats.xp}</strong> XP · Nv {levelOf(stats.xp)}
          </span>
          <Link to="/definicoes" className="avatar-chip" aria-label="Perfil">
            {initials || "AS"}
          </Link>
        </div>
      </header>

      {/* ── Conteúdo ────────────────────────────────────────────────── */}
      <main className="min-w-0 pt-6">{children}</main>

      {/* ── Sheet "Mais" (estilo bottom-sheet do Android) ───────────── */}
      {moreOpen && (
        <>
          <div
            className="mobile-menu-overlay"
            aria-hidden="true"
            onClick={() => setMoreOpen(false)}
          />
          <nav className="more-sheet" aria-label="Mais navegação">
            <span className="more-sheet-handle" aria-hidden="true" />
            {tabOverflow.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="more-sheet-item"
                onPointerDown={spawnRipple}
                onClick={() => setMoreOpen(false)}
              >
                <Icon />
                {label}
              </Link>
            ))}
          </nav>
        </>
      )}

      {/* ── Bottom navigation fixa (app nativo) ─────────────────────── */}
      <nav className="tabbar" aria-label="Navegação principal">
        {tabPrimary.map(({ to, short, icon: Icon }) => (
          <Link key={to} to={to} activeOptions={{ exact: to === "/" }} onPointerDown={spawnRipple}>
            <Icon />
            <span>{short}</span>
          </Link>
        ))}
        <button
          type="button"
          className={moreOpen ? "is-active" : ""}
          data-status={moreOpen ? "active" : undefined}
          aria-expanded={moreOpen}
          aria-label="Mais opções"
          onPointerDown={spawnRipple}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <MoreHorizontal />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
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
