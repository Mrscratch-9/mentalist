import { invoke } from "@tauri-apps/api/core";

export const inTauri = "__TAURI_INTERNALS__" in window;

// The stack checks board replaces the Red room screen when requested:
// in Tauri by env SPIKE_CHECKS (any value, even empty), in a browser by `?checks` in the URL.
export async function checksRequested(): Promise<boolean> {
  if (!inTauri) return new URLSearchParams(location.search).has("checks");
  const [checks] = await invoke<[string | null, string]>("spike_config");
  return checks !== null;
}
