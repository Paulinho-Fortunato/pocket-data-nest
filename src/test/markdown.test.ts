import { describe, expect, it } from "vitest";

import {
  codeLanguageFromClassName,
  dropUnclosedDelimiters,
  isExternalHref,
  markdownToSpeechText,
  normalizeMathMarkdown,
  normalizeMathSegment,
  prepareMarkdown,
  sanitizeHref,
  splitCodeSegments,
  stabilizeStreamingMarkdown,
} from "../lib/markdown";

describe("normalizeMathSegment", () => {
  it("converts inline and display LaTeX delimiters", () => {
    expect(normalizeMathSegment("A área é \\(\\pi r^2\\).")).toBe("A área é $\\pi r^2$.");
    expect(normalizeMathSegment("\\[\n\\frac{a}{b}\n\\]")).toContain("$$\n\\frac{a}{b}\n$$");
  });

  it("converts display environments to $$ blocks", () => {
    const source = "\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}";
    const output = normalizeMathSegment(source);
    expect(output).toContain("$$");
    expect(output).toContain("\\begin{align}");
  });

  it("leaves plain markdown untouched", () => {
    const source = "# Título\n\n- um\n- dois\n\n**forte**";
    expect(normalizeMathSegment(source)).toBe(source);
  });
});

describe("normalizeMathMarkdown", () => {
  it("does not touch delimiters inside fenced code", () => {
    const source = "```latex\n\\(x+1\\) and \\(y\\)\n```\n\nFora: \\(z\\)";
    const output = normalizeMathMarkdown(source);
    expect(output).toContain("\\(x+1\\) and \\(y\\)");
    expect(output).toContain("Fora: $z$");
  });

  it("does not touch inline code", () => {
    const output = normalizeMathMarkdown("Usa `\\(a\\)` na sintaxe; a fórmula é \\(b\\).");
    expect(output).toContain("`\\(a\\)`");
    expect(output).toContain("$b$");
  });

  it("keeps dollar maths and GFM tables intact", () => {
    const source = "| a | b |\n| - | - |\n| $1$ | $$2$$ |";
    const output = normalizeMathMarkdown(source);
    expect(output).toContain("| a | b |");
    expect(output).toContain("$1$");
  });

  it("is idempotent for already-normalised math", () => {
    const once = normalizeMathMarkdown("A fórmula \\(x^2\\) e \\[y\\]");
    expect(normalizeMathMarkdown(once)).toBe(once);
  });
});

describe("splitCodeSegments", () => {
  it("marks an unterminated fence as open", () => {
    const segments = splitCodeSegments("texto\n```ts\nconst a = 1;");
    const code = segments.find((segment) => segment.type === "code");
    expect(code?.closed).toBe(false);
    expect(code?.fence).toBe("```");
  });

  it("recognises closed fences and the language class", () => {
    const segments = splitCodeSegments("```ts\nconst a = 1;\n```");
    const code = segments.find((segment) => segment.type === "code");
    expect(code?.closed).toBe(true);
    expect(codeLanguageFromClassName("language-ts")).toBe("ts");
    expect(codeLanguageFromClassName(undefined)).toBeNull();
  });
});

describe("partial markdown during streaming", () => {
  it("closes an open fence so the partial code is readable", () => {
    const stabilized = stabilizeStreamingMarkdown("```ts\nconst a = 1;");
    expect(stabilized.trimEnd().endsWith("```")).toBe(true);
    const segments = splitCodeSegments(stabilized);
    expect(segments.every((segment) => segment.type !== "code" || segment.closed)).toBe(true);
  });

  it("removes dangling math delimiters", () => {
    expect(dropUnclosedDelimiters("Antes \\(x + ")).toBe("Antes x + ");
    expect(dropUnclosedDelimiters("Antes \\[x + ")).toBe("Antes x + ");
    expect(dropUnclosedDelimiters("Antes $$x + ")).toBe("Antes x + ");
    expect(dropUnclosedDelimiters("Completo $x$ e $$y$$")).toBe("Completo $x$ e $$y$$");
    expect(dropUnclosedDelimiters("Custa \\$5")).toBe("Custa \\$5");
  });

  it("never breaks a partially streamed table", () => {
    const partial = "| a | b |\n| --- | --- |\n| 1 |";
    expect(prepareMarkdown(partial, { streaming: true })).toContain("| 1 |");
  });

  it("leaves complete markdown unchanged", () => {
    const complete = "# T\n\n- a\n- b\n\n```js\nconst a = 1;\n```\n";
    expect(prepareMarkdown(complete, { streaming: true })).toBe(complete);
  });
});

describe("sanitizeHref", () => {
  it("accepts http, https, mailto and relative links", () => {
    expect(sanitizeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(sanitizeHref("mailto:ola@example.com")).toBe("mailto:ola@example.com");
    expect(sanitizeHref("#secção")).toBe("#secção");
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("/tutor")).toBe(false);
  });

  it("rejects dangerous protocols", () => {
    expect(sanitizeHref("javascript:alert(1)")).toBeNull();
    expect(sanitizeHref("  JavaScript:alert(1)")).toBeNull();
    expect(sanitizeHref("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(sanitizeHref("vbscript:msgbox(1)")).toBeNull();
    expect(sanitizeHref("file:///etc/passwd")).toBeNull();
    expect(sanitizeHref("")).toBeNull();
    expect(sanitizeHref(undefined)).toBeNull();
  });
});

describe("markdownToSpeechText", () => {
  it("strips code, links and formulas", () => {
    const speech = markdownToSpeechText(
      "# Título\n\nVeja [aqui](https://example.com).\n\n```js\nconst a = 1;\n```\n\n\\(x^2\\)",
    );
    expect(speech).not.toContain("```");
    expect(speech).not.toContain("https://");
    expect(speech).toContain("aqui");
    expect(speech).toContain("fórmula");
    expect(speech).toContain("bloco de código omitido");
  });
});
