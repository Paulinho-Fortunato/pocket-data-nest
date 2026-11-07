import { z } from "zod";

/**
 * Zod schemas for everything the app persists or parses from the network.
 *
 * The persisted payloads live under `angostudy:*` keys in localStorage and were
 * written before validation existed. Every schema here is therefore tolerant on
 * *unknown* fields but strict on the fields the UI relies on, so that an old or
 * partially corrupted value degrades to a recoverable state instead of crashing
 * a route.
 */

/** Version of the persisted data shape. Bump it and add a migration when it changes. */
export const DATA_SCHEMA_VERSION = 1;

/** Version of the IndexedDB `DocumentRecord` shape. */
export const DOCUMENT_SCHEMA_VERSION = 1;

export const MAX_NOTE_TITLE = 200;
export const MAX_NOTE_BODY = 40_000;
export const MAX_CHAT_CONTENT = 60_000;
export const MAX_CARD_QUESTION = 500;
export const MAX_CARD_ANSWER = 4_000;
export const MAX_DECK_NAME = 80;
export const MAX_CARDS = 5_000;
export const MAX_NOTES = 1_000;
export const MAX_MESSAGES = 500;
export const MAX_MODEL_ID = 120;
export const MAX_API_KEY_LENGTH = 400;

const idSchema = z.string().trim().min(1).max(64);

export const CardSchema = z.object({
  id: idSchema,
  q: z.string().trim().min(1, "Pergunta vazia").max(MAX_CARD_QUESTION),
  a: z.string().trim().min(1, "Resposta vazia").max(MAX_CARD_ANSWER),
  deck: z.string().trim().max(MAX_DECK_NAME).default("Geral"),
  known: z.boolean().default(false),
  /** True only for cards loaded from the optional example deck. */
  demo: z.boolean().optional(),
  /** Where the card came from, e.g. "p. 12" or "Documento: biologia.pdf". */
  source: z.string().trim().max(200).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

export const NoteSchema = z.object({
  id: idSchema,
  title: z.string().trim().max(MAX_NOTE_TITLE).default(""),
  body: z.string().max(MAX_NOTE_BODY).default(""),
  updated: z.number().finite().nonnegative().default(0),
});

export const ChatSourceSchema = z.object({
  name: z.string().trim().max(200),
  pageStart: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
  documentId: z.string().max(80).optional(),
});

export const ChatMsgSchema = z.object({
  id: z.string().trim().max(64).optional(),
  role: z.enum(["user", "assistant"]),
  /**
   * Long streamed answers are legitimate. Truncate instead of rejecting the
   * message: rejecting one message used to invalidate the whole conversation
   * on the next reload (see `chat-store.validated`).
   */
  content: z.string().transform((value) => value.slice(0, MAX_CHAT_CONTENT)),
  /** Wall-clock time of the message (survives reloads). */
  createdAt: z.number().int().nonnegative().optional(),
  /** Documents/chunks used to answer, shown as "Documento usado". */
  sources: z.array(ChatSourceSchema).max(8).optional(),
});

/** ISO `YYYY-MM-DD` activity days. */
export const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const StatsSchema = z.object({
  name: z.string().trim().max(60).default("Estudante"),
  xp: z.number().int().nonnegative().default(0),
  quizzes: z.number().int().nonnegative().default(0),
  correct: z.number().int().nonnegative().default(0),
  answered: z.number().int().nonnegative().default(0),
  reviewed: z.number().int().nonnegative().default(0),
  focusMinutes: z.number().int().nonnegative().default(0),
  sessions: z.number().int().nonnegative().default(0),
  weeklyGoal: z.number().int().min(1).max(50).default(6),
  days: z.array(DaySchema).max(3_650).default([]),
});

export const StatsListSchema = StatsSchema;
export const CardsSchema = z.array(CardSchema).max(MAX_CARDS);
export const NotesSchema = z.array(NoteSchema).max(MAX_NOTES);
/**
 * The array itself is intentionally unbounded here. The history loader keeps
 * the newest `MAX_MESSAGES` items **before** validating them; applying `.max`
 * at this layer made a 501st message erase the entire stored conversation.
 */
export const ChatSchema = z.array(ChatMsgSchema);
export const ModelSchema = z.string().trim().min(1).max(MAX_MODEL_ID);
export const ApiKeySchema = z.string().max(MAX_API_KEY_LENGTH);

/** --- Documents ------------------------------------------------------------------ */

export const DocumentPageSchema = z.object({
  page: z.number().int().positive(),
  text: z.string(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
});

export const DocumentStatusSchema = z.enum(["queued", "processing", "ready", "partial", "error"]);

export const DocumentChunkSchema = z.object({
  documentId: z.string().min(1),
  chunkId: z.string().min(1),
  index: z.number().int().nonnegative(),
  text: z.string(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
  hash: z.string().min(8),
  /** Checksum of the chunk text (same algorithm as `hashText`). */
  checksum: z.string().default(""),
  /** Chunk length in characters, kept for quick budget maths. */
  size: z.number().int().nonnegative().default(0),
  status: DocumentStatusSchema.default("ready"),
});

export const DocumentRecordSchema = z.object({
  schemaVersion: z.number().int().min(1),
  id: z.string().min(1),
  name: z.string().min(1).max(260),
  mime: z.string().max(160),
  size: z.number().int().nonnegative(),
  /** SHA-256 (or FNV fallback) of the file bytes — used to reuse extractions. */
  hash: z.string().max(128).default(""),
  status: DocumentStatusSchema.default("ready"),
  /** Pages successfully read so far (equals totalPages when status is ready). */
  processedPages: z.number().int().nonnegative().default(0),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative().default(0),
  totalPages: z.number().int().positive(),
  totalChars: z.number().int().nonnegative(),
  truncated: z.literal(false),
  text: z.string(),
  pages: z.array(DocumentPageSchema).min(1),
  chunks: z.array(DocumentChunkSchema),
  chunkCount: z.number().int().nonnegative().default(0),
  warnings: z.array(z.string()).default([]),
  error: z.string().max(2_000).optional(),
});

/** --- AI generation ---------------------------------------------------------------- */

export const GeneratedCardSchema = z.object({
  question: z.string().trim().min(3).max(2_000),
  answer: z.string().trim().min(1).max(6_000),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  source: z
    .object({
      pageStart: z.number().int().positive().optional(),
      pageEnd: z.number().int().positive().optional(),
      quote: z.string().max(600).optional(),
    })
    .optional(),
});

export const GeneratedCardListSchema = z.object({
  cards: z.array(GeneratedCardSchema).max(100),
});

export const GeneratedQuestionSchema = z.object({
  question: z.string().trim().min(3).max(2_000),
  type: z.enum(["multiple-choice", "true-false", "short-answer"]).default("multiple-choice"),
  options: z.array(z.string().trim().min(1).max(600)).max(8).optional(),
  correctAnswer: z.string().trim().min(1).max(2_000),
  explanation: z.string().max(2_000).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  source: z
    .object({
      pageStart: z.number().int().positive().optional(),
      pageEnd: z.number().int().positive().optional(),
      quote: z.string().max(600).optional(),
    })
    .optional(),
});

export const GeneratedQuizSchema = z.object({
  questions: z.array(GeneratedQuestionSchema).max(100),
});

/** --- Flashcard generation --------------------------------------------------------- */

export const FlashcardResponseSchema = z.object({
  flashcards: z
    .array(
      z.object({
        q: z.string().max(MAX_CARD_QUESTION * 2),
        a: z.string().max(MAX_CARD_ANSWER * 2),
      }),
    )
    .max(50),
});

/** Per-key schema used when importing a backup. Unknown keys are rejected. */
export const BACKUP_KEY_SCHEMAS = {
  "angostudy:stats": StatsSchema,
  "angostudy:cards": CardsSchema,
  "angostudy:notes": NotesSchema,
  "angostudy:chat": ChatSchema,
  "angostudy:openrouter_model": ModelSchema,
} as const;

export type BackupKey = keyof typeof BACKUP_KEY_SCHEMAS;

/** Keys that must never be written by a backup/import. */
export const SECRET_KEYS = ["angostudy:openrouter_key"] as const;

export const BackupEnvelopeSchema = z.object({
  app: z.literal("AngoStudy"),
  type: z.literal("backup").optional(),
  schemaVersion: z.number().int().min(1).max(999),
  exportedAt: z.string().max(40).optional(),
  data: z.record(z.string(), z.unknown()),
  /** Conversation IDB payload (the legacy `angostudy:chat` key is not enough). */
  chat: ChatSchema.optional(),
  /** Extracted documents live in IndexedDB, not in localStorage. */
  documents: z.array(DocumentRecordSchema).max(200).optional(),
});

export type BackupEnvelope = z.infer<typeof BackupEnvelopeSchema>;

export type ParsedStats = z.infer<typeof StatsSchema>;
export type ParsedCard = z.infer<typeof CardSchema>;
export type ParsedNote = z.infer<typeof NoteSchema>;
export type ParsedChatMsg = z.infer<typeof ChatMsgSchema>;
