/**
 * Capability table for OpenRouter models.
 *
 * We never assume that a free model supports streaming, tools or a large
 * context. Unknown models get the conservative profile: streaming + structured
 * JSON, no native tool calling, 32k context.
 */

export type ModelCapabilities = {
  id: string;
  streaming: boolean;
  /** Accepts "respond only with JSON" reliably enough for the agent fallback. */
  jsonMode: boolean;
  /** OpenAI-compatible `tools` / `tool_calls` are available. */
  nativeTools: boolean;
  vision: boolean;
  contextTokens: number;
  free: boolean;
};

type Profile = Partial<Omit<ModelCapabilities, "id">>;

const CONSERVATIVE: ModelCapabilities = {
  id: "unknown",
  streaming: true,
  jsonMode: true,
  nativeTools: false,
  vision: false,
  contextTokens: 32_000,
  free: false,
};

/** Substring → profile. The first match wins (order matters). */
const CATALOG: [RegExp, Profile][] = [
  [/openrouter\/auto/i, { contextTokens: 32_000, nativeTools: false, free: false }],
  [
    /gpt-4o-mini|gpt-4\.1-mini|gpt-4o/i,
    { nativeTools: true, vision: true, contextTokens: 128_000 },
  ],
  [/claude/i, { nativeTools: true, vision: true, contextTokens: 200_000 }],
  [/gemini/i, { nativeTools: true, vision: true, contextTokens: 1_000_000 }],
  [/llama-3\.3/i, { nativeTools: true, contextTokens: 131_072 }],
  [/llama-3\.1|llama-3\.2/i, { nativeTools: true, contextTokens: 131_072 }],
  [/gemma-4/i, { nativeTools: true, vision: true, contextTokens: 262_000 }],
  [/gemma-2/i, { nativeTools: false, contextTokens: 8_192 }],
  [/nemotron-3.*ultra|nemotron-3\.5-lightning/i, { contextTokens: 1_000_000 }],
  [/nemotron-3.*(nano|omni)/i, { vision: true, contextTokens: 256_000 }],
  [/north-mini-code/i, { contextTokens: 256_000 }],
  [/dots-3/i, { vision: true, contextTokens: 512_000 }],
  [/lfm-?2\.5/i, { contextTokens: 66_000 }],
  [/deepseek-r1/i, { nativeTools: false, contextTokens: 65_536 }],
  [/mistral|mixtral/i, { nativeTools: true, contextTokens: 32_768 }],
  [/qwen/i, { nativeTools: true, contextTokens: 32_768 }],
];

export function getModelCapabilities(modelId: string): ModelCapabilities {
  const id = (modelId || "openrouter/auto").trim();
  const profile = CATALOG.find(([pattern]) => pattern.test(id))?.[1] ?? {};
  const free = /:free\b/i.test(id);
  return {
    ...CONSERVATIVE,
    ...profile,
    id,
    free,
    // Free routes vary by upstream provider: use the validated JSON fallback
    // unless the user explicitly picks a paid model with known tool support.
    nativeTools: free ? false : (profile.nativeTools ?? false),
  };
}

/** Characters we are willing to send, leaving room for the answer. */
export function contextCharBudget(caps: ModelCapabilities, reserveTokens = 2_000): number {
  const usableTokens = Math.max(2_000, caps.contextTokens - reserveTokens);
  // ~3.2 characters per token is a safe approximation for Portuguese text.
  return Math.min(120_000, Math.floor(usableTokens * 3.2));
}

export function describeModel(caps: ModelCapabilities): string {
  return [
    caps.id,
    caps.free ? "gratuito" : "pago",
    `contexto ~${Math.round(caps.contextTokens / 1000)}k tokens`,
    caps.nativeTools ? "ferramentas nativas" : "ferramentas por JSON",
  ].join(" · ");
}
