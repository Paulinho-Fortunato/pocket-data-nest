import { createServerFn } from "@tanstack/react-start";
import { fetchTranscript } from "youtube-transcript";

const CACHE_TTL = 60 * 60 * 1000; // 1h
const cache = new Map<string, { at: number; text: string | null }>();

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

/**
 * Server-side YouTube transcript fetcher (replaces the old
 * src/routes/api.youtube-transcript.ts route, which was not being
 * included in the route tree by TanStack Start).
 */
export const getYouTubeTranscript = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => {
    const video = typeof raw === "string" ? raw : "";
    if (!/^[\w-]{11}$/.test(video)) {
      throw new Error("ID de vídeo inválido.");
    }
    return video;
  })
  .handler(async ({ data: video }) => {
    const cached = cache.get(video);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      return { text: cached.text };
    }
    const text = await fetchInLanguages(video);
    cache.set(video, { at: Date.now(), text: text || null });
    return { text: text || null };
  });
