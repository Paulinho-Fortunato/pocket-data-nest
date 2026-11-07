import { lazy, memo, Suspense, useMemo } from "react";

import { prepareMarkdown } from "@/lib/markdown";

/**
 * The markdown renderer and its plugins are code-split: pages that never show a
 * chat message (dashboard, quiz, focus…) do not download react-markdown,
 * remark, micromark or KaTeX.
 */
const MarkdownRenderer = lazy(() => import("./message/MarkdownRenderer"));

export type MessageContentProps = {
  content: string;
  /** Tolerate partially streamed markdown (open fences, dangling math). */
  isStreaming?: boolean;
};

function MessageContentImpl({ content, isStreaming = false }: MessageContentProps) {
  const prepared = useMemo(
    () => prepareMarkdown(content, { streaming: isStreaming }),
    [content, isStreaming],
  );

  return (
    <div className="message-content">
      <Suspense
        fallback={
          // Server render and the first client frame show the raw text, which is
          // readable and hydrates without mismatches.
          <div className="message-content-fallback whitespace-pre-wrap">{content}</div>
        }
      >
        <MarkdownRenderer prepared={prepared} />
      </Suspense>
    </div>
  );
}

/**
 * Memoised: a streaming answer re-renders once per delta, and every other
 * message in the list keeps its previous tree.
 */
export const MessageContent = memo(MessageContentImpl);
MessageContent.displayName = "MessageContent";
