import { createFileRoute } from "@tanstack/react-router";
import { Brain, CalendarClock, Moon, Shuffle } from "lucide-react";
import { PageHeader, pageHead } from "@/components/AppShell";

export const Route = createFileRoute("/metodos")({
  head: () =>
    pageHead("Métodos de estudo", "Técnicas comprovadas para estudares com mais intenção."),
  component: Metodos,
});

const methods = [
  {
    icon: Brain,
    title: "Prática de recuperação",
    text: "Fecha o livro e tenta trazer a informação à memória. O esforço revela o que precisas de rever.",
  },
  {
    icon: CalendarClock,
    title: "Repetição espaçada",
    text: "Distribui o estudo ao longo do tempo em vez de concentrares tudo na véspera.",
  },
  {
    icon: Shuffle,
    title: "Intercalação e Feynman",
    text: "Alterna tipos de problemas e explica conceitos com palavras simples, sem copiar definições.",
  },
  {
    icon: Moon,
    title: "Sono e pausas",
    text: "Descansar faz parte do estudo: a consolidação da memória precisa de tempo.",
  },
];

function Metodos() {
  return (
    <div>
      <PageHeader
        title="Métodos que funcionam"
        subtitle="A regra principal: não te limites a reler."
      />
      <div className="panel mb-4 p-5 text-sm text-muted-foreground">
        Um estudo eficaz alterna entre <strong className="text-foreground">compreender</strong>,{" "}
        <strong className="text-foreground">recuperar</strong> e{" "}
        <strong className="text-foreground">aplicar</strong>. O tutor ajuda a compreender, os
        flashcards a recuperar e os quizzes a aplicar.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {methods.map(({ icon: Icon, title, text }) => (
          <div key={title} className="panel p-5">
            <Icon className="size-6 text-primary" />
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
