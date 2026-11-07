import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  PREFERENCES_VERSION,
  PreferencesSchema,
  applyPreferences,
  loadPreferences,
  preferencesBootScript,
  resolveTheme,
  sanitizePreferences,
  savePreferences,
  usePreferences,
} from "../lib/preferences";
import { STORAGE_PREFIX } from "../lib/store";

describe("personalization preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.removeAttribute("data-density");
  });

  it("starts from the documented defaults", () => {
    expect(DEFAULT_PREFERENCES.version).toBe(PREFERENCES_VERSION);
    expect(DEFAULT_PREFERENCES.theme).toBe("dark");
    expect(DEFAULT_PREFERENCES.accent).toBe("dourado");
    expect(DEFAULT_PREFERENCES.density).toBe("confortavel");
    expect(DEFAULT_PREFERENCES.animations).toBe(true);
    expect(DEFAULT_PREFERENCES.autoSaveGeneratedCards).toBe(false);
    expect(DEFAULT_PREFERENCES.confirmDelete).toBe(true);
    expect(DEFAULT_PREFERENCES.speechRate).toBe(1);
  });

  it("sanitises field by field instead of discarding the whole file", () => {
    const migrated = sanitizePreferences({
      theme: "light",
      accent: "azul",
      density: "inventado",
      speechRate: 9,
      unknown: true,
      version: 1,
    });
    expect(migrated.theme).toBe("light");
    expect(migrated.accent).toBe("azul");
    expect(migrated.density).toBe(DEFAULT_PREFERENCES.density);
    expect(migrated.speechRate).toBe(DEFAULT_PREFERENCES.speechRate);
    expect(migrated.version).toBe(PREFERENCES_VERSION);
    expect("unknown" in migrated).toBe(false);
    expect(() => PreferencesSchema.parse(migrated)).not.toThrow();
  });

  it("falls back to defaults for corrupted storage", () => {
    localStorage.setItem(STORAGE_PREFIX + PREFERENCES_KEY, "not json");
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("applies preferences through data attributes on <html>", () => {
    const meta = document.createElement("meta");
    meta.id = "theme-color-meta";
    meta.name = "theme-color";
    document.head.appendChild(meta);

    applyPreferences({
      ...DEFAULT_PREFERENCES,
      theme: "light",
      accent: "verde",
      animations: false,
    });
    const root = document.documentElement;
    expect(root.dataset["theme"]).toBe("light");
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.dataset["accent"]).toBe("verde");
    expect(root.dataset["motion"]).toBe("reduced");
    expect(meta.content).toBe("#f7f4ec");

    applyPreferences({ ...DEFAULT_PREFERENCES, theme: "dark" });
    expect(root.dataset["theme"]).toBe("dark");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.dataset["motion"]).toBe("full");
    expect(meta.content).toBe("#0b0b0b");
  });

  it("resolves the automatic theme and persists updates", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    expect(["dark", "light"]).toContain(resolveTheme("auto"));

    const saved = savePreferences({ ...DEFAULT_PREFERENCES, fontSize: "grande" });
    expect(saved.fontSize).toBe("grande");
    expect(loadPreferences().fontSize).toBe("grande");
  });

  it("updates and resets preferences through the hook", () => {
    const { result } = renderHook(() => usePreferences());
    act(() => result.current.update({ theme: "light", density: "compacta" }));
    expect(result.current.preferences.theme).toBe("light");
    expect(result.current.preferences.density).toBe("compacta");
    expect(loadPreferences().density).toBe("compacta");

    act(() => result.current.reset());
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it("boot script applies the theme before React hydrates", () => {
    const script = preferencesBootScript();
    expect(script).toContain("angostudy:preferences");
    expect(script).toContain("prefers-color-scheme");
    expect(script).toContain("prefers-reduced-motion");
    expect(script).toContain("dataset.theme");
    expect(script).not.toContain("<script");
  });
});
