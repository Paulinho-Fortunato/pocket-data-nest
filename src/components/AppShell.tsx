import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Bot,
  Flame,
  GraduationCap,
  Home,
  Layers,
  ListChecks,
  Menu,
  NotebookPen,
  Settings,
  Timer,
  X,
  Zap,
} from "lucide-react";
import { levelOf, streak, useStats } from "@/lib/store";

const nav = [
  { to: "/", label: "Início", icon: Home },
  { to: "/tutor", label: "Tutor IA", icon: Bot },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/quiz", label: "Quiz", icon: ListChecks },
  { to: "/foco", label: "Modo foco", icon: Timer },
  { to: "/notas", label: "Notas", icon: NotebookPen },
  { to: "/progresso", label: "Progresso", icon: BarChart3 },
  { to: "/metodos", label: "Métodos", icon: BookOpen },
  { to: "/definicoes", label: "Definições", icon: Settings },
] as const;

const desktopNav = [nav[0], nav[1], nav[2], nav[3], nav[4]];

export function AppShell({ children }: { children: ReactNode }) {
  const { stats } = useStats();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = stats.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  /* fecha o menu mobile ao navegar */
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("hashchange", close);
    window.addEventListener("popstate", close);
    return () => {
      window.removeEventListener("hashchange", close);
      window.removeEventListener("popstate", close);
    };
  }, [menuOpen]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 md:px-6">
      <header className="topbar">
        <span className="topbar-beam" aria-hidden="true" />
        <span className="nav-particles" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>

        <Link to="/" className="topbar-brand">
          <span className="topbar-logo">
            <GraduationCap className="size-5" />
          </span>
          <span>
            <span className="block font-display text-lg font-bold leading-none">AngoStudy</span>
            <span className="text-[11px] text-muted-foreground">Aprende com intenção</span>
          </span>
        </Link>

        <nav className="topbar-nav" aria-label="Navegação principal">
          {desktopNav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              onClick={() => setMenuOpen(false)}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>

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
          <button
            type="button"
            className="icon-btn lg:hidden"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>

        {menuOpen && (
          <>
            <div
              className="mobile-menu-overlay"
              aria-hidden="true"
              onClick={() => setMenuOpen(false)}
            />
            <nav className="mobile-menu" aria-label="Navegação">
              {nav.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact: to === "/" }}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon />
                  {label}
                </Link>
              ))}
            </nav>
          </>
        )}
      </header>

      <div className="grid gap-7 pt-7 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden md:block">
          <nav className="sidebar-nav sticky top-24">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} activeOptions={{ exact: to === "/" }}>
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
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
