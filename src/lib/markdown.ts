/**
 * Markdown helpers shared by the renderer and its tests.
 *
 * The previous implementation rewrote math with a handful of global regexes,
 * which corrupted code samples and produced broken trees while the model was
 * still typing. Here we:
 *
 *  1. split the source into code and non-code segments (line aware, so an
 *     unterminated fence during streaming is still treated as code);
 *  2. normalise LaTeX delimiters only inside non-code segments;
 *  3. stabilise partially streamed markdown so ReactMarkdown never receives an
 *     unbalanced construct that would swallow the rest of the answer.
 */

export type MarkdownSegment = {
  type: "text" | "code";
  value: string;
  /** Fence marker (``` or ~~~) for code segments; null for inline code. */
  fence: string | null;
  closed: boolean;
};

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Splits markdown into code and text segments. A fence that never closes (the
 * normal state mid-stream) is returned with `closed: false`.
 */
export function splitCodeSegments(markdown: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const lines = markdown.split("\n");
  let buffer: string[] = [];
  let fence: string | null = null;
  let fenceLine = "";

  const flushText = () => {
    if (buffer.length > 0) {
      segments.push({ type: "text", value: buffer.join("\n"), fence: null, closed: true });
      buffer = [];
    }
  };

  for (const line of lines) {
    if (fence === null) {
      const match = FENCE_RE.exec(line);
      if (match) {
        flushText();
        fence = match[1] ?? "```";
        fenceLine = line;
        buffer.push(line);
      } else {
        buffer.push(line);
      }
      continue;
    }
    buffer.push(line);
    const closeMatch = FENCE_RE.exec(line);
    if (
      closeMatch &&
      closeMatch[1] &&
      closeMatch[1][0] === fence[0] &&
      closeMatch[1].length >= fence.length &&
      closeMatch[2]?.trim() === ""
    ) {
      segments.push({ type: "code", value: buffer.join("\n"), fence, closed: true });
      buffer = [];
      fence = null;
      fenceLine = "";
    }
  }

  if (fence !== null) {
    segments.push({ type: "code", value: buffer.join("\n"), fence, closed: false });
  } else {
    flushText();
  }
  void fenceLine;
  return segments;
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 1;
}

function indicesOf(text: string, token: string): number[] {
  const result: number[] = [];
  let index = text.indexOf(token);
  while (index !== -1) {
    // "\$" is an escaped dollar, not a delimiter.
    if (!isEscaped(text, index)) result.push(index);
    index = text.indexOf(token, index + token.length);
  }
  return result;
}

const DISPLAY_ENVIRONMENTS = [
  "equation",
  "equation*",
  "align",
  "align*",
  "aligned",
  "alignat",
  "alignat*",
  "gather",
  "gather*",
  "gathered",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
  "cases",
  "array",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "split",
  "subequations",
];

const ENVIRONMENT_RE = new RegExp(
  `\\\\begin\\{(${DISPLAY_ENVIRONMENTS.map((name) => name.replace("*", "\\*")).join("|")})\\}([\\s\\S]*?)\\\\end\\{\\1\\}`,
  "g",
);

/** Splits a text segment into inline-code and plain parts. */
export function splitInlineCode(text: string): MarkdownSegment[] {
  const parts: MarkdownSegment[] = [];
  let index = 0;
  let buffer = "";
  while (index < text.length) {
    if (text[index] === "`") {
      const run = /^`+/.exec(text.slice(index))?.[0] ?? "`";
      const close = text.indexOf(run, index + run.length);
      if (close === -1) {
        // Unclosed inline code while streaming: leave the text untouched.
        buffer += text.slice(index);
        index = text.length;
        break;
      }
      if (buffer) {
        parts.push({ type: "text", value: buffer, fence: null, closed: true });
        buffer = "";
      }
      parts.push({
        type: "code",
        value: text.slice(index, close + run.length),
        fence: run,
        closed: true,
      });
      index = close + run.length;
      continue;
    }
    buffer += text[index];
    index++;
  }
  if (buffer) parts.push({ type: "text", value: buffer, fence: null, closed: true });
  return parts;
}

function applyMathDelimiters(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `\n$$\n${math.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math: string) => `$${math.trim()}$`)
    .replace(ENVIRONMENT_RE, (match: string, env: string, body: string) =>
      match.includes("$$") ? match : `\n$$\n\\begin{${env}}${body}\\end{${env}}\n$$\n`,
    )
    .replace(/\$\$\s*\n\s*\$\$/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** Normalises LaTeX delimiters outside code fences *and* inline code. */
export function normalizeMathSegment(text: string): string {
  return splitInlineCode(text)
    .map((part) => (part.type === "code" ? part.value : applyMathDelimiters(part.value)))
    .join("");
}

/** Applies math normalisation to every non-code segment. */
export function normalizeMathMarkdown(markdown: string): string {
  return splitCodeSegments(markdown)
    .map((segment) =>
      segment.type === "code" ? segment.value : normalizeMathSegment(segment.value),
    )
    .join("\n");
}

/**
 * Removes a dangling opening delimiter so partial math shows as plain text
 * instead of swallowing the remaining answer (or crashing KaTeX).
 */
export function dropUnclosedDelimiters(text: string): string {
  const pairs: Array<[string, string]> = [
    ["$$", "$$"],
    ["\\[", "\\]"],
    ["\\(", "\\)"],
  ];
  let output = text;
  for (const [open, close] of pairs) {
    const opens = indicesOf(output, open);
    const closes = close === open ? opens : indicesOf(output, close);
    if (opens.length === 0) continue;
    const balanced = close === open ? opens.length % 2 === 0 : opens.length === closes.length;
    if (balanced) continue;
    const lastOpen = opens[opens.length - 1];
    const lastClose = close === open ? -1 : (closes[closes.length - 1] ?? -1);
    if (lastOpen === undefined || lastOpen < lastClose) continue;
    output = output.slice(0, lastOpen) + output.slice(lastOpen + open.length);
  }
  return output;
}

/**
 * Makes partially streamed markdown safe to render: closes an open code fence
 * and neutralises dangling math delimiters. Complete markdown is returned
 * unchanged.
 */
export function stabilizeStreamingMarkdown(markdown: string): string {
  const segments = splitCodeSegments(markdown);
  const openedFence = segments.find((segment) => segment.type === "code" && !segment.closed);
  const withClosedFence = openedFence?.fence ? `${markdown}\n${openedFence.fence}` : markdown;

  return splitCodeSegments(withClosedFence)
    .map((segment) =>
      segment.type === "code" ? segment.value : dropUnclosedDelimiters(segment.value),
    )
    .join("\n");
}

/** Full pipeline used by the message renderer. */
export function prepareMarkdown(markdown: string, options: { streaming?: boolean } = {}): string {
  const withMath = normalizeMathMarkdown(markdown);
  return options.streaming ? stabilizeStreamingMarkdown(withMath) : withMath;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Returns the href when it is safe to navigate to, otherwise null.
 * Blocks `javascript:`, `data:`, `vbscript:`, `file:` and similar payloads.
 */
export function sanitizeHref(raw: string | undefined): string | null {
  if (!raw) return null;
  const href = raw.trim();
  if (!href) return null;
  // Protocol-relative and in-page anchors are safe.
  if (
    href.startsWith("#") ||
    href.startsWith("/") ||
    href.startsWith("./") ||
    href.startsWith("../")
  ) {
    return href;
  }
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href);
  if (!match) return href; // relative URL without a scheme
  const protocol = `${(match[1] ?? "").toLowerCase()}:`;
  if (!SAFE_PROTOCOLS.has(protocol)) return null;
  if (protocol === "http:" || protocol === "https:") {
    try {
      const url = new URL(href);
      if (!url.hostname) return null;
      return url.toString();
    } catch {
      return null;
    }
  }
  return href;
}

/** True when clicking the link leaves the app. */
export function isExternalHref(href: string): boolean {
  return /^https?:/i.test(href.trim());
}

/** Converts markdown to something a speech synthesiser can read naturally. */
export function markdownToSpeechText(content: string): string {
  return splitCodeSegments(content)
    .map((segment) => (segment.type === "code" ? " bloco de código omitido " : segment.value))
    .join("\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " imagem ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$/g, " fórmula ")
    .replace(/\$[^$\n]+\$/g, " fórmula ")
    .replace(/\\\[[\s\S]*?\\\]/g, " fórmula ")
    .replace(/\\\([\s\S]*?\\\)/g, " fórmula ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/[*_~>]/g, "")
    .replace(/\|/g, " ")
    .replace(/https?:\/\/\S+/g, " ligação ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extracts the language of a fenced code block (e.g. ```ts → "ts"). */
export function codeLanguageFromClassName(className: unknown): string | null {
  if (typeof className !== "string") return null;
  const match = /language-([\w+#.-]+)/.exec(className);
  return match?.[1] ?? null;
}
