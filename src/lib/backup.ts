import {
  BACKUP_KEY_SCHEMAS,
  BackupEnvelopeSchema,
  DATA_SCHEMA_VERSION,
  SECRET_KEYS,
  type BackupEnvelope,
  type BackupKey,
} from "./schemas";
import { readStore, removeStore, STORAGE_PREFIX, writeStore } from "./store";

/**
 * Backup/restore with schema validation and migrations.
 *
 * Rules:
 *  - the OpenRouter key is never exported *or* imported;
 *  - only allow-listed `angostudy:` keys are accepted;
 *  - every value is validated with Zod before touching localStorage;
 *  - replace vs merge is an explicit user choice.
 */

export const BACKUP_APP = "AngoStudy";
export const BACKUP_TYPE = "backup";

export const ALLOWED_BACKUP_KEYS = Object.keys(BACKUP_KEY_SCHEMAS) as BackupKey[];

export type MergeStrategy = "replace" | "merge";

export type BackupData = Partial<Record<BackupKey, unknown>>;

export type BackupBuildResult = {
  envelope: BackupEnvelope;
  /** Keys that existed but could not be serialised (they are skipped). */
  skipped: string[];
};

export function buildBackup(now: Date = new Date()): BackupBuildResult {
  const data: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const key of ALLOWED_BACKUP_KEYS) {
    if (typeof localStorage === "undefined") break;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw) as unknown;
    } catch {
      skipped.push(key.replace(STORAGE_PREFIX, ""));
    }
  }
  const parsed = BackupEnvelopeSchema.safeParse({
    app: BACKUP_APP,
    type: BACKUP_TYPE,
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data,
  });
  const envelope: BackupEnvelope = parsed.success
    ? parsed.data
    : {
        app: BACKUP_APP,
        type: BACKUP_TYPE,
        schemaVersion: DATA_SCHEMA_VERSION,
        exportedAt: now.toISOString(),
        data: {},
      };
  return { envelope, skipped };
}

export function serializeBackup(result: BackupBuildResult): string {
  return JSON.stringify(result.envelope, null, 2);
}

/** Migrations keyed by the version they upgrade *from*. */
export const BACKUP_MIGRATIONS: Record<
  number,
  (data: Record<string, unknown>) => Record<string, unknown>
> = {
  // v0 → v1: legacy flat maps stored values as JSON *strings* under `angostudy:*`.
  0: (data) => {
    const migrated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== "string") {
        migrated[key] = value;
        continue;
      }
      try {
        migrated[key] = JSON.parse(value) as unknown;
      } catch {
        // Keep the raw value; per-key validation will reject it with a message.
        migrated[key] = value;
      }
    }
    return migrated;
  },
};

export function migrateBackup(
  data: Record<string, unknown>,
  fromVersion: number,
  toVersion: number = DATA_SCHEMA_VERSION,
): Record<string, unknown> {
  let current = data;
  for (let version = fromVersion; version < toVersion; version++) {
    const migration = BACKUP_MIGRATIONS[version];
    if (migration) current = migration(current);
  }
  return current;
}

export type ParsedBackup = {
  ok: true;
  envelope: BackupEnvelope;
  values: BackupData;
  warnings: string[];
  migratedFrom: number;
};

export type BackupFailure = { ok: false; error: string };

function looksLikeLegacyBackup(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length > 0 && keys.every((key) => key.startsWith(STORAGE_PREFIX));
}

/** Parses, validates and migrates a backup file. */
export function parseBackup(raw: string): ParsedBackup | BackupFailure {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: "O ficheiro não é um JSON válido." };
  }

  let envelopeInput: unknown;
  let migratedFrom = DATA_SCHEMA_VERSION;

  if (looksLikeLegacyBackup(json)) {
    // Old exports were a flat `{ "angostudy:key": "<json string>" }` object.
    envelopeInput = {
      app: BACKUP_APP,
      type: BACKUP_TYPE,
      schemaVersion: DATA_SCHEMA_VERSION,
      data: migrateBackup(json, 0),
    };
    migratedFrom = 0;
  } else {
    const envelope = BackupEnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      return {
        ok: false,
        error:
          "Formato de cópia de segurança não reconhecido: falta a assinatura AngoStudy ou a versão do schema.",
      };
    }
    if (envelope.data.schemaVersion > DATA_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Esta cópia foi criada por uma versão mais recente do AngoStudy (schema ${envelope.data.schemaVersion}). Atualiza a aplicação antes de importar.`,
      };
    }
    const migrated = migrateBackup(envelope.data.data, envelope.data.schemaVersion);
    envelopeInput = { ...envelope.data, data: migrated };
    migratedFrom = envelope.data.schemaVersion;
  }

  const envelope = BackupEnvelopeSchema.safeParse(envelopeInput);
  if (!envelope.success) {
    return { ok: false, error: "Cópia de segurança inválida." };
  }

  const warnings: string[] = [];
  const values: BackupData = {};
  const unknownKeys: string[] = [];
  const invalidKeys: string[] = [];

  for (const [key, value] of Object.entries(envelope.data.data)) {
    if ((SECRET_KEYS as readonly string[]).includes(key)) {
      warnings.push("A chave OpenRouter foi ignorada: segredos nunca são importados.");
      continue;
    }
    if (!(key in BACKUP_KEY_SCHEMAS)) {
      unknownKeys.push(key);
      continue;
    }
    const schema = BACKUP_KEY_SCHEMAS[key as BackupKey];
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      invalidKeys.push(key.replace(STORAGE_PREFIX, ""));
      continue;
    }
    values[key as BackupKey] = parsed.data;
  }

  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `A cópia contém chaves não permitidas: ${unknownKeys.join(", ")}. Nada foi importado.`,
    };
  }
  if (invalidKeys.length > 0) {
    return {
      ok: false,
      error: `Dados inválidos em: ${invalidKeys.join(", ")}. Nada foi importado.`,
    };
  }

  return { ok: true, envelope: envelope.data, values, warnings, migratedFrom };
}

function mergeStats(current: unknown, incoming: unknown): unknown {
  if (!current || typeof current !== "object") return incoming;
  const a = current as Record<string, unknown>;
  const b = incoming as Record<string, unknown>;
  const numericKeys = [
    "xp",
    "quizzes",
    "correct",
    "answered",
    "reviewed",
    "focusMinutes",
    "sessions",
  ] as const;
  const merged: Record<string, unknown> = { ...a, ...b };
  for (const key of numericKeys) {
    const left = typeof a[key] === "number" ? (a[key] as number) : 0;
    const right = typeof b[key] === "number" ? (b[key] as number) : 0;
    merged[key] = Math.max(left, right);
  }
  const days = new Set<string>([
    ...(Array.isArray(a["days"]) ? (a["days"] as string[]) : []),
    ...(Array.isArray(b["days"]) ? (b["days"] as string[]) : []),
  ]);
  merged["days"] = Array.from(days).sort();
  // Keep the current profile name unless it is still the default one.
  merged["name"] = a["name"] && a["name"] !== "Estudante" ? a["name"] : b["name"];
  return merged;
}

function mergeById<T extends { id: string }>(
  current: T[],
  incoming: T[],
  preferIncoming: (current: T, incoming: T) => boolean = () => true,
): T[] {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    if (preferIncoming(existing, item)) map.set(item.id, { ...existing, ...item });
  }
  return Array.from(map.values());
}

/** Merges a validated backup with what is already stored. */
export function mergeBackupValues(values: BackupData, strategy: MergeStrategy): BackupData {
  if (strategy === "replace") return values;
  const merged: BackupData = { ...values };

  const incomingStats = values["angostudy:stats"];
  if (incomingStats !== undefined) {
    merged["angostudy:stats"] = mergeStats(readStore<unknown>("stats", null), incomingStats);
  }

  const incomingCards = values["angostudy:cards"];
  if (incomingCards !== undefined) {
    merged["angostudy:cards"] = mergeById(
      readStore<{ id: string }[]>("cards", []),
      incomingCards as { id: string }[],
    );
  }

  const incomingNotes = values["angostudy:notes"];
  if (incomingNotes !== undefined) {
    merged["angostudy:notes"] = mergeById(
      readStore<{ id: string; updated: number }[]>("notes", []),
      incomingNotes as { id: string; updated: number }[],
      (current, incoming) => incoming.updated >= current.updated,
    );
  }

  const incomingChat = values["angostudy:chat"];
  if (incomingChat !== undefined) {
    const currentChat = readStore<unknown[]>("chat", []);
    merged["angostudy:chat"] = [...currentChat, ...(incomingChat as unknown[])].slice(-500);
  }

  const incomingModel = values["angostudy:openrouter_model"];
  if (incomingModel !== undefined && readStore<string>("openrouter_model", "").trim()) {
    // Never silently change the user's model selection on merge.
    delete merged["angostudy:openrouter_model"];
  }

  return merged;
}

export type ApplyBackupResult = {
  written: string[];
  secretKeysPreserved: boolean;
};

/** Writes validated values to localStorage. Secrets are always untouched. */
export function applyBackup(values: BackupData, strategy: MergeStrategy): ApplyBackupResult {
  const merged = mergeBackupValues(values, strategy);
  const written: string[] = [];
  for (const key of ALLOWED_BACKUP_KEYS) {
    if (!(key in merged)) continue;
    const schema = BACKUP_KEY_SCHEMAS[key];
    const parsed = schema.safeParse(merged[key]);
    if (!parsed.success) continue;
    writeStore(key.replace(STORAGE_PREFIX, ""), parsed.data);
    written.push(key);
  }
  return { written, secretKeysPreserved: true };
}

/** Human readable preview shown before the user confirms the import. */
export function describeBackup(values: BackupData): string[] {
  const lines: string[] = [];
  const cards = values["angostudy:cards"];
  if (Array.isArray(cards)) lines.push(`${cards.length} flashcards`);
  const notes = values["angostudy:notes"];
  if (Array.isArray(notes)) lines.push(`${notes.length} notas`);
  const chat = values["angostudy:chat"];
  if (Array.isArray(chat)) lines.push(`${chat.length} mensagens`);
  if (values["angostudy:stats"]) lines.push("progresso");
  if (values["angostudy:openrouter_model"]) lines.push("modelo de IA");
  return lines;
}

export function deleteAllAppData() {
  if (typeof localStorage === "undefined") return;
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(STORAGE_PREFIX));
  for (const key of keys) removeStore(key.replace(STORAGE_PREFIX, ""));
}
