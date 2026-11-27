import { useEffect, useMemo, useState } from "react";
import { openCanon, type Canon } from "./data/canon";
import { RedRoom } from "./home/RedRoom";
import type { UiLang } from "./i18n/strings";
import { createProgressStore, isValidProgress, localStorageAdapter, type Progress } from "./state/progress";
import { createSettingsStore } from "./state/settings";

export function App() {
  const store = useMemo(() => createProgressStore(localStorageAdapter()), []);
  const settings = useMemo(() => createSettingsStore(localStorageAdapter()), []);
  const [progress, setProgress] = useState<Progress>(() => store.get());
  const [lang, setLang] = useState<UiLang>(() => settings.get().language);
  const [canon, setCanon] = useState<Canon | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    let opened: Canon | null = null;
    openCanon().then(
      (c) => {
        if (cancelled) c.close();
        else { opened = c; setCanon(c); }
      },
      (e) => {
        console.error("Series data load failed:", e instanceof Error ? e.message : "unknown error");
        if (!cancelled) setLoadError(true);
      },
    );
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, []);

  function change(next: Progress): "error.progressInvalid" | "error.progressSave" | null {
    const result = store.set(next);
    if (!result.ok) return isValidProgress(next) ? "error.progressSave" : "error.progressInvalid";
    setProgress(store.get());
    return null;
  }

  /** The language switches at once; the return value says whether it was saved. */
  function changeLang(next: UiLang): boolean {
    setLang(next);
    return settings.setLanguage(next).ok;
  }

  return (
    <RedRoom
      canon={canon} loadError={loadError} progress={progress}
      lang={lang} onChangeLang={changeLang} onChangeProgress={change}
    />
  );
}
