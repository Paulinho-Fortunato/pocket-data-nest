import { describe, expect, it } from "vitest";

import { contextCharBudget, getModelCapabilities } from "../lib/agent/model-capabilities";
import { MODEL_GROUPS, MODEL_OPTIONS } from "../lib/model-catalog";

const NEW_FREE_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "cohere/north-mini-code:free",
  "liquid/lfm-2.5-2.6b:free",
];

describe("model catalog", () => {
  it("offers the new free chat models", () => {
    const ids = MODEL_OPTIONS.map((option) => option.id);
    for (const id of NEW_FREE_MODELS) {
      expect(ids, id).toContain(id);
    }
  });

  it("keeps non-chat free models out of the tutor picker", () => {
    const ids = MODEL_OPTIONS.map((option) => option.id).join("\n");
    expect(ids).not.toMatch(/embedding|rerank|span-01|s2\.1-pro-free/i);
  });

  it("has unique ids and a group for every option", () => {
    const ids = MODEL_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    const grouped = MODEL_GROUPS.flatMap((group) => group.models);
    expect(grouped).toHaveLength(MODEL_OPTIONS.length);
  });

  it("marks every catalog free route as free and keeps tools conservative", () => {
    for (const option of MODEL_OPTIONS) {
      const caps = getModelCapabilities(option.id);
      if (option.id.includes(":free")) {
        expect(caps.free, option.id).toBe(true);
        expect(caps.nativeTools, option.id).toBe(false);
        expect(caps.streaming, option.id).toBe(true);
      }
    }
  });

  it("knows the advertised context windows", () => {
    expect(getModelCapabilities("google/gemma-4-31b-it:free").contextTokens).toBe(262_000);
    expect(getModelCapabilities("google/gemma-4-26b-a4b-it:free").contextTokens).toBe(262_000);
    expect(getModelCapabilities("nvidia/nemotron-3-ultra-550b-a55b:free").contextTokens).toBe(
      1_000_000,
    );
    expect(getModelCapabilities("nvidia/nemotron-3.5-lightning:free").contextTokens).toBe(
      1_000_000,
    );
    expect(getModelCapabilities("dots-studio/dots-3-note-preview:free").contextTokens).toBe(
      512_000,
    );
    expect(
      getModelCapabilities("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free").contextTokens,
    ).toBe(256_000);
    expect(getModelCapabilities("cohere/north-mini-code:free").contextTokens).toBe(256_000);
    expect(getModelCapabilities("liquid/lfm-2.5-2.6b:free").contextTokens).toBe(66_000);
  });

  it("gives long-context models a much larger document budget than Gemma 2", () => {
    const small = contextCharBudget(getModelCapabilities("google/gemma-2-9b-it:free"));
    const large = contextCharBudget(getModelCapabilities("nvidia/nemotron-3-ultra-550b-a55b:free"));
    expect(large).toBeGreaterThan(small * 3);
    expect(large).toBeGreaterThanOrEqual(100_000);
  });

  it("records vision only where the model accepts images", () => {
    expect(getModelCapabilities("google/gemma-4-31b-it:free").vision).toBe(true);
    expect(getModelCapabilities("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free").vision).toBe(
      true,
    );
    expect(getModelCapabilities("cohere/north-mini-code:free").vision).toBe(false);
    expect(getModelCapabilities("liquid/lfm-2.5-2.6b:free").vision).toBe(false);
  });
});
