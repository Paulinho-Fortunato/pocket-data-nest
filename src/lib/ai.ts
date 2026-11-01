import { readStore, type ChatMsg } from "./store";

export const SYSTEM_PROMPT =
  "És o agente de IA do AngoStudy. Responde sempre em português europeu, com clareza, rigor e foco no objetivo do utilizador. Primeiro identifica a intenção; depois resolve por etapas quando a tarefa for complexa. Mantém o contexto da conversa, faz perguntas apenas quando faltarem dados essenciais e entrega uma resposta prática. Para matemática, usa Markdown e KaTeX: fórmulas inline entre \\( e \\) ou $ $, e fórmulas em bloco entre \\[ e \\] ou $$ $$; nunca mostres comandos LaTeX sem delimitadores. Usa títulos curtos, listas e tabelas apenas quando ajudam. Não inventes factos nem afirmes que executaste ações que não executaste.";

/** Maps common OpenRouter errors to friendly Portuguese messages. */
export function friendlyAIError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("no key") || m === "no_key")
    return "Falta a chave OpenRouter. Adiciona-a nas Definições.";
  if (m.includes("401") || m.includes("invalid api key") || m.includes("unauthorized"))
    return 'A chave OpenRouter parece inválida. Verifica se foi copiada por completo (começa por "sk-or-").';
  if (m.includes("402") || m.includes("credit") || m.includes("insufficient"))
    return 'Créditos insuficientes na tua conta OpenRouter. Escolhe um modelo ":free" nas Definições ou recarrega créditos.';
  if (m.includes("403") || m.includes("not allowed") || m.includes("permission"))
    return "Este modelo não está disponível para a tua chave. Tenta outro modelo nas Definições.";
  if (m.includes("404") || m.includes("is not a valid model") || m.includes("model not found"))
    return "O modelo escolhido não existe (ou mudou de nome). Escolhe outro modelo nas Definições.";
  if (m.includes("429") || m.includes("rate limit"))
    return "Demasiados pedidos de momento. Espera uns segundos e tenta de novo.";
  if (
    m.includes("502") ||
    m.includes("503") ||
    m.includes("upstream") ||
    m.includes("no endpoints")
  )
    return "O serviço OpenRouter está temporariamente indisponível. Tenta outra vez daqui a pouco.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("err_network"))
    return "Falha de rede. Verifica a tua ligação à internet (e bloqueadores de anúncios/extensões que impeçam openrouter.ai).";
  return message;
}

export async function testAIConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = readStore<string>("openrouter_key", "").trim();
  const model = readStore<string>("openrouter_model", "openrouter/auto");

  if (!key) {
    return { ok: false, error: "Adiciona uma chave OpenRouter nas definições." };
  }

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": location.origin,
        "X-Title": "AngoStudy",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Testar ligação" }],
        max_tokens: 1,
      }),
    });

    const data = (await r.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;

    if (!r.ok) {
      return {
        ok: false,
        error: friendlyAIError(data?.error?.message || `Pedido falhou (${r.status})`),
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: friendlyAIError(
        error instanceof Error ? error.message : "Erro inesperado ao testar a ligação.",
      ),
    };
  }
}

/** Calls OpenRouter directly from the browser using the key the user saved locally. */
export async function askAI(messages: ChatMsg[], system = SYSTEM_PROMPT): Promise<string> {
  const key = readStore<string>("openrouter_key", "");
  const model = readStore<string>("openrouter_model", "openrouter/auto");
  if (!key) throw new Error("NO_KEY");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": location.origin,
      "X-Title": "AngoStudy",
    },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages] }),
  });
  const data = (await r.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  } | null;
  if (!r.ok) {
    throw new Error(friendlyAIError(data?.error?.message || `Pedido falhou (${r.status})`));
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(friendlyAIError(data?.error?.message || "Sem resposta"));
  return text;
}

/**
 * Streams the answer from OpenRouter (SSE) so the UI can render text as the
 * model types. Returns the full text once the stream completes.
 *
 * OpenRouter occasionally sends SSE comments like ": OPENROUTER PROCESSING"
 * to keep the connection alive; per the SSE spec they are not JSON payloads
 * and must be ignored.
 */
export async function askAIStream(
  messages: ChatMsg[],
  onDelta: (delta: string) => void,
  options: { system?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const key = readStore<string>("openrouter_key", "");
  const model = readStore<string>("openrouter_model", "openrouter/auto");
  if (!key) throw new Error("NO_KEY");
  let r: Response;
  try {
    r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: options.signal ?? null,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": location.origin,
        "X-Title": "AngoStudy",
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: "system", content: options.system ?? SYSTEM_PROMPT }, ...messages],
      }),
    });
  } catch (error) {
    // AbortError happens when the user stops generation; propagate it as-is.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(friendlyAIError(error instanceof Error ? error.message : "Falha no pedido."));
  }

  if (!r.ok || !r.body) {
    // NOTE: never call r.json()/r.text() before getReader() here — reading the
    // body locks the stream and would make r.body.getReader() throw
    // "ReadableStreamDefaultReader constructor can only accept readable
    // streams that are not yet locked to a reader".
    let errorMessage = "";
    if (r.body && r.body.locked === false) {
      try {
        const errorBody = (await r.json()) as { error?: { message?: string } } | null;
        errorMessage = errorBody?.error?.message || "";
      } catch {
        // Ignore bodies that aren't valid JSON; we still have the status code.
      }
    }
    throw new Error(friendlyAIError(errorMessage || `Pedido falhou (${r.status})`));
  }

  // If the stream somehow ends up locked (e.g. reused response in tests or an
  // extension double-reading the body), fail with a friendly message instead
  // of the raw browser TypeError.
  if (r.body.locked) {
    throw new Error("O stream de resposta já está em uso. Tenta outra vez.");
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        // Defensive: skip malformed lines instead of crashing the whole stream.
        let chunk: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.error) throw new Error(friendlyAIError(chunk.error.message || "Erro no stream"));
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      }
    }
  } finally {
    // Always release the lock so the stream can be garbage collected and so a
    // retry never hits "stream already locked to a reader".
    reader.releaseLock();
  }
  if (!full) throw new Error("Sem resposta");
  return full;
}
