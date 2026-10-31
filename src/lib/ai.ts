import { readStore, type ChatMsg } from "./store";

export const SYSTEM_PROMPT =
  "És o tutor AngoStudy. Responde em português, de forma pedagógica, clara e rigorosa. Usa perguntas de verificação e não dês apenas a resposta final quando o estudante precisa de aprender.";

/** Calls OpenRouter directly from the browser using the key the user saved locally. */
export async function askAI(messages: ChatMsg[], system = SYSTEM_PROMPT): Promise<string> {
  const key = readStore<string>("openrouter_key", "");
  const model = readStore<string>("openrouter_model", "openrouter/free");
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
    throw new Error(data?.error?.message || `Pedido falhou (${r.status})`);
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(data?.error?.message || "Sem resposta");
  return text;
}
