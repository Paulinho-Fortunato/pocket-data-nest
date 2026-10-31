import { createAPIFileRoute } from "@tanstack/react-start/api";
import { fetchTranscript } from "youtube-transcript";

const CACHE_TTL = 60 * 60 * 1000; // 1h
const cache = new Map<string, { at: number; body: string; status: number }>();
const WINDOW = 60 * 1000; // 1 min
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (recent.length >= MAX_PER_WINDOW) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function clientIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local"
  );
}

async function fetchInLanguages(video: string): Promise<string> {
  for (const lang of ["pt", "en"] as const) {
    try {
      const chunks = await fetchTranscript(video, { lang });
      const text = chunks
        .map((chunk) => chunk.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) return text;
    } catch {
      // try next language
    }
  }
  return "";
}

export const APIRoute = createAPIFileRoute("/api/youtube-transcript")({
  GET: async ({ request }) => {
    if (rateLimited(clientIP(request))) {
      return Response.json(
        { error: "Demasiados pedidos. Tenta novamente dentro de um minuto." },
        { status: 429 },
      );
    }
    const url = new URL(request.url);
    const video = url.searchParams.get("v") ?? "";
    if (!/^[\w-]{11}$/.test(video)) {
      return Response.json({ error: "ID de vídeo inválido." }, { status: 400 });
    }
    const cached = cache.get(video);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      return new Response(cached.body, {
        status: cached.status,
        headers: { "Content-Type": "application/json", "X-Cache": "hit" },
      });
    }
    const text = await fetchInLanguages(video);
    if (!text) {
      const body = JSON.stringify({
        error: "O vídeo não tem legendas em português ou inglês.",
      });
      cache.set(video, { at: Date.now(), body, status: 404 });
      return new Response(body, { status: 404, headers: { "Content-Type": "application/json" } });
    }
    const body = JSON.stringify({ video, text });
    cache.set(video, { at: Date.now(), body, status: 200 });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "miss" },
    });
  },
});
