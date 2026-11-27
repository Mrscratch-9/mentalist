// User settings (separate storage key from progress). Today: the UI/canon language. Phase 3 adds map options here.
import { DEFAULT_UI_LANG, isUiLang, type UiLang } from "../i18n/strings";
import type { Result, StorageAdapter } from "./progress";

export const SETTINGS_KEY = "mentalist.settings.v1";

export interface Settings { language: UiLang }

export interface SettingsStore {
  get(): Settings;
  setLanguage(language: UiLang): Result;
}

export function createSettingsStore(storage: StorageAdapter): SettingsStore {
  const get = (): Settings => {
    try {
      const raw = storage.getItem(SETTINGS_KEY);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        const language = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>).language : undefined;
        if (isUiLang(language)) return { language };
      }
    } catch {
      // unreadable storage or corrupt value: default
    }
    return { language: DEFAULT_UI_LANG };
  };
  return {
    get,
    setLanguage(language) {
      if (!isUiLang(language)) return { ok: false, error: "Invalid language." };
      try {
        storage.setItem(SETTINGS_KEY, JSON.stringify({ ...get(), language }));
      } catch {
        return { ok: false, error: "Could not save settings." };
      }
      return { ok: true };
    },
  };
}
