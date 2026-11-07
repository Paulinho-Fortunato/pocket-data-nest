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
});

export const NoteSchema = z.object({
  id: idSchema,
  title: z.string().trim().max(MAX_NOTE_TITLE).default(""),
  body: z.string().max(MAX_NOTE_BODY).default(""),
  updated: z.number().finite().nonnegative().default(0),
});

export const ChatMsgSchema = z.object({
  id: z.string().trim().max(64).optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_CHAT_CONTENT),
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
export const ChatSchema = z.array(ChatMsgSchema).max(MAX_MESSAGES);
export const ModelSchema = z.string().trim().min(1).max(MAX_MODEL_ID);
export const ApiKeySchema = z.string().max(MAX_API_KEY_LENGTH);

/** --- Documents ------------------------------------------------------------------ */

export const DocumentPageSchema = z.object({
  page: z.number().int().positive(),
  text: z.string(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
});

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
});

export const DocumentRecordSchema = z.object({
  schemaVersion: z.number().int().min(1),
  id: z.string().min(1),
  name: z.string().min(1).max(260),
  mime: z.string().max(160),
  size: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  totalChars: z.number().int().nonnegative(),
  truncated: z.literal(false),
  text: z.string(),
  pages: z.array(DocumentPageSchema).min(1),
  chunks: z.array(DocumentChunkSchema),
  warnings: z.array(z.string()).default([]),
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
});

export type BackupEnvelope = z.infer<typeof BackupEnvelopeSchema>;

export type ParsedStats = z.infer<typeof StatsSchema>;
export type ParsedCard = z.infer<typeof CardSchema>;
export type ParsedNote = z.infer<typeof NoteSchema>;
export type ParsedChatMsg = z.infer<typeof ChatMsgSchema>;
