import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readStore, useStats, writeStore } from "@/lib/store";

export const Route = createFileRoute("/definicoes")({
  head: () => pageHead("Definições", "Perfil, tutor IA e cópia de segurança dos teus dados."),
  component: Definicoes,
});

const models = [
  ["openrouter/free", "OpenRouter Free (automático)"],
  ["google/gemma-2-9b-it:free", "Gemma 2 9B (Free)"],
  ["meta-llama/llama-3.3-70b-instruct:free", "Llama 3.3 70B (Free)"],
];

function Definicoes() {
  const { stats, setStats } = useStats();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(6);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("openrouter/free");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(stats.name);
    setGoal(stats.weeklyGoal);
    setKey(readStore("openrouter_key", ""));
    setModel(readStore("openrouter_model", "openrouter/free"));
  }, [stats.name, stats.weeklyGoal]);

  function save() {
    setStats({ ...stats, name: name.trim() || "Estudante", weeklyGoal: Math.max(1, goal) });
    writeStore("openrouter_key", key.trim());
    writeStore("openrouter_model", model);
    toast.success("Definições guardadas neste dispositivo.");
  }

  function backup() {
    const data: Record<string, unknown> = {};
    for (const k of Object.keys(localStorage))
      if (k.startsWith("angostudy:") && k !== "angostudy:openrouter_key")
        data[k] = localStorage.getItem(k);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    a.download = `angostudy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  async function restore(f?: File) {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as Record<string, string>;
      Object.entries(data).forEach(
        ([k, v]) => k.startsWith("angostudy:") && localStorage.setItem(k, v),
      );
      toast.success("Dados restaurados.");
      setTimeout(() => location.reload(), 600);
    } catch {
      toast.error("Ficheiro inválido.");
    }
  }

  function wipe() {
    if (!confirm("Apagar todos os dados do AngoStudy neste dispositivo?")) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith("angostudy:"))
      .forEach((k) => localStorage.removeItem(k));
    location.reload();
  }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Definições" subtitle="Tudo fica guardado apenas no teu navegador." />
      <section className="panel space-y-4 p-5">
        <h2 className="font-semibold">Perfil</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="n">Nome</Label>
            <Input id="n" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g">Meta semanal (sessões)</Label>
            <Input
              id="g"
              type="number"
              min={1}
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
            />
          </div>
        </div>
      </section>
      <section className="panel space-y-4 p-5">
        <h2 className="font-semibold">Tutor IA</h2>
        <div className="space-y-1.5">
          <Label htmlFor="k">Chave OpenRouter</Label>
          <Input
            id="k"
            type="password"
            placeholder="sk-or-..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Cria uma chave grátis em openrouter.ai. Nunca sai deste dispositivo exceto para falar
            com a IA.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m">Modelo</Label>
          <select
            id="m"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {models.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </section>
      <Button onClick={save} size="lg">
        Guardar definições
      </Button>
      <section className="panel space-y-3 p-5">
        <h2 className="font-semibold">Os teus dados</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={backup}>
            <Download /> Exportar cópia
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> Importar cópia
          </Button>
          <Button variant="destructive" onClick={wipe}>
            <Trash2 /> Apagar tudo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => restore(e.target.files?.[0])}
          />
        </div>
      </section>
    </div>
  );
}
