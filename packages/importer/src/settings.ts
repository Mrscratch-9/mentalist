import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Settings {
  fandomApi: string;
  tmdbApiKey: string | undefined;
  tmdbShowId: number;
  tmdbLanguage: string;
}

export const DEFAULT_SETTINGS_PATH = fileURLToPath(new URL("../../../data-sources.txt", import.meta.url));

const DEFAULT_FANDOM_API = "https://thementalist.fandom.com/api.php";
const DEFAULT_SHOW_ID = 5920;
const DEFAULT_LANGUAGE = "en-US";

function unquote(v: string): string {
  if (v.length >= 2) {
    const a = v[0];
    if ((a === '"' || a === "'") && v[v.length - 1] === a) return v.slice(1, -1).trim();
  }
  return v;
}

export function parseSettings(text: string): Settings {
  const raw = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    raw.set(t.slice(0, eq).trim(), unquote(t.slice(eq + 1).trim()));
  }
  const get = (k: string): string | undefined => {
    const v = raw.get(k);
    return v === undefined || v === "" ? undefined : v;
  };
  const idRaw = get("TMDB_SHOW_ID");
  let tmdbShowId = DEFAULT_SHOW_ID;
  if (idRaw !== undefined) {
    if (!/^\d+$/.test(idRaw)) throw new Error("TMDB_SHOW_ID must be a positive integer");
    tmdbShowId = Number(idRaw);
  }
  return {
    fandomApi: get("FANDOM_API") ?? DEFAULT_FANDOM_API,
    tmdbApiKey: get("TMDB_API_KEY"),
    tmdbShowId,
    tmdbLanguage: get("TMDB_LANGUAGE") ?? DEFAULT_LANGUAGE,
  };
}

/** Reads data-sources.txt. Values are never logged or put in error messages. */
export function loadSettings(path: string = DEFAULT_SETTINGS_PATH): Settings {
  if (!existsSync(path)) {
    throw new Error(
      "Settings file not found. Copy data-sources.example.txt to data-sources.txt and fill in the values.",
    );
  }
  return parseSettings(readFileSync(path, "utf8"));
}

/** Copy of the settings that is safe to print in debug output. */
export function redact(s: Settings): Settings {
  return { ...s, tmdbApiKey: s.tmdbApiKey === undefined ? undefined : "***" };
}
