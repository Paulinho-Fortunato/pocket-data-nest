import type { ParsedChatMsg } from "@/lib/schemas";

/** A source shown under an answer ("p. 12–14" etc.). */
export type TutorSource = {
  name: string;
  pageStart?: number;
  pageEnd?: number;
  documentId?: string;
};

export type TutorError = {
  message: string;
  retryable: boolean;
  code?: "offline" | "no-key" | "network" | "unknown";
};

/**
 * UI-only state on top of the persisted message: errors and the "stopped"
 * marker are ephemeral and never written to storage.
 */
export type TutorMessage = ParsedChatMsg & {
  error?: TutorError;
  stopped?: boolean;
};

export function formatMessageTime(timestamp?: number): string {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Header subtitle for the active document (pages + characters). */
export function documentSubtitle(document: {
  totalPages: number;
  totalChars: number;
  status: string;
  processedPages: number;
}): string {
  if (document.status === "partial") {
    return `${document.processedPages}/${document.totalPages} pág. · ${formatChars(document.totalChars)}`;
  }
  return `${document.totalPages} pág. · ${formatChars(document.totalChars)}`;
}

export function formatChars(chars: number): string {
  if (chars < 1000) return `${chars} caracteres`;
  return `${(chars / 1000).toFixed(chars < 10_000 ? 1 : 0)} mil caracteres`;
}
