import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

import { readStore, STORAGE_PREFIX, writeStore } from "./store";

/**
 * Versioned personalization model.
 *
 * Every option maps to a `data-*` attribute on `<html>` (or a CSS variable), so
 * the whole app reacts instantly and offline — no inline styles scattered
 * through components. Unknown/outdated values are sanitised field by field
 * instead of discarding the entire file.
 */

export const PREFERENCES_KEY = "preferences";
export const PREFERENCES_VERSION = 2;

export const ThemeSchema = z.enum(["dark", "light", "auto"]);
export const AccentSchema = z.enum(["dourado", "azul", "verde", "violeta", "rosa"]);
export const ContrastSchema = z.enum(["normal", "alto"]);
export const FontSizeSchema = z.enum(["pequeno", "normal", "grande"]);
export const DensitySchema = z.enum(["compacta", "confortavel", "espacosa"]);
export const ContentWidthSchema = z.enum(["estreita", "padrao", "larga"]);
export const NavPositionSchema = z.enum(["baixo", "topo"]);
export const NavModeSchema = z.enum(["completa", "compacta"]);
export const LanguageSchema = z.enum(["pt-PT", "en"]);
export const AiLanguageSchema = z.enum(["pt-PT", "en", "auto"]);

export const PreferencesSchema = z.object({
  version: z.number().int().min(1).default(PREFERENCES_VERSION),
  theme: ThemeSchema.default("dark"),
  accent: AccentSchema.default("dourado"),
  contrast: ContrastSchema.default("normal"),
  fontSize: FontSizeSchema.default("normal"),
  density: DensitySchema.default("confortavel"),
  contentWidth: ContentWidthSchema.default("padrao"),
  navPosition: NavPositionSchema.default("baixo"),
  navMode: NavModeSchema.default("completa"),
  showSuggestions: z.boolean().default(true),
  animations: z.boolean().default(true),
  smoothScroll: z.boolean().default(true),
  confirmDelete: z.boolean().default(true),
  autoSaveGeneratedCards: z.boolean().default(false),
  focusReading: z.boolean().default(false),
  uiLanguage: LanguageSchema.default("pt-PT"),
  aiLanguage: AiLanguageSchema.default("pt-PT"),
  voiceEnabled: z.boolean().default(false),
  speechRate: z.number().min(0.5).max(2).default(1),
});

export type Preferences = z.infer<typeof PreferencesSchema>;
export type ThemePreference = z.infer<typeof ThemeSchema>;
export type Accent = z.infer<typeof AccentSchema>;

export const DEFAULT_PREFERENCES: Preferences = PreferencesSchema.parse({});

/** Never throws: each field falls back individually. */
export function sanitizePreferences(raw: unknown): Preferences {
  const defaults = DEFAULT_PREFERENCES;
  if (!raw || typeof raw !== "object") return { ...defaults };
  const source = raw as Record<string, unknown>;
  const result = { ...defaults };
  for (const key of Object.keys(PreferencesSchema.shape) as (keyof Preferences)[]) {
    if (!(key in source)) continue;
    const field = PreferencesSchema.shape[key];
    const parsed = field.safeParse(source[key]);
    if (parsed.success) {
      // Type-level cast: the key and its schema always match.
      (result as Record<string, unknown>)[key] = parsed.data;
    }
  }
  result.version = PREFERENCES_VERSION;
  return result;
}

export function loadPreferences(): Preferences {
  return sanitizePreferences(readStore<unknown>(PREFERENCES_KEY, null));
}

export function savePreferences(preferences: Preferences): Preferences {
  const next = sanitizePreferences({ ...preferences, version: PREFERENCES_VERSION });
  writeStore(PREFERENCES_KEY, next);
  return next;
}

export const ACCENT_LABELS: Record<Accent, string> = {
  dourado: "Dourado",
  azul: "Azul",
  verde: "Verde",
  violeta: "Violeta",
  rosa: "Rosa",
};

export function systemTheme(): "dark" | "light" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(preference: ThemePreference): "dark" | "light" {
  return preference === "auto" ? systemTheme() : preference;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Applies every preference to `<html>` via data attributes + CSS variables. */
export function applyPreferences(preferences: Preferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = resolveTheme(preferences.theme);
  const reduced = !preferences.animations || prefersReducedMotion();

  root.dataset["theme"] = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  root.dataset["accent"] = preferences.accent;
  root.dataset["contrast"] = preferences.contrast;
  root.dataset["fontSize"] = preferences.fontSize;
  root.dataset["density"] = preferences.density;
  root.dataset["contentWidth"] = preferences.contentWidth;
  root.dataset["nav"] = preferences.navPosition;
  root.dataset["navMode"] = preferences.navMode;
  root.dataset["motion"] = reduced ? "reduced" : "full";
  root.dataset["smoothScroll"] = preferences.smoothScroll ? "on" : "off";
  root.dataset["focusReading"] = preferences.focusReading ? "on" : "off";
  root.dataset["fontScale"] = preferences.fontSize;

  const meta = document.querySelector<HTMLMetaElement>(
    "#theme-color-meta, meta[name='theme-color']",
  );
  if (meta) meta.content = theme === "light" ? "#f7f4ec" : "#0b0b0b";
}

/**
 * Inline script for `<head>`: applies the saved theme/accent **before** React
 * hydrates, so there is no flash of the wrong theme on reload or offline.
 */
export function preferencesBootScript(): string {
  const prefix = JSON.stringify(STORAGE_PREFIX + PREFERENCES_KEY);
  return `(function(){try{
var raw=JSON.parse(localStorage.getItem(${prefix})||"null")||{};
var allowed={theme:["dark","light","auto"],accent:["dourado","azul","verde","violeta","rosa"],contrast:["normal","alto"],fontSize:["pequeno","normal","grande"],density:["compacta","confortavel","espacosa"],contentWidth:["estreita","padrao","larga"],navPosition:["baixo","topo"],navMode:["completa","compacta"]};
function pick(k,d){return (allowed[k]&&allowed[k].indexOf(raw[k])>-1)?raw[k]:d;}
var sys=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches)?"light":"dark";
var t=pick("theme","dark");t=t==="auto"?sys:t;
var r=document.documentElement;
r.dataset.theme=t;if(t==="dark"){r.classList.add("dark");}else{r.classList.remove("dark");}
r.style.colorScheme=t;
r.dataset.accent=pick("accent","dourado");
r.dataset.contrast=pick("contrast","normal");
r.dataset.fontSize=pick("fontSize","normal");
r.dataset.density=pick("density","confortavel");
r.dataset.contentWidth=pick("contentWidth","padrao");
r.dataset.nav=pick("navPosition","baixo");
r.dataset.navMode=pick("navMode","completa");
var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
r.dataset.motion=(raw.animations===false||reduce)?"reduced":"full";
r.dataset.smoothScroll=raw.smoothScroll===false?"off":"on";
r.dataset.focusReading=raw.focusReading===true?"on":"off";
}catch(e){}})();`;
}

/**
 * Reads and applies preferences; keeps tabs in sync and follows
 * `prefers-color-scheme` / `prefers-reduced-motion` changes live.
 */
export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPreferences(loadPreferences());
    setReady(true);

    const reload = () => {
      const next = loadPreferences();
      setPreferences(next);
      applyPreferences(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === STORAGE_PREFIX + PREFERENCES_KEY) reload();
    };
    const onLocal = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as string) : undefined;
      if (detail === PREFERENCES_KEY) reload();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("angostudy-store", onLocal);

    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    const mediaMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMedia = () => reload();
    media?.addEventListener?.("change", onMedia);
    mediaMotion?.addEventListener?.("change", onMedia);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("angostudy-store", onLocal);
      media?.removeEventListener?.("change", onMedia);
      mediaMotion?.removeEventListener?.("change", onMedia);
    };
  }, []);

  useEffect(() => {
    applyPreferences(preferences);
  }, [preferences]);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => savePreferences({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setPreferences(savePreferences({ ...DEFAULT_PREFERENCES }));
  }, []);

  return { preferences, update, reset, ready };
}
