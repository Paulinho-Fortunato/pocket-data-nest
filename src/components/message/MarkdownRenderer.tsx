import { isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

import { CodeBlock } from "../CodeBlock";
import { codeLanguageFromClassName, isExternalHref, sanitizeHref } from "@/lib/markdown";

/**
 * Heavy markdown pipeline (react-markdown + remark + micromark + KaTeX).
 *
 * This module is loaded with `React.lazy` from `MessageContent` so the
 * initial bundle of the app does not include ~300 kB of markdown machinery.
 */

/** Matches `\(`, `\[`, `$$` or inline `$...$`. */
const KATEX_PATTERN = /\\\(|\\\[|\$\$|\$[^$\n]+\$/;

const katexOptions = {
  // Never let a half-typed formula break the whole message: KaTeX renders the
  // offending source in red instead of throwing.
  throwOnError: false,
  strict: false as const,
  errorColor: "#f87171",
  trust: false,
};

type Pluggable = readonly [unknown, Record<string, unknown>];

/**
 * KaTeX (~250 kB) is fetched only when a message actually contains maths.
 * Until it resolves the formula text is shown verbatim — a readable fallback
 * that hydrates identically on the server.
 */
function useLazyKatex(enabled: boolean): Pluggable[] {
  const [plugins, setPlugins] = useState<Pluggable[]>([]);
  useEffect(() => {
    if (!enabled || plugins.length > 0) return;
    let cancelled = false;
    void import("rehype-katex")
      .then((module) => {
        if (!cancelled) setPlugins([[(module.default ?? module) as unknown, katexOptions]]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, plugins.length]);
  return plugins;
}

function nodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    return nodeToText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

const markdownComponents: Components = {
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    const props = isValidElement(child)
      ? (child.props as { className?: string; children?: ReactNode })
      : undefined;
    const code = nodeToText(props?.children ?? children).replace(/\n$/, "");
    const language = codeLanguageFromClassName(props?.className);
    return <CodeBlock code={code} language={language} />;
  },
  code: ({ className, children, ...props }) => {
    const language = codeLanguageFromClassName(className);
    if (language) {
      // Fenced block: `pre` already rendered the toolbar and the code itself.
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="message-inline-code" {...props}>
        {children}
      </code>
    );
  },
  a: ({ href, children, ...props }) => {
    const safeHref = sanitizeHref(href);
    if (!safeHref) {
      return (
        <span className="message-link-blocked" title="Ligação removida por segurança">
          {children}
        </span>
      );
    }
    const external = isExternalHref(safeHref);
    return (
      <a
        {...props}
        href={safeHref}
        className="message-link"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
        {external ? (
          <>
            <span aria-hidden="true"> ↗</span>
            <span className="sr-only"> (abre numa nova janela)</span>
          </>
        ) : null}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="message-table-wrap" tabIndex={0} role="region" aria-label="Tabela">
      <table>{children}</table>
    </div>
  ),
  input: ({ checked, ...props }) => <input {...props} checked={checked} disabled readOnly />,
  img: ({ alt }) => (
    <span className="message-image-placeholder">[imagem: {alt ?? "sem descrição"}]</span>
  ),
};

export type MarkdownRendererProps = {
  prepared: string;
};

export default function MarkdownRenderer({ prepared }: MarkdownRendererProps) {
  const rehypePlugins = useLazyKatex(KATEX_PATTERN.test(prepared));
  const plugins = useMemo(() => rehypePlugins, [rehypePlugins]);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
      rehypePlugins={plugins as never}
      components={markdownComponents}
      // Raw HTML from the model is never rendered.
      skipHtml
    >
      {prepared}
    </ReactMarkdown>
  );
}
