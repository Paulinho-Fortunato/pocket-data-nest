import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, Upload, Trash2, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, pageHead } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readStore, useStats, writeStore } from "@/lib/store";
import { testAIConnection } from "@/lib/ai";

export const Route = createFileRoute("/definicoes")({
  head: () => pageHead("Definições", "Perfil, tutor IA e cópia de segurança dos teus dados."),
  component: Definicoes,
});

const models = [
  ["meta-llama/llama-3.3-70b-instruct:free", "Llama 3.3 70B (Free)"],
  ["google/gemma-2-9b-it:free", "Gemma 2 9B (Free)"],
  ["deepseek/deepseek-r1-distill-llama-70b:free", "DeepSeek R1 70B (Free)"],
  ["openrouter/auto", "Automático (o OpenRouter escolhe)"],
  ["openai/gpt-4o-mini", "GPT-4o Mini (pago)"],
];

function Definicoes() {
  const { stats, setStats } = useStats();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(6);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("openrouter/auto");
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);
  const [testError, setTestError] = useState("");
  const [savedModel, setSavedModel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(stats.name);
    setGoal(stats.weeklyGoal);
    setKey(readStore("openrouter_key", ""));
    setModel(readStore("openrouter_model", "openrouter/auto"));
    setSavedModel(readStore("openrouter_model", ""));
  }, [stats.name, stats.weeklyGoal]);

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    setTestError("");

    // Save temporarily to test
    writeStore("openrouter_key", key.trim());
    writeStore("openrouter_model", model);

    const result = await testAIConnection();

    if (result.ok) {
      setTestResult("ok");
      setSavedModel(model);
      toast.success("Ligação bem-sucedida! Podes começar a usar o tutor.");
    } else {
      setTestResult("error");
      setTestError(result.error);
      toast.error(`Erro: ${result.error}`);
    }
    setTestingConnection(false);
  }

  function save() {
    setStats({ ...stats, name: name.trim() || "Estudante", weeklyGoal: Math.max(1, goal) });
    writeStore("openrouter_key", key.trim());
    writeStore("openrouter_model", model);
    setSavedModel(model);
    toast.success("Definições guardadas neste dispositivo.");
  }

  function backup() {
    const data: Record<string, unknown> = {};
    for (const k of Object.keys(localStorage))
      if (k.startsWith("angostudy:") && k !== "angostudy:openrouter_key")
        data[k] = localStorage.getItem(k);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    a.download = `angostudy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast.success("Dados exportados. A chave OpenRouter não foi incluída.");
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
    if (!confirm("Apagar todos os dados do AngoStudy neste dispositivo? Esta ação é irreversível."))
      return;
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
        <h2 className="font-semibold">Agente IA (OpenRouter)</h2>
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
            Cria uma chave gratuita em{" "}
            <a
              href="https://openrouter.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              openrouter.ai
            </a>
            . Nunca sai deste dispositivo exceto para o modelo que selecionares.
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
          <p className="text-xs text-muted-foreground">
            Modelos gratuitos funcionam bem para a maioria dos casos.
          </p>
        </div>

        <Button
          onClick={handleTestConnection}
          disabled={!key.trim() || testingConnection}
          className="w-full"
        >
          {testingConnection ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />A testar ligação...
            </>
          ) : (
            "Testar ligação"
          )}
        </Button>

        {testResult === "ok" && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200">
            <CheckCircle className="h-4 w-4" />
            Ligação bem-sucedida! Está tudo pronto.
          </div>
        )}

        {testResult === "error" && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Erro: {testError}
          </div>
        )}

        {savedModel && savedModel !== model && (
          <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Mudaste de modelo mas ainda não guardaste. Clica em «Guardar definições» para o tutor
            usar este modelo.
          </div>
        )}
      </section>

      <Button onClick={save} size="lg" className="w-full">
        Guardar definições
      </Button>

      <section className="panel space-y-3 p-5">
        <h2 className="font-semibold">Os teus dados</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={backup}>
            <Download /> Exportar dados
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
