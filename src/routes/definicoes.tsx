import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Download,
  KeyRound,
  Loader2,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { PersonalizationPanel } from "@/components/settings/PersonalizationPanel";
import { pageHead } from "@/lib/page-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  testAIConnection,
  AI_PROXY_ENDPOINT_KEY,
  isProxyConfigured,
  friendlyAIError,
} from "@/lib/ai";
import {
  API_KEY_RISK_NOTICE,
  clearApiKey,
  getApiKey,
  maskApiKey,
  setApiKey,
} from "@/lib/credentials";
import {
  applyBackup,
  buildBackup,
  deleteAllAppData,
  describeBackup,
  MAX_BACKUP_FILE_BYTES,
  parseBackup,
  serializeBackup,
  type BackupData,
  type MergeStrategy,
} from "@/lib/backup";
import { clearChatHistory, clearDocuments } from "@/lib/idb";
import { MODEL_GROUPS } from "@/lib/model-catalog";
import type { ParsedChatMsg } from "@/lib/schemas";
import type { DocumentRecord } from "@/lib/documents";
import { readStore, useStats, writeStore } from "@/lib/store";

export const Route = createFileRoute("/definicoes")({
  head: () => pageHead("Definições", "Perfil, tutor IA e cópia de segurança dos teus dados."),
  component: Definicoes,
});

type ImportPreview = {
  values: BackupData;
  chat?: ParsedChatMsg[];
  documents?: DocumentRecord[];
  warnings: string[];
  lines: string[];
};

function Definicoes() {
  const { stats, setStats } = useStats();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(6);
  const [key, setKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [model, setModel] = useState("openrouter/auto");
  const [proxyUrl, setProxyUrl] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);
  const [testError, setTestError] = useState("");
  const [savedModel, setSavedModel] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [strategy, setStrategy] = useState<MergeStrategy>("merge");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(stats.name);
    setGoal(stats.weeklyGoal);
    const storedKey = getApiKey();
    setKey(storedKey);
    setSavedKey(storedKey);
    setModel(readStore("openrouter_model", "openrouter/auto"));
    setSavedModel(readStore("openrouter_model", ""));
    setProxyUrl(readStore(AI_PROXY_ENDPOINT_KEY, ""));
  }, [stats.name, stats.weeklyGoal]);

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    setTestError("");

    // Saved temporarily so the test uses exactly what the tutor will use.
    setApiKey(key.trim());
    writeStore("openrouter_model", model);
    writeStore(AI_PROXY_ENDPOINT_KEY, proxyUrl.trim());

    const result = await testAIConnection();

    if (result.ok) {
      setTestResult("ok");
      setSavedModel(model);
      setSavedKey(key.trim());
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
    setApiKey(key.trim());
    setSavedKey(key.trim());
    writeStore("openrouter_model", model);
    writeStore(AI_PROXY_ENDPOINT_KEY, proxyUrl.trim());
    setSavedModel(model);
    toast.success("Definições guardadas neste dispositivo.");
  }

  function removeKey() {
    clearApiKey();
    setKey("");
    setSavedKey("");
    toast.success("Chave OpenRouter removida deste navegador.");
  }

  async function backup() {
    try {
      const { envelope, skipped } = await buildBackup();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([serializeBackup({ envelope, skipped })], { type: "application/json" }),
      );
      a.download = `angostudy-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Dados exportados. A chave OpenRouter não foi incluída.", {
        description:
          skipped.length > 0
            ? `Itens ignorados (demasiado grandes ou corrompidos): ${skipped.join(", ")}.`
            : undefined,
      });
    } catch (error) {
      toast.error("Não foi possível exportar os dados.", {
        description: error instanceof Error ? error.message : "Erro de armazenamento.",
      });
    }
  }

  async function readBackup(f?: File) {
    if (!f) return;
    if (f.size > MAX_BACKUP_FILE_BYTES) {
      toast.error("Esta cópia é demasiado grande para importar neste dispositivo.");
      return;
    }
    let raw: string;
    try {
      raw = await f.text();
    } catch {
      toast.error("Não foi possível ler o ficheiro.");
      return;
    }
    const parsed = parseBackup(raw);
    if (!parsed.ok) {
      setImportPreview(null);
      toast.error(parsed.error);
      return;
    }
    for (const warning of parsed.warnings) toast.warning(warning);
    setImportPreview({
      values: parsed.values,
      ...(parsed.chat ? { chat: parsed.chat } : {}),
      ...(parsed.documents ? { documents: parsed.documents } : {}),
      warnings: parsed.warnings,
      lines: describeBackup(parsed.values, parsed.chat, parsed.documents),
    });
  }

  async function confirmImport() {
    if (!importPreview) return;
    try {
      const result = await applyBackup(importPreview.values, strategy, {
        ...(importPreview.chat ? { chat: importPreview.chat } : {}),
        ...(importPreview.documents ? { documents: importPreview.documents } : {}),
      });
      if (result.failed.length > 0 || result.errors.length > 0) {
        toast.warning(
          `Cópia importada com avisos: ${result.written.length} chaves, ${result.chatRestored} mensagens e ${result.documentsRestored} documentos.`,
          { description: result.errors.slice(0, 2).join(" "), duration: 10000 },
        );
      } else {
        toast.success(
          `Cópia importada (${strategy === "merge" ? "juntar" : "substituir"}): ${result.written.length} chaves, ${result.chatRestored} mensagens e ${result.documentsRestored} documentos.`,
          { description: "A chave OpenRouter nunca é importada." },
        );
      }
      setImportPreview(null);
      setTimeout(() => location.reload(), 800);
    } catch (error) {
      toast.error(
        `Não foi possível importar: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      );
    }
  }

  async function wipe() {
    if (!confirm("Apagar todos os dados do AngoStudy neste dispositivo? Esta ação é irreversível."))
      return;
    deleteAllAppData();
    // Chat and documents live in IndexedDB; the pending tutor→creation handoff
    // lives in sessionStorage. A "delete all" that leaves them behind is a
    // privacy bug, not a partial reset.
    await Promise.all([
      clearDocuments().catch(() => undefined),
      clearChatHistory().catch(() => undefined),
    ]);
    try {
      sessionStorage.clear();
    } catch {
      // Ignore blocked storage.
    }
    location.reload();
  }

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Definições" subtitle="Tudo fica guardado apenas no teu navegador." />

      <PersonalizationPanel />

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

        <div
          id="k-risco"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">A chave fica neste navegador</p>
            <p>{API_KEY_RISK_NOTICE}</p>
            <p>
              Para produção, configura um proxy no servidor (campo abaixo) e deixa de guardar a
              chave no browser.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="k">Chave OpenRouter</Label>
          <Input
            id="k"
            type="password"
            placeholder="sk-or-..."
            autoComplete="off"
            value={key}
            aria-describedby={testResult === "error" ? "k-risco k-erro" : "k-risco"}
            aria-invalid={testResult === "error" || undefined}
            onChange={(e) => setKey(e.target.value)}
          />
          {savedKey ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <KeyRound className="size-3.5" aria-hidden="true" />
              Chave guardada: <code className="break-all">{maskApiKey(savedKey)}</code>
              <Button variant="outline" size="sm" onClick={removeKey}>
                <Trash2 className="mr-1 size-3.5" /> Remover chave
              </Button>
            </div>
          ) : (
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
              . A chave só é enviada para o endpoint que configurares.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="proxy">Proxy de IA (opcional)</Label>
          <Input
            id="proxy"
            placeholder="https://o-teu-servidor.example/api/ai"
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Quando preenchido, o browser deixa de falar com a OpenRouter e passa a usar este
            endpoint (que deve acrescentar a chave do lado do servidor).{" "}
            {isProxyConfigured() ? "Proxy ativo." : "Sem proxy configurado."}
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
            {MODEL_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.models.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Só aparecem modelos de conversa. Modelos gratuitos de embeddings, reranking, áudio ou
            scoring não respondem no tutor e por isso não estão na lista. As imagens ainda não são
            enviadas para o modelo.
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
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 p-3 text-sm text-foreground"
          >
            <CheckCircle className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            Ligação bem-sucedida! Está tudo pronto.
          </div>
        )}

        {testResult === "error" && (
          <div
            id="k-erro"
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span>Erro: {friendlyAIError(testError)}</span>
          </div>
        )}

        {savedModel && savedModel !== model && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              Mudaste de modelo mas ainda não guardaste. Clica em «Guardar definições» para o tutor
              usar este modelo.
            </span>
          </div>
        )}
      </section>

      <Button onClick={save} size="lg" className="w-full">
        Guardar definições
      </Button>

      <section className="panel space-y-3 p-5">
        <h2 className="font-semibold">Os teus dados</h2>
        <p className="text-xs text-muted-foreground">
          A cópia inclui perfil, notas, flashcards, conversas, documentos extraídos e modelo
          escolhido. Nunca inclui a chave OpenRouter. Pode ser grande se tiveres PDFs extensos.
        </p>
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
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void readBackup(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        {importPreview && (
          <div
            className="space-y-3 rounded-lg border border-border/70 bg-secondary/40 p-3 text-sm"
            role="group"
            aria-label="Confirmar importação"
          >
            <p className="font-medium">Confirmar importação</p>
            <p className="text-xs text-muted-foreground">
              Conteúdo detetado: {importPreview.lines.join(", ") || "sem dados"}.
            </p>
            {importPreview.warnings.map((warning) => (
              <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">
                {warning}
              </p>
            ))}
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">Como aplicar?</legend>
              <label className="flex min-h-11 items-start gap-2 py-1 text-xs">
                <input
                  type="radio"
                  name="strategy"
                  value="merge"
                  checked={strategy === "merge"}
                  onChange={() => setStrategy("merge")}
                />
                <span>
                  <strong>Juntar</strong> — mantém o que já existe e acrescenta o que falta.
                </span>
              </label>
              <label className="flex min-h-11 items-start gap-2 py-1 text-xs">
                <input
                  type="radio"
                  name="strategy"
                  value="replace"
                  checked={strategy === "replace"}
                  onChange={() => setStrategy("replace")}
                />
                <span>
                  <strong>Substituir</strong> — apaga os dados atuais dessas chaves.
                </span>
              </label>
            </fieldset>
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmImport}>
                Importar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportPreview(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default Definicoes;
