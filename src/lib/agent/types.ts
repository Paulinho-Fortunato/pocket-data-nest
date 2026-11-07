import type { DocumentRecord } from "@/lib/documents";
import type { ChatMsg } from "@/lib/store";

export type AgentToolName =
  | "search_document"
  | "get_document_chunk"
  | "summarize_document"
  | "create_flashcards"
  | "create_quiz"
  | "calculate"
  | "list_user_documents";

export const AGENT_TOOLS: AgentToolName[] = [
  "search_document",
  "get_document_chunk",
  "summarize_document",
  "create_flashcards",
  "create_quiz",
  "calculate",
  "list_user_documents",
];

export type AgentStatus =
  | "idle"
  | "preparing"
  | "thinking"
  | "using-tool"
  | "streaming"
  | "completed"
  | "error"
  | "cancelled";

export type AgentProgress = {
  status: AgentStatus;
  label: string;
  tool?: AgentToolName;
  step?: number;
};

export type AgentSource = {
  name: string;
  documentId: string;
  pageStart?: number;
  pageEnd?: number;
};

export type AgentToolEvent = {
  tool: AgentToolName;
  ok: boolean;
  ms: number;
  summary: string;
};

export type AgentDocument = Pick<
  DocumentRecord,
  "id" | "name" | "chunks" | "totalChars" | "totalPages" | "status"
>;

export type AgentRunOptions = {
  query: string;
  history: ChatMsg[];
  documents: AgentDocument[];
  /** Active document chosen by the user in the composer. */
  documentId?: string | null;
  model: string;
  system: string;
  signal: AbortSignal;
  onProgress?: (progress: AgentProgress) => void;
  onDelta?: (delta: string) => void;
  maxSteps?: number;
  /** Total deadline for planning + tools (streaming final answer excluded). */
  totalTimeoutMs?: number;
  toolTimeoutMs?: number;
  /** Injectable for tests: returns the planner's raw text. */
  callPlanner?: (prompt: PlannerPrompt) => Promise<string>;
  /** Injectable for tests: streams the final answer. */
  callFinal?: (
    messages: ChatMsg[],
    system: string,
    onDelta: (delta: string) => void,
    signal: AbortSignal,
  ) => Promise<string>;
};

export type PlannerPrompt = {
  system: string;
  messages: ChatMsg[];
};

export type AgentResult = {
  text: string;
  status: "completed" | "cancelled" | "error";
  tools: AgentToolEvent[];
  sources: AgentSource[];
  steps: number;
  fallbackUsed: boolean;
  error?: string;
};
