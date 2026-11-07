import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { pageHead } from "@/lib/page-head";
import { Button } from "@/components/ui/button";
import { useStats } from "@/lib/store";

export const Route = createFileRoute("/foco")({
  head: () => pageHead("Modo foco", "Pomodoro para estudar em ciclos curtos e sustentáveis."),
  component: Foco,
});

const modes = {
  focus: { label: "Foco", min: 25 },
  short: { label: "Pausa", min: 5 },
  long: { label: "Pausa longa", min: 15 },
} as const;
type Mode = keyof typeof modes;

function Foco() {
  const [mode, setMode] = useState<Mode>("focus");
  const [left, setLeft] = useState(modes.focus.min * 60);
  const [running, setRunning] = useState(false);
  const { award } = useStats();
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (left > 0) return;
    setRunning(false);
    if (modeRef.current === "focus") {
      award(50, (s) => ({
        sessions: s.sessions + 1,
        focusMinutes: s.focusMinutes + modes.focus.min,
      }));
      toast.success("Sessão concluída · +50 XP. Faz uma pausa!");
      choose("short");
    } else {
      toast("Pausa terminada. Pronto para outro bloco?");
      choose("focus");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  function choose(m: Mode) {
    setMode(m);
    setRunning(false);
    setLeft(modes[m].min * 60);
  }

  const total = modes[mode].min * 60;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const r = 120,
    c = 2 * Math.PI * r;

  useEffect(() => {
    document.title = running ? `${mm}:${ss} · AngoStudy` : "Modo foco — AngoStudy";
  }, [mm, ss, running]);

  return (
    <div>
      <PageHeader
        title="Modo foco"
        subtitle="Cada sessão de foco completa conta para a tua meta semanal."
      />
      <div className="panel flex flex-col items-center p-5 sm:p-8">
        <div className="flex w-full flex-wrap justify-center gap-2">
          {(Object.keys(modes) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => choose(m)}
              aria-pressed={m === mode}
              className={`min-h-11 rounded-full border px-4 py-2 text-xs font-semibold ${m === mode ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"}`}
            >
              {modes[m].label} · {modes[m].min}m
            </button>
          ))}
        </div>
        <div className="relative my-6 grid w-full place-items-center sm:my-8">
          <svg
            className="foco-ring -rotate-90"
            viewBox="0 0 280 280"
            role="img"
            aria-label={`Tempo restante: ${mm} minutos e ${ss} segundos`}
          >
            <circle
              cx="140"
              cy="140"
              r={r}
              className="fill-none stroke-muted"
              strokeWidth="10"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx="140"
              cy="140"
              r={r}
              className="fill-none stroke-primary transition-all"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - left / total)}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="foco-time absolute font-display font-bold" aria-hidden="true">
            {mm}:{ss}
          </span>
        </div>
        <div className="flex w-full flex-wrap justify-center gap-2 sm:w-auto">
          <Button size="lg" className="flex-1 sm:flex-none" onClick={() => setRunning((v) => !v)}>
            {running ? (
              <>
                <Pause /> Pausar
              </>
            ) : (
              <>
                <Play /> Iniciar
              </>
            )}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => choose(mode)}
          >
            <RotateCcw /> Reiniciar
          </Button>
        </div>
      </div>
    </div>
  );
}
