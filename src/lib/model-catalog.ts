/**
 * Chat models offered in Definições.
 *
 * Only text-in/text-out chat models belong here. OpenRouter also lists
 * embedding, reranking, speech and behaviour-scoring models as "free", but
 * they cannot answer a tutor message, so selecting one would only produce an
 * error. Keep those out of the tutor's model picker.
 */

export type ModelOption = {
  id: string;
  label: string;
};

export type ModelGroup = {
  label: string;
  models: ModelOption[];
};

export const MODEL_GROUPS: readonly ModelGroup[] = [
  {
    label: "Recomendado",
    models: [{ id: "openrouter/auto", label: "Automático (o OpenRouter escolhe)" }],
  },
  {
    label: "Gratuitos",
    models: [
      {
        id: "google/gemma-4-31b-it:free",
        label: "Gemma 4 31B · grátis · 262k contexto",
      },
      {
        id: "google/gemma-4-26b-a4b-it:free",
        label: "Gemma 4 26B A4B · grátis · 262k contexto",
      },
      {
        id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        label: "Nemotron 3 Ultra 550B · grátis · 1M contexto",
      },
      {
        id: "nvidia/nemotron-3.5-lightning:free",
        label: "Nemotron 3.5 Lightning · grátis · 1M contexto",
      },
      {
        id: "dots-studio/dots-3-note-preview:free",
        label: "Dots3 Note Preview · grátis · 512k contexto",
      },
      {
        id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        label: "Nemotron 3 Nano Omni · grátis · 256k contexto",
      },
      {
        id: "cohere/north-mini-code:free",
        label: "North Mini Code · grátis · 256k contexto",
      },
      {
        id: "liquid/lfm-2.5-2.6b:free",
        label: "LFM2.5 2.6B · grátis · 66k contexto · até 13 nov",
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        label: "Llama 3.3 70B · grátis · 128k contexto",
      },
      {
        id: "google/gemma-2-9b-it:free",
        label: "Gemma 2 9B · grátis · 8k contexto",
      },
      {
        id: "deepseek/deepseek-r1-distill-llama-70b:free",
        label: "DeepSeek R1 70B · grátis · 64k contexto",
      },
    ],
  },
  {
    label: "Pagos",
    models: [{ id: "openai/gpt-4o-mini", label: "GPT-4o Mini · pago · 128k contexto" }],
  },
];

export const MODEL_OPTIONS: readonly ModelOption[] = MODEL_GROUPS.flatMap((group) => group.models);

export function findModelOption(id: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((option) => option.id === id);
}
