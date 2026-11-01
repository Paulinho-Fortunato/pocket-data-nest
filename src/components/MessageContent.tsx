import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

function normalizeMath(content: string) {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `$$\n${math.trim()}\n$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math: string) => `$${math.trim()}$`)
    .replace(
      /(^|[^$])\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g,
      (_, prefix: string, math: string) => `${prefix}$$\n${math.trim()}\n$$`,
    )
    .replace(/(^|\n)\s*\\frac/g, "$1\\frac");
}

export function MessageContent({ content }: { content: string }) {
  return (
    <div className="message-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => <pre className="message-code-block">{children}</pre>,
          code: ({ className, children, ...props }) => (
            <code className={className ?? "message-inline-code"} {...props}>
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div className="message-table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
  );
}
