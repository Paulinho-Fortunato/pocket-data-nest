import { describe, expect, it } from "vitest";

import {
  clampSourceForPrompt,
  cleanText,
  dedupeKey,
  extractJsonObject,
  normalizeForCompare,
  overlapsSource,
} from "../lib/generation-utils";

describe("extractJsonObject", () => {
  it("pulls JSON out of a fenced block or surrounding prose", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObject('Claro! {"a":{"b":"c}"}} espero que ajude')).toBe('{"a":{"b":"c}"}}');
    expect(extractJsonObject("sem json")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });
});

describe("text normalisation", () => {
  it("compares text without accents, case or repeated spaces", () => {
    expect(normalizeForCompare("  Metáfase ")).toBe("metafase");
    expect(dedupeKey("O que é a FOTOSSÍNTESE?")).toBe(dedupeKey("o  que e a fotossintese?"));
  });

  it("trims, collapses whitespace and caps length without cutting words mid-way", () => {
    expect(cleanText("  linha   com   espaços \n\n extra ", 100)).toBe("linha com espaços extra");
    const capped = cleanText("palavra ".repeat(50), 40);
    expect(capped.length).toBeLessThanOrEqual(40);
    expect(capped.endsWith("…")).toBe(true);
    expect(capped).not.toContain("  ");
  });
});

describe("source grounding", () => {
  const source =
    "A mitose é a divisão celular que produz duas células geneticamente idênticas. " +
    "Ocorre em quatro fases: prófase, metáfase, anáfase e telófase. A metáfase alinha " +
    "os cromossomas no plano equatorial. A anáfase separa as cromátides-irmãs.";

  it("accepts questions grounded in the source", () => {
    expect(overlapsSource("Em que fase os cromossomas se alinham no equador?", source)).toBe(true);
  });

  it("rejects unrelated questions", () => {
    expect(overlapsSource("Quem escreveu Os Lusíadas em 1572?", source)).toBe(false);
  });

  it("never sends more than the prompt budget", () => {
    const long = "conteúdo ".repeat(20_000);
    const clamped = clampSourceForPrompt(long, 60_000);
    expect(clamped.truncated).toBe(true);
    expect(clamped.text.startsWith(long.slice(0, 60_000))).toBe(true);
    expect(clamped.text).toContain("fonte reduzida");
    expect(clamped.originalChars).toBe(long.length);

    const short = clampSourceForPrompt("texto curto", 60_000);
    expect(short).toMatchObject({ truncated: false, text: "texto curto" });
  });
});
