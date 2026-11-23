import { useEffect, useMemo, useState } from "react";
import { openCanon, type Canon } from "./data/canon";
import { RedRoom } from "./home/RedRoom";
import { createProgressStore, localStorageAdapter, type Progress } from "./state/progress";

export function App() {
  const store = useMemo(() => createProgressStore(localStorageAdapter()), []);
  const [progress, setProgress] = useState<Progress>(() => store.get());
  const [canon, setCanon] = useState<Canon | null>(null);
  const [loadError, setLoadError] = useState(false);

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

  function change(next: Progress): string | null {
    const result = store.set(next);
    if (!result.ok) return result.error;
    setProgress(store.get());
    return null;
  }

  return <RedRoom canon={canon} loadError={loadError} progress={progress} onChangeProgress={change} />;
}
