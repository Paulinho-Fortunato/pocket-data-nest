import { createAPIFileRoute } from "@tanstack/react-start/api";
import { fetchTranscript } from "youtube-transcript";

export const APIRoute = createAPIFileRoute("/api/youtube-transcript")({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const video = url.searchParams.get("v") ?? "";
    if (!/^[\w-]{11}$/.test(video)) {
      return Response.json({ error: "ID de vídeo inválido." }, { status: 400 });
    }
    try {
      const chunks = await fetchTranscript(video, { lang: "pt" });
      const text = chunks
        .map((chunk) => chunk.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) {
        return Response.json({ error: "O vídeo não tem legendas disponíveis." }, { status: 404 });
      }
      return Response.json({ video, text });
    } catch {
      return Response.json(
        { error: "Não foi possível obter a transcrição deste vídeo." },
        { status: 404 },
      );
    }
  },
});
