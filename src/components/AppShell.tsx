import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
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
  Sparkles,
  Timer,
  WifiOff,
  Zap,
} from "lucide-react";
import { InstallBanner } from "@/components/InstallBanner";
import { useOnlineStatus } from "@/lib/pwa";
import { levelOf, streak, useStats } from "@/lib/store";

const nav = [
  { to: "/", label: "Início", short: "Início", icon: Home },
  { to: "/tutor", label: "Agente IA", short: "Agente", icon: Bot },
  { to: "/flashcards", label: "Flashcards", short: "Cartões", icon: Layers },
  { to: "/criar-cartoes", label: "Criar cartões com IA", short: "Cartões IA", icon: Sparkles },
  { to: "/quiz", label: "Quiz", short: "Quiz", icon: ListChecks },
  { to: "/criar-quiz", label: "Criar quiz com IA", short: "Quiz IA", icon: Sparkles },
  { to: "/foco", label: "Modo foco", short: "Foco", icon: Timer },
  { to: "/notas", label: "Notas", short: "Notas", icon: NotebookPen },
  { to: "/progresso", label: "Progresso", short: "Níveis", icon: BarChart3 },
  { to: "/metodos", label: "Métodos", short: "Métodos", icon: BookOpen },
  { to: "/definicoes", label: "Definições", short: "Ajustes", icon: Settings },
] as const;

/* 4 destinos principais na barra de baixo + "Mais" (estilo app Android) */
const tabPrimary = [nav[0], nav[1], nav[2], nav[4]];
const tabOverflow = nav.filter((item) => !tabPrimary.includes(item as never));

export function AppShell({ children }: { children: ReactNode }) {
  const { stats } = useStats();
  const online = useOnlineStatus();
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const initials = stats.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  /* sheet "Mais": foco entra no diálogo, Escape fecha, Tab fica dentro */
  useEffect(() => {
    if (!moreOpen) return;
    const sheet = sheetRef.current;
    const focusables = () =>
      Array.from(sheet?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);

    focusables()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        moreButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  /* navegação por ligação: o foco passa para o conteúdo novo */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const isCurrent = (to: string) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

  /* O tutor é imersivo: ocupa a altura toda e traz o próprio cabeçalho. */
  const immersive = pathname === "/tutor";

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
    <div className="app-frame" data-immersive={immersive ? "true" : undefined}>
      <a className="skip-link" href="#conteudo">
        Saltar para o conteúdo
      </a>
      {/* ── Top bar compacta estilo app ─────────────────────────────── */}
      <header className="topbar">
        <Link to="/" className="topbar-brand" aria-label="AngoStudy — início">
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
          {!online ? (
            <span className="stat-chip" role="status" aria-label="Sem ligação à internet">
              <WifiOff className="size-3.5 text-warning" aria-hidden="true" />
              <span className="hidden sm:inline">Offline</span>
            </span>
          ) : null}
          <Link to="/definicoes" className="avatar-chip" aria-label="Perfil e definições">
            <span aria-hidden="true">{initials || "AS"}</span>
          </Link>
        </div>
      </header>

      {/* ── Conteúdo ────────────────────────────────────────────────── */}
      <main ref={mainRef} id="conteudo" className="min-w-0 pt-6" tabIndex={-1}>
        {!immersive ? <InstallBanner /> : null}
        {children}
      </main>

      {/* ── Sheet "Mais" (estilo bottom-sheet do Android) ───────────── */}
      {moreOpen && (
        <>
          <div
            className="mobile-menu-overlay"
            aria-hidden="true"
            onClick={() => {
              setMoreOpen(false);
              moreButtonRef.current?.focus();
            }}
          />
          <div
            ref={sheetRef}
            id="mais-navegacao"
            className="more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções de navegação"
          >
            <span className="more-sheet-handle" aria-hidden="true" />
            <nav className="more-sheet-nav" aria-label="Mais navegação">
              {tabOverflow.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact: to === "/" }}
                  className="more-sheet-item"
                  aria-current={isCurrent(to) ? "page" : undefined}
                  onPointerDown={spawnRipple}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}

      {/* ── Bottom navigation fixa (app nativo) ─────────────────────── */}
      <nav className="tabbar" aria-label="Navegação principal">
        {tabPrimary.map(({ to, label, short, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            aria-label={label}
            aria-current={isCurrent(to) ? "page" : undefined}
            onPointerDown={spawnRipple}
          >
            <Icon aria-hidden="true" />
            <span>{short}</span>
          </Link>
        ))}
        <button
          ref={moreButtonRef}
          type="button"
          className={moreOpen ? "is-active" : ""}
          data-status={moreOpen ? "active" : undefined}
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? "mais-navegacao" : undefined}
          aria-label="Mais opções"
          onPointerDown={spawnRipple}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <MoreHorizontal aria-hidden="true" />
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
    <div className="page-header">
      <div className="min-w-0">
        <h1 className="page-title font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
